import React from 'react';
import { Users, Check, Save, CloudUpload, RefreshCw } from 'lucide-react';

interface SettingsTabProps {
  employeeText: string;
  setEmployeeText: (text: string) => void;
  onSaveEmployees: () => void;
  saveStatus: 'idle' | 'saved';
  importing: boolean;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  dismissedCount: number;
  onRestoreDismissed: () => void;
  onResetDefaults: () => void;
}

const SettingsTab: React.FC<SettingsTabProps> = ({
  employeeText, setEmployeeText, onSaveEmployees, saveStatus, 
  importing, onImport, dismissedCount, onRestoreDismissed, onResetDefaults
}) => {
  return (
    <div className="bg-[#1c1e24]/80 backdrop-blur-md rounded-[32px] border border-white/5 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="text-blue-400" />
          <h2 className="text-xl font-semibold text-white">System Settings</h2>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Employee Database Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-white">Employee Database</h3>
              <p className="text-sm text-slate-400">Manage the list of staff names for auto-correction. Format: First Name [tab] Surname [tab] Concatenate...</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={onResetDefaults}
                className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Reset Defaults
              </button>
              <button 
                onClick={onSaveEmployees}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${saveStatus === 'saved' ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
              >
                {saveStatus === 'saved' ? <Check size={16} /> : <Save size={16} />}
                {saveStatus === 'saved' ? 'Saved' : 'Save Changes'}
              </button>
            </div>
          </div>
          <div className="bg-black/30 rounded-xl border border-white/10 p-1">
            <textarea 
              value={employeeText}
              onChange={(e) => setEmployeeText(e.target.value)}
              className="w-full h-64 bg-transparent border-none text-slate-300 font-mono text-xs p-4 focus:ring-0 resize-y"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="h-px bg-white/5"></div>

        {/* Import Data Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-medium text-white mb-2">Import Historical Data</h3>
            <p className="text-sm text-slate-400 mb-4">Upload CSV or JSON files to bulk import data into Supabase.</p>
            
            <div className="relative group flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed border-slate-600 hover:border-indigo-500 transition-colors bg-white/5 hover:bg-white/10 cursor-pointer">
              {importing ? (
                <div className="flex flex-col items-center">
                  <RefreshCw className="animate-spin text-indigo-400 mb-2" size={24} />
                  <span className="text-sm text-slate-300">Importing...</span>
                </div>
              ) : (
                <>
                  <CloudUpload className="text-slate-400 group-hover:text-indigo-400 mb-2" size={32} />
                  <span className="text-sm text-slate-300 font-medium">Click to Upload File</span>
                  <span className="text-xs text-slate-500 mt-1">.csv or .json supported</span>
                </>
              )}
              <input 
                type="file" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                accept=".csv,.json"
                onChange={onImport}
                disabled={importing}
              />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-white mb-2">System Maintenance</h3>
            <p className="text-sm text-slate-400 mb-4">Manage local data and cached settings.</p>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div>
                  <p className="text-sm font-medium text-slate-200">Dismissed Discrepancies</p>
                  <p className="text-xs text-slate-500">{dismissedCount} items hidden from pending list.</p>
                </div>
                <button 
                  onClick={onRestoreDismissed}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider"
                >
                  Restore All
                </button>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Database</span>
                  <span className="text-emerald-400 font-medium">Supabase Connected</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;