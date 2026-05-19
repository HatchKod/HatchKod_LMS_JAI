import { useState, useEffect, useRef } from "react";
import { api, formatApiError } from "../../lib/api";
import { 
  X, 
  CheckCircle, 
  XCircle, 
  Download,
  Loader2,
  AlertCircle,
  UploadCloud,
  FileText,
  UserCheck,
  Search,
  Info
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "../ui/avatar";

export default function SessionAttendance({ sessionId, sessionTopic, sessionDate, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  


  const fetchAttendance = async () => {
    try {
      const { data } = await api.get(`/sessions/${sessionId}/attendance`);
      setRecords(data);
    } catch (e) {
      toast.error("Failed to load attendance records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [sessionId]);

  const handleOverride = async (studentId, newStatus) => {
    try {
      await api.patch(`/sessions/${sessionId}/attendance/${studentId}`, {
        status: newStatus,
        override_reason: "Manual override by mentor"
      });
      setRecords(prev => prev.map(r => 
        r.student_id === studentId 
          ? { ...r, status: newStatus, override_reason: "Manual override by mentor" } 
          : r
      ));
      toast.success("Attendance updated successfully");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to update");
    }
  };



  const exportCSV = () => {
    const headers = ["Student Name", "Status", "Joined At", "Duration (Min)", "Override Reason"];
    const rows = records.map(r => {
      const durationMatch = r.override_reason && r.override_reason.match(/Meet duration:\s*(\d+)/i);
      const duration = durationMatch ? durationMatch[1] : (r.joined_at && r.left_at ? Math.round((new Date(r.left_at) - new Date(r.joined_at)) / 60000) : "");
        
      return [
        r.student_name,
        r.status.toUpperCase(),
        r.joined_at ? new Date(r.joined_at).toLocaleTimeString() : "—",
        duration,
        r.override_reason || ""
      ];
    });
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance-${sessionTopic.replace(/\s+/g, '-')}-${new Date(sessionDate).toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = {
    present: records.filter(r => r.status === 'present').length,
    absent: records.filter(r => r.status === 'absent').length,
    total: records.length
  };

  const filteredRecords = records.filter(r => 
    r.student_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.student_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );



  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-right duration-300 font-['IBM_Plex_Sans']">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800 font-['Outfit']">{sessionTopic}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            {new Date(sessionDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <X className="h-5 w-5 text-slate-400" />
        </button>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Chrome Extension Info */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-sm flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-blue-800">Automated Sync via Chrome Extension</p>
              <p className="text-[10px] text-blue-600 mt-0.5 leading-relaxed">
                The HatchKod Chrome Extension automatically syncs Google Meet attendance to this dashboard. 
                Students are recommended as <span className="text-emerald-500 font-bold">Present</span> if their total call duration meets or exceeds <span className="text-blue-500 font-bold">75%</span> of the class duration.
              </p>
            </div>
          </div>
        </div>

          {/* Summary Stats & Progress Bar */}
          <div className="p-4 bg-slate-50/50 border-b border-slate-100 space-y-3">
            {/* Performance Metric */}
            {stats.total > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <span>Attendance Rate</span>
                  <span className="text-[#194BFB]">{Math.round((stats.present / stats.total) * 100)}% ({stats.present}/{stats.total})</span>
                </div>
                <div className="h-1.5 w-full bg-slate-200/60 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#194BFB] rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${Math.round((stats.present / stats.total) * 100)}%` }} 
                  />
                </div>
              </div>
            )}
            
            {/* Status Chips */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
              <div className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-sm border border-emerald-100 flex items-center gap-1.5 shrink-0">
                <CheckCircle className="h-3 w-3" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Present: {stats.present}</span>
              </div>
              <div className="bg-red-50 text-red-700 px-2.5 py-1 rounded-sm border border-red-100 flex items-center gap-1.5 shrink-0">
                <XCircle className="h-3 w-3" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Absent: {stats.absent}</span>
              </div>
              <div className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-sm border border-slate-200 flex items-center gap-1.5 shrink-0 ml-auto">
                <span className="text-[9px] font-bold uppercase tracking-wider">Total: {stats.total}</span>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 bg-slate-50/20">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search students by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs rounded-sm border-slate-200 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest">Loading records...</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-slate-100">
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Student</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Meet Duration</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right pr-8">Manual Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredRecords.map(r => {
                    // Parse duration from override reason text (e.g. "Meet duration: 45 min")
                    const durationMatch = r.override_reason && r.override_reason.match(/Meet duration:\s*(\d+)/i);
                    const durationText = durationMatch 
                      ? `${durationMatch[1]} min` 
                      : (r.joined_at && r.left_at ? `${Math.round((new Date(r.left_at) - new Date(r.joined_at)) / 60000)} min` : "—");

                    return (
                      <tr key={r.student_id} className="group hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border border-slate-200">
                              <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                                {r.student_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="text-sm font-bold text-slate-700 block">{r.student_name}</span>
                              <span className="text-[9px] text-slate-400 block mt-0.5">{r.student_email || "No email"}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="p-4 text-center">
                          {durationText !== "—" ? (
                            <div className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-sm border border-slate-200 inline-block">
                              <span className="text-[10px] font-bold tracking-wider">{durationText}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-4 text-right pr-8">
                          <div className="space-y-1 inline-block text-left">
                            <select 
                              value={r.status}
                              onChange={(e) => handleOverride(r.student_id, e.target.value)}
                              className="text-[10px] font-bold uppercase tracking-wider bg-white border border-slate-200 rounded-sm px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="present">Present</option>
                              <option value="absent">Absent</option>
                            </select>
                            {r.override_reason && !r.override_reason.includes("Meet duration") && (
                              <div className="flex items-center gap-1 text-blue-500 justify-end">
                                <AlertCircle className="h-2.5 w-2.5" />
                                <span className="text-[8px] font-bold uppercase tracking-tighter">Overridden</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/30">
            <Button 
              variant="outline" 
              className="w-full h-11 border-slate-200 text-slate-600 font-bold uppercase tracking-widest text-xs gap-2 hover:bg-white"
              onClick={exportCSV}
              disabled={records.length === 0}
            >
              <Download className="h-4 w-4" />
              Export Verification Sheet (CSV)
            </Button>
          </div>
        </div>
    </div>
  );
}

function StatusBadge({ status }) {
  switch (status) {
    case 'present':
      return (
        <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-sm border border-emerald-100 w-fit">
          <CheckCircle className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Present</span>
        </div>
      );
    case 'absent':
      return (
        <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-0.5 rounded-sm border border-red-100 w-fit">
          <XCircle className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Absent</span>
        </div>
      );
    default:
      return null;
  }
}
