import { useState, useEffect } from "react";
import { api, formatApiError } from "../../lib/api";
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  ClipboardList,
  Loader2
} from "lucide-react";
import { Card } from "../ui/card";
import { useAuth } from "../../lib/auth";

export default function MyAttendance() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const res = await api.get(`/students/${user.id}/attendance`);
        setData(res.data);
      } catch (e) {
        console.error("Failed to load attendance", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAttendance();
  }, [user.id]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="h-10 w-10 animate-spin mb-2" />
      <p className="text-xs font-bold uppercase tracking-widest">Calculating attendance...</p>
    </div>
  );

  if (!data || data.records.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-white border border-dashed rounded-sm">
      <ClipboardList className="h-12 w-12 mb-3 opacity-20" />
      <p className="text-sm font-bold uppercase tracking-widest">No attendance records yet</p>
      <p className="text-[10px] font-medium mt-1">Attendance is recorded automatically when you join live classes.</p>
    </div>
  );

  const { summary, records } = data;
  const filteredRecords = filter === "all" ? records : records.filter(r => r.status === filter);

  const getPctColor = (pct) => {
    if (pct >= 90) return "text-emerald-600";
    if (pct >= 75) return "text-amber-500";
    return "text-red-600";
  };

  const getPctBg = (pct) => {
    if (pct >= 90) return "bg-emerald-500";
    if (pct >= 75) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-slate-200 rounded-sm relative overflow-hidden group hover:border-slate-300 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Overall Attendance</p>
              <h3 className={`text-4xl font-black mt-2 font-['Outfit'] ${getPctColor(summary.attendance_percentage)}`}>
                {summary.attendance_percentage}%
              </h3>
            </div>
            <div className="relative h-14 w-14">
              <svg className="h-14 w-14 transform -rotate-90">
                <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-100" />
                <circle 
                  cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="transparent" 
                  strokeDasharray={150.8}
                  strokeDashoffset={150.8 - (150.8 * summary.attendance_percentage) / 100}
                  className={getPctColor(summary.attendance_percentage)}
                />
              </svg>
            </div>
          </div>
        </Card>

        <Card className="p-5 border-slate-200 rounded-sm hover:border-slate-300 transition-all">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Present</p>
          <div className="flex items-center gap-3 mt-2">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
            <h3 className="text-3xl font-black font-['Outfit'] text-slate-800">{summary.present_count}</h3>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-1">Classes attended on time</p>
        </Card>

        <Card className="p-5 border-slate-200 rounded-sm hover:border-slate-300 transition-all">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Late</p>
          <div className="flex items-center gap-3 mt-2">
            <Clock className="h-8 w-8 text-amber-500" />
            <h3 className="text-3xl font-black font-['Outfit'] text-slate-800">{summary.late_count}</h3>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-1">Sessions joined after 10m</p>
        </Card>

        <Card className="p-5 border-slate-200 rounded-sm hover:border-slate-300 transition-all">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Absent</p>
          <div className="flex items-center gap-3 mt-2">
            <XCircle className="h-8 w-8 text-red-400" />
            <h3 className="text-3xl font-black font-['Outfit'] text-slate-800">{summary.absent_count}</h3>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-1">Missed class sessions</p>
        </Card>
      </div>

      {summary.attendance_percentage < 75 && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-sm flex items-center gap-3 animate-pulse">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <div>
            <p className="text-sm font-bold text-red-900">Attendance Warning</p>
            <p className="text-xs text-red-700 font-medium">Your attendance is below the 75% requirement. Please attend all upcoming classes.</p>
          </div>
        </div>
      )}

      {/* History Table */}
      <Card className="border-slate-200 rounded-sm overflow-hidden bg-white">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h4 className="text-sm font-bold text-slate-800 font-['Outfit']">Attendance History</h4>
          <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-sm border border-slate-200">
            {["all", "present", "late", "absent"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all ${
                  filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                <th className="px-6 py-3 font-bold">Date</th>
                <th className="px-6 py-3 font-bold">Session Topic</th>
                <th className="px-6 py-3 font-bold">Status</th>
                <th className="px-6 py-3 font-bold">Joined At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                    No {filter !== 'all' ? filter : ''} records found
                  </td>
                </tr>
              ) : (
                filteredRecords.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-700">
                        {new Date(r.scheduled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short' })}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-800 leading-tight">{r.lesson_title}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{r.batch_name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-500">
                          {r.joined_at ? new Date(r.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}
                        </span>
                        {r.status === 'late' && (
                          <span className="text-[9px] text-amber-500 font-black uppercase tracking-tighter">(Late Entry)</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }) {
  switch (status) {
    case 'present':
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-600 border border-emerald-100">
          <CheckCircle className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Present</span>
        </div>
      );
    case 'late':
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-amber-50 text-amber-600 border border-amber-100">
          <Clock className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Late</span>
        </div>
      );
    case 'absent':
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-red-50 text-red-600 border border-red-100">
          <XCircle className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Absent</span>
        </div>
      );
    default:
      return null;
  }
}
