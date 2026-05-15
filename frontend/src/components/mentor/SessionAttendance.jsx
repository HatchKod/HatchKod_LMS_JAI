import { useState, useEffect } from "react";
import { api, formatApiError } from "../../lib/api";
import { 
  X, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Download,
  Loader2,
  AlertCircle
} from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "../ui/avatar";

export default function SessionAttendance({ sessionId, sessionTopic, sessionDate, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      toast.success("Attendance updated");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to update");
    }
  };

  const exportCSV = () => {
    const headers = ["Student Name", "Status", "Joined At", "Left At", "Duration (Min)", "Override Reason"];
    const rows = records.map(r => {
      const duration = r.joined_at && r.left_at 
        ? Math.round((new Date(r.left_at) - new Date(r.joined_at)) / 60000)
        : "";
        
      return [
        r.student_name,
        r.status.toUpperCase(),
        r.joined_at ? new Date(r.joined_at).toLocaleTimeString() : "—",
        r.left_at ? new Date(r.left_at).toLocaleTimeString() : "—",
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
    late: records.filter(r => r.status === 'late').length,
    absent: records.filter(r => r.status === 'absent').length,
    total: records.length
  };

  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-right duration-300">
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

      {/* Summary Chips */}
      <div className="p-4 bg-slate-50/50 flex gap-2 overflow-x-auto no-scrollbar">
        <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-sm border border-emerald-100 flex items-center gap-2 shrink-0">
          <CheckCircle className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Present: {stats.present}</span>
        </div>
        <div className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-sm border border-amber-100 flex items-center gap-2 shrink-0">
          <Clock className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Late: {stats.late}</span>
        </div>
        <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded-sm border border-red-100 flex items-center gap-2 shrink-0">
          <XCircle className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Absent: {stats.absent}</span>
        </div>
        <div className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-sm border border-slate-200 flex items-center gap-2 shrink-0 ml-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider">Total: {stats.total}</span>
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
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Joined</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Left</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Duration</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right pr-8">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {records.map(r => {
                const duration = r.joined_at && r.left_at 
                  ? Math.round((new Date(r.left_at) - new Date(r.joined_at)) / 60000)
                  : null;

                return (
                  <tr key={r.student_id} className="group hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-slate-200">
                          <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                            {r.student_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-bold text-slate-700">{r.student_name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-xs text-slate-400 font-medium">
                        {r.joined_at ? new Date(r.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-xs text-slate-400 font-medium">
                        {r.left_at ? new Date(r.left_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {duration !== null ? (
                        <div className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm border border-slate-200 inline-block">
                          <span className="text-[10px] font-bold tracking-wider">{duration} min</span>
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
                          <option value="late">Late</option>
                          <option value="absent">Absent</option>
                        </select>
                        {r.override_reason && (
                          <div className="flex items-center gap-1 text-blue-500">
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
          Export Attendance (CSV)
        </Button>
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
    case 'late':
      return (
        <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-sm border border-amber-100 w-fit">
          <Clock className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Late</span>
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
