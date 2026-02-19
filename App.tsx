import React, { useState, useEffect, useMemo } from 'react';
import Logo from './components/Logo';
import { analyzeReimbursement } from './services/geminiService';
import { fileToBase64 } from './utils/fileHelpers';
import { FileWithPreview, ProcessingResult, ProcessingState } from './types';
import { supabase } from './services/supabaseClient';

// Tab Components
import DashboardTab from './components/tabs/DashboardTab';
import DatabaseTab from './components/tabs/DatabaseTab';
import NabTab from './components/tabs/NabTab';
import EodTab from './components/tabs/EodTab';
import AnalyticsTab from './components/tabs/AnalyticsTab';
import SettingsTab from './components/tabs/SettingsTab';
import RowDetailModal from './components/modals/RowDetailModal';

// --- DATA & HELPER CONFIGURATION ---

// Default Data for Employee List
const DEFAULT_EMPLOYEE_DATA = `First Names	Surname	Concatenate	BSB	Account
John	Smith	Smith, John	000000	00000000
Jane	Doe	Doe, Jane	000000	00000000`;

interface Employee {
  firstName: string;
  surname: string;
  fullName: string;
  bsb: string;
  account: string;
}

const parseEmployeeData = (rawData: string): Employee[] => {
    return rawData.split('\n')
        .slice(1) // Skip header
        .filter(line => line.trim().length > 0)
        .map(line => {
            const cols = line.split('\t');
            if (cols.length < 3) return null; // Relaxed check
            return {
                firstName: cols[0]?.trim() || '',
                surname: cols[1]?.trim() || '',
                fullName: cols[2]?.trim() || `${cols[1] || ''}, ${cols[0] || ''}`, 
                bsb: cols[3]?.trim() || '',
                account: cols[4]?.trim() || ''
            };
        })
        .filter(item => item !== null) as Employee[];
};

const findBestEmployeeMatch = (scannedName: string, employees: Employee[]): Employee | null => {
    if (!scannedName) return null;
    const normalizedInput = scannedName.toLowerCase().replace(/[^a-z ]/g, '');

    for (const emp of employees) {
        const full = emp.fullName.toLowerCase();
        if (normalizedInput.includes(full) || full.includes(normalizedInput)) {
            return emp;
        }
    }
    return null;
};

// --- HELPER: DEFENSIVE DATA SANITIZATION ---
const safeNumber = (val: any): number => {
    if (val === undefined || val === null) return 0.0;
    if (typeof val === 'number') return isNaN(val) ? 0.0 : val;
    const str = String(val).replace(/[^0-9.-]+/g, "");
    const num = parseFloat(str);
    return isNaN(num) ? 0.0 : num;
};

const safeString = (val: any, fallback = 'N/A'): string => {
    if (val === undefined || val === null) return fallback;
    const str = String(val).trim();
    return str.length === 0 ? fallback : str;
};

