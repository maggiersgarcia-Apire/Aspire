import React from 'react';
import { RefreshCw, LayoutDashboard, AlertCircle, Send, CheckCircle, Edit2, X, Check, CloudUpload, Copy, CreditCard, Loader2 } from 'lucide-react';
import FileUpload from '../FileUpload';
import ProcessingStep from '../ProcessingStep';
import MarkdownRenderer from '../MarkdownRenderer';
import { FileWithPreview, ProcessingResult, ProcessingState } from '../../types';

interface DashboardTabProps {
  receiptFiles: FileWithPreview[];
  setReceiptFiles: (files: FileWithPreview[]) => void;
  formFiles: FileWithPreview[];
  setFormFiles: (files: FileWithPreview[]) => void;
  processingState: ProcessingState;
  results: ProcessingResult | null;
  errorMessage: string | null;
  onProcess: () => void;
  onReset: () => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  handleSaveEdit: () => void;
  handleCancelEdit: () => void;
  handleSmartSave: () => void;
  saveStatus: 'idle' | 'success' | 'error' | 'duplicate';
  isSaving: boolean;
  handleCopyEmail: () => void;
  emailCopied: boolean;
  handleStartNewAudit: () => void;
  parsedTransactions: any[];
  handleTransactionNabChange: (index: number, val: string) => void;
  handleCopyField: (text: string, field: string) => void;
  copiedField: string | null;
  editableContent: string;
  setEditableContent: (content: string) => void;
}

const DashboardTab: React.FC<DashboardTabProps> = ({
  receiptFiles, setReceiptFiles, formFiles, setFormFiles,
  processingState, results, errorMessage, onProcess, onReset,
  isEditing, setIsEditing, handleSaveEdit, handleCancelEdit, handleSmartSave,
  saveStatus, isSaving, handleCopyEmail, emailCopied, handleStartNewAudit,
  parsedTransactions, handleTransactionNabChange, handleCopyField, copiedField,
  editableContent, setEditableContent
}) => {

  const getSaveButtonText = () => {
    if (isSaving) {
      return (
        <>
          <Loader2 className="animate-spin" size={12} />
          <span>Saving...</span>
        </>
      );
    }
    if (saveStatus === 'success') {
      return (
        <>
          <Check size={12} strokeWidth={3} />
          <span>Saved</span>
        </>
      );
    }
    if (saveStatus === 'error' || saveStatus === 'duplicate') {
       return (
        <>
          <AlertCircle size={12} strokeWidth={3} />
          <span>Error</span>
        </>
      );
    }
    return (
      <>
        <CloudUpload size={12} strokeWidth={3} />
        <span>Save to Database</span>
      </>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-full lg:w-[400px] space-y-6 flex-shrink-0">
        <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden relative group">
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
          <div className="px-6 py-6 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white tracking-tight">Documents</h2>
            {results && (
              <button onClick={onReset} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10" title="Reset">
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
              onClick={onProcess}
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
  );
};

export default DashboardTab;