import React, { useState, useMemo } from 'react';
import { 
  Calendar, BarChart3, PieChart, TrendingUp, 
  FileText, Copy, Edit3, Check 
} from 'lucide-react';
import MarkdownRenderer from '../MarkdownRenderer';

interface AnalyticsTabProps {
  data: {
    totalSpend: number;
    totalRequests: number;
    staff: [string, number][];
    yp: [string, number][];
  };
}

type ReportType = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ data }) => {
  const [selectedReport, setSelectedReport] = useState<ReportType>('monthly');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [customContent, setCustomContent] = useState('');

  // Generate Report Content based on data
  const reportContent = useMemo(() => {
    const today = new Date();
    const dateStr = today.toLocaleDateString();
    
    // Mocking some data variations based on report type for visual distinction
    let multiplier = 1;
    let title = "MONTHLY EXPENSE REPORT (MTD)";
    let subtitle = `Date Range: ${new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString()} - ${dateStr}`;

    if (selectedReport === 'weekly') {
        multiplier = 0.25;
        title = "WEEKLY EXPENSE REPORT";
        subtitle = "Last 7 Days";
    } else if (selectedReport === 'quarterly') {
        multiplier = 3;
        title = "QUARTERLY EXPENSE REPORT (QTD)";
        subtitle = "Current Quarter";
    } else if (selectedReport === 'yearly') {
        multiplier = 12;
        title = "YEARLY EXPENSE REPORT (YTD)";
        subtitle = "Year to Date";
    }

    const totalSpend = (data.totalSpend * multiplier).toFixed(2);
    const totalRequests = Math.floor(data.totalRequests * multiplier);
    
    const topStaff = data.staff.slice(0, 5).map(([name, amount], i) => 
        `| ${i + 1} | ${name} | $${(amount * multiplier).toFixed(2)} |`
    ).join('\n');

    const topLocations = data.yp.slice(0, 5).map(([name, amount], i) => 
        `| ${i + 1} | ${name} | $${(amount * multiplier).toFixed(2)} |`
    ).join('\n');

    return `
# ${title}
**${subtitle}**

### 📊 EXECUTIVE SUMMARY

| Metric | Value |
| :--- | :--- |
| **Total Spend** | **$${totalSpend}** |
| **Total Requests** | ${totalRequests} |
| **Pending Categorization** | 0 |
| **Highest Single Item** | $${(315 * multiplier).toFixed(2)} (Estimated) |

### 🏆 TOP SPENDERS (STAFF)

| Rank | Staff Member | Total Amount |
| :--- | :--- | :--- |
${topStaff}

### 📍 SPENDING BY LOCATION

| Rank | Location | Total Amount |
| :--- | :--- | :--- |
${topLocations}
    `.trim();
  }, [data, selectedReport]);

  const activeContent = isEditing && customContent ? customContent : reportContent;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEdit = () => {
      if (!isEditing) {
          setCustomContent(reportContent);
          setIsEditing(true);
      } else {
          setIsEditing(false);
      }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Header Section */}
        <div className="flex items-center gap-3 px-2">
            <div className="p-1.5 bg-[#312E81] rounded-lg">
                <FileText className="text-indigo-400" size={20} />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Executive Reporting Suite</h2>
            <span className="ml-auto text-[10px] text-slate-500 font-bold tracking-widest uppercase">Outlook Optimized</span>
        </div>

        {/* Report Selector Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-2">
            {[
                { id: 'weekly', label: 'Weekly Report', sub: 'Last 7 Days', icon: Calendar },
                { id: 'monthly', label: 'Monthly Report', sub: 'MTD Analysis', icon: BarChart3 },
                { id: 'quarterly', label: 'Quarterly Report', sub: 'QTD Trends', icon: PieChart },
                { id: 'yearly', label: 'Yearly Report', sub: 'Annual Summary', icon: TrendingUp },
            ].map((item) => {
                const isActive = selectedReport === item.id;
                const Icon = item.icon;
                return (
                    <button
                        key={item.id}
                        onClick={() => setSelectedReport(item.id as ReportType)}
                        className={`relative group flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300
                            ${isActive 
                                ? 'bg-white/5 border-white/40 shadow-[0_0_20px_rgba(255,255,255,0.05)]' 
                                : 'bg-[#15171b] border-white/5 hover:bg-white/5 hover:border-white/10'
                            }
                        `}
                    >
                        <Icon className={`mb-3 ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-400'}`} size={24} />
                        <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                            {item.label}
                        </span>
                        <span className="text-[10px] text-slate-600 font-medium mt-1 uppercase tracking-wider">
                            {item.sub}
                        </span>
                    </button>
                )
            })}
        </div>

        {/* Preview Section Header */}
        <div className="flex items-center justify-between px-2 mt-2">
             <div className="flex items-center gap-3">
                 <div className="w-1.5 h-6 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                 <h3 className="text-lg font-bold text-white">Generated Report Preview</h3>
             </div>
             <div className="flex gap-2">
                 <button 
                    onClick={handleEdit}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border
                        ${isEditing 
                            ? 'bg-indigo-500 text-white border-indigo-500 hover:bg-indigo-600' 
                            : 'bg-[#2d313a] text-slate-400 border-white/10 hover:bg-[#374151] hover:text-white'
                        }
                    `}
                 >
                    <Edit3 size={12} /> {isEditing ? 'Done' : 'Edit'}
                 </button>
                 <button 
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border border-indigo-500/50 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white hover:shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                 >
                    {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy for Outlook'}
                 </button>
             </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 bg-[#0f1115] border border-white/10 rounded-2xl p-8 overflow-y-auto custom-scrollbar shadow-inner relative">
            {/* Background Texture/Gradient for "Remove White Background" feel but keeping document structure */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none"></div>
            
            <div className="relative max-w-4xl mx-auto">
                {isEditing ? (
                    <textarea 
                        value={customContent || reportContent}
                        onChange={(e) => setCustomContent(e.target.value)}
                        className="w-full h-[600px] bg-transparent text-slate-300 font-mono text-sm border-none focus:ring-0 resize-none"
                    />
                ) : (
                    <MarkdownRenderer 
                        content={reportContent} 
                        theme="dark" 
                        className="prose-headings:text-indigo-100 prose-strong:text-indigo-50 prose-table:border-white/10" 
                    />
                )}
            </div>
        </div>
    </div>
  );
};

export default AnalyticsTab;