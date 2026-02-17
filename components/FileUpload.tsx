import React, { useRef, useState } from 'react';
import { Upload, X, FileText, FileSpreadsheet } from 'lucide-react';
import { FileWithPreview } from '../types';
import { formatBytes } from '../utils/fileHelpers';

interface FileUploadProps {
  label: string;
  files: FileWithPreview[];
  onFilesChange: (files: FileWithPreview[]) => void;
  multiple?: boolean;
  accept?: string;
  description?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  label,
  files,
  onFilesChange,
  multiple = false,
  accept = "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv",
  description = "Support for JPG, PDF, Word, Excel"
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Helper to unify file processing from Drop, Input, and Paste
  const processFiles = (incomingFiles: File[]) => {
    if (incomingFiles.length === 0) return;
    
    const newFiles = incomingFiles.map((file: File) => Object.assign(file, {
      preview: URL.createObjectURL(file)
    }));

    if (multiple) {
      onFilesChange([...files, ...newFiles]);
    } else {
      if (newFiles.length > 0) {
        onFilesChange([newFiles[0]]);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        processFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (indexToRemove: number) => {
    const updatedFiles = files.filter((_, index) => index !== indexToRemove);
    onFilesChange(updatedFiles);
  };

  // Drag and Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Unified Paste Handler Logic
  const handlePasteLogic = (clipboardData: DataTransfer | null) => {
    if (!clipboardData) return;

    const extractedFiles: File[] = [];

    // 1. Check for standard files (e.g. copied from file explorer)
    if (clipboardData.files.length > 0) {
       extractedFiles.push(...Array.from(clipboardData.files));
    } 
    // 2. Check for raw items (e.g. screenshots in clipboard memory)
    else if (clipboardData.items) {
        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (blob) {
                    // Create a named file from the blob
                    const file = new File([blob], `screenshot-${Date.now()}.png`, { type: item.type || 'image/png' });
                    extractedFiles.push(file);
                }
            }
        }
    }

    if (extractedFiles.length > 0) {
        processFiles(extractedFiles);
        return true; // handled
    }
    return false;
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // Only handle if focused to avoid conflicts, though React's onPaste usually implies focus or bubbling
    if (handlePasteLogic(e.clipboardData)) {
        e.preventDefault();
    }
  };

  const getFileIcon = (file: File) => {
      if (file.type.startsWith('image/')) {
          return <img src={(file as FileWithPreview).preview} alt={file.name} className="h-full w-full object-cover" />;
      }
      if (file.name.endsWith('.xls') || file.name.endsWith('.xlsx') || file.name.endsWith('.csv')) {
          return <FileSpreadsheet className="text-emerald-400" />;
      }
      if (file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
          return <FileText className="text-blue-400" />;
      }
      return <FileText className="text-slate-400" />;
  };

  return (
    <div className="w-full">
      {/* Header Row: Label Left, Description Right */}
      <div className="flex justify-between items-baseline mb-3 px-1">
        <label className="block text-base font-medium text-slate-200">{label}</label>
        <span className="text-xs text-slate-500">{description}</span>
      </div>
      
      {/* Dropzone Box */}
      <div 
        ref={containerRef}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        tabIndex={0}
        className={`group relative flex flex-col items-center justify-center w-full h-40 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer outline-none overflow-hidden
          ${isDragging 
            ? 'border-indigo-400 bg-indigo-500/10' 
            : isFocused 
              ? 'border-indigo-500/50 bg-white/5 ring-1 ring-indigo-500/30' 
              : 'border-slate-600/60 bg-slate-800/30 hover:bg-slate-800/50 hover:border-slate-500'
          }
        `}
      >
        <div className="flex flex-col items-center justify-center space-y-3 p-5 text-center">
          {/* Circular Icon Background */}
          <div className={`p-3 rounded-full transition-colors duration-300
             ${isDragging ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-700/50 text-slate-400 group-hover:bg-slate-700 group-hover:text-indigo-400'}
          `}>
             {isDragging ? <Upload size={24} className="animate-bounce" /> : <Upload size={24} />}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-300">
              <span className="text-indigo-400 hover:text-indigo-300 underline decoration-dotted underline-offset-2">Upload files</span>, Paste, or Drag & Drop
            </p>
            <p className="text-xs text-slate-500">
               {multiple ? "Multiple files allowed" : "Single file"} • Ctrl+V to paste
            </p>
          </div>
        </div>
        
        <input 
          ref={fileInputRef}
          type="file" 
          className="sr-only" 
          multiple={multiple} 
          accept={accept}
          onChange={handleFileChange}
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="relative flex items-center p-3 border border-white/10 rounded-xl bg-white/5 backdrop-blur-sm group hover:border-white/20 transition-colors">
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-black/20 flex items-center justify-center border border-white/5">
                {getFileIcon(file)}
              </div>
              <div className="ml-4 flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
              </div>
              <button
                onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                }}
                className="ml-4 flex-shrink-0 bg-transparent rounded-md text-slate-500 hover:text-red-400 transition-colors focus:outline-none opacity-0 group-hover:opacity-100"
              >
                <X size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FileUpload;