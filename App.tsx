import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, X, FileText, FileSpreadsheet, CheckCircle, Circle, Loader2, 
  HelpCircle, AlertCircle, RefreshCw, Send, LayoutDashboard, Edit2, Check, 
  Copy, CreditCard, ClipboardList, Calendar, BarChart3, PieChart, TrendingUp, 
  Users, Database, Search, Download, Save 
} from 'lucide-react';
import FileUpload from './components/FileUpload';
import ProcessingStep from './components/ProcessingStep';
import MarkdownRenderer from './components/MarkdownRenderer';
import Logo from './components/Logo';
import { analyzeReimbursement } from './services/geminiService';
import { FileWithPreview, ProcessingResult, ProcessingState } from './types';
import { supabase } from './services/supabaseClient';

const DEFAULT_EMPLOYEE_DATA = `John Doe\tManager\nJane Smith\tAssociate`;

// Helper to parse employee data
const parseEmployeeData = (text: string) => {
    return text.split('\n').map(line => {
        const parts = line.split('\t');
        return { name: parts[0], role: parts[1] || 'Staff' };
    }).filter(e => e.name.trim() !== '');
};

export const App = () => {
  // State
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
  
  // Analytics Report State
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [reportEditableContent, setReportEditableContent] = useState('');

  // Database / History State
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Settings
  const [employeeRawText, setEmployeeRawText] = useState(DEFAULT_EMPLOYEE_DATA);
  const [employeeList, setEmployeeList] = useState(parseEmployeeData(DEFAULT_EMPLOYEE_DATA));
  const [saveEmployeeStatus, setSaveEmployeeStatus] = useState<'idle' | 'saved'>('idle');
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Computed / Parsed Data from Results
  const [parsedTransactions, setParsedTransactions] = useState<any[]>([]);

  // Mock Data for Dashboard/Analytics (since we don't have real DB connectivity setup in this context fully)
  // In a real app, these would come from `historyData`
  const databaseRows = historyData.map(item => ({
      id: item.id,
      ypName: item.client_location || 'Unknown',
      staffName: item.staff_name || 'Unknown',
      expenseType: item.category || 'General',
      product: item.description || 'N/A',
      receiptDate: item.date_incurred || 'N/A',
      amount: `$${item.amount?.toFixed(2) || '0.00'}`,
      totalAmount: `$${item.amount?.toFixed(2) || '0.00'}`,
      dateProcessed: new Date(item.created_at).toLocaleDateString(),
      nabCode: item.nab_reference || '-',
      rawDate: new Date(item.created_at)
  }));

  const filteredDatabaseRows = databaseRows.filter(row => 
    row.staffName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    row.ypName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    row.amount.includes(searchTerm)
  );

  const analyticsData = {
      totalSpend: historyData.reduce((acc, curr) => acc + (curr.amount || 0), 0),
      totalRequests: historyData.length,
      yp: Object.entries(historyData.reduce((acc: any, curr) => {
          const loc = curr.client_location || 'Unknown';
          acc[loc] = (acc[loc] || 0) + (curr.amount || 0);
          return acc;
      }, {})).sort((a: any, b: any) => b[1] - a[1]),
      staff: Object.entries(historyData.reduce((acc: any, curr) => {
          const staff = curr.staff_name || 'Unknown';
          acc[staff] = (acc[staff] || 0) + (curr.amount || 0);
          return acc;
      }, {})).sort((a: any, b: any) => b[1] - a[1])
  } as any;

  // Today's specific data
  const todaysProcessedRecords = historyData.filter(d => new Date(d.created_at).toDateString() === new Date().toDateString());
  const nabReportData = todaysProcessedRecords.map(d => ({
      date: new Date(d.created_at).toLocaleDateString(),
      staff_name: d.staff_name,
      nabRef: d.nab_reference || 'PENDING',
      amount: `$${d.amount?.toFixed(2)}`
  }));
  const totalAmount = todaysProcessedRecords.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const eodData = todaysProcessedRecords.map(d => ({
      eodTimeStart: new Date(d.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      eodTimeEnd: new Date(new Date(d.created_at).getTime() + 10*60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      eodActivity: 'Reimbursement Processing',
      staff_name: d.staff_name,
      amount: `$${d.amount?.toFixed(2)}`,
      eodStatus: 'Completed'
  }));

  const reimbursementCount = todaysProcessedRecords.length;
  const pendingCountToday = 0; // Mock

  // Effects
  useEffect(() => {
    fetchHistory();
  }, []);

  // Handlers
  const fetchHistory = async () => {
    setLoadingHistory(true);
    // Simulate API delay or fetch from Supabase if configured
    try {
        const { data, error } = await supabase.from('reimbursements').select('*').order('created_at', { ascending: false });
        if (data) {
            setHistoryData(data);
        } else {
            // Mock data if Supabase is empty/fails
            // setHistoryData([]); 
        }
    } catch (e) {
        console.error("Fetch error", e);
    } finally {
        setLoadingHistory(false);
    }
  };

  const resetAll = () => {
    setReceiptFiles([]);
    setFormFiles([]);
    setResults(null);
    setProcessingState(ProcessingState.IDLE);
    setParsedTransactions([]);
    setEditableContent('');
    setSaveStatus('idle');
  };

  const handleProcess = async () => {
    if (receiptFiles.length === 0) {
        setErrorMessage("Please upload at least one receipt.");
        return;
    }
    setErrorMessage(null);
    setProcessingState(ProcessingState.PROCESSING);
    
    try {
        const analysisText = await analyzeReimbursement(
            await Promise.all(receiptFiles.map(async f => ({
                mimeType: f.type,
                data: (await import('./utils/fileHelpers')).fileToBase64(f) as unknown as string, // Need to implement/fix this helper or inline it. The existing fileHelpers.ts returns Promise<string> but has `fileToBase64` export.
                name: f.name
            }))),
            formFiles.length > 0 ? {
                mimeType: formFiles[0].type,
                data: (await import('./utils/fileHelpers')).fileToBase64(formFiles[0]) as unknown as string,
                name: formFiles[0].name
            } : null
        );

        // Simple parsing of sections based on markers in system prompt
        const phase1 = analysisText.split('<<<PHASE_1_START>>>')[1]?.split('<<<PHASE_1_END>>>')[0] || '';
        const phase2 = analysisText.split('<<<PHASE_2_START>>>')[1]?.split('<<<PHASE_2_END>>>')[0] || '';
        const phase3 = analysisText.split('<<<PHASE_3_START>>>')[1]?.split('<<<PHASE_3_END>>>')[0] || '';
        const phase4 = analysisText.split('<<<PHASE_4_START>>>')[1]?.split('<<<PHASE_4_END>>>')[0] || '';

        setResults({ phase1, phase2, phase3, phase4 });
        setEditableContent(phase4.trim());
        
        // Extract amount for parsed transactions (very basic regex logic for demo)
        const amountMatch = phase4.match(/\$([0-9,]+\.[0-9]{2})/);
        const nameMatch = phase4.match(/Staff Member:\*\*\s*(.*)/i);
        
        if (amountMatch) {
            setParsedTransactions([{
                formattedName: nameMatch ? nameMatch[1].trim() : 'Unknown Staff',
                amount: amountMatch[0],
                currentNabRef: ''
            }]);
        } else {
             setParsedTransactions([]);
        }

        setProcessingState(ProcessingState.COMPLETE);
    } catch (error) {
        console.error(error);
        setProcessingState(ProcessingState.ERROR);
        setErrorMessage("Failed to analyze documents. Please try again.");
    }
  };

  const handleStartNewAudit = () => {
      resetAll();
  };

  const handleCopyEmail = () => {
    const text = isEditing ? editableContent : results?.phase4 || '';
    navigator.clipboard.writeText(text);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  };

  const handleCopyField = (text: string, field: string) => {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
  };

  const handleTransactionNabChange = (index: number, val: string) => {
      const newTx = [...parsedTransactions];
      newTx[index].currentNabRef = val;
      setParsedTransactions(newTx);
      
      // Update email content dynamically (simple replace)
      let content = isEditing ? editableContent : results?.phase4 || '';
      // Regex to find NAB Reference: PENDING and replace it
      // This is a simplified replacement logic
      if (content.includes('NAB Reference:** PENDING')) {
         const newContent = content.replace('NAB Reference:** PENDING', `NAB Reference:** ${val}`);
         setEditableContent(newContent);
         if (!isEditing) setIsEditing(true); // Switch to edit mode to show changes
      }
  };

  const handleCopyTable = (id: string, type: any) => {
      const el = document.getElementById(id);
      if (el) {
          const range = document.createRange();
          range.selectNode(el);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
          document.execCommand('copy');
          window.getSelection()?.removeAllRanges();
          setReportCopied(type);
          setTimeout(() => setReportCopied(null), 2000);
      }
  };

  const handleDownloadCSV = () => {
      // Implementation for CSV download
      const headers = ['ID', 'Date', 'Staff', 'Location', 'Amount', 'Status'];
      const csvContent = [
          headers.join(','),
          ...databaseRows.map(row => [row.id, row.receiptDate, row.staffName, row.ypName, row.amount, 'Processed'].join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'aspire_export.csv');
      link.click();
  };
  
  const handleSmartSave = () => {
     setShowSaveModal(true);
  };

  const confirmSave = async (status: 'PENDING' | 'PAID') => {
      setIsSaving(true);
      setShowSaveModal(false);
      
      // Persist to Supabase
      try {
          const tx = parsedTransactions[0];
          const { error } = await supabase.from('reimbursements').insert({
              staff_name: tx?.formattedName || 'Unknown',
              amount: parseFloat(tx?.amount.replace(/[^0-9.]/g, '') || '0'),
              status: status,
              nab_reference: tx?.currentNabRef || (status === 'PENDING' ? 'PENDING' : 'PROCESSED'),
              raw_text: isEditing ? editableContent : results?.phase4
          });
          
          if (error) throw error;
          
          setSaveStatus('success');
          fetchHistory(); // Refresh DB
      } catch (e) {
          console.error(e);
          setSaveStatus('error');
      } finally {
          setIsSaving(false);
      }
  };

  const handleSaveEdit = () => {
      // Logic to commit the edit to the displayed view if needed, 
      // but we are using editableContent for display when isEditing is true anyway.
      // This might just confirm the edit mode exit if we wanted to flip back to markdown view, 
      // but usually we keep it in edit mode if manual changes were made until save.
      // For now, let's just toggle editing off but keep content.
      // Actually, if we toggle off, it renders `results.phase4` again which is the original.
      // So we should update results.phase4 or handle it.
      if (results) {
          setResults({ ...results, phase4: editableContent });
      }
      setIsEditing(false);
  };

  const handleCancelEdit = () => {
      setEditableContent(results?.phase4 || '');
      setIsEditing(false);
  };

  const getSaveButtonText = () => {
      if (isSaving) return 'Saving...';
      if (saveStatus === 'success') return 'Saved! Start New';
      if (saveStatus === 'error') return 'Error - Retry';
      return 'Save to Database';
  };

  const handleSaveEmployeeList = () => {
      setEmployeeList(parseEmployeeData(employeeRawText));
      setSaveEmployeeStatus('saved');
      setTimeout(() => setSaveEmployeeStatus('idle'), 2000);
  };

  const handleGenerateReport = (type: 'weekly' | 'monthly' | 'quarterly' | 'yearly') => {
    const now = new Date();
    let startDate = new Date();
    let reportTitle = "";

    switch (type) {
        case 'weekly':
            startDate.setDate(now.getDate() - 7);
            reportTitle = "WEEKLY EXPENSE REPORT";
            break;
        case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
            reportTitle = "MONTHLY EXPENSE REPORT (MTD)";
            break;
        case 'quarterly':
            const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
            startDate = new Date(now.getFullYear(), quarterMonth, 1);
            reportTitle = "QUARTERLY EXPENSE REPORT (QTD)";
            break;
        case 'yearly':
            startDate = new Date(now.getFullYear(), 0, 1); // Jan 1st
            reportTitle = "ANNUAL EXPENSE REPORT (YTD)";
            break;
    }

    // Filter rows
    const relevantRows = databaseRows.filter(row => {
        return row.rawDate >= startDate;
    });

    if (relevantRows.length === 0) {
        alert("No records found for this period.");
        return;
    }

    // Calculate Metrics
    let totalSpend = 0;
    let totalRequests = relevantRows.length;
    const staffSpend: Record<string, number> = {};
    const locationSpend: Record<string, number> = {};
    let maxItem = { product: '', amount: 0, staff: '' };
    let pendingCount = 0;

    relevantRows.forEach(row => {
        // Extract amount safely
        const amountStr = row.amount || "0";
        const val = parseFloat(amountStr.replace(/[^0-9.-]+/g,"")) || 0;
        
        totalSpend += val;

        // Staff
        const staff = row.staffName || "Unknown";
        staffSpend[staff] = (staffSpend[staff] || 0) + val;

        // Location
        const loc = row.ypName || "Unknown";
        locationSpend[loc] = (locationSpend[loc] || 0) + val;

        // Max Item
        if (val > maxItem.amount) {
            maxItem = { product: row.product || "N/A", amount: val, staff: staff };
        }

        // Pending Flags
        if (loc === "N/A" || loc === "Unknown" || staff === "Unknown") {
            pendingCount++;
        }
    });

    // Sort Tops
    const topStaff = Object.entries(staffSpend).sort((a,b) => b[1] - a[1]).slice(0, 3);
    const topLoc = Object.entries(locationSpend).sort((a,b) => b[1] - a[1]).slice(0, 3);

    // Build String
    let report = `[📋 CLICK TO COPY REPORT]\n\n`;
    report += `# ${reportTitle}\n`;
    report += `**Date Range:** ${startDate.toLocaleDateString()} - ${now.toLocaleDateString()}\n\n`;

    report += `## 📊 EXECUTIVE SUMMARY\n`;
    report += `| Metric | Value |\n`;
    report += `| :--- | :--- |\n`;
    report += `| **Total Spend** | **$${totalSpend.toFixed(2)}** |\n`;
    report += `| **Total Requests** | ${totalRequests} |\n`;
    report += `| **Pending Categorization** | ${pendingCount} |\n`;
    report += `| **Highest Single Item** | $${maxItem.amount.toFixed(2)} (${maxItem.product}) |\n\n`;

    report += `## 🏆 TOP SPENDERS (STAFF)\n`;
    report += `| Rank | Staff Member | Total Amount |\n`;
    report += `| :--- | :--- | :--- |\n`;
    topStaff.forEach((s, i) => {
        report += `| ${i+1} | ${s[0]} | **$${s[1].toFixed(2)}** |\n`;
    });
    report += `\n`;

    report += `## 📍 SPENDING BY LOCATION\n`;
    report += `| Rank | Location | Total Amount |\n`;
    report += `| :--- | :--- | :--- |\n`;
    topLoc.forEach((l, i) => {
        report += `| ${i+1} | ${l[0]} | **$${l[1].toFixed(2)}** |\n`;
    });
    
    // Set State for Display
    setGeneratedReport(report);
    setReportEditableContent(report);
    setIsEditingReport(false);

    // Copy to clipboard automatically as well
    navigator.clipboard.writeText(report);
    setReportCopied(type);
    setTimeout(() => setReportCopied(null), 2000);
  };

  const handleCopyGeneratedReport = async () => {
      const content = isEditingReport ? reportEditableContent : generatedReport;
      if (!content) return;

      const element = document.getElementById('generated-report-content');
      if (element && !isEditingReport) {
          try {
              const blobHtml = new Blob([element.innerHTML], { type: 'text/html' });
              const blobText = new Blob([element.innerText], { type: 'text/plain' });
              const data = [new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })];
              await navigator.clipboard.write(data);
              setReportCopied('generated');
              setTimeout(() => setReportCopied(null), 2000);
              return;
          } catch (e) {
              console.warn("ClipboardItem API failed", e);
          }
      }

      navigator.clipboard.writeText(content);
      setReportCopied('generated');
      setTimeout(() => setReportCopied(null), 2000);
  };

  const handleSaveReportEdit = () => {
      setGeneratedReport(reportEditableContent);
      setIsEditingReport(false);
  };

  const handleCancelReportEdit = () => {
      setReportEditableContent(generatedReport || '');
      setIsEditingReport(false);
  };
  
  // Reconstruct the return JSX from the provided snippet
  return (
    <div className="min-h-screen bg-[#0f1115] text-slate-300 font-sans">
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
              onClick={() => setActiveTab('analytics')}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'analytics' ? 'bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              Analytics
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
                                onClick={saveStatus === 'success' ? handleStartNewAudit : handleSmartSave} 
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

                      {parsedTransactions.length > 0 && parsedTransactions.map((tx, idx) => (
                        <div key={idx} className="mx-8 mt-6 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                               <CreditCard size={80} className="text-white" />
                            </div>
                            <div className="relative z-10">
                               <h4 className="text-sm font-bold text-indigo-200 uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                                  Banking Details {parsedTransactions.length > 1 ? `(${idx + 1}/${parsedTransactions.length})` : '(Manual Transfer)'}
                               </h4>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="bg-black/30 rounded-xl p-3 border border-white/5 hover:border-white/10 transition-colors">
                                     <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Payee Name</p>
                                     <div className="flex justify-between items-center">
                                        <p className="text-white font-semibold truncate uppercase">{tx.formattedName}</p>
                                        <button onClick={() => handleCopyField(tx.formattedName, 'name')} className="text-indigo-400 hover:text-white transition-colors">
                                           {copiedField === 'name' ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                     </div>
                                  </div>
                                  <div className="bg-black/30 rounded-xl p-3 border border-white/5 hover:border-emerald-500/30 transition-colors">
                                     <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Amount</p>
                                     <div className="flex justify-between items-center">
                                        <p className="text-emerald-400 font-bold text-lg">{tx.amount.replace(/[^0-9.]/g, '')}</p>
                                        <button onClick={() => handleCopyField(tx.amount.replace(/[^0-9.]/g, ''), 'amount')} className="text-emerald-500 hover:text-white transition-colors">
                                           {copiedField === 'amount' ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                     </div>
                                  </div>
                                </div>
                            </div>
                        </div>
                      ))}

                      <div className="px-8 pt-6 pb-2">
                          <label className="block text-xs uppercase tracking-widest font-bold text-slate-500 mb-2">
                             Step 5: Enter Bank/NAB Reference(s)
                          </label>
                          <div className="space-y-3">
                              {parsedTransactions.length === 0 ? (
                                  <p className="text-sm text-slate-500 italic">No transactions detected or pending analysis...</p>
                              ) : parsedTransactions.map((tx, idx) => (
                                  <div key={idx} className="relative">
                                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" size={16} />
                                      <input 
                                          type="text" 
                                          value={tx.currentNabRef} 
                                          onChange={(e) => handleTransactionNabChange(idx, e.target.value)} 
                                          placeholder={`Reference for ${tx.formattedName} ($${tx.amount})...`} 
                                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600" 
                                      />
                                  </div>
                              ))}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-2">Paying via bank transfer? Enter the reference code(s) above to update the email automatically.</p>
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

          {activeTab === 'nab_log' && (
             <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                    <div className="bg-white rounded-lg p-1 overflow-hidden">
                        <table id="nab-log-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '14px', backgroundColor: '#ffffff', color: '#333' }}>
                           <thead>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                 <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold', color: '#111827', width: '100px' }}>Date</th>
                                 <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>Staff Member</th>
                                 <th style={{ padding: '16px', textAlign: 'left', fontWeight: 'bold', color: '#111827', width: '150px' }}>Category</th>
                                 <th style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold', color: '#111827', width: '120px' }}>Amount</th>
                                 <th style={{ padding: '16px', width: '40px' }}></th>
                              </tr>
                           </thead>
                           <tbody>
                              {nabReportData.map((row, idx) => (
                                 <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#ffffff' }}>
                                    <td style={{ padding: '16px', color: '#374151', verticalAlign: 'middle' }}>{row.date}</td>
                                    
                                    <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M8 3 4 7l4 4"/>
                                                    <path d="M4 7h16"/>
                                                    <path d="m16 21 4-4-4-4"/>
                                                    <path d="M20 17H4"/>
                                                </svg>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#1f2937', fontSize: '13px' }}>{row.staff_name}</span>
                                                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{row.nabRef}</span>
                                            </div>
                                        </div>
                                    </td>

                                    <td style={{ padding: '16px', verticalAlign: 'middle' }}>
                                        <span style={{ backgroundColor: '#f3f4f6', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '500', color: '#374151', display: 'inline-block' }}>
                                            Transfers out
                                        </span>
                                    </td>

                                    <td style={{ padding: '16px', textAlign: 'right', verticalAlign: 'middle', fontWeight: 'bold', color: '#111827' }}>
                                        ${Math.abs(parseFloat(row.amount.replace(/[^0-9.-]+/g,""))).toFixed(2)}
                                    </td>

                                    <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'middle' }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m9 18 6-6-6-6"/>
                                        </svg>
                                    </td>
                                 </tr>
                              ))}
                              {nabReportData.length === 0 && (
                                  <tr>
                                      <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#6b7280', fontStyle: 'italic' }}>No banking records found for today.</td>
                                  </tr>
                              )}
                              <tr style={{ backgroundColor: '#f9fafb' }}>
                                  <td colSpan={3} style={{ padding: '16px', textAlign: 'right', color: '#111827', fontWeight: 'bold' }}>Total Processed:</td>
                                  <td style={{ padding: '16px', textAlign: 'right', color: '#111827', fontWeight: 'bold', fontSize: '15px' }}>${totalAmount.toFixed(2)}</td>
                                  <td></td>
                              </tr>
                           </tbody>
                        </table>
                    </div>
                </div>
             </div>
          )}
          
          {activeTab === 'eod' && (
             <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <ClipboardList className="text-indigo-400" />
                      <h2 className="text-xl font-semibold text-white">End of Day Schedule</h2>
                   </div>
                   <div className="flex items-center gap-4">
                       <div className="flex gap-4 mr-4 text-sm">
                           <div className="flex flex-col items-end">
                               <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Processed</span>
                               <span className="text-emerald-400 font-mono font-bold">{reimbursementCount}</span>
                           </div>
                           <div className="flex flex-col items-end">
                               <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Pending</span>
                               <span className="text-red-400 font-mono font-bold">{pendingCountToday}</span>
                           </div>
                       </div>
                       <button onClick={() => handleCopyTable('eod-table', 'eod')} className={`px-4 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${reportCopied === 'eod' ? 'bg-indigo-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                          {reportCopied === 'eod' ? <Check size={16} /> : <Copy size={16} />}
                          {reportCopied === 'eod' ? 'Copied Schedule!' : 'Copy for Outlook'}
                       </button>
                       <button onClick={fetchHistory} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white">
                          <RefreshCw size={18} className={loadingHistory ? 'animate-spin' : ''} />
                       </button>
                   </div>
                </div>

                <div className="p-8 overflow-x-auto">
                    <div className="bg-white rounded-lg p-1 overflow-hidden">
                        <table id="eod-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Arial, sans-serif', fontSize: '13px', backgroundColor: '#ffffff' }}>
                           <thead>
                              <tr style={{ backgroundColor: '#f3f4f6' }}>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#111827', width: '100px' }}>Start</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#111827', width: '100px' }}>End</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#111827', width: '150px' }}>Activity</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#111827', width: '200px' }}>Staff Name</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#111827', width: '120px' }}>Amount</th>
                                 <th style={{ border: '1px solid #d1d5db', padding: '8px 12px', textAlign: 'left', fontWeight: 'bold', color: '#111827' }}>Description / Status</th>
                              </tr>
                           </thead>
                           <tbody>
                              {eodData.map((row: any, idx: number) => (
                                 <tr key={idx} style={{ backgroundColor: '#ffffff' }}>
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', verticalAlign: 'top' }}>{row.eodTimeStart}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', verticalAlign: 'top' }}>{row.eodTimeEnd}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', verticalAlign: 'top', fontWeight: row.eodActivity === 'IDLE' ? 'bold' : 'normal' }}>{row.eodActivity}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', verticalAlign: 'top', textTransform: 'uppercase' }}>{row.staff_name}</td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', verticalAlign: 'top' }}>
                                      {row.eodActivity === 'IDLE' ? '' : `$${parseFloat(row.amount.replace(/[^0-9.-]+/g,"")).toFixed(2)}`}
                                    </td>
                                    <td style={{ border: '1px solid #d1d5db', padding: '8px 12px', color: '#374151', verticalAlign: 'top' }}>{row.eodStatus}</td>
                                 </tr>
                              ))}
                              {todaysProcessedRecords.length === 0 && (
                                  <tr><td colSpan={6} style={{ border: '1px solid #d1d5db', padding: '20px', textAlign: 'center', color: '#6b7280' }}>No activity recorded for today.</td></tr>
                              )}
                           </tbody>
                        </table>
                    </div>
                </div>
             </div>
          )}

          {activeTab === 'analytics' && (
             <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden">
                    <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center bg-indigo-500/5">
                        <div className="flex items-center gap-3">
                            <FileText className="text-emerald-400" size={20} />
                            <h3 className="font-semibold text-white">Executive Reporting Suite</h3>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Outlook Optimized</span>
                    </div>
                    <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <button 
                            onClick={() => handleGenerateReport('weekly')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${reportCopied === 'weekly' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}
                        >
                            {reportCopied === 'weekly' ? <Check size={24} className="mb-2" /> : <Calendar size={24} className="mb-2 text-indigo-400" />}
                            <span className="text-sm font-bold">Weekly Report</span>
                            <span className="text-[10px] text-slate-500 mt-1">Last 7 Days</span>
                        </button>

                        <button 
                            onClick={() => handleGenerateReport('monthly')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${reportCopied === 'monthly' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}
                        >
                            {reportCopied === 'monthly' ? <Check size={24} className="mb-2" /> : <BarChart3 size={24} className="mb-2 text-blue-400" />}
                            <span className="text-sm font-bold">Monthly Report</span>
                            <span className="text-[10px] text-slate-500 mt-1">MTD Analysis</span>
                        </button>

                        <button 
                            onClick={() => handleGenerateReport('quarterly')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${reportCopied === 'quarterly' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}
                        >
                            {reportCopied === 'quarterly' ? <Check size={24} className="mb-2" /> : <PieChart size={24} className="mb-2 text-purple-400" />}
                            <span className="text-sm font-bold">Quarterly Report</span>
                            <span className="text-[10px] text-slate-500 mt-1">QTD Trends</span>
                        </button>

                        <button 
                            onClick={() => handleGenerateReport('yearly')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${reportCopied === 'yearly' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300 hover:text-white'}`}
                        >
                            {reportCopied === 'yearly' ? <Check size={24} className="mb-2" /> : <TrendingUp size={24} className="mb-2 text-amber-400" />}
                            <span className="text-sm font-bold">Yearly Report</span>
                            <span className="text-[10px] text-slate-500 mt-1">Annual Summary</span>
                        </button>
                    </div>
                </div>

                {generatedReport && (
                    <div className="bg-indigo-500/5 backdrop-blur-xl rounded-[32px] border border-indigo-500/20 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.3)] relative animate-in fade-in slide-in-from-bottom-2 duration-300">
                       <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] pointer-events-none"></div>
                       <div className="px-6 py-4 border-b border-indigo-500/10 flex items-center justify-between bg-indigo-500/10">
                        <div className="flex items-center gap-3">
                           <div className="w-2 h-8 bg-indigo-400 rounded-full shadow-[0_0_15px_rgba(129,140,248,0.8)]"></div>
                           <h3 className="font-bold text-white text-lg flex items-center gap-2">
                              Generated Report Preview
                           </h3>
                        </div>
                        <div className="flex gap-2">
                            {!isEditingReport ? (
                              <button onClick={() => setIsEditingReport(true)} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-white/10 text-white hover:bg-white/20 transition-all shadow-lg">
                                <Edit2 size={12} strokeWidth={2.5} /> Edit
                              </button>
                            ) : (
                                <>
                                  <button onClick={handleCancelReportEdit} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all shadow-lg">
                                    <X size={12} strokeWidth={3} /> Cancel
                                  </button>
                                  <button onClick={handleSaveReportEdit} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-lg">
                                    <Check size={12} strokeWidth={3} /> Save Changes
                                  </button>
                                </>
                            )}
                            <button onClick={handleCopyGeneratedReport} disabled={isEditingReport} className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 ${reportCopied === 'generated' ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' : isEditingReport ? 'bg-indigo-500/50 text-white/50 cursor-not-allowed' : 'bg-indigo-500 text-white shadow-indigo-500/20 hover:bg-indigo-600 hover:scale-105 active:scale-95'}`}>
                              {reportCopied === 'generated' ? (<><Check size={12} strokeWidth={3} /> Copied!</>) : (<><Copy size={12} strokeWidth={3} /> Copy for Outlook</>)}
                            </button>
                        </div>
                      </div>
                      <div className="p-8">
                        <div className="bg-white rounded-xl p-8 shadow-2xl text-slate-800 selection:bg-indigo-100 selection:text-indigo-900">
                          {isEditingReport ? (
                             <textarea value={reportEditableContent} onChange={(e) => setReportEditableContent(e.target.value)} className="w-full h-[400px] p-4 font-mono text-sm border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-900 resize-none" placeholder="Edit report content here..." />
                          ) : (
                             <MarkdownRenderer content={generatedReport} id="generated-report-content" theme="light" />
                          )}
                        </div>
                      </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 p-6 shadow-xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                           <TrendingUp size={100} className="text-white" />
                       </div>
                       <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-1">Total Spend (Processed)</h3>
                       <p className="text-4xl font-bold text-white mb-2">${analyticsData.totalSpend.toFixed(2)}</p>
                       <p className="text-xs text-emerald-400 flex items-center gap-1">
                           <CheckCircle size={12} /> {analyticsData.totalRequests} total requests
                       </p>
                    </div>

                    <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 p-6 shadow-xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                           <BarChart3 size={100} className="text-blue-500" />
                       </div>
                       <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-1">Top Location (YP)</h3>
                       <p className="text-2xl font-bold text-blue-400 mb-2 truncate">
                           {analyticsData.yp.length > 0 ? analyticsData.yp[0][0] : 'N/A'}
                       </p>
                       <p className="text-xs text-slate-500">
                           ${analyticsData.yp.length > 0 ? analyticsData.yp[0][1].toFixed(2) : '0.00'} spent here
                       </p>
                    </div>

                    <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 p-6 shadow-xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                           <Users size={100} className="text-purple-500" />
                       </div>
                       <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-1">Top Claimant</h3>
                       <p className="text-2xl font-bold text-purple-400 mb-2 truncate">
                           {analyticsData.staff.length > 0 ? analyticsData.staff[0][0] : 'N/A'}
                       </p>
                       <p className="text-xs text-slate-500">
                           ${analyticsData.staff.length > 0 ? analyticsData.staff[0][1].toFixed(2) : '0.00'} claimed total
                       </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <PieChart className="text-blue-400" size={20} />
                                <h3 className="font-semibold text-white">Expenses by Location (YP)</h3>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                                {analyticsData.yp.map(([name, amount]: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                                                {idx + 1}
                                            </div>
                                            <span className="font-medium text-slate-200">{name}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="font-bold text-white">${amount.toFixed(2)}</span>
                                            <div className="w-24 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                                                <div 
                                                    className="h-full bg-blue-500" 
                                                    style={{ width: `${Math.min((amount / analyticsData.totalSpend) * 100, 100)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {analyticsData.yp.length === 0 && (
                                    <p className="text-center text-slate-500 py-4">No data available.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden">
                        <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <Users className="text-purple-400" size={20} />
                                <h3 className="font-semibold text-white">Staff Spending</h3>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                                {analyticsData.staff.map(([name, amount]: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                                                {idx + 1}
                                            </div>
                                            <span className="font-medium text-slate-200 uppercase">{name}</span>
                                        </div>
                                        <span className="font-bold text-white">${amount.toFixed(2)}</span>
                                    </div>
                                ))}
                                {analyticsData.staff.length === 0 && (
                                    <p className="text-center text-slate-500 py-4">No data available.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
             </div>
          )}

          {activeTab === 'database' && (
             <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-[calc(100vh-140px)]">
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between flex-shrink-0">
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
                <div className="flex-1 overflow-auto p-0 custom-scrollbar">
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
                    <div className="min-w-max">
                        <table className="w-full text-left border-collapse font-sans text-xs text-slate-300">
                           <thead className="sticky top-0 z-10 bg-[#111216] text-white font-bold uppercase tracking-wider shadow-lg">
                              <tr>
                                 <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Client / Location</th>
                                 <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Staff Name</th>
                                 <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Type of expense</th>
                                 <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Product</th>
                                 <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[100px]">Receipt Date</th>
                                 <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap text-right min-w-[100px]">Amount</th>
                                 <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap text-right min-w-[100px] bg-white/5">Total Amount</th>
                                 <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[120px]">Date Processed</th>
                                 <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Nab Code</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-white/5">
                              {filteredDatabaseRows.map((row) => (
                                 <tr key={row.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap truncate max-w-[250px]" title={row.ypName}>{row.ypName}</td>
                                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap uppercase font-medium text-indigo-300">{row.staffName}</td>
                                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-slate-400">{row.expenseType}</td>
                                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-slate-400 truncate max-w-[200px]" title={row.product}>{row.product}</td>
                                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-slate-400">{row.receiptDate}</td>
                                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right font-mono text-slate-300">{row.amount}</td>
                                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right font-mono font-bold text-emerald-400 bg-white/5">{row.totalAmount}</td>
                                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-slate-500">{row.dateProcessed}</td>
                                    <td className="px-4 py-3 whitespace-nowrap font-mono text-[10px] text-slate-500">{row.nabCode}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                    </div>
                  )}
                </div>
             </div>
          )}

          {activeTab === 'settings' && (
             <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <Users className="text-blue-400" />
                      <h2 className="text-xl font-semibold text-white">System Settings</h2>
                   </div>
                </div>

                <div className="p-8 space-y-8">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-medium text-white">Employee Database</h3>
                                <p className="text-sm text-slate-400">Manage the list of staff names for auto-correction. Format: First Name [tab] Surname [tab] Concatenate...</p>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => {
                                        if(window.confirm('Reset to default list?')) {
                                            setEmployeeRawText(DEFAULT_EMPLOYEE_DATA);
                                            setEmployeeList(parseEmployeeData(DEFAULT_EMPLOYEE_DATA));
                                        }
                                    }}
                                    className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors"
                                >
                                    Reset Defaults
                                </button>
                                <button 
                                    onClick={handleSaveEmployeeList}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${saveEmployeeStatus === 'saved' ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                                >
                                    {saveEmployeeStatus === 'saved' ? <Check size={16} /> : <Save size={16} />}
                                    {saveEmployeeStatus === 'saved' ? 'Saved' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                        <div className="bg-black/30 rounded-xl border border-white/10 p-1">
                            <textarea 
                                value={employeeRawText}
                                onChange={(e) => setEmployeeRawText(e.target.value)}
                                className="w-full h-64 bg-transparent border-none text-slate-300 font-mono text-xs p-4 focus:ring-0 resize-y"
                                spellCheck={false}
                            />
                        </div>
                    </div>

                    <div className="h-px bg-white/5"></div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-lg font-medium text-white mb-2">System Maintenance</h3>
                            <p className="text-sm text-slate-400 mb-4">Manage local data and cached settings.</p>
                            
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                                    <div>
                                        <p className="text-sm font-medium text-slate-200">Dismissed Discrepancies</p>
                                        <p className="text-xs text-slate-500">{dismissedIds.length} items hidden from pending list.</p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            if(window.confirm('Restore all dismissed discrepancies?')) {
                                                setDismissedIds([]);
                                                localStorage.removeItem('aspire_dismissed_discrepancies');
                                            }
                                        }}
                                        className="text-xs font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider"
                                    >
                                        Restore All
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium text-white mb-2">System Info</h3>
                            <p className="text-sm text-slate-400 mb-4">Version and status information.</p>
                            
                            <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Version</span>
                                    <span className="text-slate-300 font-mono">v2.4.0 (Live)</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Status</span>
                                    <span className="text-emerald-400 font-medium flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Online</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Database</span>
                                    <span className="text-indigo-400 font-medium">Supabase Connected</span>
                                </div>
                            </div>
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