// --- MAIN APPLICATION COMPONENT ---
export const App = () => {
  const [receiptFiles, setReceiptFiles] = useState<FileWithPreview[]>([]);
  const [formFiles, setFormFiles] = useState<FileWithPreview[]>([]);
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [results, setResults] = useState<ProcessingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editableContent, setEditableContent] = useState('');
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error' | 'duplicate'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  
  const [emailCopied, setEmailCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [reportCopied, setReportCopied] = useState<'nab' | 'eod' | 'analytics' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'generated' | null>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'database' | 'nab_log' | 'eod' | 'analytics' | 'settings'>('dashboard');
  const [loadingSplash, setLoadingSplash] = useState(true);

  // Database / History State
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // EOD State
  const [eodDate, setEodDate] = useState(new Date().toISOString().split('T')[0]);

  // Row Modal State
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [isRowModalOpen, setIsRowModalOpen] = useState(false);
  const [isRowEditMode, setIsRowEditMode] = useState(false);
  const [editedRowData, setEditedRowData] = useState<any>(null);

  // Employee Database State
  const [employeeList, setEmployeeList] = useState<Employee[]>([]);
  const [employeeRawText, setEmployeeRawText] = useState(DEFAULT_EMPLOYEE_DATA);
  const [saveEmployeeStatus, setSaveEmployeeStatus] = useState<'idle' | 'saved'>('idle');
  
  // Import State
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    // Splash screen timer
    const timer = setTimeout(() => setLoadingSplash(false), 2000);
    
    // Load dismissed IDs
    const storedDismissed = localStorage.getItem('aspire_dismissed_discrepancies');
    if (storedDismissed) {
        setDismissedIds(JSON.parse(storedDismissed));
    }

    // Load Employee Data
    const storedEmployees = localStorage.getItem('aspire_employee_list');
    if (storedEmployees) {
        setEmployeeRawText(storedEmployees);
        setEmployeeList(parseEmployeeData(storedEmployees));
    } else {
        setEmployeeList(parseEmployeeData(DEFAULT_EMPLOYEE_DATA));
    }

    // Initial fetch
    fetchHistory();

    return () => clearTimeout(timer);
  }, []);

  const handleSaveEmployeeList = () => {
      localStorage.setItem('aspire_employee_list', employeeRawText);
      setEmployeeList(parseEmployeeData(employeeRawText));
      setSaveEmployeeStatus('saved');
      setTimeout(() => setSaveEmployeeStatus('idle'), 2000);
  };

  const parseTransactionPart = (part: string, index: number) => {
        const lines = part.split('\n');
        let staffName = lines[0].trim();
        const amountMatch = part.match(/\*\*Amount:\*\*\s*(.*)/) || part.match(/Amount:\s*(.*)/);
        let amount = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';
        
        const nabMatch = part.match(/NAB (?:Code|Reference):(?:\*\*|)\s*(.*)/i);
        let currentNabRef = nabMatch ? nabMatch[1].trim() : '';
        if (currentNabRef === 'PENDING') currentNabRef = '';

        const receiptMatch = part.match(/\*\*Receipt ID:\*\*\s*(.*)/) || part.match(/Receipt ID:\s*(.*)/);
        const receiptId = receiptMatch ? receiptMatch[1].trim() : 'N/A';

        let formattedName = staffName;
        if (staffName.includes(',')) {
            const p = staffName.split(',');
            if (p.length >= 2) formattedName = `${p[1].trim()} ${p[0].trim()}`;
        }

        return {
            index,
            staffName,
            formattedName,
            amount,
            receiptId,
            currentNabRef
        };
  };

  const getParsedTransactions = () => {
      const content = isEditing ? editableContent : results?.phase4;
      if (!content) return [];

      // Check for Table Format (Type D)
      if (content.includes('| Staff Member |') || content.includes('|Staff Member|')) {
         const lines = content.split('\n');
         const tableTxs: any[] = [];
         let isTable = false;
         let idx = 0;
         
         for (const line of lines) {
             if (line.toLowerCase().includes('| staff member')) {
                 isTable = true;
                 continue;
             }
             if (isTable && line.trim().startsWith('|') && !line.includes('---')) {
                 const cols = line.split('|').map(c => c.trim()).filter(c => c !== '');
                 if (cols.length >= 3) {
                     // Columns: Staff Member | Approved By | Amount | NAB Code
                     const staffName = cols[0];
                     const amount = cols[2].replace('$', '').trim();
                     let currentNabRef = cols.length > 3 ? cols[3] : '';
                     if (currentNabRef === 'PENDING') currentNabRef = '';
                     
                     let formattedName = staffName;
                     if (staffName.includes(',')) {
                        const p = staffName.split(',');
                        if (p.length >= 2) formattedName = `${p[1].trim()} ${p[0].trim()}`;
                     }

                     tableTxs.push({
                         index: idx++,
                         staffName,
                         formattedName,
                         amount,
                         receiptId: 'BATCH',
                         currentNabRef
                     });
                 }
             }
         }
         if (tableTxs.length > 0) return tableTxs;
      }

      const parts = content.split('**Staff Member:**');
      if (parts.length <= 1) {
           const unboldedParts = content.split('Staff Member:');
           if (unboldedParts.length > 1) {
               return unboldedParts.slice(1).map((part, index) => parseTransactionPart(part, index));
           }
           return [];
      }
      return parts.slice(1).map((part, index) => parseTransactionPart(part, index));
  };

  const parsedTransactions = getParsedTransactions();

  const handleTransactionNabChange = (index: number, newVal: string) => {
      const content = isEditing ? editableContent : results?.phase4;
      if (!content) return;

      // Check if table format
      if (content.includes('| Staff Member |')) {
          const lines = content.split('\n');
          let txIndex = 0;
          let isTable = false;
          const newLines = lines.map(line => {
             if (line.toLowerCase().includes('| staff member')) isTable = true;
             
             if (isTable && line.trim().startsWith('|') && !line.includes('Staff Member') && !line.includes('---')) {
                 if (txIndex === index) {
                     // Found the row, replace the last column or append it
                     const cols = line.split('|');
                     // cols[0] is empty (before first |), cols[1] Name, cols[2] Approver, cols[3] Amount, cols[4] NAB, cols[5] empty
                     if (cols.length >= 5) {
                         cols[4] = ` ${newVal} `;
                         txIndex++;
                         return cols.join('|');
                     }
                 }
                 txIndex++;
             }
             return line;
          });
          const newContent = newLines.join('\n');
          if (isEditing) setEditableContent(newContent);
          else setResults({ ...results!, phase4: newContent });
          return;
      }

      const marker = '**Staff Member:**';
      const parts = content.split(marker);
      const partIndex = index + 1;

      if (parts.length <= partIndex) return;

      let targetPart = parts[partIndex];
      
      if (targetPart.match(/NAB (?:Code|Reference):/i)) {
          targetPart = targetPart.replace(/NAB (?:Code|Reference):.*/i, `NAB Code: ${newVal}`);
      } else {
           if (targetPart.includes('Amount:')) {
               targetPart = targetPart.replace(/(Amount:.*)/, `$1\n**NAB Code:** ${newVal}`);
           } else {
               targetPart += `\n**NAB Code:** ${newVal}`;
           }
      }

      parts[partIndex] = targetPart;
      const newContent = parts.join(marker);

      if (isEditing) {
          setEditableContent(newContent);
      } else {
          setResults({ ...results!, phase4: newContent });
      }
  };

  const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
          const { data, error } = await supabase
              .from('audit_logs')
              .select('*')
              .order('created_at', { ascending: false });
          
          if (error) {
              if (error.code === '42P01') { 
                  console.warn("Table 'audit_logs' not found.");
                  setHistoryData([]);
                  return;
              }
              throw error;
          }
          setHistoryData(data || []);
      } catch (e) {
          console.error("Error fetching history:", e);
      } finally {
          setLoadingHistory(false);
      }
  };

  const parseDatabaseRows = (data: any[]) => {
      const allRows: any[] = [];
      data.forEach((record) => {
          const content = record.full_email_content || "";
          const internalId = record.id;
          const receiptId = record.uid || record.nab_code || 'N/A';
          const timestamp = record.time_stamp_log ? new Date(record.time_stamp_log).toLocaleString() : new Date(record.created_at).toLocaleString();
          const rawDate = new Date(record.created_at);
          
          const staffName = record.staff_name || 'Unknown';
          const amountMatch = content.match(/\*\*Amount:\*\*\s*(.*)/);
          
          const safeToFixed = (val: any): string | null => {
            if (val === undefined || val === null) return null;
            const num = parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
            return isNaN(num) ? null : num.toFixed(2);
          };

          let totalAmount = safeToFixed(record.total_amount);
          
          if (totalAmount === null) {
              totalAmount = safeToFixed(record.amount);
          }
          
          if (totalAmount === null) {
              totalAmount = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';
          }
          
          let ypName = record.client_location || 'N/A';
          if (ypName === 'N/A' || !ypName) {
              const ypMatch = content.match(/\*\*Client \/ Location:\*\*\s*(.*?)(?:\n|$)/);
              if (ypMatch) {
                  ypName = ypMatch[1].trim();
              }
          }
          
          const dateProcessed = record.date_processed ? new Date(record.date_processed).toLocaleDateString() : new Date(record.created_at).toLocaleDateString();
          const nabRefDisplay = record.nab_code || 'PENDING';

          let youngPersonName = record.yp_name || ypName;
          if ((!record.yp_name || record.yp_name === 'N/A') && ypName && ypName !== 'N/A' && ypName.includes('/')) {
              const parts = ypName.split('/');
              if (parts.length > 0) {
                  youngPersonName = parts[0].trim();
              }
          }

          let receiptDateDisplay = record.receipt_date;
          if (!receiptDateDisplay) {
             const dateMatch = content.match(/(\d{2}\/\d{2}\/\d{2,4})/);
             receiptDateDisplay = dateMatch ? dateMatch[1] : dateProcessed;
          }

          const lines = content.split('\n');
          let foundTable = false;
          let tableRowsFound = false;

          for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line.startsWith('| Receipt #') || line.startsWith('|Receipt #')) {
                  foundTable = true;
                  continue; 
              }
              if (foundTable && line.startsWith('| :---')) {
                  continue; 
              }
              if (foundTable && line.startsWith('|')) {
                  const cols = line.split('|').map((c: string) => c.trim()).filter((c: string) => c !== '');
                  if (cols.length >= 5) {
                      tableRowsFound = true;
                      const storeCol = cols[1];
                      const rowDateMatch = storeCol.match(/(\d{2}\/\d{2}\/\d{2,4})/);
                      const rowDate = rowDateMatch ? rowDateMatch[1] : receiptDateDisplay;

                      allRows.push({
                          id: `${internalId}-${i}`, 
                          uid: receiptId, 
                          internalId: internalId,
                          timestamp,
                          rawDate,
                          ypName: ypName,
                          youngPersonName: youngPersonName,
                          staffName,
                          product: cols[2], 
                          expenseType: cols[3], 
                          receiptDate: rowDate,
                          amount: cols[4], 
                          totalAmount: record.total_amount || totalAmount, 
                          dateProcessed,
                          nabCode: nabRefDisplay 
                      });
                  }
              }
              if (foundTable && line === '') {
                  foundTable = false;
              }
          }

          if (!tableRowsFound) {
              allRows.push({
                  id: `${internalId}-summary`,
                  uid: receiptId,
                  internalId: internalId,
                  timestamp,
                  rawDate,
                  ypName: ypName,
                  youngPersonName: youngPersonName,
                  staffName,
                  product: record.product_name || 'Petty Cash / Reimbursement',
                  expenseType: record.expense_type || 'Batch Request',
                  receiptDate: receiptDateDisplay,
                  amount: typeof totalAmount === 'number' ? (totalAmount as number).toFixed(2) : totalAmount,
                  totalAmount: typeof totalAmount === 'number' ? (totalAmount as number).toFixed(2) : totalAmount,
                  dateProcessed,
                  nabCode: nabRefDisplay
              });
          }
      });
      return allRows;
  };

  const databaseRows = useMemo(() => parseDatabaseRows(historyData), [historyData]);
  
  const filteredDatabaseRows = useMemo(() => {
      if (!searchTerm) return databaseRows;
      const lower = searchTerm.toLowerCase();
      return databaseRows.filter(r => 
          r.staffName.toLowerCase().includes(lower) || 
          r.ypName.toLowerCase().includes(lower) ||
          r.youngPersonName.toLowerCase().includes(lower) ||
          String(r.amount).includes(lower) ||
          String(r.uid).toLowerCase().includes(lower)
      );
  }, [databaseRows, searchTerm]);

  // NAB DATA
  const pendingTx = useMemo(() => databaseRows.filter(r => !r.nabCode || r.nabCode === 'PENDING' || r.nabCode === 'N/A' || r.nabCode === ''), [databaseRows]);
  const paidTx = useMemo(() => databaseRows.filter(r => r.nabCode && r.nabCode !== 'PENDING' && r.nabCode !== 'N/A' && r.nabCode !== ''), [databaseRows]);
  const pendingTotal = useMemo(() => pendingTx.reduce((sum, r) => sum + (parseFloat(String(r.amount).replace(/[^0-9.-]+/g,"")) || 0), 0), [pendingTx]);

  // EOD DATA
  const eodRows = useMemo(() => {
    return databaseRows.filter(r => {
        const d = new Date(r.rawDate);
        const dateStr = d.toLocaleDateString('en-CA');
        return dateStr === eodDate || r.timestamp.includes(new Date(eodDate).toLocaleDateString()); 
    });
  }, [databaseRows, eodDate]);

  const eodTotal = useMemo(() => eodRows.reduce((sum, r) => sum + (parseFloat(String(r.amount).replace(/[^0-9.-]+/g,"")) || 0), 0), [eodRows]);

  const generateEodReportText = () => {
     let report = `**EOD SHIFT REPORT - ${new Date(eodDate).toLocaleDateString()}**\n\n`;
     report += `**Total Processed:** $${eodTotal.toFixed(2)}\n`;
     report += `**Transactions:** ${eodRows.length}\n\n`;
     report += `| Staff | Amount | Reference |\n| :--- | :--- | :--- |\n`;
     eodRows.forEach(row => {
        report += `| ${row.staffName} | $${row.amount} | ${row.nabCode || 'PENDING'} |\n`;
     });
     return report;
  };

  const copyBatchPaymentList = () => {
      const list = pendingTx.map(t => `${t.staffName}\t${t.amount}\t${t.uid}`).join('\n');
      navigator.clipboard.writeText(list);
      setReportCopied('nab');
      setTimeout(() => setReportCopied(null), 2000);
  };

  // Analytics Calculation
  const analyticsData = useMemo(() => {
      const groupedByYP: { [key: string]: number } = {};
      const groupedByStaff: { [key: string]: number } = {};
      let totalSpend = 0;
      let totalRequests = 0;

      databaseRows.forEach(row => {
          const val = parseFloat(String(row.amount).replace(/[^0-9.-]+/g,"")) || 0;
          
          const yp = row.ypName || 'Unknown';
          groupedByYP[yp] = (groupedByYP[yp] || 0) + val;

          const staff = row.staffName || 'Unknown';
          groupedByStaff[staff] = (groupedByStaff[staff] || 0) + val;

          totalSpend += val;
          totalRequests++;
      });

      return {
          yp: Object.entries(groupedByYP).sort((a, b) => b[1] - a[1]),
          staff: Object.entries(groupedByStaff).sort((a, b) => b[1] - a[1]),
          totalSpend,
          totalRequests
      };
  }, [databaseRows]);

  const handleRowClick = (row: any) => {
      setSelectedRow(row);
      setEditedRowData({ ...row });
      setIsRowEditMode(false);
      setIsRowModalOpen(true);
  };

  const handleRowModalClose = () => {
      setIsRowModalOpen(false);
      setSelectedRow(null);
      setEditedRowData(null);
  };

  const handleDeleteRow = async () => {
      if (!selectedRow) return;
      if (confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
          try {
              const { error } = await supabase.from('audit_logs').delete().eq('id', selectedRow.internalId);
              if (error) throw error;
              setHistoryData(prev => prev.filter(item => item.id !== selectedRow.internalId));
              handleRowModalClose();
          } catch (e) {
              console.error("Delete failed", e);
              alert("Failed to delete record.");
          }
      }
  };

  const handleSaveRowChanges = async () => {
      if (!editedRowData) return;
      
      const originalRecord = historyData.find(r => r.id === editedRowData.internalId);
      if (!originalRecord) return;

      let newContent = originalRecord.full_email_content || "";
      newContent = newContent.replace(/(\*\*Staff Member:\*\*\s*)(.*?)(\n|$)/, `$1${editedRowData.staffName}$3`);
      const amountVal = String(editedRowData.totalAmount).replace(/[^0-9.]/g, '');
      newContent = newContent.replace(/(\*\*Amount:\*\*\s*\$?)(.*?)(\n|$)/, `$1$${amountVal}$3`);
      if (newContent.match(/\*\*Client \/ Location:\*\*/)) {
          newContent = newContent.replace(/(\*\*Client \/ Location:\*\*\s*)(.*?)(\n|$)/, `$1${editedRowData.ypName}$3`);
      } else {
          newContent += `\n**Client / Location:** ${editedRowData.ypName}`;
      }
      if (newContent.match(/NAB (?:Code|Reference):/)) {
          newContent = newContent.replace(/(NAB (?:Code|Reference):(?:\*\*|)\s*)(.*?)(\n|$)/, `$1${editedRowData.nabCode}$3`);
      } else {
          newContent += `\n**NAB Code:** ${editedRowData.nabCode}`;
      }

      const updatedHistory = historyData.map(item => {
          if (item.id === editedRowData.internalId) {
              return { 
                  ...item, 
                  staff_name: editedRowData.staffName,
                  amount: parseFloat(amountVal), 
                  total_amount: parseFloat(amountVal),
                  client_location: editedRowData.ypName,
                  nab_code: editedRowData.nabCode,
                  full_email_content: newContent
              };
          }
          return item;
      });
      setHistoryData(updatedHistory);

      try {
          const { error } = await supabase
              .from('audit_logs')
              .update({
                  staff_name: editedRowData.staffName,
                  amount: parseFloat(amountVal),
                  total_amount: parseFloat(amountVal),
                  client_location: editedRowData.ypName,
                  nab_code: editedRowData.nabCode,
                  full_email_content: newContent
              })
              .eq('id', editedRowData.internalId);

          if (error) throw error;
          handleRowModalClose();
      } catch (e) {
          console.error("Supabase Update Error", e);
          alert("Failed to save changes to the database. Please check your connection.");
      }
  };

  const handleDownloadCSV = () => {
    if (filteredDatabaseRows.length === 0) return;
    const headers = [
        "UID", "Time Stamp", "YP Name", "Staff Name", "Type of expense", 
        "Product", "Receipt Date", "Amount", "Total Amount", "Date Processed", "Nab Code"
    ];
    const csvRows = [
        headers.join(','),
        ...filteredDatabaseRows.map(row => {
            const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
            return [
                escape(row.uid), escape(row.timestamp), escape(row.ypName), escape(row.staffName),
                escape(row.expenseType), escape(row.product), escape(row.receiptDate), escape(row.amount),
                escape(row.totalAmount), escape(row.dateProcessed), escape(row.nabCode)
            ].join(',');
        })
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reimbursement_database_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    setReceiptFiles([]); setFormFiles([]); setProcessingState(ProcessingState.IDLE);
    setResults(null); setErrorMessage(null); setEmailCopied(false); setSaveStatus('idle'); setIsEditing(false);
  };

  const handleStartNewAudit = () => { resetAll(); fetchHistory(); };

  const handleCopyEmail = async () => {
    if (!results?.phase4) return;
    const content = isEditing ? editableContent : results.phase4;
    // Remove asterisks to clean up formatting for Outlook plain text/simple paste
    const cleanContent = content.replace(/\*/g, '');
    navigator.clipboard.writeText(cleanContent);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const handleCopyField = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSaveToCloud = async (contentOverride?: string) => {
    const contentToSave = contentOverride || (isEditing ? editableContent : results?.phase4);
    if (!contentToSave) return;
    
    setIsSaving(true);
    setSaveStatus('idle');
    const batchTimestamp = new Date().toISOString();

    try {
      const staffBlocks = contentToSave.split('**Staff Member:**');
      const payloads: any[] = [];
      
      // NEW: Check for Markdown Table (Type D)
      const hasTable = contentToSave.includes('| Staff Member |') || contentToSave.includes('|Staff Member|');
      
      if (hasTable && !contentToSave.includes('**Staff Member:**')) {
          const lines = contentToSave.split('\n');
          const clientMatch = contentToSave.match(/\*\*Client \/ Location:\*\*\s*(.*?)(?:\n|$)/);
          const globalClient = clientMatch ? clientMatch[1].trim() : 'N/A';
          let globalYp = 'N/A';
          if (globalClient !== 'N/A' && globalClient.includes('/')) globalYp = globalClient.split('/')[0].trim();
          else if (globalClient !== 'N/A') globalYp = globalClient;

          let txIndex = 0;
          for (const line of lines) {
              if (line.trim().startsWith('|') && !line.includes('Staff Member') && !line.includes('---')) {
                   const cols = line.split('|').map(c => c.trim()).filter(c => c !== '');
                   if (cols.length >= 4) {
                       // Name | Approver | Amount | Nab
                       const staffName = cols[0];
                       const amountRaw = cols[2].replace('$', '');
                       let extractedUid = cols[3];
                       if (extractedUid === 'PENDING' || extractedUid === '') {
                           extractedUid = `BATCH-${Date.now()}-${txIndex}-${Math.floor(Math.random()*1000)}`;
                       }
                       
                       payloads.push({
                           uid: extractedUid,
                           time_stamp_log: batchTimestamp,
                           staff_name: safeString(staffName),
                           amount: safeNumber(amountRaw),
                           total_amount: safeNumber(amountRaw),
                           client_location: safeString(globalClient),
                           yp_name: safeString(globalYp),
                           expense_type: 'Batch Request',
                           product_name: 'Petty Cash / Reimbursement',
                           date_processed: batchTimestamp,
                           nab_code: extractedUid,
                           full_email_content: contentToSave,
                           created_at: batchTimestamp,
                           receipt_date: new Date().toLocaleDateString('en-AU')
                       });
                       txIndex++;
                   }
              }
          }
      } else if (staffBlocks.length > 1) {
          for (let i = 1; i < staffBlocks.length; i++) {
              const block = staffBlocks[i];
              const staffNameLine = block.split('\n')[0].trim();
              const amountMatch = block.match(/\*\*Amount:\*\*\s*(.*)/);
              const nabMatch = block.match(/NAB (?:Code|Reference):(?:\*\*|)\s*(.*)/i);
              const clientMatch = block.match(/\*\*Client \/ Location:\*\*\s*(.*?)(?:\n|$)/) || contentToSave.match(/\*\*Client \/ Location:\*\*\s*(.*?)(?:\n|$)/);
              
              const staffName = staffNameLine;
              const amountRaw = amountMatch ? amountMatch[1] : '0';
              const clientLocation = clientMatch ? clientMatch[1].trim() : 'N/A';
              
              let ypName = 'N/A';
              if (clientLocation !== 'N/A' && clientLocation.includes('/')) {
                  ypName = clientLocation.split('/')[0].trim();
              } else if (clientLocation !== 'N/A') {
                  ypName = clientLocation;
              }

              let extractedUid = nabMatch ? nabMatch[1].trim() : null;
              if (!extractedUid || extractedUid === 'PENDING' || extractedUid === 'N/A' || extractedUid === '') {
                  extractedUid = `BATCH-${Date.now()}-${i}-${Math.floor(Math.random() * 10000)}`;
              }
              const dateMatch = block.match(/(\d{2}\/\d{2}\/\d{2,4})/);
              const receiptDate = dateMatch ? dateMatch[1] : new Date().toLocaleDateString('en-AU');

              payloads.push({
                  uid: extractedUid, time_stamp_log: batchTimestamp, staff_name: safeString(staffName),
                  amount: safeNumber(amountRaw), total_amount: safeNumber(amountRaw), client_location: safeString(clientLocation),
                  yp_name: safeString(ypName), expense_type: 'Batch Request', product_name: 'Petty Cash / Reimbursement',
                  date_processed: batchTimestamp, nab_code: extractedUid, full_email_content: contentToSave, created_at: batchTimestamp, receipt_date: receiptDate
              });
          }
      } else {
          const staffNameMatch = contentToSave.match(/\*\*Staff Member:\*\*\s*(.*)/);
          const amountMatch = contentToSave.match(/\*\*Amount:\*\*\s*(.*)/);
          const receiptIdMatch = contentToSave.match(/\*\*Receipt ID:\*\*\s*(.*)/);
          const nabMatch = contentToSave.match(/NAB (?:Code|Reference):(?:\*\*|)\s*(.*)/i);
          const clientMatch = contentToSave.match(/\*\*Client \/ Location:\*\*\s*(.*?)(?:\n|$)/);

          const staffName = staffNameMatch ? staffNameMatch[1].trim() : 'Unknown';
          const amountRaw = amountMatch ? amountMatch[1] : '0';
          const clientLocation = clientMatch ? clientMatch[1].trim() : 'N/A';
          
          let ypName = 'N/A';
          if (clientLocation !== 'N/A' && clientLocation.includes('/')) {
                ypName = clientLocation.split('/')[0].trim();
          } else if (clientLocation !== 'N/A') {
                ypName = clientLocation;
          }

          let extractedUid = nabMatch ? nabMatch[1].trim() : (receiptIdMatch ? receiptIdMatch[1].trim() : null);
          const isDiscrepancy = contentToSave.toLowerCase().includes('discrepancy') || contentToSave.toLowerCase().includes('mismatch') || contentToSave.includes('STATUS: PENDING');

          if (!extractedUid || extractedUid === 'PENDING' || extractedUid === 'N/A' || extractedUid === '') {
               if (isDiscrepancy) {
                   extractedUid = `DISC-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
               } else {
                   extractedUid = `T${Date.now()}-${Math.floor(Math.random() * 10000)}`;
               }
          }
          let expenseType = 'General Reimbursement';
          let productName = 'Multiple Items';
          if (contentToSave.includes('|') && !contentToSave.toLowerCase().includes('multiple items')) {
             const lines = contentToSave.split('\n');
             let dataRow = null;
             for (const line of lines) {
                 if (line.includes('| :---')) continue;
                 else if (line.includes('|') && !line.includes('Total Amount')) {
                     dataRow = line; break;
                 }
             }
             if (dataRow) {
                 const cols = dataRow.split('|').filter(c => c.trim() !== '');
                 if (cols.length >= 4) { productName = cols[2].trim(); expenseType = cols[3].trim(); }
             }
          }
          const dateMatch = contentToSave.match(/(\d{2}\/\d{2}\/\d{2,4})/);
          const receiptDate = dateMatch ? dateMatch[1] : new Date().toLocaleDateString('en-AU');

          payloads.push({
              uid: extractedUid, time_stamp_log: batchTimestamp, staff_name: safeString(staffName),
              amount: safeNumber(amountRaw), total_amount: safeNumber(amountRaw), client_location: safeString(clientLocation),
              yp_name: safeString(ypName), expense_type: safeString(expenseType), product_name: safeString(productName),
              date_processed: batchTimestamp, nab_code: extractedUid, full_email_content: contentToSave, created_at: batchTimestamp, receipt_date: receiptDate
          });
      }
      const { error } = await supabase.from('audit_logs').upsert(payloads, { onConflict: 'uid' }).select();
      if (error) throw error;
      setSaveStatus('success');
      fetchHistory();
    } catch (error: any) {
      console.error("Supabase Save Error:", error);
      alert("Error saving data. " + error.message);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSmartSave = () => {
    const hasTransactions = parsedTransactions.length > 0;
    const allHaveRef = parsedTransactions.every(tx => !!tx.currentNabRef && tx.currentNabRef.trim() !== '' && tx.currentNabRef !== 'PENDING');
    const status = (hasTransactions && allHaveRef) ? 'PAID' : 'PENDING';
    const tag = status === 'PENDING' ? '\n\n<!-- STATUS: PENDING -->' : '\n\n<!-- STATUS: PAID -->';
    const baseContent = isEditing ? editableContent : results?.phase4 || '';
    const finalContent = baseContent.includes('<!-- STATUS:') ? baseContent : baseContent + tag;
    handleSaveToCloud(finalContent);
  };

  const handleProcess = async () => {
    if (receiptFiles.length === 0) { setErrorMessage("Please upload at least one receipt."); return; }
    setProcessingState(ProcessingState.PROCESSING);
    setErrorMessage(null); setResults(null); setEmailCopied(false); setSaveStatus('idle'); setIsEditing(false);

    try {
      const receiptImages = await Promise.all(receiptFiles.map(async (file) => ({
        mimeType: file.type || 'application/octet-stream', data: await fileToBase64(file), name: file.name
      })));
      const formImage = formFiles.length > 0 ? {
        mimeType: formFiles[0].type || 'application/octet-stream', data: await fileToBase64(formFiles[0]), name: formFiles[0].name
      } : null;

      const fullResponse = await analyzeReimbursement(receiptImages, formImage);
      const parseSection = (tagStart: string, tagEnd: string, text: string) => {
        const startIdx = text.indexOf(tagStart); const endIdx = text.indexOf(tagEnd);
        if (startIdx === -1 || endIdx === -1) return "Section not found or parsing error.";
        return text.substring(startIdx + tagStart.length, endIdx).trim();
      };

      if (!fullResponse) throw new Error("No response from AI");
      let phase1 = parseSection('<<<PHASE_1_START>>>', '<<<PHASE_1_END>>>', fullResponse);
      const phase2 = parseSection('<<<PHASE_2_START>>>', '<<<PHASE_2_END>>>', fullResponse);
      const phase3 = parseSection('<<<PHASE_3_START>>>', '<<<PHASE_3_END>>>', fullResponse);
      let phase4 = parseSection('<<<PHASE_4_START>>>', '<<<PHASE_4_END>>>', fullResponse);

      const staffNameMatch = phase4.match(/\*\*Staff Member:\*\*\s*(.*)/);
      if (staffNameMatch) {
          const originalName = staffNameMatch[1].trim();
          const matchedEmployee = findBestEmployeeMatch(originalName, employeeList);
          if (matchedEmployee) {
              phase4 = phase4.replace(originalName, matchedEmployee.fullName);
              if (phase1.includes(originalName)) phase1 = phase1.replace(originalName, matchedEmployee.fullName);
          }
      }
      setResults({ phase1, phase2, phase3, phase4 });
      setProcessingState(ProcessingState.COMPLETE);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "An unexpected error occurred.");
      setProcessingState(ProcessingState.ERROR);
    }
  };

  const handleCancelEdit = () => { if (results) setEditableContent(results.phase4); setIsEditing(false); };
  const handleSaveEdit = () => { if (results) { setResults({ ...results, phase4: editableContent }); setIsEditing(false); }};

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImporting(true);
      try {
          const text = await file.text();
          let data: any[] = [];
          if (file.name.endsWith('.json')) data = JSON.parse(text);
          else if (file.name.endsWith('.csv')) {
              const rows = text.split('\n').map(row => row.split(','));
              const headers = rows[0];
              data = rows.slice(1).filter(r => r.length === headers.length).map(row => {
                  const obj: any = {};
                  headers.forEach((h, i) => { obj[h ? h.trim().replace(/^"|"$/g, '') : `col${i}`] = row[i] ? row[i].trim().replace(/^"|"$/g, '') : ''; });
                  return obj;
              });
          }
          if (data.length === 0) throw new Error("No parseable data found");

          const payloads = data.map(record => ({
            uid: safeString(record.uid || record.UID || `IMP-${Date.now()}-${Math.random()}`),
            time_stamp_log: record.timestamp || new Date().toISOString(),
            client_location: safeString(record.client_location || record['Client / Location'] || 'Imported'),
            yp_name: safeString(record.yp_name || record['YP Name'] || 'N/A'),
            staff_name: safeString(record.staff_name || record['Staff Name'] || 'Unknown'),
            expense_type: safeString(record.expense_type || record['Type of expense'] || 'Imported'),
            product_name: safeString(record.product || record['Product'] || 'Imported Item'),
            receipt_date: record.receipt_date || new Date().toLocaleDateString(),
            amount: safeNumber(record.amount || record['Amount']),
            total_amount: safeNumber(record.total_amount || record['Total Amount'] || record.amount),
            date_processed: record.date_processed || new Date().toISOString(),
            nab_code: safeString(record.nab_code || record['Nab Code'] || 'IMPORTED'),
            full_email_content: 'Imported via Settings',
            created_at: new Date().toISOString()
          }));

          const { error } = await supabase.from('audit_logs').upsert(payloads, { onConflict: 'uid' }).select();
          if (error) throw error;
          alert(`Successfully imported ${payloads.length} records!`);
          fetchHistory();
      } catch (err: any) { console.error(err); alert("Import failed: " + err.message); } finally { setImporting(false); e.target.value = ''; }
  };

  const onResetDefaults = () => { if(window.confirm('Reset to default list?')) { setEmployeeRawText(DEFAULT_EMPLOYEE_DATA); setEmployeeList(parseEmployeeData(DEFAULT_EMPLOYEE_DATA)); }};
  const onRestoreDismissed = () => { if(window.confirm('Restore all dismissed discrepancies?')) { setDismissedIds([]); localStorage.removeItem('aspire_dismissed_discrepancies'); }};

  if (loadingSplash) {
    return (
      <div className="fixed inset-0 bg-[#0f1115] z-50 flex flex-col items-center justify-center animate-in fade-in duration-700">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/20 rounded-full blur-[100px]"></div>
         <div className="relative z-10 flex flex-col items-center animate-pulse">
            <Logo size={120} showText={true} />
            <div className="mt-8 w-64 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 animate-[width_5s_ease-in-out_forwards]" style={{width: '0%'}}></div>
            </div>
            <p className="mt-4 text-slate-500 text-sm font-medium tracking-widest uppercase">Initializing Auditor...</p>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1115] text-slate-300 font-sans">
      <div className="relative z-10 p-6 max-w-[1600px] mx-auto">
        <header className="flex items-center justify-between mb-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-6 py-3 shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="bg-[#312E81] p-1.5 rounded-full shadow-[0_0_15px_rgba(49,46,129,0.5)]">
               <Logo size={28} />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-bold tracking-tight text-lg leading-none">ASPIRE</span>
              <span className="text-[10px] text-slate-400 tracking-[0.2em] font-medium mt-0.5">HOMES AUDITOR</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-black/20 rounded-full p-1 border border-white/5">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'database', label: 'Database' },
              { id: 'nab_log', label: 'NAB', extraClass: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/20' },
              { id: 'eod', label: 'EOD', extraClass: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/20' },
              { id: 'analytics', label: 'Analytics', extraClass: 'text-blue-400 border-blue-500/20 bg-blue-500/20' },
              { id: 'settings', label: 'Settings' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  activeTab === tab.id 
                    ? (tab.extraClass || 'bg-white/10 text-white shadow-sm') 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
             <div className="flex items-center gap-3 pr-2">
                <div className="text-right hidden sm:block">
                   <p className="text-sm font-semibold text-white">Auditor Mode</p>
                   <p className="text-xs text-indigo-400">Active</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-indigo-500 to-blue-500 p-[2px]">
                   <div className="h-full w-full rounded-full bg-slate-900 flex items-center justify-center">
                      <span className="font-bold text-white text-xs">AM</span>
                   </div>
                </div>
             </div>
          </div>
        </header>

        <main className="w-full">
          <RowDetailModal 
            isOpen={isRowModalOpen}
            onClose={handleRowModalClose}
            row={selectedRow}
            isEditMode={isRowEditMode}
            setIsEditMode={setIsRowEditMode}
            editedRowData={editedRowData}
            setEditedRowData={setEditedRowData}
            onDelete={handleDeleteRow}
            onSave={handleSaveRowChanges}
          />

          {activeTab === 'dashboard' && (
            <DashboardTab 
              receiptFiles={receiptFiles} setReceiptFiles={setReceiptFiles}
              formFiles={formFiles} setFormFiles={setFormFiles}
              processingState={processingState} results={results} errorMessage={errorMessage}
              onProcess={handleProcess} onReset={resetAll}
              isEditing={isEditing} setIsEditing={setIsEditing}
              handleSaveEdit={handleSaveEdit} handleCancelEdit={handleCancelEdit}
              handleSmartSave={handleSmartSave} saveStatus={saveStatus} isSaving={isSaving}
              handleCopyEmail={handleCopyEmail} emailCopied={emailCopied} handleStartNewAudit={handleStartNewAudit}
              parsedTransactions={parsedTransactions} handleTransactionNabChange={handleTransactionNabChange}
              handleCopyField={handleCopyField} copiedField={copiedField}
              editableContent={editableContent} setEditableContent={setEditableContent}
            />
          )}

          {activeTab === 'database' && (
            <DatabaseTab 
              filteredRows={filteredDatabaseRows} searchTerm={searchTerm} setSearchTerm={setSearchTerm}
              onDownloadCSV={handleDownloadCSV} onRefresh={fetchHistory} loading={loadingHistory}
              onRowClick={handleRowClick}
            />
          )}

          {activeTab === 'nab_log' && (
            <NabTab 
              pendingTotal={pendingTotal} pendingTx={pendingTx} paidTx={paidTx}
              onCopyBatch={copyBatchPaymentList} reportCopied={reportCopied}
              copiedField={copiedField} setCopiedField={setCopiedField}
            />
          )}

          {activeTab === 'eod' && (
            <EodTab 
              date={eodDate} setDate={setEodDate} total={eodTotal} count={eodRows.length} rows={eodRows}
              onCopyReport={() => {
                navigator.clipboard.writeText(generateEodReportText());
                setReportCopied('eod'); setTimeout(() => setReportCopied(null), 2000);
              }}
              reportCopied={reportCopied} reportText={generateEodReportText()}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsTab data={analyticsData} />
          )}

          {activeTab === 'settings' && (
            <SettingsTab 
              employeeText={employeeRawText} setEmployeeText={setEmployeeRawText}
              onSaveEmployees={handleSaveEmployeeList} saveStatus={saveEmployeeStatus}
              importing={importing} onImport={handleImportFile}
              dismissedCount={dismissedIds.length} onRestoreDismissed={onRestoreDismissed}
              onResetDefaults={onResetDefaults}
            />
          )}
        </main>
      </div>
    </div>
  );
};