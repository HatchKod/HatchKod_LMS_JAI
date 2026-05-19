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
  ClipboardList,
  UploadCloud,
  FileCheck
} from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Card } from "../ui/card";
import { Dialog, DialogContent } from "../ui/dialog";
import SessionAttendance from "./SessionAttendance";

export default function MentorAttendance({ forcedBatchId, onClose }) {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(forcedBatchId || "");
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [remindingId, setRemindingId] = useState(null);
  const [activeTab, setActiveTab] = useState("students");

  // Individual Session Verification States
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);

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

  const fetchSummary = async () => {
    if (!selectedBatchId) return;
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

  const fetchSessions = async () => {
    if (!selectedBatchId) return;
    try {
      const { data } = await api.get(`/batches/${selectedBatchId}/sessions`);
      setSessions(data.filter(s => s.status === 'ended'));
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchSessions();
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
    const atRiskCount = summary.filter(s => s.total_sessions > 0 && s.attendance_percentage < 75).length;
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

  const handleCloseSessionAttendance = () => {
    setSelectedSession(null);
    // Reload overall stats & session stats to show up-to-date verified percentages
    fetchSummary();
    fetchSessions();
  };

  const atRiskStudents = summary.filter(s => s.total_sessions > 0 && s.attendance_percentage < 75);

  return (
    <div className="space-y-6 font-['IBM_Plex_Sans']">
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

      <div className="bg-slate-50 border border-slate-200 rounded-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-bold text-slate-700 flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-[#194BFB]" /> Manage Class Attendance
          </p>
          <p className="text-[10px] text-slate-500 font-medium">Attendance is synced automatically via the <b>HatchKod Chrome Extension</b>. Select a session to review or manually upload a CSV fallback.</p>
        </div>

        <div className="flex items-center gap-3">
          <select 
            onChange={(e) => {
              const sess = sessions.find(s => s.id === e.target.value);
              setSelectedSession(sess || null);
            }}
            value={selectedSession?.id || ""}
            className="text-xs bg-white border border-slate-200 rounded-sm px-3 py-2 outline-none min-w-[240px] font-medium text-slate-600 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">-- Choose Ended Session --</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.custom_topic || s.topic_title || `Class on ${new Date(s.scheduled_at).toLocaleDateString()}`}
              </option>
            ))}
          </select>
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

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200 pb-px">
        <button
          onClick={() => setActiveTab("students")}
          className={`pb-3 px-2 text-xs font-bold transition-all border-b-2 uppercase tracking-widest ${
            activeTab === "students" 
              ? "border-[#194BFB] text-[#194BFB]" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          👥 Student Summary
        </button>
        <button
          onClick={() => setActiveTab("sessions")}
          className={`pb-3 px-2 text-xs font-bold transition-all border-b-2 uppercase tracking-widest ${
            activeTab === "sessions" 
              ? "border-[#194BFB] text-[#194BFB]" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          📅 Session History
        </button>
      </div>

      <Card className="rounded-sm border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === "students" ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Student</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Sessions</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Present</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Absent</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-32">Attendance %</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="p-12 text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-300 mb-2" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gathering data...</span>
                    </td>
                  </tr>
                ) : summary.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-12 text-center">
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
                          disabled={remindingId === s.student_id || s.total_sessions === 0}
                          className={`h-8 px-3 text-[10px] font-bold uppercase tracking-widest gap-2 transition-all ${
                            remindingId === s.student_id ? "bg-emerald-50 text-emerald-600 border-emerald-200" : 
                            s.total_sessions === 0 ? "opacity-50 cursor-not-allowed border-slate-100 text-slate-300 hover:bg-transparent" :
                            "border-slate-200 text-slate-500 hover:bg-white"
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
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Session Topic</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Date</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Present / Total</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-32">Attendance %</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-12 text-center">
                      <ClipboardList className="h-10 w-10 mx-auto text-slate-200 mb-2" />
                      <p className="text-sm font-bold text-slate-400">No ended sessions found for this batch.</p>
                    </td>
                  </tr>
                ) : (
                  sessions.map(sess => (
                    <tr key={sess.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <span className="text-sm font-bold text-slate-700 block">
                          {sess.custom_topic || sess.topic_title || "Untitled Live Session"}
                        </span>
                        <span className="text-[9px] text-slate-400 uppercase tracking-wide font-medium mt-0.5 block">
                          ID: {sess.id.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="p-4 text-center text-xs font-semibold text-slate-500">
                        {new Date(sess.scheduled_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="p-4 text-center text-sm font-bold text-slate-600">
                        <span className="text-emerald-600">{sess.present_count}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span>{sess.total_students}</span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className={`text-xs font-black ${
                            sess.attendance_percentage >= 90 ? "text-emerald-600" :
                            sess.attendance_percentage >= 75 ? "text-amber-500" : "text-red-600"
                          }`}>
                            {sess.attendance_percentage}%
                          </span>
                          <div className="h-1 w-16 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                sess.attendance_percentage >= 90 ? "bg-emerald-500" :
                                sess.attendance_percentage >= 75 ? "bg-amber-500" : "bg-red-500"
                              }`}
                              style={{ width: `${sess.attendance_percentage}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedSession(sess)}
                          className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest gap-1.5 border-slate-200 text-[#194BFB] hover:text-[#0F3AE5] hover:bg-blue-50/30"
                        >
                          <FileCheck className="h-3.5 w-3.5" />
                          Verify / Review
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Verified Attendance Session Dialog */}
      <Dialog open={!!selectedSession} onOpenChange={(val) => { if (!val) handleCloseSessionAttendance(); }}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden border-none shadow-2xl">
          {selectedSession && (
            <SessionAttendance 
              sessionId={selectedSession.id}
              sessionTopic={selectedSession.custom_topic || selectedSession.topic_title || "Live Class"}
              sessionDate={selectedSession.scheduled_at}
              onClose={handleCloseSessionAttendance}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
