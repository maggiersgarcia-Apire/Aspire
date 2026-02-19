import React, { useState, useRef, useEffect } from 'react';
import { Database, Search, Download, RefreshCw, Trash2, Circle, CheckCircle } from 'lucide-react';

interface DatabaseTabProps {
  filteredRows: any[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onDownloadCSV: () => void;
  onRefresh: () => void;
  loading: boolean;
  onRowClick: (row: any) => void;
  onBulkDelete?: (ids: string[]) => Promise<boolean>;
}

const DatabaseTab: React.FC<DatabaseTabProps> = ({
  filteredRows, searchTerm, setSearchTerm, onDownloadCSV, onRefresh, loading, onRowClick, onBulkDelete
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  
  // Ref to track dragging state across events without re-renders affecting logic immediately
  const isDraggingRef = useRef(false);

  // Global mouse up handler to stop dragging if mouse is released outside table
  useEffect(() => {
      const handleGlobalMouseUp = () => {
          if (isDraggingRef.current) {
              isDraggingRef.current = false;
              setIsDragging(false);
          }
      };
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const handleMouseDown = (id: any, e: React.MouseEvent) => {
      // Prevent text selection
      e.preventDefault(); 
      isDraggingRef.current = true;
      setIsDragging(true);
      
      // Select the item clicked
      toggleSelection(String(id));
  };

  const handleMouseEnter = (id: any) => {
      if (isDraggingRef.current) {
          // If dragging, we assume "paint" selection (add to selection)
          // We cast to String to ensure set consistency
          setSelectedIds(prev => {
              const newSet = new Set(prev);
              newSet.add(String(id));
              return newSet;
          });
      }
  };

  const handleBulkDeleteClick = async () => {
      if (onBulkDelete && selectedIds.size > 0) {
          const success = await onBulkDelete(Array.from(selectedIds));
          if (success) {
              setSelectedIds(new Set());
          }
      }
  };

  const handleSelectAll = () => {
      // Calculate unique IDs in the current view
      const uniqueIdsInView = new Set(filteredRows.map(r => String(r.internalId)));
      
      // If all currently visible unique IDs are selected, deselect all
      // We check if every unique ID in view is in the selected set
      const allSelected = Array.from(uniqueIdsInView).every(id => selectedIds.has(id));

      if (allSelected) {
          setSelectedIds(new Set());
      } else {
          // Select all visible
          setSelectedIds(uniqueIdsInView);
      }
  };

  return (
    <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-[calc(100vh-140px)]">
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Database className="text-emerald-400" />
          <h2 className="text-xl font-semibold text-white">Reimbursement Database (All Records)</h2>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
             <button 
                onClick={handleBulkDeleteClick}
                className="flex items-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 px-4 py-2 rounded-full text-sm font-bold transition-colors mr-2 animate-in fade-in slide-in-from-right-4"
             >
                <Trash2 size={16} />
                Delete Selected ({selectedIds.size})
             </button>
          )}

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
      <div className="flex-1 overflow-auto p-0 custom-scrollbar select-none">
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
                  <th className="px-4 py-4 border-b border-white/10 w-12 text-center">
                      <button onClick={handleSelectAll} className="text-slate-400 hover:text-white transition-colors">
                          {selectedIds.size > 0 ? <CheckCircle size={16} className="text-indigo-400" /> : <Circle size={16} />}
                      </button>
                  </th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[120px]">UID</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Time Stamp</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Nab Code</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Client / Location</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">YP NAME</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Staff Name</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[150px]">Type of expense</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[200px]">Product</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[100px]">Receipt Date</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap text-right min-w-[100px]">Amount</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap text-right min-w-[100px] bg-white/5">Total Amount</th>
                  <th className="px-4 py-4 border-b border-white/10 whitespace-nowrap min-w-[120px]">Date Processed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRows.map((row) => {
                  const isSelected = selectedIds.has(String(row.internalId));
                  return (
                    <tr 
                      key={row.id} 
                      className={`transition-colors group cursor-pointer ${isSelected ? 'bg-indigo-500/20 hover:bg-indigo-500/30' : 'hover:bg-white/10 even:bg-white/5'}`}
                      onMouseEnter={() => handleMouseEnter(row.internalId)}
                    >
                      <td 
                        className="px-4 py-3 border-r border-white/5 text-center" 
                        onMouseDown={(e) => handleMouseDown(row.internalId, e)}
                        onClick={(e) => e.stopPropagation()} // Stop propagation to row click
                      >
                          <div className={`cursor-pointer ${isSelected ? 'text-indigo-400' : 'text-slate-600 group-hover:text-slate-400'}`}>
                             {isSelected ? <CheckCircle size={16} /> : <Circle size={16} />}
                          </div>
                      </td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap font-mono" onClick={() => onRowClick(row)}>{row.uid}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap" onClick={() => onRowClick(row)}>{row.timestamp}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap font-mono text-emerald-400" onClick={() => onRowClick(row)}>{row.nabCode}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap truncate max-w-[250px]" title={row.ypName} onClick={() => onRowClick(row)}>{row.ypName}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap" onClick={() => onRowClick(row)}>{row.youngPersonName}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap uppercase" onClick={() => onRowClick(row)}>{row.staffName}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap" onClick={() => onRowClick(row)}>{row.expenseType}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap truncate max-w-[200px]" title={row.product} onClick={() => onRowClick(row)}>{row.product}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap" onClick={() => onRowClick(row)}>{row.receiptDate}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right font-mono" onClick={() => onRowClick(row)}>{row.amount}</td>
                      <td className="px-4 py-3 border-r border-white/5 whitespace-nowrap text-right font-mono font-bold bg-white/5" onClick={() => onRowClick(row)}>{row.totalAmount}</td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={() => onRowClick(row)}>{row.dateProcessed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseTab;