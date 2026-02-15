import React from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  id?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '', id }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let tableBuffer: string[] = [];
  let isProcessingTable = false;

  const renderTable = (rows: string[], key: string) => {
    if (rows.length < 2) return null; // Need at least header and separator or header and body

    // Filter separator line (contains ---) and empty lines
    const cleanRows = rows.filter(r => !r.includes('---') && r.trim() !== '');
    
    if (cleanRows.length === 0) return null;

    return (
      <div key={key} className="my-4 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm border-collapse bg-[#1a1c23]">
          <thead>
            <tr className="bg-[#2d313a] border-b border-slate-600">
              {cleanRows[0].split('|').filter(c => c.trim()).map((header, i) => (
                <th key={i} className="px-3 py-2 font-semibold text-slate-200 border-r border-slate-600 last:border-r-0 whitespace-nowrap">
                  {header.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {cleanRows.slice(1).map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                {row.split('|').filter(c => c.trim()).map((cell, cIdx) => (
                  <td key={cIdx} className="px-3 py-2 text-slate-300 border-r border-slate-700 last:border-r-0 align-top">
                    {cell.trim()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Table detection logic
    if (trimmed.startsWith('|')) {
      if (!isProcessingTable) isProcessingTable = true;
      tableBuffer.push(trimmed);
      return; // Skip rendering, accumulating lines
    } 
    
    // If we were processing a table and hit a non-table line
    if (isProcessingTable) {
      elements.push(renderTable(tableBuffer, `table-${index}`));
      tableBuffer = [];
      isProcessingTable = false;
    }

    if (trimmed === '') {
        elements.push(<div key={index} className="h-4"></div>);
        return;
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(<h3 key={index} className="text-lg font-bold text-slate-100 mt-6 mb-2 tracking-tight">{trimmed.replace('### ', '')}</h3>);
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(<h2 key={index} className="text-xl font-bold text-white mt-8 mb-3 border-b border-white/10 pb-2">{trimmed.replace('## ', '')}</h2>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(<h1 key={index} className="text-2xl font-bold text-white mt-6 mb-4">{trimmed.replace('# ', '')}</h1>);
      return;
    }

    // Lists
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
       elements.push(<li key={index} className="ml-4 list-disc text-slate-400 marker:text-slate-500 pl-1 mb-1">{trimmed.replace(/^[-*] /, '')}</li>);
       return;
    }

    // Bold/Text parsing
    const parts = line.split(/(\*\*.*?\*\*)/g);
    elements.push(
      <p key={index} className="text-slate-300 leading-relaxed min-h-[1.2em] mb-1">
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
          }
          return part;
        })}
      </p>
    );
  });

  // Flush remaining table if file ends with table
  if (isProcessingTable && tableBuffer.length > 0) {
      elements.push(renderTable(tableBuffer, `table-end`));
  }

  return (
    <div id={id} className={`font-sans ${className}`}>
      {elements}
    </div>
  );
};

export default MarkdownRenderer;