import React from 'react';
import { Database, Search, Download, RefreshCw } from 'lucide-react';

interface DatabaseTabProps {
  filteredRows: any[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onDownloadCSV: () => void;
  onRefresh: () => void;
  loading: boolean;
  onRowClick: (row: any) => void;
}

const DatabaseTab: React.FC<DatabaseTabProps> = ({
  filteredRows, searchTerm, setSearchTerm, onDownloadCSV, onRefresh, loading, onRowClick
}) => {
  return (
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
          
          <button onClick={onDownloadCSV} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white" title="Download CSV">
            <Download size={18} />
          </button>

          <button onClick={onRefresh} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors text-slate-400 hover:text-white" title="Refresh">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-0 custom-scrollbar">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="animate-spin mx-auto mb-3" size={32} />
            <p>Loading database...</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Database className="mx-auto mb-3 opacity-50" size={48} />
            <p className="text-lg font-medium text-slate-300">No records found</p>
            <p className="text-sm">Processed transactions will appear here.</p>
          </div>
        ) : (
          <div className="min-w-max">
            <table className="w-full text-left border-collapse font-sans text-xs text-white">
              <thead className="sticky top-0 z-10 bg-[#111216] font-bold uppercase tracking-wider shadow-lg">
                <tr>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[120px]">UID</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Time Stamp</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Client / Location</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">YP NAME</th>
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
                {filteredRows.map((row) => (
                  <tr 
                    key={row.id} 
                    onClick={() => onRowClick(row)}
                    className="hover:bg-white/10 transition-colors group cursor-pointer even:bg-white/5"
                  >
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap font-mono">{row.uid}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap">{row.timestamp}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap truncate max-w-[250px]" title={row.ypName}>{row.ypName}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap">{row.youngPersonName}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap uppercase">{row.staffName}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap">{row.expenseType}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap truncate max-w-[200px]" title={row.product}>{row.product}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap">{row.receiptDate}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right font-mono">{row.amount}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right font-mono font-bold bg-white/5">{row.totalAmount}</td>
                    <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap">{row.dateProcessed}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono">{row.nabCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseTab;