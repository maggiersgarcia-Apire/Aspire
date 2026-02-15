import React, { useState, useEffect } from 'react';
import { ShieldCheck, FileText, Send, AlertCircle, RefreshCw, LogOut, LayoutDashboard, ChevronRight, Copy, Check } from 'lucide-react';
import FileUpload from './components/FileUpload';
import ProcessingStep from './components/ProcessingStep';
import MarkdownRenderer from './components/MarkdownRenderer';
import Logo from './components/Logo';
import { analyzeReimbursement } from './services/geminiService';
import { fileToBase64 } from './utils/fileHelpers';
import { FileWithPreview, ProcessingState, ProcessingResult } from './types';

const App: React.FC = () => {
  // State
  const [loadingSplash, setLoadingSplash] = useState(true);
  const [receiptFiles, setReceiptFiles] = useState<FileWithPreview[]>([]);
  const [formFiles, setFormFiles] = useState<FileWithPreview[]>([]);
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [results, setResults] = useState<ProcessingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  // Splash Screen Timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingSplash(false);
    }, 5000); // 5 seconds
    return () => clearTimeout(timer);
  }, []);

  const resetAll = () => {
    setReceiptFiles([]);
    setFormFiles([]);
    setProcessingState(ProcessingState.IDLE);
    setResults(null);
    setErrorMessage(null);
    setEmailCopied(false);
  };

  const handleCopyEmail = async () => {
    if (!results?.phase4) return;

    const emailElement = document.getElementById('email-output-content');
    
    if (emailElement) {
        // Advanced Copy: Try to copy as Rich Text (HTML) for Outlook
        try {
            const blobHtml = new Blob([emailElement.innerHTML], { type: 'text/html' });
            const blobText = new Blob([emailElement.innerText], { type: 'text/plain' });
            
            // This API is supported in modern browsers (Chrome/Edge/Safari)
            const data = [new ClipboardItem({
                'text/html': blobHtml,
                'text/plain': blobText,
            })];
            
            await navigator.clipboard.write(data);
            setEmailCopied(true);
            setTimeout(() => setEmailCopied(false), 2000);
            return;
        } catch (e) {
            console.warn("ClipboardItem API failed, falling back to text", e);
        }
    }

    // Fallback to plain text if HTML copy fails
    navigator.clipboard.writeText(results.phase4);
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
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

    try {
      // Convert files to base64 and capture mimeType
      const receiptImages = await Promise.all(receiptFiles.map(async (file) => ({
        mimeType: file.type || 'image/jpeg', // Fallback to jpeg if unknown
        data: await fileToBase64(file)
      })));

      const formImage = formFiles.length > 0 ? {
        mimeType: formFiles[0].type || 'image/jpeg',
        data: await fileToBase64(formFiles[0])
      } : null;

      // Call Gemini
      const fullResponse = await analyzeReimbursement(receiptImages, formImage);

      // Parse the output using the delimiters
      const parseSection = (tagStart: string, tagEnd: string, text: string) => {
        const startIdx = text.indexOf(tagStart);
        const endIdx = text.indexOf(tagEnd);
        if (startIdx === -1 || endIdx === -1) return "Section not found or parsing error.";
        return text.substring(startIdx + tagStart.length, endIdx).trim();
      };

      if (!fullResponse) throw new Error("No response from AI");

      const phase1 = parseSection('<<<PHASE_1_START>>>', '<<<PHASE_1_END>>>', fullResponse);
      const phase2 = parseSection('<<<PHASE_2_START>>>', '<<<PHASE_2_END>>>', fullResponse);
      const phase3 = parseSection('<<<PHASE_3_START>>>', '<<<PHASE_3_END>>>', fullResponse);
      const phase4 = parseSection('<<<PHASE_4_START>>>', '<<<PHASE_4_END>>>', fullResponse);

      setResults({
        phase1,
        phase2,
        phase3,
        phase4
      });

      setProcessingState(ProcessingState.COMPLETE);
    } catch (err: any) {
      console.error(err);
      
      // Extract clean error message
      let msg = err.message || "An unexpected error occurred during processing.";
      if (msg.includes('400')) {
         msg = "Error 400: The AI could not process the image. Please ensure you are uploading valid image files (JPG/PNG) or PDFs. Try refreshing the page.";
      }
      
      setErrorMessage(msg);
      setProcessingState(ProcessingState.ERROR);
    }
  };

  // Splash Screen Render
  if (loadingSplash) {
    return (
      <div className="fixed inset-0 bg-[#0f1115] z-50 flex flex-col items-center justify-center animate-in fade-in duration-700">
         {/* Background Glows */}
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
      
      {/* Ambient Glows - Updated to Brand Blue/Indigo */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0"></div>
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] translate-x-1/4 translate-y-1/4 pointer-events-none z-0"></div>

      {/* Header */}
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
            <button className="px-5 py-2 rounded-full bg-white/10 text-white text-sm font-medium shadow-sm transition-all">Dashboard</button>
            <button className="px-5 py-2 rounded-full text-slate-400 hover:text-white text-sm font-medium transition-all hover:bg-white/5">History</button>
            <button className="px-5 py-2 rounded-full text-slate-400 hover:text-white text-sm font-medium transition-all hover:bg-white/5">Settings</button>
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

        <main className="flex flex-col lg:flex-row gap-6">
          
          {/* LEFT COLUMN: Input & Controls */}
          <div className="w-full lg:w-[400px] space-y-6 flex-shrink-0">
            
            {/* Upload Card */}
            <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden relative group">
              {/* Gradient border effect on top */}
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
                  description="Screenshots, Images, PDF"
                  files={receiptFiles} 
                  onFilesChange={setReceiptFiles} 
                  multiple={true}
                  accept="image/*,application/pdf"
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
                  description="Form Screenshot, Image, or PDF"
                  files={formFiles} 
                  onFilesChange={setFormFiles}
                  accept="image/*,application/pdf"
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

            {/* Status Card */}
            <div className="bg-[#1c1e24]/60 backdrop-blur-md rounded-[32px] border border-white/5 shadow-lg p-6 relative">
               <h3 className="text-xs font-bold text-slate-500 mb-6 uppercase tracking-widest pl-1">Process Status</h3>
               <div className="space-y-6 pl-2">
                 <ProcessingStep 
                    status={processingState === ProcessingState.IDLE ? 'idle' : 'complete'} 
                    title="Upload" 
                    description="Receipts & Forms received" 
                 />
                 <ProcessingStep 
                    status={processingState === ProcessingState.PROCESSING ? 'processing' : results ? 'complete' : 'idle'} 
                    title="AI Extraction" 
                    description="Analyzing receipt data" 
                 />
                 <ProcessingStep 
                    status={processingState === ProcessingState.PROCESSING ? 'idle' : results ? 'complete' : 'idle'} 
                    title="Rule Engine" 
                    description="Validating policy limits" 
                 />
                 <ProcessingStep 
                    status={processingState === ProcessingState.PROCESSING ? 'idle' : results ? 'complete' : 'idle'} 
                    title="Final Decision" 
                    description="Email generation" 
                 />
               </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Results */}
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
                
                {/* PHASE 1: RECEIPT ANALYSIS */}
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

                {/* PHASE 2: STANDARDIZATION */}
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

                {/* PHASE 3: AUDIT */}
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

                {/* PHASE 4: EMAIL */}
                <div className="bg-indigo-500/5 backdrop-blur-xl rounded-[32px] border border-indigo-500/20 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.3)] xl:col-span-2 relative">
                   <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] pointer-events-none"></div>
                   
                   <div className="px-6 py-4 border-b border-indigo-500/10 flex items-center justify-between bg-indigo-500/10">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-8 bg-indigo-400 rounded-full shadow-[0_0_15px_rgba(129,140,248,0.8)]"></div>
                       <h3 className="font-bold text-white text-lg">Final Decision & Email</h3>
                    </div>
                    <button 
                      onClick={handleCopyEmail}
                      className={`flex items-center gap-2 text-[10px] px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg transition-all duration-200 
                        ${emailCopied 
                          ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600' 
                          : 'bg-indigo-500 text-white shadow-indigo-500/20 hover:bg-indigo-600 hover:scale-105 active:scale-95'
                        }`}
                    >
                      {emailCopied ? (
                        <>
                          <Check size={12} strokeWidth={3} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={12} strokeWidth={3} />
                          Copy for Outlook
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-8">
                    <div className="bg-white rounded-xl p-8 shadow-2xl text-slate-800 selection:bg-indigo-100 selection:text-indigo-900">
                      <MarkdownRenderer content={results.phase4} id="email-output-content" />
                    </div>
                  </div>
                </div>

              </div>
            )}
            
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;