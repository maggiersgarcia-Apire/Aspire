import React, { useMemo, useState } from 'react';
import { ClipboardList, Check, Copy, RefreshCw } from 'lucide-react';

interface EodTabProps {
  date: string;
  setDate: (date: string) => void;
  total: number;
  count: number;
  rows: any[];
  onCopyReport: () => void;
  reportCopied: string | null;
  reportText: string;
}

const EodTab: React.FC<EodTabProps> = ({
  date, setDate, total, count, rows, onCopyReport, reportCopied, reportText
}) => {
  const [localCopied, setLocalCopied] = useState(false);

  // LOGIC IMPLEMENTATION:
  // 1. Start at 07:00 AM
  // 2. Sequential entries with 1 min gap
  // 3. Random duration 10-15 mins for Reimbursement
  // 4. Final IDLE entry ends at 15:00
  const schedule = useMemo(() => {
    // Sort rows by timestamp to ensure consistent order
    const sorted = [...rows].sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());
    
    // Initialize Start Time: 07:00:00
    let currentCursor = new Date(date);
    currentCursor.setHours(7, 0, 0, 0);

    const items = sorted.map(row => {
        const timeIn = new Date(currentCursor);
        
        // Duration: Random between 10 to 15 minutes
        const durationMin = 10;
        const durationMax = 15;
        const duration = Math.floor(Math.random() * (durationMax - durationMin + 1) + durationMin);
        
        const timeOut = new Date(timeIn.getTime() + duration * 60000);
        
        // Update cursor for NEXT entry: Previous Time Out + 1 minute
        currentCursor = new Date(timeOut.getTime() + 60000);

        // Determine Status based on Logic Rule 4
        // If nabCode exists and is not PENDING -> Paid
        // If PENDING or missing -> "Dashboard Rule Mismatch"
        const isPending = !row.nabCode || row.nabCode === 'PENDING' || row.nabCode === 'N/A';
        const status = isPending ? 'Dashboard Rule Mismatch' : `Paid to Nab [${row.nabCode}]`;

        return {
            timeIn: timeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            timeOut: timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            activity: 'REIMBURSEMENT',
            yp: row.ypName || 'N/A',
            staff: row.staffName,
            amount: row.amount,
            status: status,
            isIdle: false
        };
    });

    // Final Entry: IDLE
    // Must always show end time 15:00 (03:00 PM)
    const idleEnd = new Date(date);
    idleEnd.setHours(15, 0, 0, 0);
    
    // Only add IDLE if we haven't passed 15:00
    if (currentCursor < idleEnd) {
         items.push({
            timeIn: currentCursor.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            timeOut: idleEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            activity: 'IDLE',
            yp: '',
            staff: '',
            amount: '',
            status: '',
            isIdle: true
        });
    }

    return items;
  }, [rows, date]);

  const handleCopySchedule = async () => {
      // Generate Professional HTML Table (Light Theme, Black Text, Standard Borders)
      // This is optimized for pasting into Outlook/Word as a clean professional table.
      const htmlContent = `
        <table style="width: 100%; border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000000;">
          <thead>
            <tr style="text-align: left;">
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">TIME IN</th>
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">TIME OUT</th>
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">ACTIVITY</th>
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">NAME OF YP</th>
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">NAME OF STAFF</th>
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">AMOUNT</th>
              <th style="border: 1px solid #000000; padding: 4px 8px; font-weight: bold; background-color: #ffffff;">COMMENTS / STATUS</th>
            </tr>
          </thead>
          <tbody>
            ${schedule.map(item => `
              <tr>
                <td style="border: 1px solid #000000; padding: 4px 8px;">${item.timeIn}</td>
                <td style="border: 1px solid #000000; padding: 4px 8px;">${item.timeOut}</td>
                <td style="border: 1px solid #000000; padding: 4px 8px;">${item.activity}</td>
                <td style="border: 1px solid #000000; padding: 4px 8px;">${item.yp}</td>
                <td style="border: 1px solid #000000; padding: 4px 8px; text-transform: uppercase;">${item.staff}</td>
                <td style="border: 1px solid #000000; padding: 4px 8px;">${item.amount ? '$' + item.amount.replace('$','') : ''}</td>
                <td style="border: 1px solid #000000; padding: 4px 8px;">${item.status}</td>
              </tr>
            `).join('')}
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
        console.error("Clipboard API failed, fallback not available for formatted HTML", e);
        alert("Failed to copy formatted table. Your browser might not support direct HTML copying.");
      }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-[#312E81] rounded-lg">
             <ClipboardList className="text-indigo-400" size={20} />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Daily Activity Tracker (EOD)</h2>
        </div>

        <div className="flex items-center gap-6">
           {/* Stats */}
           <div className="flex gap-6 text-[10px] font-bold tracking-widest uppercase">
              <div className="flex flex-col items-end">
                 <span className="text-slate-500">Processed</span>
                 <span className="text-emerald-400 text-sm">{count}</span>
              </div>
              <div className="flex flex-col items-end">
                 <span className="text-slate-500">Pending</span>
                 <span className="text-red-400 text-sm">0</span>
              </div>
           </div>

           {/* Actions */}
           <div className="flex items-center gap-3">
              <button 
                 onClick={handleCopySchedule}
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
      </div>

      {/* Main Table Card */}
      <div className="flex-1 bg-[#1c1e24]/80 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-xl">
         {/* Date Filter (Hidden in UI but functional) */}
         <div className="hidden">
             <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
         </div>

         {/* Table Header */}
         <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-white/5 border-b border-white/10 text-center">
             <div className="col-span-1 text-xs font-bold text-slate-400 uppercase">Time In</div>
             <div className="col-span-1 text-xs font-bold text-slate-400 uppercase">Time Out</div>
             <div className="col-span-2 text-xs font-bold text-slate-400 uppercase text-left">Activity</div>
             <div className="col-span-2 text-xs font-bold text-slate-400 uppercase text-left">Name of YP</div>
             <div className="col-span-2 text-xs font-bold text-slate-400 uppercase text-left">Name of Staff</div>
             <div className="col-span-1 text-xs font-bold text-slate-400 uppercase text-right">Amount</div>
             <div className="col-span-3 text-xs font-bold text-slate-400 uppercase text-left pl-4">Comments / Status</div>
         </div>

         {/* Table Body */}
         <div className="overflow-y-auto flex-1 custom-scrollbar">
             {schedule.length === 0 ? (
                 <div className="p-12 text-center text-slate-500 text-sm italic">
                    No schedule items generated for {new Date(date).toLocaleDateString()}.
                 </div>
             ) : (
                 schedule.map((item, i) => {
                     const isIdle = item.activity === 'IDLE';
                     const isMismatch = item.status === 'Dashboard Rule Mismatch';

                     return (
                        <div key={i} className={`grid grid-cols-12 gap-4 px-6 py-3 border-b border-white/5 items-center hover:bg-white/5 transition-colors ${isIdle ? 'opacity-50' : ''}`}>
                           <div className="col-span-1 text-sm text-slate-500 font-mono text-center">{item.timeIn}</div>
                           <div className="col-span-1 text-sm text-slate-500 font-mono text-center">{item.timeOut}</div>
                           <div className={`col-span-2 text-sm uppercase ${isIdle ? 'text-slate-400' : 'text-white'}`}>
                               {item.activity}
                           </div>
                           <div className="col-span-2 text-sm text-slate-300 truncate" title={item.yp}>{item.yp}</div>
                           <div className="col-span-2 text-sm text-slate-200 uppercase truncate" title={item.staff}>{item.staff}</div>
                           <div className="col-span-1 text-sm text-emerald-400 font-mono text-right">{item.amount ? `$${item.amount.replace('$','')}` : ''}</div>
                           <div className={`col-span-3 text-sm truncate pl-4 ${isMismatch ? 'text-red-400' : 'text-slate-500'}`}>
                               {item.status}
                           </div>
                        </div>
                     );
                 })
             )}
         </div>
         
         {/* Footer / Total Bar */}
         <div className="bg-white/5 px-6 py-3 border-t border-white/10 flex justify-between items-center text-xs text-slate-400">
             <span>Viewing EOD Schedule for: {new Date(date).toLocaleDateString()}</span>
             <span className="font-bold text-white">Total Processed: ${total.toFixed(2)}</span>
         </div>
      </div>
    </div>
  );
};

export default EodTab;