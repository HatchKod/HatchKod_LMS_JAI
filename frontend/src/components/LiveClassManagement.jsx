import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "./ui/select";
import {
  Video,
  Clock,
  Calendar,
  Plus,
  Play,
  XCircle,
  ExternalLink,
  Edit2,
  PlayCircle
} from "lucide-react";
import { toast } from "sonner";
import RecordingUpload from "./mentor/RecordingUpload";
import SessionAttendance from "./mentor/SessionAttendance";
import { Users } from "lucide-react";

export default function LiveClassManagement({ role, userId }) {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [topics, setTopics] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [startingId, setStartingId] = useState(null);
  const [inlineUrlEdit, setInlineUrlEdit] = useState(null);
  const [attendanceSession, setAttendanceSession] = useState(null);
  const timeInputRef = useRef(null);
  const [form, setForm] = useState({
    batch_id: "",
    lesson_id: "",
    custom_topic: "",
    date: "",
    time: "",
    meeting_url: ""
  });

  const load = async () => {
    try {
      const [resClasses, resBatches] = await Promise.all([
        api.get("/live-classes"),
        role === "mentor" ? api.get("/batches/mentor").catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
      ]);
      setClasses(resClasses.data);
      if (resBatches?.data) {
        setBatches(resBatches.data);
      }
    } catch (e) {
      toast.error("Failed to load live classes");
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (form.batch_id) {
      api.get(`/batches/${form.batch_id}/lessons`)
        .then(res => setTopics(res.data))
        .catch(() => setTopics([]));
    } else {
      setTopics([]);
    }
  }, [form.batch_id]);

  const openEdit = (c) => {
    setEditingId(c.id);
    const date = new Date(c.scheduled_at);
    // Local date (YYYY-MM-DD)
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    // Local time (HH:mm)
    const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[1].slice(0, 5);

    setForm({
      batch_id: c.batch_id || "",
      lesson_id: c.lesson_id || "",
      custom_topic: c.custom_topic || "",
      date: localDate,
      time: localTime,
      meeting_url: c.meeting_url || ""
    });
    setIsModalOpen(true);
  };

  const updateSessionRecordingUrl = (id, url) => {
    setClasses(prev => prev.map(c => c.id === id ? { ...c, recording_url: url } : c));
  };

  const handleSchedule = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      console.log("Scheduling class with form:", form);
      const dateObj = new Date(`${form.date}T${form.time}`);
      if (isNaN(dateObj.getTime())) {
        console.error("Invalid Date Object created from:", `${form.date}T${form.time}`);
        toast.error("Invalid date or time selected");
        setBusy(false);
        return;
      }
      const payload = {
        batch_id: form.batch_id,
        lesson_id: form.lesson_id || null,
        custom_topic: form.custom_topic || null,
        scheduled_at: dateObj.toISOString(),
        meeting_url: form.meeting_url || null
      };
      console.log("Sending payload to backend:", payload);

      if (payload.meeting_url && !payload.meeting_url.startsWith("https://")) {
        toast.error("Meeting URL must start with https://");
        setBusy(false);
        return;
      }

      if (editingId) {
        await api.put(`/live-classes/${editingId}`, payload);
        toast.success("Class updated successfully");
      } else {
        const res = await api.post("/live-classes", payload);
        console.log("Response from backend:", res.data);
        toast.success("Class scheduled successfully");
      }
      setIsModalOpen(false);
      setEditingId(null);
      setForm({ batch_id: "", lesson_id: "", custom_topic: "", date: "", time: "", meeting_url: "" });
      load();
    } catch (e) {
      console.error("Full error object captured in handleSchedule:", e);
      if (e.response) {
        console.error("Error response data:", e.response.data);
      }
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  const handleStart = async (id) => {
    setStartingId(id);
    try {
      await api.post(`/sessions/${id}/start`);
      navigate(`/mentor/live/${id}`);
    } catch (e) {
      if (e.response?.status === 409) {
        toast.error("You already have another class running.");
      } else {
        toast.error(formatApiError(e.response?.data?.detail));
      }
    } finally {
      setStartingId(null);
    }
  };

  const saveInlineUrl = async (id, newUrl) => {
    if (!newUrl.startsWith("https://")) {
      toast.error("Meeting URL must start with https://");
      return;
    }
    try {
      await api.put(`/sessions/${id}/meeting-url`, { meeting_url: newUrl });
      toast.success("Meeting link updated");
      setInlineUrlEdit(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const deleteClass = async (id) => {
    if (!window.confirm("Are you sure?")) return;
    try {
      await api.delete(`/live-classes/${id}`);
      toast.success("Class deleted");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Video className="h-5 w-5 text-[#194BFB]" />
          Live Classes
        </h2>
        {role === "mentor" && (
          <Button onClick={() => setIsModalOpen(true)} size="sm" className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]">
            <Plus className="h-4 w-4 mr-2" /> Schedule Class
          </Button>
        )}
      </div>

    <div className="grid grid-cols-1 gap-6">
        {classes.length === 0 && (
          <div className="text-center py-20 border border-dashed border-slate-200 rounded-sm bg-slate-50/30">
            <Video className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">No live classes scheduled yet.</p>
          </div>
        )}
        {classes.map((c) => (
          <Card key={c.id} className={`group relative overflow-hidden rounded-sm border-slate-200 transition-all duration-300 hover:shadow-md ${c.status === 'live' ? 'ring-1 ring-emerald-500 border-emerald-200' : ''}`}>
            {/* Status Indicator Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
              c.status === 'live' ? 'bg-emerald-500' : 
              c.status === 'ended' ? 'bg-slate-300' : 'bg-[#194BFB]'
            }`} />

            <div className="p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* Left Side: Info */}
                <div className="flex items-start gap-4 flex-1">
                  <div className={`mt-1 h-12 w-12 rounded-sm flex items-center justify-center flex-shrink-0 ${
                    c.status === 'live' ? 'bg-emerald-50 text-emerald-600 animate-pulse' : 
                    c.status === 'ended' ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-[#194BFB]'
                  }`}>
                    <Video className="h-6 w-6" />
                  </div>
                  
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <h3 className="font-bold text-slate-900 text-lg leading-tight truncate">{c.custom_topic || c.topic_title || "Live Class"}</h3>
                      <span className={`text-[9px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-sm ${
                        c.status === 'live' ? 'bg-emerald-100 text-emerald-700' :
                        c.status === 'ended' ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-[#194BFB]'
                      }`}>
                        {c.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-300" />
                        {new Date(c.scheduled_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-300" />
                        {new Date(c.scheduled_at).toLocaleTimeString('en-IN', {
                          hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: true
                        })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[#194BFB] bg-blue-50 px-2 py-0.5 rounded-sm border border-blue-100">{c.batch_name}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Actions */}
                <div className="flex flex-col items-end gap-3 min-w-[240px]">
                  <div className="flex items-center gap-2">
                    {role === "mentor" ? (
                      <>
                        {c.status === "scheduled" && (
                          <Button onClick={() => handleStart(c.id)} disabled={startingId === c.id} className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] h-9 px-6 text-xs font-bold uppercase tracking-widest">
                            {startingId === c.id ? "Starting..." : <><Play className="h-3.5 w-3.5 mr-2" /> Start Class</>}
                          </Button>
                        )}
                        {c.status === "live" && (
                          <Button onClick={() => navigate(`/mentor/teach/${c.id}`)} className="rounded-sm bg-emerald-600 hover:bg-emerald-700 h-9 px-6 text-xs font-bold uppercase tracking-widest">
                            <ExternalLink className="h-3.5 w-3.5 mr-2" /> Enter Teaching Mode
                          </Button>
                        )}
                        {c.status === "ended" && (
                          <Button 
                            variant="outline" 
                            onClick={() => setAttendanceSession(c)}
                            className="rounded-sm border-slate-200 text-slate-600 h-9 px-4 text-xs font-bold uppercase tracking-widest hover:bg-slate-50"
                          >
                            <Users className="h-3.5 w-3.5 mr-2" /> Attendance
                          </Button>
                        )}
                        <Button 
                          onClick={() => deleteClass(c.id)} 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-sm"
                        >
                          <XCircle className="h-4.5 w-4.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        disabled={c.status !== "live"}
                        onClick={() => window.open(c.meeting_url, '_blank')}
                        className={`rounded-sm h-10 px-8 text-xs font-bold uppercase tracking-widest ${c.status === 'live' ? 'bg-[#194BFB] hover:bg-[#0F3AE5] shadow-lg shadow-blue-100' : 'bg-slate-100 text-slate-400'}`}
                      >
                        {c.status === 'live' ? 'Join Now' : 'Wait for Mentor'}
                      </Button>
                    )}
                  </div>

                  {role === "mentor" && c.status === "scheduled" && !c.meeting_url && (
                    <div className="w-full">
                      {inlineUrlEdit === c.id ? (
                        <div className="flex items-center gap-2 mt-2">
                          <Input 
                            placeholder="Paste meeting link..." 
                            className="h-8 text-xs flex-1 rounded-sm border-amber-200"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveInlineUrl(c.id, e.target.value);
                              if (e.key === 'Escape') setInlineUrlEdit(null);
                            }}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button onClick={() => setInlineUrlEdit(c.id)} className="w-full text-[10px] text-amber-600 bg-amber-50 px-3 py-2 rounded-sm border border-amber-100 hover:bg-amber-100/50 transition-colors flex items-center justify-center gap-2 font-bold uppercase tracking-wider">
                          <span>⚠ No meeting link set</span>
                          <span className="underline">Add Link</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>


            </div>
          </Card>
        ))}
      </div>

      <Dialog open={isModalOpen} onOpenChange={(val) => { setIsModalOpen(val); if (!val) setEditingId(null); }}>
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-[#194BFB] p-6 text-white">
            <DialogTitle className="text-2xl font-['Outfit'] font-extrabold tracking-tight">
              {editingId ? "Edit Class Details" : "Schedule Live Class"}
            </DialogTitle>
            <p className="text-blue-100 text-xs mt-1 font-medium uppercase tracking-wider">Fill in the details to notify your students</p>
          </div>

          <form onSubmit={handleSchedule} className="p-8 space-y-6 bg-white">
            <div className="space-y-4">
              {/* Batch Selection */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center gap-2">
                  <Video className="h-3 w-3" /> Select Batch
                </Label>
                <select
                  value={form.batch_id}
                  onChange={(e) => {
                    const bid = e.target.value;
                    setForm({ ...form, batch_id: bid });
                    // Auto-fill meeting URL from most recent class of this batch
                    const recent = classes.find(c => c.batch_id === bid && c.meeting_url);
                    if (recent) {
                      setForm(prev => ({ ...prev, meeting_url: recent.meeting_url }));
                    }
                  }}
                  className="w-full rounded-sm border border-slate-200 bg-slate-50/50 h-11 px-3 text-sm focus:ring-2 focus:ring-[#194BFB] outline-none"
                  required
                >
                  <option value="">Choose a batch</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.name} — {b.course_title}</option>)}
                </select>
              </div>

              {/* Custom Title Input */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center gap-2">
                  <Edit2 className="h-3 w-3" /> Class Title / Topics
                </Label>
                <Input
                  value={form.custom_topic}
                  onChange={(e) => setForm({ ...form, custom_topic: e.target.value })}
                  placeholder="e.g. Java Basics & Doubt Clearing"
                  className="rounded-sm border-slate-200 focus:ring-[#194BFB] bg-slate-50/50 h-11 px-3 text-sm"
                  required
                />
              </div>

              {/* Schedule Time (Split) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center gap-2">
                    <Calendar className="h-3 w-3" /> Date
                  </Label>
                  <Input
                    type="date"
                    value={form.date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => {
                      setForm({ ...form, date: e.target.value });
                      if (e.target.value) {
                        setTimeout(() => timeInputRef.current?.showPicker?.() || timeInputRef.current?.focus(), 100);
                      }
                    }}
                    className="rounded-sm border-slate-200 focus:ring-[#194BFB] bg-slate-50/50 h-11"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center gap-2">
                      <Clock className="h-3 w-3" /> Time
                    </Label>
                    <span className="text-[8px] bg-blue-50 text-[#194BFB] px-1.5 py-0.5 rounded-full font-bold">IST</span>
                  </div>
                  <Input
                    ref={timeInputRef}
                    type="time"
                    value={form.time}
                    onChange={(e) => {
                      setForm({ ...form, time: e.target.value });
                      if (e.target.value) {
                        e.target.blur(); // Closes the picker UI
                      }
                    }}
                    className="rounded-sm border-slate-200 focus:ring-[#194BFB] bg-slate-50/50 h-11"
                    required
                  />
                </div>
              </div>

              {/* Meeting Link */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center gap-2">
                  <ExternalLink className="h-3 w-3" /> Meeting Link
                </Label>
                <Input
                  value={form.meeting_url}
                  onChange={(e) => setForm({ ...form, meeting_url: e.target.value })}
                  placeholder="https://meet.google.com/xxx-xxxx-xxx (Optional)"
                  className="rounded-sm border-slate-200 focus:ring-[#194BFB] bg-slate-50/50 h-11"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="flex-1 rounded-sm font-bold text-slate-500 uppercase tracking-widest text-xs">
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="flex-1 rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] font-bold uppercase tracking-widest text-xs shadow-lg shadow-blue-100">
                {busy ? "Processing..." : (editingId ? "Update Class" : "Schedule Class")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Attendance Modal */}
      <Dialog open={!!attendanceSession} onOpenChange={() => setAttendanceSession(null)}>
        <DialogContent className="sm:max-w-xl p-0 overflow-hidden border-none shadow-2xl">
          {attendanceSession && (
            <SessionAttendance 
              sessionId={attendanceSession.id}
              sessionTopic={attendanceSession.topic_title}
              sessionDate={attendanceSession.scheduled_at}
              onClose={() => setAttendanceSession(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
