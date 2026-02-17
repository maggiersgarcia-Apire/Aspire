import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  RefreshCw, AlertCircle, Send, LayoutDashboard, CheckCircle, 
  UserCheck, Edit2, X, Check, CloudUpload, Copy, CreditCard, 
  ClipboardList, Trash2, Database, Search, Download, User, Users, Save, HelpCircle
} from 'lucide-react';
import { supabase } from './services/supabaseClient';
import { analyzeReimbursement } from './services/geminiService';
import { fileToBase64 } from './utils/fileHelpers';
import { FileWithPreview, ProcessingResult, ProcessingState } from './types';
import FileUpload from './components/FileUpload';
import ProcessingStep from './components/ProcessingStep';
import MarkdownRenderer from './components/MarkdownRenderer';
import Logo from './components/Logo';

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
    let bestMatch: Employee | null = null;

    for (const emp of employees) {
        const full = emp.fullName.toLowerCase();
        if (normalizedInput.includes(full) || full.includes(normalizedInput)) {
            return emp;
        }
    }
    return null;
};

export const App = () => {
  const [receiptFiles, setReceiptFiles] = useState<FileWithPreview[]>([]);
  const [formFiles, setFormFiles] = useState<FileWithPreview[]>([]);
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [results, setResults] = useState<ProcessingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editableContent, setEditableContent] = useState('');
  const [nabReference, setNabReference] = useState('');
  
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error' | 'duplicate'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  
  const [emailCopied, setEmailCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [reportCopied, setReportCopied] = useState<'nab' | 'eod' | null>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'database' | 'nab_log' | 'eod' | 'settings'>('dashboard');
  const [loadingSplash, setLoadingSplash] = useState(true);

  // Database / History State
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Employee Database State
  const [employeeList, setEmployeeList] = useState<Employee[]>([]);
  const [employeeRawText, setEmployeeRawText] = useState(DEFAULT_EMPLOYEE_DATA);
  const [saveEmployeeStatus, setSaveEmployeeStatus] = useState<'idle' | 'saved'>('idle');

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

  const handleNabReferenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNabReference(e.target.value);
    // Update email content if we have results
    if (results && results.phase4) {
        let newContent = isEditing ? editableContent : results.phase4;
        if (newContent.includes('**NAB Reference:**')) {
            newContent = newContent.replace(/\*\*NAB Reference:\*\* .*/, `**NAB Reference:** ${e.target.value}`);
        } else {
             newContent += `\n**NAB Reference:** ${e.target.value}`;
        }
        
        if (isEditing) {
            setEditableContent(newContent);
        } else {
            setResults({ ...results, phase4: newContent });
        }
    }
  };

  const showJulianApproval = () => {
      if (!results) return false;
      return results.phase3.includes("Email Type C") || results.phase4.includes("Julian");
  };

  const handleJulianApproval = () => {
      if (!results) return;

      const currentContent = results.phase4;
      
      // Extract data from current content or phase 1
      const getField = (regex: RegExp) => {
          const match = currentContent.match(regex);
          return match ? match[1].trim() : null;
      };

      const staffName = getField(/\*\*Staff Member:\*\*\s*(.*)/) || getField(/Staff Member:\s*(.*)/) || "Unknown";
      let amount = getField(/\*\*Amount:\*\*\s*(.*)/) || getField(/Amount:\s*(.*)/) || "0.00";
      // Sanitize Amount
      amount = amount.replace('(Based on Receipts/Form Audit)', '').trim();

      const client = getField(/\*\*Client \/ Location:\*\*\s*(.*)/) || getField(/Client \/ Location:\s*(.*)/) || "N/A";
      
      // Attempt to find Receipt ID in Phase 1 if not in Phase 4
      let receiptId = getField(/\*\*Receipt ID:\*\*\s*(.*)/);
      if (!receiptId && results.phase1) {
          const phase1Id = results.phase1.match(/\*\*Receipt ID:\*\* (.*)/) || results.phase1.match(/Receipt ID: (.*)/);
          receiptId = phase1Id ? phase1Id[1].trim() : "generated-ref";
      }

      const approvedContent = `Hi,

I hope this message finds you well.

I am writing to confirm that your reimbursement request has been successfully processed today.

**Staff Member:** ${staffName}
**Client / Location:** ${client}
**Approved By:** Julian
**Amount:** ${amount}
**Receipt ID:** ${receiptId || 'PENDING'}
**NAB Reference:** PENDING

Here is the full breakdown of the items analyzed from your receipts:

${results.phase1}

**TOTAL AMOUNT: ${amount}**
`;

      setResults({
          ...results,
          phase4: approvedContent,
          // Modifying phase3 to remove the trigger condition so the button disappears after approval
          phase3: results.phase3.replace("Email Type C", "Email Type B (Julian Approved)")
      });
  };

  const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
          const { data, error } = await supabase
              .from('audit_logs')
              .select('*')
              .order('created_at', { ascending: false });
          
          if (error) throw error;
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
          const receiptId = record.nab_code || 'N/A';
          const timestamp = new Date(record.created_at).toLocaleString();
          
          // Extract basic info
          const staffName = record.staff_name || 'Unknown';
          const amountMatch = content.match(/\*\*Amount:\*\*\s*(.*)/);
          let totalAmount = record.amount || (amountMatch ? amountMatch[1].trim() : '0.00');
          // Sanitize Total Amount
          totalAmount = totalAmount.replace('(Based on Receipts/Form Audit)', '').trim();
          
          const ypMatch = content.match(/\*\*Client \/ Location:\*\*\s*(.*)/);
          const ypName = ypMatch ? ypMatch[1].trim() : 'N/A';
          
          const dateProcessed = new Date(record.created_at).toLocaleDateString();
          const nabRefDisplay = record.nab_code || 'PENDING';

          // 2. Extract Table Rows
          // Find the detailed table section. It usually starts after the headers and before "Summary:"
          // We look for lines starting with |
          const lines = content.split('\n');
          let foundTable = false;
          let tableRowsFound = false;

          for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              
              if (line.startsWith('| Receipt #') || line.startsWith('|Receipt #')) {
                  foundTable = true;
                  continue; // Skip header
              }
              if (foundTable && line.startsWith('| :---')) {
                  continue; // Skip separator
              }
              if (foundTable && line.startsWith('|')) {
                  // This is a data row
                  // Format: | Receipt # | Store Name Date & Time | Product | Category | Item Amount | Grand Total |
                  const cols = line.split('|').map((c: string) => c.trim()).filter((c: string) => c !== '');
                  
                  if (cols.length >= 5) {
                      tableRowsFound = true;
                      // Attempt to extract date from Store Name (Col 1)
                      // content: "Kmart Minto 06/02/26 10:59"
                      const storeCol = cols[1];
                      const dateMatch = storeCol.match(/(\d{2}\/\d{2}\/\d{2,4})/);
                      const receiptDate = dateMatch ? dateMatch[1] : dateProcessed;

                      allRows.push({
                          id: `${internalId}-${i}`, // Unique key for React using DB ID
                          uid: receiptId, // Display Receipt ID/Reference in UID column
                          internalId: internalId,
                          timestamp,
                          ypName,
                          staffName,
                          product: cols[2], // Product Name
                          expenseType: cols[3], // Category
                          receiptDate,
                          amount: cols[4], // Item Amount
                          totalAmount: cols[5], // Grand Total
                          dateProcessed,
                          nabCode: nabRefDisplay // Display Bank Ref in Nab Code column
                      });
                  }
              }
              // Stop if we hit end of table (usually an empty line or Summary)
              if (foundTable && line === '') {
                  foundTable = false;
              }
          }

          // Fallback if no table found (e.g. old data format or parsing fail)
          if (!tableRowsFound) {
              allRows.push({
                  id: `${internalId}-summary`,
                  uid: receiptId,
                  internalId: internalId,
                  timestamp,
                  ypName,
                  staffName,
                  product: 'N/A',
                  expenseType: 'Uncategorized (Legacy)',
                  receiptDate: dateProcessed,
                  amount: totalAmount,
                  totalAmount: totalAmount,
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
          r.amount.includes(lower) ||
          r.uid.toLowerCase().includes(lower)
      );
  }, [databaseRows, searchTerm]);

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
                escape(row.uid),
                escape(row.timestamp),
                escape(row.ypName),
                escape(row.staffName),
                escape(row.expenseType),
                escape(row.product),
                escape(row.receiptDate),
                escape(row.amount),
                escape(row.totalAmount),
                escape(row.dateProcessed),
                escape(row.nabCode)
            ].join(',');
        })
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
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
    setReceiptFiles([]);
    setFormFiles([]);
    setProcessingState(ProcessingState.IDLE);
    setResults(null);
    setErrorMessage(null);
    setEmailCopied(false);
    setSaveStatus('idle');
    setIsEditing(false);
    setNabReference('');
  };

  const handleCopyEmail = async () => {
    if (!results?.phase4) return;
    if (isEditing) {
        navigator.clipboard.writeText(editableContent);
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
        return;
    }
    const emailElement = document.getElementById('email-output-content');
    if (emailElement) {
        try {
            const blobHtml = new Blob([emailElement.innerHTML], { type: 'text/html' });
            const blobText = new Blob([emailElement.innerText], { type: 'text/plain' });
            const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
            await navigator.clipboard.write(data);
            setEmailCopied(true);
            setTimeout(() => setEmailCopied(false), 2000);
            return;
        } catch (e) {
            console.warn("ClipboardItem API failed", e);
        }
    }
    navigator.clipboard.writeText(results.phase4);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const handleCopyField = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Generic Function to Copy HTML Element to Clipboard (for Outlook Tables)
  const handleCopyTable = async (elementId: string, type: 'nab' | 'eod') => {
      const element = document.getElementById(elementId);
      if (!element) return;
      try {
          const blobHtml = new Blob([element.outerHTML], { type: 'text/html' });
          const blobText = new Blob([element.innerText], { type: 'text/plain' });
          const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
          await navigator.clipboard.write(data);
          setReportCopied(type);
          setTimeout(() => setReportCopied(null), 2000);
      } catch (e) {
          console.error("Failed to copy table", e);
      }
  };

  const handleSaveToCloud = async (contentOverride?: string) => {
    const contentToSave = contentOverride || (isEditing ? editableContent : results?.phase4);
    if (!contentToSave) return;
    
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const staffNameMatch = contentToSave.match(/\*\*Staff Member:\*\*\s*(.*)/);
      const amountMatch = contentToSave.match(/\*\*Amount:\*\*\s*(.*)/);
      const receiptIdMatch = contentToSave.match(/\*\*Receipt ID:\*\*\s*(.*)/);
      // const nabRefMatch = contentToSave.match(/\*\*NAB Reference:\*\*\s*(.*)/);

      const staffName = staffNameMatch ? staffNameMatch[1].trim() : 'Unknown';
      // Sanitize Amount
      const amount = amountMatch ? amountMatch[1].replace('(Based on Receipts/Form Audit)', '').trim() : '0.00';
      
      let uniqueReceiptId = receiptIdMatch ? receiptIdMatch[1].trim() : null;
      
      // Fallback for Discrepancies which don't have Receipt ID in the email body
      // We generate a unique ID so it can be saved to Supabase (assuming nab_code might be a PK or unique)
      if (!uniqueReceiptId && (contentToSave.toLowerCase().includes('discrepancy') || contentToSave.toLowerCase().includes('mismatch') || contentToSave.includes('STATUS: PENDING'))) {
          uniqueReceiptId = `DISC-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      }

      if (uniqueReceiptId) {
          const { data: existingData } = await supabase
              .from('audit_logs')
              .select('id')
              .eq('nab_code', uniqueReceiptId)
              .single();
          
          if (existingData) {
              setSaveStatus('duplicate');
              setIsSaving(false);
              setErrorMessage(`Duplicate Receipt Detected! ID: ${uniqueReceiptId} already exists.`);
              return; 
          }
      }

      const payload = {
        staff_name: staffName,
        amount: amount,
        nab_code: uniqueReceiptId, 
        full_email_content: contentToSave, 
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('audit_logs').insert([payload]);
      if (error) throw error;

      setSaveStatus('success');
      
    } catch (error) {
      console.error("Supabase Save Error:", error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmSave = (status: 'PENDING' | 'PAID') => {
      const tag = status === 'PENDING' ? '\n\n<!-- STATUS: PENDING -->' : '\n\n<!-- STATUS: PAID -->';
      const baseContent = isEditing ? editableContent : results?.phase4 || '';
      // Only append if not already there to avoid duplicates if re-saving
      const finalContent = baseContent.includes('<!-- STATUS:') ? baseContent : baseContent + tag;
      
      handleSaveToCloud(finalContent);
      setShowSaveModal(false);
  };

  const handleProcess = async () => {
    if (receiptFiles.length === 0) {
      setErrorMessage("Please upload at least one receipt.");
      return;
    }

    setProcessingState(ProcessingState.PROCESSING);
    setErrorMessage(null);
    setResults(null);
    setEmailCopied(false);
    setSaveStatus('idle');
    setIsEditing(false);
    setNabReference('');

    try {
      const receiptImages = await Promise.all(receiptFiles.map(async (file) => ({
        mimeType: file.type || 'application/octet-stream', 
        data: await fileToBase64(file),
        name: file.name
      })));

      const formImage = formFiles.length > 0 ? {
        mimeType: formFiles[0].type || 'application/octet-stream',
        data: await fileToBase64(formFiles[0]),
        name: formFiles[0].name
      } : null;

      const fullResponse = await analyzeReimbursement(receiptImages, formImage);

      const parseSection = (tagStart: string, tagEnd: string, text: string) => {
        const startIdx = text.indexOf(tagStart);
        const endIdx = text.indexOf(tagEnd);
        if (startIdx === -1 || endIdx === -1) return "Section not found or parsing error.";
        return text.substring(startIdx + tagStart.length, endIdx).trim();
      };

      if (!fullResponse) throw new Error("No response from AI");

      let phase1 = parseSection('<<<PHASE_1_START>>>', '<<<PHASE_1_END>>>', fullResponse);
      const phase2 = parseSection('<<<PHASE_2_START>>>', '<<<PHASE_2_END>>>', fullResponse);
      const phase3 = parseSection('<<<PHASE_3_START>>>', '<<<PHASE_3_END>>>', fullResponse);
      let phase4 = parseSection('<<<PHASE_4_START>>>', '<<<PHASE_4_END>>>', fullResponse);

      // --- AUTO-CORRECT STAFF NAME LOGIC ---
      const staffNameMatch = phase4.match(/\*\*Staff Member:\*\*\s*(.*)/);
      if (staffNameMatch) {
          const originalName = staffNameMatch[1].trim();
          const matchedEmployee = findBestEmployeeMatch(originalName, employeeList);
          
          if (matchedEmployee) {
              // Replace in Phase 4
              // "Concatenate" is usually "Surname, Firstname"
              phase4 = phase4.replace(originalName, matchedEmployee.fullName);
              
              // Optionally replace in Phase 1 if present
               if (phase1.includes(originalName)) {
                   phase1 = phase1.replace(originalName, matchedEmployee.fullName);
               }
          }
      }
      // -------------------------------------

      setResults({ phase1, phase2, phase3, phase4 });
      setProcessingState(ProcessingState.COMPLETE);
    } catch (err: any) {
      console.error(err);
      let msg = err.message || "An unexpected error occurred during processing.";
      if (msg.includes('400')) msg = "Error 400: The AI could not process the file. Please ensure you are uploading valid Images, PDFs, Word Docs, or Excel files.";
      setErrorMessage(msg);
      setProcessingState(ProcessingState.ERROR);
    }
  };

  const handleSaveEdit = () => {
     if (results) {
         setResults({ ...results, phase4: editableContent });
         setIsEditing(false);
     }
  };

  const handleCancelEdit = () => {
      if (results) setEditableContent(results.phase4);
      setIsEditing(false);
  };

  // REPLACED OLD DELETE HANDLER WITH DISMISS HANDLER TO PRESERVE HISTORY
  const handleDismissDiscrepancy = (id: number) => {
      // Logic Refinement: "Manual deletion required after resolution."
      // Interpreted as removing from this specific list only.
      if (!window.confirm("Resolve this discrepancy? This will remove it from the Outstanding list but keep the record in the Daily Activity Tracker.")) return;
      
      const newIds = [...dismissedIds, id];
      setDismissedIds(newIds);
      localStorage.setItem('aspire_dismissed_discrepancies', JSON.stringify(newIds));
  };

  // Helper to extract fields for reports from stored content (For NAB/EOD tabs)
  // MODIFIED: Takes raw records and returns processed records without filtering by date initially
  const processRecords = (records: any[]) => {
      return records.map(r => {
          const content = r.full_email_content || "";
          
          const nabRefMatch = content.match(/\*\*NAB Reference:?\*\*?\s*(.*?)(?:\n|$)/i);
          const clientMatch = content.match(/\*\*Client \/ Location:\*\*\s*(.*?)(?:\n|$)/i);

          // Identify Status based on content content OR manual tags
          let isDiscrepancy = false;
          if (content.includes("<!-- STATUS: PENDING -->")) {
              isDiscrepancy = true;
          } else if (content.includes("<!-- STATUS: PAID -->")) {
              isDiscrepancy = false;
          } else {
              // Fallback to AI text analysis
              isDiscrepancy = content.toLowerCase().includes("discrepancy was found") || 
                              content.toLowerCase().includes("mismatch") ||
                              !content.toLowerCase().includes("successfully processed");
          }
          
          const clientName = clientMatch ? clientMatch[1].trim() : 'N/A';
          const nabRef = nabRefMatch ? nabRefMatch[1].trim() : (isDiscrepancy ? 'N/A' : 'PENDING');

          // EXTRACT DISCREPANCY REASON (EOD)
          let discrepancyReason = '';
          if (isDiscrepancy) {
              const formAmountMatch = content.match(/Amount on Form:\s*\$([0-9,.]+)/);
              const receiptAmountMatch = content.match(/Actual Receipt Total:\s*\$([0-9,.]+)/);
              if (formAmountMatch && receiptAmountMatch) {
                  discrepancyReason = `Mismatch: Form $${formAmountMatch[1]} / Rcpt $${receiptAmountMatch[1]}`;
              } else {
                  discrepancyReason = 'Discrepancy / Pending';
              }
          }

          return {
              ...r,
              nabRef: nabRef,
              clientName: clientName,
              isDiscrepancy: isDiscrepancy,
              discrepancyReason: discrepancyReason,
              time: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              date: new Date(r.created_at).toLocaleDateString(),
              created_at: r.created_at, // Ensure created_at is passed through
              id: r.id, // Ensure ID is passed through
              staff_name: r.staff_name || 'Unknown',
              // Sanitize amount immediately upon processing for all views
              amount: (r.amount || '0.00').replace('(Based on Receipts/Form Audit)', '').trim(),
              // Helper for Today check
              isToday: new Date(r.created_at).toDateString() === new Date().toDateString()
          };
      });
  };

  // Generate EOD Schedule (Sequential time from 7:00 AM)
  const generateEODSchedule = (records: any[]) => {
     if (records.length === 0) return [];

     let currentTime = new Date();
     currentTime.setHours(7, 0, 0, 0); // Start at 7:00 AM
     
     const scheduled = records.map(record => {
         const activity = record.isDiscrepancy ? 'Pending' : 'Reimbursement';

         // LOGIC BASED ON EXCEL FORMULA:
         // IF(curr="Reimbursement", TIME(0, RANDBETWEEN(10,15), 0), TIME(0, RANDBETWEEN(15,20), 0))
         let duration = 0;
         if (activity === 'Reimbursement') {
             duration = Math.floor(Math.random() * (15 - 10 + 1) + 10); // 10 to 15 mins
         } else {
             // Pending or other
             duration = Math.floor(Math.random() * (20 - 15 + 1) + 15); // 15 to 20 mins
         }
         
         const startTime = new Date(currentTime);
         const endTime = new Date(currentTime);
         endTime.setMinutes(endTime.getMinutes() + duration);
         
         // Formatting HH:MM:SS
         const timeStartStr = startTime.toLocaleTimeString('en-GB', { hour12: false });
         const timeEndStr = endTime.toLocaleTimeString('en-GB', { hour12: false });
         
         // Update current time for next row (End + 1 min gap per formula: prev_end + TIME(0, 1, 0))
         currentTime = new Date(endTime);
         currentTime.setMinutes(currentTime.getMinutes() + 1);
         
         // Status Logic
         let status = '';
         if (record.isDiscrepancy) {
             status = `🔴 ${record.discrepancyReason}`; // Show specific reason
         } else {
             // Treat all amounts same regardless of value (user request to remove High Value warning)
             status = `🟩 PAID TO NAB ${record.amount} ${record.staff_name} ${record.nabRef}`;
         }

         return {
             ...record,
             eodTimeStart: timeStartStr,
             eodTimeEnd: timeEndStr,
             eodActivity: activity,
             eodStatus: status
         };
     });

     // Extract Payment Details for Dashboard Card (only if no discrepancy)
     return scheduled;
  };

  const getDashboardPaymentDetails = () => {
      if (!results?.phase4) return null;
      
      const isDiscrepancy = results.phase4.toLowerCase().includes("discrepancy was found") || 
                            results.phase4.toLowerCase().includes("mismatch");
      
      if (isDiscrepancy) return null;

      const staffNameMatch = results.phase4.match(/\*\*Staff Member:\*\*\s*(.*)/);
      const amountMatch = results.phase4.match(/\*\*Amount:\*\*\s*(.*)/);
      const receiptIdMatch = results.phase4.match(/\*\*Receipt ID:\*\*\s*(.*)/);

      let rawName = staffNameMatch ? staffNameMatch[1].trim() : 'Unknown';
      let formattedName = rawName;
      
      // Convert "LAST, FIRST" to "FIRST LAST"
      if (rawName.includes(',')) {
          const parts = rawName.split(',');
          if (parts.length >= 2) {
              formattedName = `${parts[1].trim()} ${parts[0].trim()}`;
          }
      }

      return {
          name: formattedName,
          amount: amountMatch ? amountMatch[1].trim() : '0.00',
          ref: receiptIdMatch ? receiptIdMatch[1].trim() : 'N/A'
      };
  };

  // DATA PROCESSING LOGIC UPDATE
  const allProcessedRecords = useMemo<any[]>(() => processRecords(historyData), [historyData]);

  // Today's records for EOD Schedule & NAB Log
  const todaysProcessedRecords = useMemo<any[]>(() => {
      return allProcessedRecords
        .filter(r => r.isToday)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [allProcessedRecords]);

  // Outstanding Discrepancies (ALL TIME - Persistent until dismissed)
  const pendingRecords = useMemo(() => {
      return allProcessedRecords
          .filter(r => r.isDiscrepancy && !dismissedIds.includes(r.id))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // Newest first
  }, [allProcessedRecords, dismissedIds]);

  // Derived Data for Views
  const eodData = generateEODSchedule(todaysProcessedRecords);
  
  // Counts for Today (EOD Header)
  const reimbursementCount = todaysProcessedRecords.filter(r => !r.isDiscrepancy).length;
  // This pending count in header usually refers to today's pending items found
  const pendingCountToday = todaysProcessedRecords.filter(r => r.isDiscrepancy).length;

  // NAB Log (Today)
  const nabReportData: any[] = todaysProcessedRecords.filter(r => !r.isDiscrepancy);
  const totalAmount = nabReportData.reduce((sum, r) => sum + parseFloat(r.amount.replace(/[^0-9.-]+/g,"")), 0);
  
  const dashboardPaymentDetails = getDashboardPaymentDetails();

  // Helper to determine what text to show on Save Button
  const getSaveButtonText = () => {
      if (isSaving) return <><RefreshCw size={12} className="animate-spin" /> Saving...</>;
      if (saveStatus === 'success') return <><RefreshCw size={12} strokeWidth={2.5} /> Start New Audit</>;
      if (saveStatus === 'error') return <><CloudUpload size={12} strokeWidth={2.5} /> Retry Save</>;
      if (saveStatus === 'duplicate') return <><CloudUpload size={12} strokeWidth={2.5} /> Duplicate!</>;
      
      // Dynamic Label based on Result Type
      if (results?.phase4.toLowerCase().includes('discrepancy')) {
          return <><CloudUpload size={12} strokeWidth={2.5} /> Save Record</>;
      }
      return <><CloudUpload size={12} strokeWidth={2.5} /> Save & Pay</>;
  };

  // Splash Screen Render
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
      {/* BACKGROUND WATERMARKS REMOVED AS REQUESTED */}

      {/* SAVE CONFIRMATION MODAL */}
      {showSaveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-[#1c1e24] border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                  <div className="flex flex-col items-center text-center space-y-6">
                      <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                          <HelpCircle size={32} />
                      </div>
                      <div className="space-y-2">
                          <h3 className="text-xl font-bold text-white">Confirm Transaction Status</h3>
                          <p className="text-slate-400 text-sm">Is this transaction PENDING (Discrepancy) or ready to be PAID?</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 w-full">
                          <button 
                              onClick={() => confirmSave('PENDING')}
                              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group"
                          >
                              <AlertCircle className="text-red-400 group-hover:scale-110 transition-transform" />
                              <span className="text-sm font-bold text-red-400">PENDING</span>
                              <span className="text-[10px] text-red-300 opacity-60">Discrepancy Found</span>
                          </button>
                          <button 
                              onClick={() => confirmSave('PAID')}
                              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all group"
                          >
                              <CheckCircle className="text-emerald-400 group-hover:scale-110 transition-transform" />
                              <span className="text-sm font-bold text-emerald-400">PAID / PROCESSED</span>
                              <span className="text-[10px] text-emerald-300 opacity-60">Reimbursement Success</span>
                          </button>
                      </div>
                      <button 
                          onClick={() => setShowSaveModal(false)}
                          className="text-slate-500 hover:text-white text-sm font-medium transition-colors"
                      >
                          Cancel
                      </button>
                  </div>
              </div>
          </div>
      )}

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
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('database')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'database' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              Database
            </button>
            <button 
              onClick={() => setActiveTab('nab_log')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'nab_log' ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              NAB
            </button>
            <button 
              onClick={() => setActiveTab('eod')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'eod' ? 'bg-indigo-500/20 text-indigo-400 shadow-sm border border-indigo-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              EOD
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              Settings
            </button>
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
          {activeTab === 'dashboard' && (
            <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-full lg:w-[400px] space-y-6 flex-shrink-0">
                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden relative group">
                  <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                  <div className="px-6 py-6 border-b border-white/5 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-white tracking-tight">Documents</h2>
                    {results && (
                      <button onClick={resetAll} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
                        <RefreshCw size={16} />
                      </button>
                    )}
                  </div>
                  <div className="p-6 space-y-8">
                    <FileUpload 
                      label="1. Receipt Images" 
                      description="Screenshots, Images, PDF, Word, Excel"
                      files={receiptFiles} 
                      onFilesChange={setReceiptFiles} 
                      multiple={true}
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv"
                    />
                    <div className="relative">
                       <div className="absolute inset-0 flex items-center" aria-hidden="true">
                         <div className="w-full border-t border-white/5"></div>
                       </div>
                       <div className="relative flex justify-center">
                         <span className="bg-[#1c1e24] px-2 text-xs text-slate-500 uppercase tracking-widest">Optional</span>
                       </div>
                    </div>
                    <FileUpload 
                      label="2. Reimbursement Form" 
                      description="Form Image, PDF, Word, Excel"
                      files={formFiles} 
                      onFilesChange={setFormFiles}
                      accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv"
                    />
                    {errorMessage && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
                        <AlertCircle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
                        <p className="text-sm text-red-200">{errorMessage}</p>
                      </div>
                    )}
                    <button
                      onClick={handleProcess}
                      disabled={processingState === ProcessingState.PROCESSING || receiptFiles.length === 0}
                      className={`w-full group relative flex justify-center items-center gap-3 py-4 px-6 rounded-2xl font-semibold text-white transition-all duration-300 shadow-[0_0_20px_rgba(79,70,229,0.1)]
                        ${processingState === ProcessingState.PROCESSING 
                          ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                          : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-[0_0_30px_rgba(79,70,229,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                    >
                      {processingState === ProcessingState.PROCESSING ? (
                        <>Processing...</>
                      ) : (
                        <>
                          <Send size={18} strokeWidth={2.5} />
                          Start Audit
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className="bg-[#1c1e24]/60 backdrop-blur-md rounded-[32px] border border-white/5 shadow-lg p-6 relative">
                   <h3 className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest pl-1">Process Status</h3>
                   <div className="space-y-6 pl-2">
                     <ProcessingStep status={processingState === ProcessingState.IDLE ? 'idle' : 'complete'} title="Upload" description="Receipts & Forms received" />
                     <ProcessingStep status={processingState === ProcessingState.PROCESSING ? 'processing' : results ? 'complete' : 'idle'} title="AI Extraction" description="Analyzing receipt data" />
                     <ProcessingStep status={processingState === ProcessingState.PROCESSING ? 'idle' : results ? 'complete' : 'idle'} title="Rule Engine" description="Validating policy limits" />
                     <ProcessingStep status={processingState === ProcessingState.PROCESSING ? 'idle' : results ? 'complete' : 'idle'} title="Final Decision" description="Email generation" />
                   </div>
                </div>
              </div>

              <div className="flex-1 space-y-6 min-h-[600px]">
                {!results && processingState === ProcessingState.IDLE && (
                   <div className="h-full flex flex-col items-center justify-center text-slate-500 bg-[#1c1e24]/30 border border-dashed border-white/5 rounded-[32px] p-12 text-center backdrop-blur-sm">
                      <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                        <LayoutDashboard size={40} className="text-slate-600" />
                      </div>
                      <h2 className="text-2xl font-bold text-white mb-2">Audit Dashboard</h2>
                      <p className="max-w-sm mx-auto text-slate-400">Upload documents on the left panel to begin the AI-powered auditing process.</p>
                   </div>
                )}
                {!results && processingState === ProcessingState.PROCESSING && (
                   <div className="h-full flex flex-col items-center justify-center bg-[#1c1e24]/30 border border-white/5 rounded-[32px] p-12 backdrop-blur-sm">
                      <div className="relative w-24 h-24 mb-8">
                         <div className="absolute inset-0 border-t-4 border-indigo-400 rounded-full animate-spin"></div>
                         <div className="absolute inset-2 border-r-4 border-blue-400 rounded-full animate-spin animation-delay-150"></div>
                         <div className="absolute inset-4 border-b-4 border-purple-400 rounded-full animate-spin animation-delay-300"></div>
                      </div>
                      <h2 className="text-xl font-bold text-white">Analyzing Documents...</h2>
                      <p className="text-slate-400 mt-2 animate-pulse">Running compliance checks</p>
                   </div>
                )}
                {results && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full content-start">
                    <div className="bg-[#1c1e24]/80 backdrop-blur-xl rounded-[32px] border border-white/5 overflow-hidden shadow-lg hover:border-white/10 transition-colors">
                      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-8 bg-indigo-400 rounded-full shadow-[0_0_10px_rgba(129,140,248,0.5)]"></div>
                          <h3 className="font-semibold text-white text-lg">Receipt Analysis</h3>
                        </div>
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded-md border border-indigo-500/20 uppercase tracking-wider font-bold">Phase 1</span>
                      </div>
                      <div className="p-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                        <MarkdownRenderer content={results.phase1} />
                      </div>
                    </div>
                    <div className="bg-[#1c1e24]/80 backdrop-blur-xl rounded-[32px] border border-white/5 overflow-hidden shadow-lg hover:border-white/10 transition-colors">
                      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                        <div className="flex items-center gap-3">
                           <div className="w-2 h-8 bg-blue-400 rounded-full shadow-[0_0_10px_rgba(96,165,250,0.5)]"></div>
                           <h3 className="font-semibold text-white text-lg">Standardization</h3>
                        </div>
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded-md border border-blue-500/20 uppercase tracking-wider font-bold">Phase 2</span>
                      </div>
                      <div className="p-6 bg-[#111216] font-mono text-xs text-slate-300 overflow-x-auto">
                         <pre className="whitespace-pre-wrap">{results.phase2.replace(/```pgsql/g, '').replace(/```sql/g, '').replace(/```/g, '').trim()}</pre>
                      </div>
                    </div>
                    <div className="bg-[#1c1e24]/80 backdrop-blur-xl rounded-[32px] border border-white/5 overflow-hidden shadow-lg hover:border-white/10 transition-colors xl:col-span-2">
                      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                        <div className="flex items-center gap-3">
                           <div className="w-2 h-8 bg-purple-400 rounded-full shadow-[0_0_10px_rgba(192,132,252,0.5)]"></div>
                           <h3 className="font-semibold text-white text-lg">Audit Rules Engine</h3>
                        </div>
                        <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-1 rounded-md border border-purple-500/20 uppercase tracking-wider font-bold">Phase 3</span>
                      </div>
                      <div className="p-6">
                        <MarkdownRenderer content={results.phase3} />
                      </div>
                    </div>
                    <div className="bg-indigo-500/5 backdrop-blur-xl rounded-[32px] border border-indigo-500/20 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.3)] xl:col-span-2 relative">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] pointer-events-none"></div>
                       <div className="px-6 py-4 border-b border-indigo-500/10 flex items-center justify-between bg-indigo-500/10">
                        <div className="flex items-center gap-3">
                           <div className="w-2 h-8 bg-indigo-400 rounded-full shadow-[0_0_15px_rgba(129,140,248,0.8)]"></div>
                           <h3 className="font-bold text-white text-lg flex items-center gap-2">
                              <CheckCircle size={24} className="text-lime-400" />
                              Final Decision & Email
                           </h3>
                        </div>
                        <div className="flex gap-2">
                            {!isEditing && showJulianApproval() && (
                                <button onClick={handleJulianApproval} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-all shadow-lg border border-amber-500/20">
                                     <UserCheck size={12} strokeWidth={2.5} /> Approved by Julian
                                </button>
                            )}
                            {!isEditing ? (
                              <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-white/10 text-white hover:bg-white/20 transition-all shadow-lg">
                                <Edit2 size={12} strokeWidth={2.5} /> Override / Edit
                              </button>
                            ) : (
                                <>
                                  <button onClick={handleCancelEdit} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all shadow-lg">
                                    <X size={12} strokeWidth={3} /> Cancel
                                  </button>
                                  <button onClick={handleSaveEdit} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-lg">
                                    <Check size={12} strokeWidth={3} /> Save Changes
                                  </button>
                                </>
                            )}
                            <button 
                                onClick={() => setShowSaveModal(true)} 
                                disabled={isSaving || isEditing} 
                                className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 ${saveStatus === 'success' ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' : saveStatus === 'error' || saveStatus === 'duplicate' ? 'bg-red-500 text-white shadow-red-500/20' : isEditing ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed' : 'bg-slate-700 text-white hover:bg-slate-600 shadow-slate-900/20'}`}
                            >
                                {getSaveButtonText()}
                            </button>
                            <button onClick={handleCopyEmail} disabled={isEditing} className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 ${emailCopied ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' : isEditing ? 'bg-indigo-500/50 text-white/50 cursor-not-allowed' : 'bg-indigo-500 text-white shadow-indigo-500/20 hover:bg-indigo-600 hover:scale-105 active:scale-95'}`}>
                              {emailCopied ? (<><Check size={12} strokeWidth={3} /> Copied!</>) : (<><Copy size={12} strokeWidth={3} /> Copy for Outlook</>)}
                            </button>
                        </div>
                      </div>

                      {/* Banking Details Card (Inline, No Discrepancy) */}
                      {dashboardPaymentDetails && (
                         <div className="mx-8 mt-6 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                               <CreditCard size={80} className="text-white" />
                            </div>
                            <div className="relative z-10">
                               <h4 className="text-sm font-bold text-indigo-200 uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                                  Banking Details (Manual Transfer)
                               </h4>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="bg-black/30 rounded-xl p-3 border border-white/5 hover:border-white/10 transition-colors">
                                     <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Payee Name</p>
                                     <div className="flex justify-between items-center">
                                        <p className="text-white font-semibold truncate uppercase">{dashboardPaymentDetails.name}</p>
                                        <button onClick={() => handleCopyField(dashboardPaymentDetails.name, 'name')} className="text-indigo-400 hover:text-white transition-colors">
                                           {copiedField === 'name' ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                     </div>
                                  </div>
                                  <div className="bg-black/30 rounded-xl p-3 border border-white/5 hover:border-emerald-500/30 transition-colors">
                                     <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Amount</p>
                                     <div className="flex justify-between items-center">
                                        <p className="text-emerald-400 font-bold text-lg">{dashboardPaymentDetails.amount.replace(/[^0-9.]/g, '')}</p>
                                        <button onClick={() => handleCopyField(dashboardPaymentDetails.amount.replace(/[^0-9.]/g, ''), 'amount')} className="text-emerald-500 hover:text-white transition-colors">
                                           {copiedField === 'amount' ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                     </div>
                                  </div>
                                </div>
                            </div>
                         </div>
                      )}

                      <div className="px-8 pt-6 pb-2">
                          <label className="block text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">
                             Step 5: Enter Bank/NAB Reference
                          </label>
                          <div className="relative">
                             <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" size={16} />
                             <input type="text" value={nabReference} onChange={handleNabReferenceChange} placeholder="e.g. 562891 (From your banking app)" className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                          </div>
                          <p className="text-[10px] text-slate-500 mt-2">Paying via bank transfer? Enter the reference code here to update the email automatically.</p>
                      </div>
                      <div className="p-8">
                        <div className="bg-white rounded-xl p-8 shadow-2xl text-slate-800 selection:bg-indigo-100 selection:text-indigo-900">
                          {isEditing ? (
                             <textarea value={editableContent} onChange={(e) => setEditableContent(e.target.value)} className="w-full h-[400px] p-4 font-mono text-sm border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-900 resize-none" placeholder="Edit email content here..." />
                          ) : (
                             <MarkdownRenderer content={results.phase4} id="email-output-content" theme="light" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NAB LOG VIEW (NEW) */}
          {activeTab === 'nab_log' && (
             <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* ... content of NAB log view ... */}
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <CreditCard className="text-emerald-400" />
                      <h2 className="text-xl font-semibold text-white">NAB Banking Log (Today)</h2>
                   </div>
                   <div className="flex items-center gap-2">
                       <button onClick={() => handleCopyTable('nab-log-table', 'nab')} className={`px-4 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${reportCopied === 'nab' ? 'bg-emerald-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                          {reportCopied === 'nab' ? <Check size={16} /> : <Copy size={16} />}
                          {reportCopied === 'nab' ? 'Copied Table!' : 'Copy for Outlook'}
                       </button>
                       <button onClick={fetchHistory} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                          <RefreshCw size={18} className={loadingHistory ? 'animate-spin' : ''} />
                       </button>
                   </div>
                </div>

                <div className="p-8 overflow-x-auto">
                    {/* THIS TABLE IS DESIGNED TO BE COPIED TO OUTLOOK - INLINE STYLES ARE CRITICAL */}
                    <div className="bg-white rounded-lg p-1 overflow-hidden">
                        <table id="nab-log-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '13px', backgroundColor: '#ffffff' }}>
                           <thead>
                              <tr style={{ backgroundColor: '#f3f4f6' }}>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#111827', width: '15%' }}>Date</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>STAFF MEMBER</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>Nab Details</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'right', fontWeight: 'bold', color: '#111827', width: '15%' }}>Amount</th>
                              </tr>
                           </thead>
                           <tbody>
                              {nabReportData.map((row, idx) => (
                                 <tr key={idx} style={{ backgroundColor: '#ffffff' }}>
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', verticalAlign: 'top' }}>{row.date}</td>
                                    {/* UPPERCASE STAFF NAME ENFORCED */}
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', verticalAlign: 'top', textTransform: 'uppercase' }}>{row.staff_name.toUpperCase()}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', verticalAlign: 'top' }}>{row.nabRef}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', textAlign: 'right', verticalAlign: 'top' }}>{row.amount}</td>
                                 </tr>
                              ))}
                              {nabReportData.length === 0 && (
                                  <tr>
                                      <td colSpan={4} style={{ border: '1px solid #d1d5db', padding: '20px', textAlign: 'center', color: '#6b7280' }}>No banking records found for today.</td>
                                  </tr>
                              )}
                              {/* Total Row */}
                              <tr style={{ backgroundColor: '#f9fafb', fontWeight: 'bold' }}>
                                  <td colSpan={3} style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'right', color: '#111827' }}>Total:</td>
                                  <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'right', color: '#111827' }}>${totalAmount.toFixed(2)}</td>
                              </tr>
                           </tbody>
                        </table>
                    </div>
                </div>
             </div>
          )}

          {/* ... existing views ... */}
          {activeTab === 'eod' && (
             <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* ... content of EOD view ... */}
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <ClipboardList className="text-indigo-400" />
                      <h2 className="text-xl font-semibold text-white">Daily Activity Tracker (EOD)</h2>
                   </div>
                   <div className="flex items-center gap-2">
                       <button onClick={() => handleCopyTable('eod-report-table', 'eod')} className={`px-4 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${reportCopied === 'eod' ? 'bg-indigo-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                          {reportCopied === 'eod' ? <Check size={16} /> : <Copy size={16} />}
                          {reportCopied === 'eod' ? 'Copied Report!' : 'Copy for Outlook'}
                       </button>
                       <button onClick={fetchHistory} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                          <RefreshCw size={18} className={loadingHistory ? 'animate-spin' : ''} />
                       </button>
                   </div>
                </div>

                <div className="p-8 overflow-x-auto">
                    {/* HEADER SUMMARY SECTION */}
                    <div className="flex gap-4 mb-4 text-slate-400 font-mono text-sm">
                        <div className="bg-white/5 px-4 py-2 rounded border border-white/10">Date: <span className="text-white">{new Date().toDateString()}</span></div>
                        <div className="bg-white/5 px-4 py-2 rounded border border-white/10">TOTAL - Reimbursement: <span className="text-emerald-400 font-bold">{reimbursementCount}</span> | Pending: <span className="text-red-400 font-bold">{pendingCountToday}</span></div>
                    </div>

                    {/* THIS TABLE IS DESIGNED TO BE COPIED TO OUTLOOK - INLINE STYLES ARE CRITICAL */}
                    <div className="bg-white rounded-lg p-1 overflow-hidden">
                        <table id="eod-report-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '11px', backgroundColor: '#ffffff' }}>
                           <thead>
                              <tr style={{ backgroundColor: '#f3f4f6' }}>
                                 <th style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>TIME START</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>TIME END</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>ACTIVITY</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>NAME OF YP</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>NAME OF EMPLOYEE</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'right', fontWeight: 'bold', color: '#111827' }}>AMOUNT</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'center', fontWeight: 'bold', color: '#111827' }}>Date Received Email</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '6px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>COMMENTS/STATUS</th>
                              </tr>
                           </thead>
                           <tbody>
                              {eodData.map((row, idx) => (
                                 <tr key={idx} style={{ backgroundColor: '#ffffff' }}>
                                    <td style={{ border: '1px solid #d1d5db', padding: '6px', color: '#374151', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{row.eodTimeStart}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '6px', color: '#374151', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{row.eodTimeEnd}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '6px', color: '#374151', verticalAlign: 'middle' }}>{row.eodActivity}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '6px', color: '#374151', verticalAlign: 'middle' }}>{row.clientName}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '6px', color: '#374151', verticalAlign: 'middle', textTransform: 'uppercase' }}>{row.staff_name ? row.staff_name.toUpperCase() : ''}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '6px', color: '#374151', textAlign: 'right', verticalAlign: 'middle' }}>{row.amount}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '6px', color: '#374151', textAlign: 'center', verticalAlign: 'middle' }}>{row.date}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '6px', color: '#374151', verticalAlign: 'middle', fontSize: '10px' }}>
                                        {row.eodStatus}
                                    </td>
                                 </tr>
                              ))}
                              {eodData.length === 0 && (
                                  <tr>
                                      <td colSpan={8} style={{ border: '1px solid #d1d5db', padding: '20px', textAlign: 'center', color: '#6b7280' }}>No activity records found for today.</td>
                                  </tr>
                              )}
                           </tbody>
                        </table>
                    </div>

                    {/* OUTSTANDING PENDING SUMMARY TABLE (WITH DELETE) */}
                    <div className="mt-8 bg-red-500/5 border border-red-500/20 rounded-xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-red-500/10 flex justify-between items-center bg-red-500/5">
                            <h3 className="text-red-400 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                                <AlertCircle size={16} />
                                Outstanding Discrepancies (Follow-up Required)
                            </h3>
                            <span className="text-[10px] text-red-300 opacity-70">
                                Manual deletion required after resolution.
                            </span>
                        </div>
                        {pendingRecords.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm">
                                No pending discrepancies found for today (or all cleared). Good job!
                            </div>
                        ) : (
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-red-500/10 text-red-200">
                                        <th className="px-6 py-3 font-medium">Time / Date</th>
                                        <th className="px-6 py-3 font-medium">Staff Member</th>
                                        <th className="px-6 py-3 font-medium">Client</th>
                                        <th className="px-6 py-3 font-medium">Discrepancy Details</th>
                                        <th className="px-6 py-3 font-medium text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-red-500/10">
                                    {pendingRecords.map((record) => (
                                        <tr key={record.id} className="hover:bg-red-500/5 transition-colors">
                                            <td className="px-6 py-3 text-slate-400">
                                                {record.isToday ? record.time : <span className="text-slate-500">{record.date} {record.time}</span>}
                                            </td>
                                            <td className="px-6 py-3 text-white font-medium uppercase">{record.staff_name}</td>
                                            <td className="px-6 py-3 text-slate-300">{record.clientName}</td>
                                            <td className="px-6 py-3 text-red-300">{record.discrepancyReason}</td>
                                            <td className="px-6 py-3 text-right">
                                                <button 
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDismissDiscrepancy(record.id);
                                                    }}
                                                    className="text-slate-500 hover:text-red-400 transition-colors p-2 rounded-full hover:bg-red-500/10 relative z-10 cursor-pointer"
                                                    title="Resolve & Remove from List"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
             </div>
          )}

          {/* ... existing database view ... */}
          {activeTab === 'database' && (
             <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* ... content of database view ... */}
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <Database className="text-emerald-400" />
                      <h2 className="text-xl font-semibold text-white">Reimbursement Database (All Records)</h2>
                   </div>
                   <div className="flex items-center gap-2">
                       <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Staff, Client, or Amount..." className="bg-black/20 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 w-80" />
                       </div>
                       
                       <button onClick={handleDownloadCSV} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white" title="Download CSV">
                          <Download size={18} />
                       </button>

                       <button onClick={fetchHistory} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white" title="Refresh">
                          <RefreshCw size={18} className={loadingHistory ? 'animate-spin' : ''} />
                       </button>
                   </div>
                </div>
                <div className="p-0 overflow-x-auto">
                  {loadingHistory ? (
                     <div className="p-12 text-center text-slate-500">
                        <RefreshCw className="animate-spin mx-auto mb-3" size={32} />
                        <p>Loading database...</p>
                     </div>
                  ) : filteredDatabaseRows.length === 0 ? (
                     <div className="p-12 text-center text-slate-500">
                        <Database className="mx-auto mb-3 opacity-50" size={48} />
                        <p className="text-lg font-medium text-slate-300">No records found</p>
                        <p className="text-sm">Processed transactions will appear here.</p>
                     </div>
                  ) : (
                    // DATABASE TABLE MATCHING EXCEL SCREENSHOT
                    <div className="bg-white min-w-full">
                        <table className="w-full text-left border-collapse font-sans text-xs text-black">
                           <thead>
                              <tr className="border-b border-gray-300 bg-white text-black font-bold">
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">UID</th>
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">Time Stamp</th>
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">YP Name</th>
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">Staff Name</th>
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">Type of expense</th>
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">Product</th>
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">Receipt Date</th>
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap text-right">Amount</th>
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap text-right">Total Amount</th>
                                 <th className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">Date Processed</th>
                                 <th className="px-2 py-2 whitespace-nowrap">Nab Code</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-200">
                              {filteredDatabaseRows.map((row) => (
                                 <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap text-gray-500 font-mono text-[10px]" title={row.uid}>{row.uid}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">{row.timestamp}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">{row.ypName}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap uppercase">{row.staffName}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">{row.expenseType}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">{row.product}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">{row.receiptDate}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap text-right">{row.amount}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap text-right font-semibold">{row.totalAmount}</td>
                                    <td className="px-2 py-2 border-r border-gray-200 whitespace-nowrap">{row.dateProcessed}</td>
                                    <td className="px-2 py-2 whitespace-nowrap font-mono text-xs">{row.nabCode}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                    </div>
                  )}
                </div>
             </div>
          )}

          {/* ... existing settings view ... */}
          {activeTab === 'settings' && (
             <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
                
                {/* Profile Card */}
                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden">
                   <div className="px-8 py-6 border-b border-white/5">
                      <div className="flex items-center gap-3">
                         <User className="text-blue-400" />
                         <h2 className="text-xl font-semibold text-white">Auditor Profile</h2>
                      </div>
                   </div>
                   <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                         <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-slate-400">Auditor Name</label>
                            <input type="text" defaultValue="Aspire Admin" className="bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                         </div>
                         <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-slate-400">Email Address</label>
                            <input type="email" defaultValue="admin@aspirehomes.com.au" className="bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                         </div>
                      </div>
                      <div className="space-y-4">
                         <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-slate-400">Role</label>
                            <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-slate-400 cursor-not-allowed">Senior Auditor</div>
                         </div>
                         <div className="flex flex-col gap-1">
                             <label className="text-sm font-medium text-slate-400">Last Login</label>
                             <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-slate-400 cursor-not-allowed">Today, 9:41 AM</div>
                         </div>
                      </div>
                   </div>
                </div>

                {/* Employee Database Card */}
                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden">
                    <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <Users className="text-emerald-400" />
                          <h2 className="text-xl font-semibold text-white">Employee Master List</h2>
                       </div>
                       <button onClick={handleSaveEmployeeList} disabled={saveEmployeeStatus === 'saved'} className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${saveEmployeeStatus === 'saved' ? 'bg-emerald-500 text-white cursor-default' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg'}`}>
                           {saveEmployeeStatus === 'saved' ? <Check size={16} /> : <Save size={16} />}
                           {saveEmployeeStatus === 'saved' ? 'Database Updated' : 'Save & Update'}
                       </button>
                    </div>
                    <div className="p-8">
                       <div className="flex items-start gap-3 mb-6 bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl">
                          <AlertCircle size={20} className="text-indigo-400 mt-1 flex-shrink-0" />
                          <div className="text-sm text-indigo-100">
                             <p className="font-bold mb-1">Mass Update Instructions</p>
                             <p className="opacity-80">Copy the data from your Excel file (including headers) and paste it into the box below. This list is used to auto-correct staff names during the audit process.</p>
                             <p className="opacity-60 text-xs mt-2 font-mono">Format: First Name | Surname | Concatenate | BSB | Account</p>
                          </div>
                       </div>
                       <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-end">
                              <label className="text-sm font-medium text-slate-400">Employee Data (TSV/CSV)</label>
                              <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded">Loaded Records: <span className="text-emerald-400 font-bold">{employeeList.length}</span></span>
                          </div>
                          <textarea 
                             value={employeeRawText}
                             onChange={(e) => setEmployeeRawText(e.target.value)}
                             className="w-full h-[500px] bg-black/20 border border-white/10 rounded-xl p-4 font-mono text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 resize-y"
                             placeholder="Paste Excel data here..."
                          />
                       </div>
                    </div>
                </div>
             </div>
          )}
        </main>
      </div>
    </div>
  );
};