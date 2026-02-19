import React from 'react';
import { X, Edit2, Trash2, Save } from 'lucide-react';

interface RowDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: any;
  isEditMode: boolean;
  setIsEditMode: (isEdit: boolean) => void;
  editedRowData: any;
  setEditedRowData: (data: any) => void;
  onDelete: () => void;
  onSave: () => void;
}

const RowDetailModal: React.FC<RowDetailModalProps> = ({
  isOpen, onClose, row, isEditMode, setIsEditMode, 
  editedRowData, setEditedRowData, onDelete, onSave
}) => {
  if (!isOpen || !row) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1c1e24] border border-white/10 rounded-2xl p-6 max-w-2xl w-full shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
          <X size={20} />
        </button>
        <div className="mb-6 flex items-center justify-between pr-8">
          <h2 className="text-xl font-bold text-white">Transaction Details</h2>
          <div className="flex gap-2">
            {!isEditMode ? (
              <button onClick={() => setIsEditMode(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 text-xs font-bold uppercase tracking-wider transition-colors">
                <Edit2 size={14} /> Edit
              </button>
            ) : (
              <button onClick={() => setIsEditMode(false)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-bold uppercase tracking-wider transition-colors">
                Cancel
              </button>
            )}
            <button onClick={onDelete} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-bold uppercase tracking-wider transition-colors">
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Staff Name</label>
              {isEditMode ? (
                <input 
                  type="text" 
                  value={editedRowData?.staffName || ''} 
                  onChange={(e) => setEditedRowData({...editedRowData, staffName: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                />
              ) : (
                <p className="text-white font-medium uppercase">{row.staffName}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Amount</label>
              {isEditMode ? (
                <input 
                  type="text" 
                  value={editedRowData?.totalAmount || ''} 
                  onChange={(e) => setEditedRowData({...editedRowData, totalAmount: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                />
              ) : (
                <p className="text-emerald-400 font-bold text-lg">{row.totalAmount}</p>
              )}
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Client / Location</label>
              {isEditMode ? (
                <input 
                  type="text" 
                  value={editedRowData?.ypName || ''} 
                  onChange={(e) => setEditedRowData({...editedRowData, ypName: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                />
              ) : (
                <p className="text-slate-300 text-sm">{row.ypName}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">NAB Code</label>
              {isEditMode ? (
                <input 
                  type="text" 
                  value={editedRowData?.nabCode || ''} 
                  onChange={(e) => setEditedRowData({...editedRowData, nabCode: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                />
              ) : (
                <p className="text-slate-400 text-sm font-mono">{row.nabCode}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Date Processed</label>
              <p className="text-slate-400 text-sm">{row.dateProcessed}</p>
            </div>
          </div>
        </div>

        {isEditMode && (
          <div className="mt-8 pt-4 border-t border-white/10 flex justify-end gap-3">
            <button onClick={() => setIsEditMode(false)} className="px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 text-slate-400 text-sm font-medium transition-colors">
              Cancel Changes
            </button>
            <button onClick={onSave} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors flex items-center gap-2">
              <Save size={16} /> Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RowDetailModal;