import React, { useState } from 'react';
import { CreditCard, Copy, RefreshCw, ArrowRightLeft, ChevronRight, Check } from 'lucide-react';

interface NabTabProps {
  pendingTotal: number;
  pendingTx: any[];
  paidTx: any[];
  onCopyBatch: () => void;
  reportCopied: string | null;
  copiedField: string | null;
  setCopiedField: (field: string | null) => void;
}

const NabTab: React.FC<NabTabProps> = ({
  pendingTotal, pendingTx, paidTx, onCopyBatch, reportCopied, copiedField, setCopiedField
}) => {
  const [localCopied, setLocalCopied] = useState(false);
  
  // Calculate total for the list shown (paidTx)
  const paidTotal = paidTx.reduce((sum, tx) => sum + (parseFloat(String(tx.amount).replace(/[^0-9.-]+/g,"")) || 0), 0);

  const handleCopyLog = async () => {
      // Generate HTML Table for Outlook
      const htmlContent = `
        <table style="width: 100%; border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000000;">
          <thead>
            <tr style="text-align: left;">
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">Date</th>
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">Staff Member</th>
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">NAB CODE</th>
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${paidTx.map(tx => {
                const dateStr = new Date(tx.rawDate).toLocaleDateString('en-US');
                const staff = (tx.staffName || '').replace(/\*/g, '').trim();
                const amount = (String(tx.amount) || '').replace(/\*/g, '').trim();
                const uid = (tx.uid || '').replace(/\*/g, '').trim();

                return `
                  <tr>
                    <td style="border: 1px solid #000000; padding: 4px 8px;">${dateStr}</td>
                    <td style="border: 1px solid #000000; padding: 4px 8px;">${staff}</td>
                    <td style="border: 1px solid #000000; padding: 4px 8px;">${uid}</td>
                    <td style="border: 1px solid #000000; padding: 4px 8px; text-align: right;">$${amount}</td>
                  </tr>
                `;
            }).join('')}
          </tbody>
        </table>
      `;

      try {
        const type = "text/html";
        const blob = new Blob([htmlContent], { type });
        const data = [new ClipboardItem({ [type]: blob })];
        await navigator.clipboard.write(data);
        setLocalCopied(true);
        setTimeout(() => setLocalCopied(false), 2000);
      } catch (e) {
        console.error("Clipboard API failed", e);
        alert("Failed to copy formatted table. Your browser might not support direct HTML copying.");
      }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <CreditCard className="text-emerald-400" size={24} />
          <h2 className="text-xl font-bold text-white tracking-tight">NAB Banking Log (Today)</h2>
        </div>
        <div className="flex items-center gap-3">
          <button 
             onClick={handleCopyLog}
             className="flex items-center gap-2 bg-[#2d313a] hover:bg-[#374151] text-white px-4 py-2 rounded-full text-sm font-semibold transition-all border border-white/10"
          >
             {localCopied ? <Check size={16} className="text-emerald-400"/> : <Copy size={16} />}
             Copy for Outlook
          </button>
          <button className="p-2 bg-[#2d313a] hover:bg-[#374151] text-slate-400 hover:text-white rounded-full transition-colors border border-white/10">
             <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 px-2 pb-4">
        
        {/* Pending Payments Section (Conditional) */}
        {pendingTx.length > 0 && (
           <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <h3 className="text-amber-400 text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                 Pending Authorization ({pendingTx.length})
              </h3>
              <div className="space-y-2">
                 {pendingTx.map((tx, i) => (
                    <div key={i} className="flex items-center justify-between bg-black/20 p-3 rounded-lg border border-white/5">
                       <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                             {tx.staffName.charAt(0)}
                          </div>
                          <div>
                             <p className="text-sm font-medium text-white">{tx.staffName}</p>
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-mono">{tx.uid}</span>
                                <button 
                                   onClick={() => {
                                      navigator.clipboard.writeText(tx.uid);
                                      setCopiedField(tx.id);
                                   }}
                                   className="text-[10px] text-indigo-400 hover:text-indigo-300"
                                >
                                   {copiedField === tx.id ? "Copied" : "Copy"}
                                </button>
                             </div>
                          </div>
                       </div>
                       <p className="text-emerald-400 font-mono font-bold">${tx.amount}</p>
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* Paid / Log Section (Dark Card Style) */}
        <div className="bg-[#1c1e24]/80 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden">
           {/* Table Header */}
           <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/10 bg-white/5">
              <div className="col-span-2 text-xs font-bold text-slate-400 uppercase tracking-wide">Date</div>
              <div className="col-span-5 text-xs font-bold text-slate-400 uppercase tracking-wide">Staff Member</div>
              <div className="col-span-3 text-xs font-bold text-slate-400 uppercase tracking-wide">NAB CODE</div>
              <div className="col-span-2 text-right text-xs font-bold text-slate-400 uppercase tracking-wide pr-8">Amount</div>
           </div>

           {/* Table Body */}
           <div className="divide-y divide-white/5">
              {paidTx.length === 0 ? (
                 <div className="p-8 text-center text-slate-500 text-sm italic">
                    No processed transactions found for the log.
                 </div>
              ) : (
                 paidTx.map((tx, i) => (
                    <div key={i} className="grid grid-cols-12 gap-4 px-6 py-5 items-center hover:bg-white/5 transition-colors group">
                       {/* Date */}
                       <div className="col-span-2 text-sm text-white">
                          {new Date(tx.rawDate).toLocaleDateString('en-US')}
                       </div>

                       {/* Staff Member */}
                       <div className="col-span-5 flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0 text-indigo-400 border border-indigo-500/30">
                             <ArrowRightLeft size={16} />
                          </div>
                          <div className="min-w-0">
                             <p className="text-sm text-white uppercase truncate">{tx.staffName}</p>
                          </div>
                       </div>

                       {/* NAB Code */}
                       <div className="col-span-3">
                          <span className="font-mono text-sm text-white">
                             {tx.uid}
                          </span>
                       </div>

                       {/* Amount & Action */}
                       <div className="col-span-2 flex items-center justify-end gap-4">
                          <span className="text-sm text-white">${tx.amount}</span>
                          <ChevronRight size={16} className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                       </div>
                    </div>
                 ))
              )}
           </div>

           {/* Footer Total */}
           <div className="px-6 py-5 bg-white/5 border-t border-white/10 flex justify-end items-center gap-8">
              <span className="text-sm font-bold text-slate-400">Total Processed:</span>
              <span className="text-lg font-extrabold text-emerald-400 pr-8">${paidTotal.toFixed(2)}</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default NabTab;