import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { BookOpen, Video, ArrowLeft, ArrowRight, Github, FileUp, Link2, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Clock, Trash2, Edit3, RefreshCcw, Check, Lock, CheckCircle } from "lucide-react";
import StatusPill from "../components/StatusPill";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import Navbar from "../components/Navbar";
import Breadcrumbs from "../components/Breadcrumbs";
import PaymentWall from "../components/PaymentWall";
import ReactMarkdown from "react-markdown";

export default function SubtopicView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "content";
  const classId = searchParams.get("classId");
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const taskRef = useRef(null);
  const [submissionError, setSubmissionError] = useState("");
  const [file, setFile] = useState(null);
  const [submissionType, setSubmissionType] = useState("link");
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedAt, setCompletedAt] = useState(null);
  const [isSyllabusOpen, setIsSyllabusOpen] = useState(false);
  const [showPaymentWall, setShowPaymentWall] = useState(false);
  const startTimeRef = useRef(Date.now());

  const load = async () => {
    setError("");
    try {
      const res = await api.get(`/subtopics/${id}`);
      setData(res.data);
      if (res.data.submission) {
        const sUrl = res.data.submission.submission_url || "";
        setUrl(sUrl);
        setText(res.data.submission.submission_text || "");
        if (sUrl.includes("/storage/v1/object/public/submissions/")) {
          setSubmissionType("file");
        } else {
          setSubmissionType("link");
        }
      } else {
        setUrl("");
        setText("");
        setSubmissionType("link");
      }
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 403) {
        if (detail && detail.code === "TIER_LOCKED") {
          setShowPaymentWall(true);
          return;
        }
        if (detail && detail.code === "ACCESS_EXPIRED") {
          toast.error("Your trial access has expired. Please make payment.");
        } else {
          toast.error(typeof detail === "string" ? detail : (detail?.message || "This module is not included in your current plan."));
        }
        navigate("/dashboard");
        return;
      }
      setError(formatApiError(detail) || "Failed to load subtopic");
    }
  };

  // Check completion status and track time
  useEffect(() => {
    if (!user?.id || !id) return;
    api.get(`/students/${user.id}/progress`).then(({ data }) => {
      const allSubtopics = (data.modules || []).flatMap(m => m.topics || []).flatMap(t => t.subtopics || []);
      const found = allSubtopics.find(s => s.id === id);
      if (found) {
        setIsCompleted(found.is_completed);
        setCompletedAt(found.completed_at);
      }
    }).catch(() => {});
  }, [user?.id, id]);

  // Time tracking via Page Visibility API
  useEffect(() => {
    if (user?.role !== "student") return;
    startTimeRef.current = Date.now();
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        const mins = Math.round((Date.now() - startTimeRef.current) / 60000);
        if (mins > 0) {
          api.post(`/subtopics/${id}/complete`, { time_spent_minutes: mins }).catch(() => {});
        }
      } else {
        startTimeRef.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      const mins = Math.round((Date.now() - startTimeRef.current) / 60000);
      if (mins > 0) {
        api.post(`/subtopics/${id}/complete`, { time_spent_minutes: mins }).catch(() => {});
      }
    };
  }, [id, user?.role]);

  useEffect(() => {
    load();

    // Listen for real-time updates from admin
    const channel = supabase.channel(`subtopic_view_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtopics', filter: `id=eq.${id}` }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (window.location.hash === "#task" && taskRef.current) {
      setTimeout(() => {
        taskRef.current.scrollIntoView({ behavior: "smooth" });
      }, 500);
    }
  }, [data]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    const allowed = [".pdf", ".zip"];
    const ext = selected.name.slice(selected.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      setSubmissionError("File type not supported. Only PDF and ZIP are allowed.");
      e.target.value = "";
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setSubmissionError("File size exceeds limit (10MB).");
      e.target.value = "";
      return;
    }
    setFile(selected);
    setSubmissionError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmissionError("");

    let finalUrl = url;
    if (submissionType === "file") {
      if (!file && !data.submission) { setSubmissionError("Please select a file"); return; }
      if (file) {
        setBusy(true);
        try {
          const res = await api.upload("/submissions/upload", file);
          finalUrl = res.data.url;
        } catch (err) {
          setSubmissionError(formatApiError(err.response?.data?.detail) || "Upload failed");
          setBusy(false);
          return;
        }
      }
    } else {
      if (!url) { setSubmissionError("Add a GitHub link"); return; }
    }

    setBusy(true);
    try {
      await api.post(`/subtopics/${id}/submit`, { submission_url: finalUrl, submission_text: text });
      toast.success("Submitted! Mentor will review shortly.");
      setIsEditing(false);
      setSubmissionError("");
      setFile(null);
      await load();
    } catch (e) {
      setSubmissionError(formatApiError(e.response?.data?.detail) || "Submission failed");
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this submission?")) return;
    setBusy(true);
    try {
      await api.delete(`/submissions/${data.submission.id}`);
      toast.success("Submission deleted");
      setIsEditing(false);
      setUrl("");
      setText("");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    } finally { setBusy(false); }
  };

  const handleComplete = async () => {
    if (!isStudent) return;
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 60000);
    setBusy(true);
    try {
      const res = await api.post(`/subtopics/${id}/complete`, { time_spent_minutes: elapsed });
      if (res.data.gamification) {
        toast.success(`+${res.data.gamification.xp_earned} XP earned! 🔥`, {
          description: `You are now Level ${res.data.gamification.level} with a ${res.data.gamification.streak} day streak!`
        });
      } else {
        toast.success("Subtopic complete! Keep it up 🚀");
      }
      setIsCompleted(true);
      setCompletedAt(new Date().toISOString());
      if (data.next_subtopic) {
        navigate(`/subtopic/${data.next_subtopic.id}`);
      } else {
        navigate("/student/progress");
      }
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to complete subtopic");
    } finally { setBusy(false); }
  };

  const handleUndoComplete = async () => {
    try {
      await api.delete(`/subtopics/${id}/complete`);
      setIsCompleted(false);
      setCompletedAt(null);
      load();
    } catch {
      toast.error("Failed to undo completion");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-6">
        <div className="bg-white border border-border rounded-sm p-8 max-w-md w-full text-center">
          <div className="text-red-500 mb-4 font-semibold">{error}</div>
          <Button onClick={() => navigate("/dashboard")} variant="outline" className="rounded-sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (showPaymentWall) {
    return <PaymentWall />;
  }

  if (!data || !data.subtopic) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="max-w-6xl mx-auto py-8 px-6 min-h-[calc(100vh-120px)] flex flex-col">
          {/* Header Skeleton */}
          <div className="mb-8 space-y-3">
            <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 w-2/3 bg-slate-100 rounded animate-pulse" />
          </div>

          <div className="flex flex-1 gap-8">
            {/* Sidebar Skeleton */}
            <div className="hidden lg:block w-80 space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 bg-slate-50 rounded-sm animate-pulse" />
              ))}
            </div>

            {/* Content Area Skeleton */}
            <div className="flex-1 space-y-6">
              <div className="h-[400px] bg-slate-50 rounded-sm animate-pulse" />
              <div className="space-y-3">
                <div className="h-4 w-full bg-slate-50 rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-slate-50 rounded animate-pulse" />
                <div className="h-4 w-4/6 bg-slate-50 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { subtopic, course, module, topic, task, submission, next_subtopic, prev_subtopic, total_subtopics, subtopic_index } = data;
  
  // Handle content from either 'content' or 'content_html'
  const rawContent = subtopic.content || subtopic.content_html || "";
  const contentBlocks = rawContent.split(/\n---\n/).filter(b => b.trim());
  const isStudent = user?.role === "student";
  const isEditingState = isEditing;
  const setIsEditingState = setIsEditing;

  const getEmbedUrl = (url) => {
    if (!url) return "";
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes("youtube.com") && urlObj.searchParams.has("v")) {
        return `https://www.youtube.com/embed/${urlObj.searchParams.get("v")}`;
      }
      if (urlObj.hostname === "youtu.be") {
        return `https://www.youtube.com/embed${urlObj.pathname}`;
      }
      return url;
    } catch { return url; }
  };

  const renderContent = (content) => {
    if (!content) return <p className="italic text-slate-500">No content for this subtopic yet.</p>;

    return (
      <div className="markdown-content">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white font-['IBM_Plex_Sans']">
      <Navbar />

      <main className="max-w-6xl mx-auto py-8 px-6 min-h-[calc(100vh-120px)] flex flex-col">
        <div className="mb-6">
          <Sheet open={isSyllabusOpen} onOpenChange={setIsSyllabusOpen}>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-sm text-slate-600 hover:text-[#194BFB] hover:border-[#194BFB] transition-all whitespace-nowrap group text-[11px] font-bold uppercase tracking-wider">
                <BookOpen className="h-3.5 w-3.5 text-[#194BFB]" />
                <span>Topic: {topic?.title}</span>
                <ChevronRight className="h-3 w-3 ml-1 group-data-[state=open]:rotate-90 transition-transform" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[400px] sm:w-[540px] p-0 border-r border-slate-200">
              <SheetHeader className="p-6 border-b border-slate-100 bg-white sticky top-0 z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-8 w-8 bg-[#194BFB]/5 rounded-sm flex items-center justify-center border border-[#194BFB]/10">
                    <BookOpen className="h-4 w-4 text-[#194BFB]" />
                  </div>
                  <SheetTitle className="font-['Outfit'] font-extrabold text-2xl text-[#0A0A0A]">Course Syllabus</SheetTitle>
                </div>
                <p className="text-sm text-slate-500 font-medium">{course?.title}</p>
              </SheetHeader>
              <div className="overflow-y-auto h-[calc(100vh-120px)] p-6 bg-slate-50/30">
                <div className="space-y-8">
                  {course?.modules?.map((m, mi) => (
                    <div key={m.id} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-6 w-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">{mi + 1}</div>
                        <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">{m.title}</h4>
                      </div>
                      <div className="space-y-4 ml-6">
                        {m.topics?.map((t, ti) => (
                          <div key={t.id} className="space-y-2">
                            <div className="flex items-center gap-2 px-3 py-1">
                               <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                               <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Topic: {t.title}</span>
                            </div>
                              <div className="space-y-1 ml-3">
                                {t.subtopics?.map((s, si) => {
                                  const isCurrent = s.id === id;
                                  const isCompleted = s.completed;
                                  const isLocked = s.unlocked === false && user?.role === 'student';
                                  
                                  const content = (
                                    <Link
                                      key={s.id}
                                      to={isLocked ? '#' : `/subtopic/${s.id}`}
                                      onClick={(e) => {
                                        if (isLocked) {
                                          e.preventDefault();
                                          return;
                                        }
                                        setIsSyllabusOpen(false);
                                      }}
                                      className={`flex items-center justify-between p-2 rounded-sm border transition-all ${isCurrent ? 'bg-[#194BFB]/5 border-[#194BFB] ring-1 ring-[#194BFB]/10' : (isLocked ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-[#194BFB] hover:shadow-sm')}`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 border ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-200'}`}>
                                          {isCompleted ? <Check className="h-2 w-2 stroke-[3]" /> : (isLocked ? <Lock className="h-2 w-2 text-slate-400" /> : <div className="h-1 w-1 rounded-full bg-slate-200" />)}
                                        </div>
                                        <span className={`text-[13px] font-bold truncate ${isCurrent ? 'text-[#194BFB]' : (isLocked ? 'text-slate-400' : 'text-slate-600')}`}>{s.title}</span>
                                      </div>
                                      {isCurrent && <div className="h-1.5 w-1.5 rounded-full bg-[#194BFB] animate-pulse" />}
                                    </Link>
                                  );

                                  return isLocked ? (
                                    <TooltipProvider key={s.id}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="cursor-not-allowed">
                                            {content}
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="bg-red-500 text-white border-none rounded-sm text-[10px] font-bold p-3 shadow-xl flex items-center gap-2 animate-in zoom-in-95">
                                          <Lock className="h-3 w-3" />
                                          Complete "{si > 0 ? t.subtopics[si-1].title : 'previous topic'}" to unlock
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : content;
                                })}
                              </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {classId && user?.role === "mentor" && (
          <div className="mb-6">
            <Button asChild variant="outline" className="border-[#194BFB] text-[#194BFB] hover:bg-[#194BFB] hover:text-white rounded-sm font-bold uppercase tracking-widest text-[10px] h-9">
              <Link to={`/mentor/teach/${classId}`}>
                <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to Teaching Mode
              </Link>
            </Button>
          </div>
        )}

        <Breadcrumbs
          items={[
            { label: course?.title, to: `/course/${course?.id}` },
            { label: module?.title },
            { label: topic?.title },
            { label: subtopic?.title }
          ]}
        />

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 border ${mode === 'task' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-[#194BFB] border-blue-100'}`}>
              {mode === 'task' ? <ClipboardCheck className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
              {mode === 'task' ? 'Homework' : 'Subtopic'}
            </div>
            {submission?.status === 'approved' && (
              <div className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider">
                Completed
              </div>
            )}
          </div>

          {subtopic.video_url && (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-8 px-3 font-bold text-[10px] uppercase tracking-widest gap-2 shrink-0">
                  <div className="h-4 w-4 rounded-full bg-white/20 flex items-center justify-center">
                    <Video className="h-2.5 w-2.5" />
                  </div>
                  Recordings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-none rounded-sm">
                <DialogHeader className="p-4 bg-white border-b border-border text-left">
                  <DialogTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
                    <Video className="h-4 w-4 text-[#194BFB]" />
                    Session Recording — {subtopic.title}
                  </DialogTitle>
                </DialogHeader>
                <div className="aspect-video w-full">
                  <iframe
                    src={getEmbedUrl(subtopic.video_url)}
                    title={subtopic.title}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#0A0A0A] font-['Outfit'] mb-4">
          {subtopic.title}
        </h1>

        {/* Completion Banner */}
        {isStudent && isCompleted && (
          <div className="bg-green-50 border border-green-200 rounded-sm p-3 mb-6 flex items-center gap-2">
            <CheckCircle className="text-green-500 h-4 w-4 shrink-0" />
            <span className="text-sm text-green-700">
              You completed this subtopic{completedAt ? ` on ${new Date(completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            </span>
            <button
              onClick={handleUndoComplete}
              className="ml-auto text-xs text-slate-400 hover:text-red-400 transition-colors"
            >
              Undo completion
            </button>
          </div>
        )}

        {mode === 'content' ? (
          <div className="prose prose-slate prose-lg max-w-4xl mx-auto pb-48">
            {renderContent(contentBlocks[currentPage])}
          </div>
        ) : (
          /* Task Mode */
          task && (
            <div className="max-w-3xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-xl shadow-slate-100/50">
                {/* Header */}
                <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.3em] mb-2 flex items-center gap-2">
                      <div className="h-1 w-8 bg-red-500" />
                      Assigned Homework
                    </div>
                    <h3 className="font-['Outfit'] font-extrabold text-2xl tracking-tight leading-tight">{task.description}</h3>
                  </div>
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <ClipboardCheck className="h-24 w-24 -rotate-12" />
                  </div>
                </div>

                {/* Status Bar */}
                {submission && (
                  <div className={`px-8 py-3 border-b flex items-center justify-between text-[10px] font-bold uppercase tracking-widest ${
                    submission.status === 'rework' ? 'bg-orange-50 text-orange-600 border-orange-100' : 
                    (submission.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100')
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                        submission.status === 'rework' ? 'bg-orange-500' : 
                        (submission.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-500')
                      }`} />
                      Submission Status: {submission.status}
                    </div>
                    {submission.status === 'rework' ? <RefreshCcw className="h-3.5 w-3.5" /> : (submission.status === 'approved' ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />)}
                  </div>
                )}

              <div className="p-8 space-y-10">
                {/* Instructions */}
                <div>
                  <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-4">Instructions</h4>
                  <div className="bg-slate-50/50 border border-slate-100 p-6 rounded-sm text-slate-600 leading-relaxed">
                    {task.instructions || "No specific instructions provided."}
                  </div>
                </div>

                {/* Expected Output */}
                {task.expected_output && (
                  <div>
                    <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-4">Expected Output</h4>
                    <pre className="bg-[#0A0A0A] text-[#10B981] p-6 rounded-sm font-mono text-sm overflow-x-auto border border-white/5 shadow-inner">
                      {task.expected_output}
                    </pre>
                  </div>
                )}

                {/* Submission Area */}
                <div className="pt-6 border-t border-slate-100">
                  <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-6">Your Submission</h4>

                  {submission && !isEditingState ? (
                    <div className="bg-slate-50 border border-slate-200 p-6 rounded-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 bg-white border border-slate-200 rounded-sm flex items-center justify-center">
                            {submission.type === "file" ? <FileUp className="h-5 w-5 text-[#194BFB]" /> : <Link2 className="h-5 w-5 text-[#194BFB]" />}
                          </div>
                          <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Submitted {submission.type === 'file' ? 'File' : 'Link'}</div>
                            <a href={submission.submission_url} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#194BFB] hover:underline flex items-center gap-1">
                              {submission.submission_url?.slice(0, 50) || "View Submission"}...
                            </a>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(submission.status === "pending" || submission.status === "rework") && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => setIsEditingState(true)} className="h-8 text-slate-600 hover:text-[#194BFB] hover:bg-[#194BFB]/5">
                                <Edit3 className="h-3.5 w-3.5 mr-2" /> Edit
                              </Button>
                              <Button variant="ghost" size="sm" onClick={handleDelete} className="h-8 text-red-500 hover:text-red-600 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {submission.mentor_feedback && (
                        <div className="mt-4 p-4 bg-orange-50/50 border border-orange-100 rounded-sm">
                          <div className="text-[10px] uppercase font-bold text-orange-600 tracking-wider mb-2">Mentor Feedback</div>
                          <p className="text-sm text-orange-800 leading-relaxed italic">"{submission.mentor_feedback}"</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    isStudent && (
                      <form onSubmit={submit} className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex gap-4">
                          <button type="button" onClick={() => { setSubmissionType("link"); setSubmissionError(""); }} className={`flex-1 p-4 rounded-sm border transition-all text-left ${submissionType === "link" ? "border-[#194BFB] bg-[#194BFB]/5 ring-1 ring-[#194BFB]" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center mb-3 ${submissionType === "link" ? "bg-[#194BFB] text-white" : "bg-slate-100 text-slate-400"}`}>
                              <Link2 className="h-4 w-4" />
                            </div>
                            <div className="font-bold text-sm">Submission Link</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">GitHub or URL</div>
                          </button>
                          <button type="button" onClick={() => { setSubmissionType("file"); setSubmissionError(""); }} className={`flex-1 p-4 rounded-sm border transition-all text-left ${submissionType === "file" ? "border-[#194BFB] bg-[#194BFB]/5 ring-1 ring-[#194BFB]" : "border-slate-200 hover:border-slate-300 bg-white"}`}>
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center mb-3 ${submissionType === "file" ? "bg-[#194BFB] text-white" : "bg-slate-100 text-slate-400"}`}>
                              <FileUp className="h-4 w-4" />
                            </div>
                            <div className="font-bold text-sm">Upload File</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">ZIP, PDF, or Image</div>
                          </button>
                        </div>

                        {submissionType === "link" ? (
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Resource URL</Label>
                            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/your-project" className="rounded-sm border-slate-200 focus:ring-[#194BFB] h-11" />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Choose File</Label>
                            <Input type="file" onChange={handleFileChange} className="rounded-sm border-slate-200 h-11 py-2 cursor-pointer" />
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Comments (Optional)</Label>
                          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything you want the mentor to know..." className="rounded-sm border-slate-200 min-h-[100px] focus:ring-[#194BFB]" />
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                          <Button type="submit" disabled={busy} className="flex-1 rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] h-11 font-bold uppercase tracking-widest">
                            {busy ? "Submitting..." : (submission ? "Save & Resubmit" : "Submit Assignment")}
                          </Button>
                          {isEditingState && (
                            <Button variant="ghost" onClick={() => setIsEditingState(false)} className="rounded-sm h-11 font-bold text-slate-500">
                              Cancel
                            </Button>
                          )}
                        </div>
                        {submissionError && <div className="text-xs text-red-500 font-medium text-center">{submissionError}</div>}
                      </form>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      )}
      </main>

      {/* Sticky Navigation Footer */}
      <footer className="sticky bottom-0 bg-white border-t border-border p-4 flex items-center justify-between mt-auto">
        <div className="w-1/3">
          {mode === 'task' ? (
            <Button asChild variant="outline" className="rounded-sm border-slate-200 hover:border-[#194BFB] hover:text-[#194BFB] group transition-all h-10">
              <Link to={`/subtopic/${id}?mode=content`}>
                <ChevronLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" />
                <span className="hidden sm:inline">Back to Content</span>
              </Link>
            </Button>
          ) : currentPage > 0 ? (
            <Button onClick={() => setCurrentPage(prev => prev - 1)} variant="outline" className="rounded-sm border-slate-200 hover:border-[#194BFB] hover:text-[#194BFB] group transition-all h-10 px-6 font-bold uppercase tracking-wider">
              <ChevronLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" />
              Previous
            </Button>
          ) : prev_subtopic ? (
            <Button asChild variant="outline" className="rounded-sm border-slate-200 hover:border-[#194BFB] hover:text-[#194BFB] group transition-all h-10">
              <Link to={`/subtopic/${prev_subtopic.id}`}>
                <ChevronLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" />
                <span className="hidden sm:inline">Previous Subtopic</span>
              </Link>
            </Button>
          ) : <div />}
        </div>

        <div className="w-1/3 text-center">
          {mode === 'content' && (
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
              Page {currentPage + 1} / {contentBlocks.length}
            </span>
          )}
          {mode === 'task' && (
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
              Subtopic {subtopic_index} / {total_subtopics}
            </span>
          )}
        </div>

        <div className="w-1/3 text-right">
          {mode === 'content' ? (
            currentPage < contentBlocks.length - 1 ? (
              <Button onClick={() => setCurrentPage(prev => prev + 1)} className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm group h-10 px-6 font-bold uppercase tracking-wider">
                Next
                <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </Button>
            ) : (task && task.id) ? (
              <Button asChild className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm group h-10 px-6 font-bold uppercase tracking-wider shadow-lg shadow-blue-100">
                <Link to={`/subtopic/${id}?mode=task${classId ? `&classId=${classId}` : ''}`}>
                  Go to Task
                  <ClipboardCheck className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={busy} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-sm h-10 px-6 font-bold uppercase tracking-wider">
                {busy ? "..." : (next_subtopic ? "Next Subtopic" : "Finish Course")}
              </Button>
            )
          ) : (
            next_subtopic ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block relative">
                      <Button
                        onClick={() => navigate(`/subtopic/${next_subtopic.id}`)}
                        disabled={(submission?.status !== 'approved' && user?.role !== 'mentor') || busy}
                        className={`bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-11 px-8 text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-100 ${((submission?.status !== 'approved' && user?.role !== 'mentor') || busy) ? 'pointer-events-none' : ''}`}
                      >
                        {busy ? "..." : (next_subtopic ? "Next Subtopic" : "Finish Course")} <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {(submission?.status !== 'approved' && user?.role !== 'mentor') && (
                    <TooltipContent className="bg-red-500 text-white border-none rounded-sm text-[10px] font-bold p-3 shadow-xl shadow-red-100 flex items-center gap-2 animate-in zoom-in-95">
                      <Lock className="h-3 w-3" />
                      Submit & get approval to unlock next subtopic
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button asChild className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-sm h-10 px-6 font-bold uppercase tracking-wider">
                <Link to={`/course/${course.id}`}>Finish</Link>
              </Button>
            )
          )}
        </div>
      </footer>
    </div>
  );
}
