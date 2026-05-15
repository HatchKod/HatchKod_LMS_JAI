import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, formatApiError } from "../lib/api";
import { supabase } from "../lib/supabase";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { 
  Video, 
  Users, 
  BookOpen, 
  ChevronDown, 
  ChevronRight, 
  ExternalLink, 
  StopCircle, 
  Bell, 
  Github, 
  PlayCircle, 
  ClipboardList, 
  CheckCircle2, 
  Loader2,
  Clock,
  ArrowRight,
  ChevronLeft
} from "lucide-react";
import { toast } from "sonner";
import RecordingUpload from "../components/mentor/RecordingUpload";
import ReactMarkdown from "react-markdown";
import Navbar from "../components/Navbar";
import Breadcrumbs from "../components/Breadcrumbs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";

export default function TeachingMode() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Data State
  const [session, setSession] = useState(null);
  const [course, setCourse] = useState(null);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [joinedStudents, setJoinedStudents] = useState([]);
  const [allBatchStudents, setAllBatchStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyllabusOpen, setIsSyllabusOpen] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  
  // UI State
  const [activeTab, setActiveTab] = useState("learn"); // learn, video, task
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [classEndedSuccess, setClassEndedSuccess] = useState(false);
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [timer, setTimer] = useState("00:00:00");
  const [remindingId, setRemindingId] = useState(null);
  const [endingBusy, setEndingBusy] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  // Derived State
  const activeLesson = course?.modules?.flatMap(m => m.lessons).find(l => l.id === activeLessonId);

  // Pagination Logic
  const rawContent = activeLesson?.content || activeLesson?.content_html || "";
  const contentBlocks = rawContent.split(/\n---\n/).filter(b => b.trim());
  const totalPages = contentBlocks.length;
  const isLastPage = currentPage === totalPages - 1 || totalPages === 0;

  // Reset page on lesson change
  useEffect(() => {
    setCurrentPage(0);
  }, [activeLessonId]);

  // 1. Initial Data Fetch
  const loadInitialData = useCallback(async () => {
    try {
      // Step 1: Session Status
      const { data: sess } = await api.get(`/sessions/${classId}/status`);
      if (!sess) throw new Error("404");
      if (sess.status === 'ended') {
        setSession(sess);
        setLoading(false);
        return;
      }
      setSession(sess);

      // Step 2 & 3: Course & Students
      const [resCourse, resStudents] = await Promise.all([
        api.get(`/courses/${sess.course_id}`),
        api.get(`/batches/${sess.batch_id}/students`)
      ]);
      
      setCourse(resCourse.data);
      setAllBatchStudents(resStudents.data);
      
      // Auto-select lesson: Priority 1: Current Live Topic, Priority 2: First Lesson of Course
      const initialLessonId = sess.lesson_id || resCourse.data.modules?.[0]?.lessons?.[0]?.id;
      setActiveLessonId(initialLessonId);
      
      // Expand modules by default
      if (resCourse.data.modules) {
        setExpandedModules(new Set(resCourse.data.modules.map(m => m.id)));
      }

      // Step 4: Initial Attendance
      const { data: att } = await api.get(`/sessions/${classId}/attendance`);
      setJoinedStudents(att);

      setLoading(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load classroom data");
      setLoading(false);
    }
  }, [classId]);

  // 2. Poll Attendance
  const pollAttendance = useCallback(async () => {
    try {
      const { data } = await api.get(`/sessions/${classId}/attendance`);
      setJoinedStudents(data);
    } catch (e) {
      console.error("Attendance poll failed", e);
    }
  }, [classId]);

  useEffect(() => {
    loadInitialData();
    
    // Realtime subscription
    const channel = supabase.channel(`teaching-mode-${classId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'class_sessions', 
        filter: `id=eq.${classId}` 
      }, (payload) => {
        if (payload.new.status === 'ended') {
          toast.info("Class has been ended.");
          navigate('/mentor');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classId, loadInitialData, navigate]);

  useEffect(() => {
    if (session?.status !== 'live') return;
    const interval = setInterval(pollAttendance, 10000);
    return () => clearInterval(interval);
  }, [session?.status, pollAttendance]);

  // 3. Live Timer Logic
  useEffect(() => {
    if (!session?.started_at || session?.status !== 'live') return;

    const updateTimer = () => {
      const start = new Date(session.started_at);
      const now = new Date();
      const diff = Math.floor((now - start) / 1000);
      
      const hrs = Math.floor(diff / 3600).toString().padStart(2, '0');
      const mins = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const secs = (diff % 60).toString().padStart(2, '0');
      
      setTimer(`${hrs}:${mins}:${secs}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [session?.started_at, session?.status]);

  const handleEndClass = async () => {
    setEndingBusy(true);
    try {
      await api.post(`/sessions/${classId}/end`);
      setClassEndedSuccess(true);
      toast.success("Class ended successfully.");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setEndingBusy(false); }
  };

  const sendReminder = async (studentId) => {
    setRemindingId(studentId);
    try {
      // 1. Persist to DB for history/refresh
      await api.post("/notifications/broadcast", {
        user_id: studentId,
        title: "Join Now!",
        body: "Your mentor is waiting. Join class now.",
        type: "class_reminder",
        related_session_id: classId
      });

      // 2. Instant Broadcast for real-time delivery
      const broadcastChannel = supabase.channel(`user-notifications-${studentId}`);
      await broadcastChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await broadcastChannel.send({
            type: 'broadcast',
            event: 'new-reminder',
            payload: {
              title: "Join Now!",
              body: "Your mentor is waiting. Join class now.",
              type: "class_reminder",
              related_session_id: classId
            }
          });
          supabase.removeChannel(broadcastChannel);
        }
      });

      toast.success("Reminder sent!");
      setTimeout(() => setRemindingId(null), 3000);
    } catch (e) {
      toast.error("Failed to send reminder");
      setRemindingId(null);
    }
  };

  const toggleModule = (mid) => {
    const next = new Set(expandedModules);
    if (next.has(mid)) next.delete(mid);
    else next.add(mid);
    setExpandedModules(next);
  };

  const formatVideoUrl = (url) => {
    if (!url) return null;
    if (url.includes("youtube.com/watch?v=")) {
      return url.replace("watch?v=", "embed/");
    }
    return url;
  };

  // Rendering
  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white font-['IBM_Plex_Sans'] text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-[#194BFB] mb-4" />
      <p className="text-sm font-medium">Loading class room...</p>
    </div>
  );

  if (!session) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white font-['IBM_Plex_Sans']">
      <h2 className="text-xl font-bold text-slate-900">Class not found.</h2>
      <Button onClick={() => navigate("/mentor")} className="mt-4 bg-[#194BFB] text-white rounded-sm">Back to Dashboard</Button>
    </div>
  );

  if (session.status === 'ended') return (
    <div className="h-screen flex flex-col items-center justify-center bg-white font-['IBM_Plex_Sans']">
      <h2 className="text-xl font-bold text-slate-900">This class has already ended.</h2>
      <Button onClick={() => navigate("/mentor")} className="mt-4 bg-[#194BFB] text-white rounded-sm">Back to Dashboard</Button>
    </div>
  );

  const presentStudents = joinedStudents.filter(s => s.status === 'present' || s.status === 'late');
  const pendingStudents = allBatchStudents.filter(s => !presentStudents.find(j => j.student_id === s.student_id));

  return (
    <div className="min-h-screen bg-white font-['IBM_Plex_Sans'] flex flex-col">
      {/* TOP COCKPIT BAR (Mentor Only) */}
      <header className="bg-[#0A0D14] text-white h-12 flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Live Class:</span>
            <span className="text-[10px] font-mono font-bold text-emerald-400">{timer}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href={session.meeting_url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-all flex items-center gap-2 mr-4"
          >
            Meeting Link <ExternalLink className="h-3 w-3" />
          </a>
          <Button
            onClick={() => setIsEndModalOpen(true)}
            className="bg-rose-500 hover:bg-rose-600 text-white h-8 rounded-sm px-4 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg shadow-rose-900/20"
          >
            <StopCircle className="h-3.5 w-3.5 mr-2" /> End Class
          </Button>
        </div>
      </header>

      <Navbar />

      <div className="flex flex-1 overflow-hidden relative">
        {/* FLOATING ATTENDANCE TAB (Always visible on the right edge unless roster is open) */}
        <Sheet open={isRosterOpen} onOpenChange={setIsRosterOpen}>
          <SheetTrigger asChild>
            <button className={`fixed right-0 top-1/2 -translate-y-1/2 bg-[#0A0D14] text-white py-6 px-1.5 rounded-l-md shadow-[-10px_0_30px_rgba(0,0,0,0.1)] flex flex-col items-center gap-5 hover:bg-[#194BFB] transition-all z-[60] border border-white/10 border-r-0 group ${isRosterOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <div className="relative">
                <Users className="h-5 w-5" />
                {pendingStudents.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-rose-500 rounded-full border-2 border-[#0A0D14] group-hover:border-[#194BFB]" />
                )}
              </div>
              <span className="[writing-mode:vertical-lr] rotate-180 text-[10px] font-black uppercase tracking-[0.3em] opacity-60 group-hover:opacity-100">Roster</span>
              <div className="flex flex-col gap-1.5 items-center">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono font-bold text-emerald-400">{presentStudents.length}</span>
              </div>
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[350px] p-0 border-l border-slate-200">
            <div className="p-6 border-b border-slate-200 bg-white">
              <h3 className="font-bold text-slate-900 uppercase tracking-widest text-[11px] flex items-center gap-2">
                <Users className="h-4 w-4 text-[#194BFB]" />
                Class Roster
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar h-[calc(100vh-140px)]">
              {/* Joined Students */}
              <div>
                <div className="flex items-center justify-between mb-3 px-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Joined</span>
                  <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{presentStudents.length}</span>
                </div>
                <div className="space-y-1">
                  {presentStudents.length === 0 ? (
                    <div className="p-4 text-center border border-dashed border-slate-200 rounded-sm text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      Waiting for students...
                    </div>
                  ) : (
                    presentStudents.map(s => (
                      <div key={s.student_id} className="flex items-center gap-3 p-2 bg-white border border-slate-100 rounded-sm shadow-sm">
                        <div className="h-7 w-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px] font-bold border border-emerald-100">
                          {s.name?.charAt(0) || "S"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-slate-700 truncate">{s.name}</p>
                          <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-tighter">Live Now</p>
                        </div>
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Absent Students */}
              <div>
                <div className="flex items-center justify-between mb-3 px-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Absent</span>
                  <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{pendingStudents.length}</span>
                </div>
                <div className="space-y-1">
                  {pendingStudents.map(s => (
                    <div key={s.student_id} className="flex items-center gap-3 p-2 bg-white border border-slate-100 rounded-sm group">
                      <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-bold border border-slate-200">
                        {s.name?.charAt(0) || "S"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-slate-500 truncate group-hover:text-slate-700 transition-colors">{s.name}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Not Joined</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 w-7 p-0 hover:bg-amber-50 hover:text-amber-600 rounded-full"
                        onClick={() => sendReminder(s.student_id)}
                        disabled={remindingId === s.student_id}
                      >
                        {remindingId === s.student_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 sticky bottom-0">
              <Button 
                variant="outline" 
                className="w-full h-9 rounded-sm border-slate-200 text-[10px] font-bold uppercase tracking-widest hover:text-[#194BFB] hover:border-[#194BFB]"
                onClick={() => {
                  pendingStudents.forEach(s => sendReminder(s.student_id));
                  toast.info("Reminders sent to all absent students.");
                }}
              >
                Remind All Absent
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <main className="flex-1 overflow-y-auto max-w-6xl mx-auto py-8 px-6 min-h-[calc(100vh-120px)] flex flex-col w-full custom-scrollbar">
          {/* SYLLABUS SHEET (Same as Student) */}
          <div className="mb-6">
            <Sheet open={isSyllabusOpen} onOpenChange={setIsSyllabusOpen}>
              <SheetTrigger asChild>
                <button className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-sm text-slate-600 hover:text-[#194BFB] hover:border-[#194BFB] transition-all whitespace-nowrap group text-[11px] font-bold uppercase tracking-wider">
                  <BookOpen className="h-3.5 w-3.5 text-[#194BFB]" />
                  <span>Course Syllabus</span>
                  <ChevronRight className="h-3 w-3 ml-1 group-data-[state=open]:rotate-90 transition-transform" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[400px] sm:w-[540px] p-0 border-r border-slate-200">
                <div className="p-6 border-b border-slate-100 bg-white sticky top-0 z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-8 w-8 bg-[#194BFB]/5 rounded-sm flex items-center justify-center border border-[#194BFB]/10">
                      <BookOpen className="h-4 w-4 text-[#194BFB]" />
                    </div>
                    <h3 className="font-['Outfit'] font-extrabold text-2xl text-[#0A0A0A]">Syllabus</h3>
                  </div>
                  <p className="text-sm text-slate-500 font-medium">{course?.title}</p>
                </div>
                <div className="overflow-y-auto h-[calc(100vh-120px)] p-6 bg-slate-50/30">
                  <div className="space-y-8">
                    {course?.modules?.map((m, mi) => (
                      <div key={m.id} className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">{mi + 1}</div>
                          <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">{m.title}</h4>
                        </div>
                        <div className="space-y-2 ml-9">
                          {m.lessons?.map((l) => {
                            const isCurrent = l.id === activeLessonId;
                            return (
                              <button
                                key={l.id}
                                onClick={() => {
                                  setActiveLessonId(l.id);
                                  setIsSyllabusOpen(false);
                                }}
                                className={`w-full flex items-center justify-between p-3 rounded-sm border transition-all ${isCurrent ? 'bg-[#194BFB]/5 border-[#194BFB] ring-1 ring-[#194BFB]/10' : 'bg-white border-slate-200 hover:border-[#194BFB] hover:shadow-sm'}`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 border ${isCurrent ? 'bg-[#194BFB] border-[#194BFB] text-white' : 'bg-white border-slate-200'}`}>
                                    {isCurrent ? <div className="h-1.5 w-1.5 rounded-full bg-white" /> : <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />}
                                  </div>
                                  <span className={`text-sm font-bold truncate ${isCurrent ? 'text-[#194BFB]' : 'text-slate-700'}`}>{l.title}</span>
                                </div>
                                {isCurrent && <div className="h-1.5 w-1.5 rounded-full bg-[#194BFB] animate-pulse" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

            <Breadcrumbs
              items={[
                { label: course?.title, to: `/course/${course?.id}` },
                { label: activeLesson?.title }
              ]}
            />

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-blue-50 text-[#194BFB] px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 border border-blue-100">
                  <BookOpen className="h-3 w-3" />
                  Lesson
                </div>
                {activeLessonId === session.lesson_id && (
                  <div className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider border border-emerald-200">
                    Live Topic
                  </div>
                )}
              </div>

              {activeLesson?.video_url && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-8 px-3 font-bold text-[10px] uppercase tracking-widest gap-2 shrink-0 shadow-lg shadow-blue-100">
                      <Video className="h-3.5 w-3.5" />
                      Recordings
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-none rounded-sm">
                    <div className="p-4 bg-white border-b border-border text-left">
                      <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
                        <Video className="h-4 w-4 text-[#194BFB]" />
                        Session Recording — {activeLesson.title}
                      </h3>
                    </div>
                    <div className="aspect-video w-full">
                      <iframe
                        src={formatVideoUrl(activeLesson.video_url)}
                        title={activeLesson.title}
                        className="w-full h-full"
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* TABS - Matching student view */}
            {activeLesson?.task && (
              <div className="flex border-b border-slate-200 mb-8 gap-8">
                <button
                  onClick={() => setActiveTab('learn')}
                  className={`pb-3 text-[11px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'learn' ? 'text-[#194BFB]' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Lesson
                  {activeTab === 'learn' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#194BFB]" />}
                </button>
                <button
                  onClick={() => setActiveTab('task')}
                  className={`pb-3 text-[11px] font-bold uppercase tracking-widest transition-all relative ${activeTab === 'task' ? 'text-[#194BFB]' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Assignment
                  {activeTab === 'task' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#194BFB]" />}
                </button>
              </div>
            )}

            <h1 className="text-4xl font-black tracking-tight text-[#0A0A0A] font-['Outfit'] mb-8">
              {activeTab === 'learn' ? activeLesson?.title : (activeLesson?.task?.title || "Assignment")}
            </h1>

            {/* CONTENT AREA - Multi-page matching student view */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-12 pb-48">
              {activeTab === 'learn' ? (
                <div className="prose prose-slate max-w-none text-sm leading-relaxed markdown-content">
                  {(activeLesson?.content || activeLesson?.content_html) ? (
                    <ReactMarkdown>
                      {contentBlocks[currentPage] || ""}
                    </ReactMarkdown>
                  ) : (
                    <div className="py-24 text-center text-slate-300 italic border-2 border-dashed border-slate-50 rounded-sm">
                      No written content for this lesson yet.
                    </div>
                  )}
                </div>
              ) : (
                /* Task Mode - Exactly as student task view */
                <div className="space-y-12">
                  <div className="bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-200 p-8">
                      <div className="flex items-center gap-3 text-[#194BFB] mb-3">
                        <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center border border-blue-100 shadow-sm">
                          <ClipboardList className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Live Assignment</span>
                          <h4 className="text-2xl font-black text-slate-900 tracking-tight">{activeLesson.task.title || "Project Task"}</h4>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-slate-500 leading-relaxed max-w-2xl">
                        {activeLesson.task.description}
                      </p>
                    </div>
                    
                    <div className="p-10 space-y-10 bg-white">
                      <div>
                        <h5 className="text-[11px] uppercase font-black text-slate-400 tracking-[0.2em] mb-5 flex items-center gap-2">
                          <div className="h-1 w-1 rounded-full bg-slate-300" /> Implementation Instructions
                        </h5>
                        <div className="prose prose-slate max-w-none text-sm text-slate-700 leading-relaxed markdown-content pl-3 border-l-2 border-slate-50">
                          <ReactMarkdown>{activeLesson.task.instructions}</ReactMarkdown>
                        </div>
                      </div>

                      {activeLesson.task.expected_output && (
                        <div>
                          <h5 className="text-[11px] uppercase font-black text-slate-400 tracking-[0.2em] mb-5 flex items-center gap-2">
                            <div className="h-1 w-1 rounded-full bg-slate-300" /> Expected Result
                          </h5>
                          <div className="relative group">
                            <pre className="bg-slate-900 text-[#10B981] p-8 rounded-sm font-['JetBrains_Mono'] text-xs overflow-x-auto border-l-4 border-[#10B981] shadow-2xl">
                              {activeLesson.task.expected_output}
                            </pre>
                            <div className="absolute top-4 right-4 bg-[#10B981]/10 text-[#10B981] text-[9px] font-bold px-2 py-1 rounded-sm uppercase tracking-widest border border-[#10B981]/20">Output</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Extra Mentor Context for Task */}
                  <div className="bg-amber-50 border border-amber-100 p-6 rounded-sm flex items-start gap-4">
                    <div className="h-8 w-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-amber-900 mb-1">Mentor Guidance</h5>
                      <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                        While students work on this assignment, you can monitor their progress in the "Progress" tab of the dashboard. Ensure all students understand the expected output before they begin.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </main>
      </div>

      <footer className="sticky bottom-0 bg-white border-t border-slate-200 p-4 flex items-center justify-between mt-auto z-10">
        <div className="w-1/3 text-left">
          {currentPage > 0 ? (
            <Button 
              variant="outline" 
              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
              className="rounded-sm border-slate-200 hover:border-[#194BFB] hover:text-[#194BFB] h-10 px-6 text-xs font-bold uppercase tracking-widest"
            >
              <ChevronLeft className="h-4 w-4 mr-2" /> Previous Page
            </Button>
          ) : (
            <Button 
              variant="outline"
              onClick={() => {
                const allLessons = course?.modules?.flatMap(m => m.lessons) || [];
                const idx = allLessons.findIndex(l => l.id === activeLessonId);
                if (idx > 0) setActiveLessonId(allLessons[idx-1].id);
              }}
              disabled={(() => {
                const allLessons = course?.modules?.flatMap(m => m.lessons) || [];
                return allLessons.findIndex(l => l.id === activeLessonId) <= 0;
              })()}
              className="rounded-sm border-slate-200 hover:border-[#194BFB] hover:text-[#194BFB] h-10 px-6 text-xs font-bold uppercase tracking-widest"
            >
              <ChevronLeft className="h-4 w-4 mr-2" /> Previous Lesson
            </Button>
          )}
        </div>
        <div className="w-1/3 text-center">
          <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
            Page {currentPage + 1} / {totalPages || 1}
          </span>
        </div>
        <div className="w-1/3 text-right">
          {currentPage < totalPages - 1 ? (
            <Button 
              onClick={() => setCurrentPage(prev => prev + 1)}
              className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-10 px-6 text-xs font-bold uppercase tracking-widest"
            >
              Next Page <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button 
              onClick={() => {
                const allLessons = course?.modules?.flatMap(m => m.lessons) || [];
                const idx = allLessons.findIndex(l => l.id === activeLessonId);
                if (idx < allLessons.length - 1) {
                  setActiveLessonId(allLessons[idx+1].id);
                }
              }}
              disabled={(() => {
                const allLessons = course?.modules?.flatMap(m => m.lessons) || [];
                const idx = allLessons.findIndex(l => l.id === activeLessonId);
                return idx === -1 || idx === allLessons.length - 1;
              })()}
              className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-10 px-6 text-xs font-bold uppercase tracking-widest"
            >
              Next Lesson <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </footer>

      {/* END CLASS MODAL */}
      {isEndModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <Card className="bg-white rounded-sm border-none shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#EF4444] p-5 text-white">
              <h3 className="font-['Outfit'] font-bold text-xl">End current class?</h3>
              <p className="text-red-100 text-xs mt-1">This will permanently finalize the session and attendance.</p>
            </div>
            <div className="p-6 space-y-6">
              {!classEndedSuccess ? (
                <>
                  <div className="bg-slate-50 p-4 rounded-sm border border-slate-100 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                      <StopCircle className="h-5 w-5 text-[#EF4444]" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700">Are you ready to end?</p>
                      <p className="text-[10px] text-slate-500 font-medium">This will notify all students and finalize attendance.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Button 
                      onClick={handleEndClass}
                      disabled={endingBusy}
                      className="w-full bg-[#EF4444] hover:bg-red-600 text-white h-11 rounded-sm font-bold uppercase tracking-widest text-xs shadow-lg shadow-red-100"
                    >
                      {endingBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <><StopCircle className="h-4 w-4 mr-2" /> Yes, End Class Now</>}
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => setIsEndModalOpen(false)}
                      className="w-full text-slate-500 font-bold uppercase tracking-widest text-xs h-11"
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                  <div className="text-center">
                    <div className="h-12 w-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">Class Finalized</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Attendance records saved</p>
                  </div>

                  <RecordingUpload 
                    sessionId={classId} 
                    onSuccess={() => {
                      toast.success("All set! Redirecting...");
                      setTimeout(() => navigate('/mentor'), 2000);
                    }}
                  />

                  <Button 
                    variant="ghost" 
                    onClick={() => navigate('/mentor')}
                    className="w-full text-slate-500 font-bold uppercase tracking-widest text-xs h-11"
                  >
                    Close & Go to Dashboard
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
