import { useState, useEffect, useCallback } from "react";
import { fmtDateTime } from "../../lib/dateUtils";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../../lib/api";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { 
  Users, 
  Video, 
  Play, 
  Square, 
  AlertTriangle, 
  Save, 
  Bell, 
  CheckCircle2, 
  Loader2 
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "../ui/dialog";
import { toast } from "sonner";

export default function MentorClassView() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [batchStudents, setBatchStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [newMeetingUrl, setNewMeetingUrl] = useState("");
  const [updatingUrl, setUpdatingUrl] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data: sess } = await api.get(`/sessions/${classId}/status`);
      if (sess) {
        setSession(sess);
        setNewMeetingUrl(sess.meeting_url || "");
        
        if (sess.batch_id) {
          const { data: students } = await api.get(`/batches/${sess.batch_id}/students`);
          setBatchStudents(students);
        }
      }
    } catch (e) {
      toast.error("Failed to load class data");
    } finally {
      setLoading(false);
    }
  }, [classId]);

  const fetchAttendance = useCallback(async () => {
    try {
      const { data } = await api.get(`/sessions/${classId}/attendance`);
      setAttendance(data);
    } catch (e) {
      console.error("Attendance poll failed", e);
    }
  }, [classId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (session?.status !== 'live') return;
    
    fetchAttendance();
    const interval = setInterval(fetchAttendance, 5000);
    return () => clearInterval(interval);
  }, [session?.status, fetchAttendance]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const { data } = await api.post(`/sessions/${classId}/start`);
      setSession(data);
      toast.success("Class is now LIVE!");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setStarting(false);
    }
  };

  const handleEnd = async () => {
    setEnding(true);
    try {
      const { data } = await api.post(`/sessions/${classId}/end`);
      setSession(data);
      setIsEndModalOpen(false);
      toast.success("Class ended.");
      navigate("/mentor"); 
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setEnding(false);
    }
  };

  const handleUpdateUrl = async () => {
    if (!newMeetingUrl.startsWith("https://")) {
      toast.error("Meeting URL must start with https://");
      return;
    }
    setUpdatingUrl(true);
    try {
      const { data } = await api.put(`/sessions/${classId}/meeting-url`, { meeting_url: newMeetingUrl });
      setSession(prev => ({ ...prev, meeting_url: data.meeting_url }));
      toast.success("Meeting URL updated");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setUpdatingUrl(false);
    }
  };

  const sendReminder = async (studentId) => {
    try {
      await api.post("/notifications/broadcast", {
        user_id: studentId,
        title: "Join Now!",
        body: "Your mentor is waiting. Join class now."
      });
      toast.success("Reminder sent!");
    } catch (e) {
      toast.error("Failed to send reminder");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen font-['IBM_Plex_Sans'] text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...
    </div>
  );

  if (!session) return (
    <div className="flex flex-col items-center justify-center h-screen font-['IBM_Plex_Sans'] text-slate-500">
      <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
      <h2 className="text-xl font-bold text-slate-900">Session Not Found</h2>
      <p className="mt-2 text-sm">The class session you are looking for does not exist.</p>
      <Button onClick={() => navigate("/mentor")} className="mt-6 bg-[#194BFB] text-white">Return to Dashboard</Button>
    </div>
  );

  const isWithinWindow = () => {
    if (!session?.scheduled_at) return false;
    const start = new Date(session.scheduled_at);
    const now = new Date();
    // Within 30 minutes before or any time after
    return (start - now) <= 1800000;
  };

  const joinedIds = new Set(attendance.map(a => a.student_id));
  const pendingStudents = batchStudents.filter(s => !joinedIds.has(s.student_id));

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 font-['IBM_Plex_Sans']">
      {session && !session.meeting_url && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-sm flex items-center gap-3 text-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div className="text-sm font-bold">No meeting link set. Students cannot join.</div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-6">
          <Card className="p-8 rounded-sm border-slate-200 shadow-sm">
            <div className="flex items-start justify-between mb-8">
              <div className="space-y-1">
                <h1 className="text-3xl font-['Outfit'] font-black text-slate-900 tracking-tight">
                  {session.topic_title || "Class Session"}
                </h1>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  {session.batch_name && (
                    <span className="font-bold text-[#194BFB]">{session.batch_name}</span>
                  )}
                  <Badge variant="outline" className="rounded-full uppercase tracking-widest text-[10px] font-bold">
                    {session.status}
                  </Badge>
                  <span>Scheduled for {fmtDateTime(session.scheduled_at)}</span>
                </div>
              </div>
              {session.status === 'live' && (
                <Badge className="bg-[#10B981] text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest animate-pulse">
                  Class LIVE
                </Badge>
              )}
            </div>

            <div className="flex gap-4 pt-6 border-t border-slate-100">
              {session.status === 'scheduled' && (
                <Button onClick={handleStart} disabled={starting || !isWithinWindow()} className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm px-8 h-12 font-bold uppercase tracking-wider text-xs">
                  {starting ? "Starting..." : "Start Class"}
                </Button>
              )}
              {session.status === 'live' && (
                <Button variant="destructive" onClick={() => setIsEndModalOpen(true)} className="bg-[#EF4444] hover:bg-red-600 text-white rounded-sm px-8 h-12 font-bold uppercase tracking-wider text-xs">
                  End Class
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-8 rounded-sm border-slate-200 shadow-sm space-y-4">
            <h3 className="font-['Outfit'] font-bold text-slate-900">Meeting Link</h3>
            <div className="flex gap-3">
              <Input value={newMeetingUrl} onChange={(e) => setNewMeetingUrl(e.target.value)} placeholder="https://..." className="flex-1 rounded-sm border-slate-200" />
              <Button onClick={handleUpdateUrl} disabled={updatingUrl} className="bg-[#194BFB] hover:bg-[#0F3AE5] rounded-sm">
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>

        <div className="w-full lg:w-96 space-y-6">
          <Card className="p-6 rounded-sm border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-[#194BFB]" />
              <div className="text-sm font-bold text-slate-900">Live Attendance</div>
            </div>
            <Badge className="bg-[#194BFB] text-white px-3 py-1 rounded-full text-xs font-bold">
              {joinedIds.size} Joined
            </Badge>
          </Card>

          <Card className="p-6 rounded-sm border-slate-200 shadow-sm space-y-4">
            <h3 className="font-['Outfit'] font-bold text-slate-900 border-b pb-3">Pending Students</h3>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {pendingStudents.map(student => (
                <div key={student.student_id} className="flex items-center justify-between gap-3 p-2 hover:bg-slate-50 rounded-sm">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 rounded-sm">
                      <AvatarImage src={student.avatar_url} />
                      <AvatarFallback>{student.student_name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="text-xs font-bold text-slate-700">{student.student_name}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => sendReminder(student.student_id)} className="text-slate-400 hover:text-[#194BFB]">
                    <Bell className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={isEndModalOpen} onOpenChange={setIsEndModalOpen}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle>End Class?</DialogTitle>
            <DialogDescription>Are you sure? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3">
            <Button variant="ghost" onClick={() => setIsEndModalOpen(false)}>Cancel</Button>
            <Button onClick={handleEnd} disabled={ending} className="bg-[#EF4444]">End Class</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
