import { useState, useEffect } from "react";
import { api, formatApiError } from "../../lib/api";
import { 
  Users, 
  Search, 
  AlertTriangle, 
  Bell, 
  CheckCircle, 
  Loader2,
  ChevronRight,
  ClipboardList
} from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Card } from "../ui/card";

export default function MentorAttendance({ forcedBatchId, onClose }) {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(forcedBatchId || "");
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [remindingId, setRemindingId] = useState(null);

  useEffect(() => {
    if (forcedBatchId) return;
    const fetchBatches = async () => {
      try {
        const { data } = await api.get("/batches/mentor");
        setBatches(data);
        if (data.length > 0) setSelectedBatchId(data[0].id);
      } catch (e) {
        toast.error("Failed to load batches");
      }
    };
    fetchBatches();
  }, []);

  useEffect(() => {
    if (!selectedBatchId) return;
    const fetchSummary = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/batches/${selectedBatchId}/attendance-summary`);
        if (data && data.length > 0 && data[0].error) {
          toast.error(`Backend Error: ${data[0].error}`);
          setSummary([]);
        } else {
          setSummary(data);
        }
      } catch (e) {
        toast.error("Failed to load attendance summary");
      } finally {
        setLoading(false);
      }
    };
    fetchSummary();
  }, [selectedBatchId]);

  const sendReminder = async (studentId, pct) => {
    setRemindingId(studentId);
    try {
      const { data } = await api.post("/notifications/broadcast", {
        user_id: studentId,
        title: "Attendance Reminder",
        body: `Your attendance is at ${pct}%. Please attend upcoming classes regularly.`,
        type: "general"
      });
      
      if (data && data.error) {
        toast.error(`Backend Error: ${data.error}`);
      } else {
        toast.success("Reminder sent");
      }
      setTimeout(() => setRemindingId(null), 3000);
    } catch (e) {
      toast.error("Failed to send reminder");
      setRemindingId(null);
    }
  };

  const sendBulkReminder = async () => {
    const atRiskCount = summary.filter(s => s.attendance_percentage < 75).length;
    if (atRiskCount === 0) return;
    
    try {
      await api.post("/notifications/broadcast-batch", {
        batch_id: selectedBatchId,
        title: "Attendance Alert",
        body: "Your attendance is below 75%. Please ensure you attend all upcoming live classes.",
        type: "general"
      });
      toast.success(`Sent reminders to ${atRiskCount} at-risk students`);
    } catch (e) {
      toast.error("Failed to send bulk reminder");
    }
  };

  const atRiskStudents = summary.filter(s => s.attendance_percentage < 75);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 font-['Outfit']">Attendance Overview</h2>
          <p className="text-xs text-slate-500 font-medium">Track and manage student presence across your batches.</p>
        </div>

        <div className="flex items-center gap-2">
          {batches.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBatchId(b.id)}
              className={`px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all ${
                selectedBatchId === b.id 
                  ? "bg-[#194BFB] text-white shadow-lg shadow-blue-100" 
                  : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {atRiskStudents.length > 0 && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-sm flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-900">{atRiskStudents.length} Students at Risk</p>
              <p className="text-xs text-red-700 font-medium opacity-80">These students have attendance below 75%.</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={sendBulkReminder}
            className="border-red-200 text-red-600 hover:bg-red-100 font-bold uppercase tracking-widest text-[10px] h-9"
          >
            <Bell className="h-3 w-3 mr-2" /> Remind All At-Risk
          </Button>
        </div>
      )}

      <Card className="rounded-sm border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Student</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Sessions</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Present</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Late</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Absent</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-32">Attendance %</th>
                <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-300 mb-2" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gathering data...</span>
                  </td>
                </tr>
              ) : summary.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-12 text-center">
                    <ClipboardList className="h-10 w-10 mx-auto text-slate-200 mb-2" />
                    <p className="text-sm font-bold text-slate-400">No attendance data found for this batch.</p>
                  </td>
                </tr>
              ) : (
                summary.map(s => (
                  <tr key={s.student_id} className="group hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-slate-200">
                          <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                            {s.student_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-bold text-slate-700">{s.student_name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center text-sm font-medium text-slate-600">{s.total_sessions}</td>
                    <td className="p-4 text-center text-sm font-bold text-emerald-600">{s.present_count}</td>
                    <td className="p-4 text-center text-sm font-bold text-amber-500">{s.late_count}</td>
                    <td className="p-4 text-center text-sm font-bold text-red-500">{s.absent_count}</td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className={`text-xs font-black ${
                          s.attendance_percentage >= 90 ? "text-emerald-600" :
                          s.attendance_percentage >= 75 ? "text-amber-500" : "text-red-600"
                        }`}>
                          {s.attendance_percentage}%
                        </span>
                        <div className="h-1 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              s.attendance_percentage >= 90 ? "bg-emerald-500" :
                              s.attendance_percentage >= 75 ? "bg-amber-500" : "bg-red-500"
                            }`}
                            style={{ width: `${s.attendance_percentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendReminder(s.student_id, s.attendance_percentage)}
                        disabled={remindingId === s.student_id}
                        className={`h-8 px-3 text-[10px] font-bold uppercase tracking-widest gap-2 transition-all ${
                          remindingId === s.student_id ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "border-slate-200 text-slate-500 hover:bg-white"
                        }`}
                      >
                        {remindingId === s.student_id ? (
                          <><CheckCircle className="h-3 w-3" /> Sent</>
                        ) : (
                          <><Bell className="h-3 w-3" /> Remind</>
                        )}
                      </Button>
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
