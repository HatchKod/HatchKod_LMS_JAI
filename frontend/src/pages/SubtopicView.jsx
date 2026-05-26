import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { fmtDate } from "../lib/dateUtils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { BookOpen, Video, ArrowLeft, ArrowRight, Github, FileUp, Link2, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Clock, Trash2, Edit3, RefreshCcw, Check, Lock, CheckCircle, Play, Terminal, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import StatusPill from "../components/StatusPill";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import Navbar from "../components/Navbar";
import Breadcrumbs from "../components/Breadcrumbs";
import ReactMarkdown from "react-markdown";
import Editor from "@monaco-editor/react";

export default function SubtopicView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "content";
  const classId = searchParams.get("classId");
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
  const startTimeRef = useRef(Date.now());

  // Coding task state
  const [code, setCode] = useState("");
  const [codeRunning, setCodeRunning] = useState(false);
  const [codeResults, setCodeResults] = useState(null); // { status, all_passed, test_results }
  const [stdin, setStdin] = useState("");
  const [runOutput, setRunOutput] = useState(null); // { output, cpuTime, memory }
  const [runBusy, setRunBusy] = useState(false);

  const courseId = data?.course?.id;

  // Full course data — uses the same cache key as CourseView so it's free when navigating
  // from the syllabus. Provides topic-level mentor_locked / subtopic-level unlocked flags.
  const { data: fullCourse } = useQuery({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const res = await api.get(`/courses/${courseId}`);
      return res.data;
    },
    enabled: !!courseId,
    staleTime: 1000 * 60 * 5,
  });

  // Set of topic IDs that the mentor has locked for this student's batch
  const mentorLockedTopicIds = new Set(
    user?.role === "student" && fullCourse
      ? (fullCourse.modules || [])
          .flatMap(m => m.topics || [])
          .filter(t => t.mentor_locked)
          .map(t => t.id)
      : []
  );

  const load = async () => {
    setError("");
    try {
      const res = await api.get(`/subtopics/${id}`);
      setData(res.data);
      if (res.data.is_completed !== undefined) {
        setIsCompleted(res.data.is_completed);
        setCompletedAt(res.data.completed_at);
      }
      if (res.data.submission) {
        const sUrl = res.data.submission.submission_url || "";
        setUrl(sUrl);
        setText(res.data.submission.submission_text || "");
        if (sUrl.includes("hatchkod-student-submissions.s3.ap-south-1.amazonaws.com")) {
          setSubmissionType("file");
        } else {
          setSubmissionType("link");
        }
      } else {
        setUrl("");
        setText("");
        setSubmissionType("link");
      }
      // Restore last code for coding tasks
      if (res.data.last_code_submission?.code) {
        setCode(res.data.last_code_submission.code);
        setCodeResults({
          status: res.data.last_code_submission.status,
          all_passed: res.data.last_code_submission.status === "accepted",
          test_results: res.data.last_code_submission.test_results || [],
        });
      }
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 403) {
        if (detail?.code === "TIER_LOCKED" || detail?.code === "ACCESS_EXPIRED") {
          navigate("/billing", { replace: true });
          return;
        }
        toast.error(typeof detail === "string" ? detail : (detail?.message || "Access denied."));
        navigate("/dashboard");
        return;
      }
      setError(formatApiError(detail) || "Failed to load subtopic");
    }
  };

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
    setData(null);
    setCode("");
    setCodeResults(null);
    setStdin("");
    setRunOutput(null);
    setIsCompleted(false);
    setCompletedAt(null);
    load();

    const channel = supabase.channel(`subtopic_view_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtopics', filter: `id=eq.${id}` }, () => load())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [id]);

  // When the mentor changes topic lock state, refresh both the course cache (sidebar) and
  // the subtopic data (next_topic_locked drives the Next button disabled state).
  const loadRef = useRef(null);
  loadRef.current = load;

  useEffect(() => {
    if (!courseId) return;
    const ch = supabase.channel(`subtopic_access_${courseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_topic_access' }, () => {
        queryClient.invalidateQueries({ queryKey: ["course", courseId] });
        loadRef.current?.();
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [courseId, queryClient]);

  // Poll every 5s while submission is pending so the Next button unlocks
  // the moment a mentor approves — no page reload needed.
  useEffect(() => {
    if (data?.submission?.status !== 'pending') return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [data?.submission?.status]);

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
    const allowed = [".pdf", ".zip", ".docx", ".png", ".jpg", ".jpeg", ".webp"];
    const ext = selected.name.slice(selected.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      setSubmissionError("File type not supported. Allowed: PDF, ZIP, DOCX, PNG, JPG, WEBP.");
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
      toast.success("Submitted! You can proceed — XP will be awarded after mentor review.");
      setIsCompleted(true);
      setIsEditing(false);
      setSubmissionError("");
      setFile(null);
      const courseId = data?.course?.id;
      if (courseId) queryClient.invalidateQueries({ queryKey: ["course", courseId] });
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
      if (course?.id) queryClient.invalidateQueries({ queryKey: ["course", course.id] });
      if (data.next_subtopic && !data.next_topic_locked) {
        navigate(`/subtopic/${data.next_subtopic.id}`);
      } else if (!data.next_subtopic) {
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
      if (course?.id) queryClient.invalidateQueries({ queryKey: ["course", course.id] });
      load();
    } catch {
      toast.error("Failed to undo completion");
    }
  };

  const runCode = async () => {
    if (!code.trim()) { toast.error("Write some code first"); return; }
    setRunBusy(true);
    setRunOutput(null);
    try {
      const res = await api.post("/execute", {
        code,
        stdin,
        language: data?.task?.language || "java",
      });
      setRunOutput(res.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Execution failed");
    } finally {
      setRunBusy(false);
    }
  };

  const submitCode = async () => {
    if (!code.trim()) { toast.error("Write some code first"); return; }
    setCodeRunning(true);
    setCodeResults(null);
    try {
      const res = await api.post(`/subtopics/${id}/submit-code`, {
        code,
        language: data?.task?.language || "java",
      });
      setCodeResults(res.data);
      if (res.data.all_passed) {
        setIsCompleted(true);
        setCompletedAt(new Date().toISOString());
        if (course?.id) queryClient.invalidateQueries({ queryKey: ["course", course.id] });
        if (res.data.gamification) {
          toast.success(`All tests passed! +${res.data.gamification.xp_earned} XP earned! 🔥`, {
            description: `Level ${res.data.gamification.level} · ${res.data.gamification.streak} day streak`,
          });
        } else {
          toast.success("All tests passed! Moving to next topic 🚀");
        }
        setTimeout(() => {
          if (data?.next_subtopic && !data?.next_topic_locked) {
            navigate(`/subtopic/${data.next_subtopic.id}`);
          } else if (!data?.next_subtopic) {
            navigate("/progress");
          }
        }, 1800);
      } else {
        const failed = res.data.test_results?.filter(t => !t.passed).length || 0;
        const total = res.data.test_results?.length || 0;
        toast.error(`${failed}/${total} test case${failed !== 1 ? "s" : ""} failed. Keep trying!`);
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Execution failed");
    } finally {
      setCodeRunning(false);
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

  const { subtopic, course, module, topic, task, submission, next_subtopic, prev_subtopic, total_subtopics, subtopic_index, next_topic_locked, next_topic_lock_reason } = data;
  
  // Handle content from either 'content' or 'content_html'
  const rawContent = subtopic.content || subtopic.content_html || "";
  const contentBlocks = rawContent.split(/\n---\n/).filter(b => b.trim());
  const isStudent = user?.role === "student";
  const isEditingState = isEditing;
  const setIsEditingState = setIsEditing;

  // Sidebar lock state: flatten all subtopics in order; everything after the
  // first incomplete subtopic is locked for students.
  const allFlatSubtopics = (course?.modules || []).flatMap(m =>
    (m.topics || []).flatMap(t => t.subtopics || [])
  );
  const sidebarFrontierIdx = isStudent
    ? allFlatSubtopics.findIndex(s => !s.completed)
    : -1;


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
                        {m.topics?.map((t) => {
                          const topicSubs = t.subtopics || [];
                          const topicAllDone = topicSubs.length > 0 && topicSubs.every(s => s.completed);

                          return (
                            <div key={t.id} className="space-y-2">
                              {/* Topic header */}
                              <div className="flex items-center gap-2 px-3 py-1">
                                {topicAllDone
                                  ? <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                                  : <div className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                                }
                                <span className={`text-xs font-bold uppercase tracking-tight ${topicAllDone ? 'text-emerald-600' : 'text-slate-500'}`}>
                                  Topic: {t.title}
                                </span>
                              </div>

                              {/* Subtopics */}
                              <div className="space-y-1 ml-3">
                                {topicSubs.map((s, si) => {
                                  const globalIdx = allFlatSubtopics.findIndex(x => x.id === s.id);
                                  const isCurrent = s.id === id;
                                  const isSubCompleted = !!s.completed;
                                  // A subtopic is locked if:
                                  // 1. Its topic is mentor-locked (even if previously completed — mentor re-locked it)
                                  // 2. It's not completed AND is beyond the sequential completion frontier
                                  // 3. It's the immediate next subtopic and its topic boundary is locked
                                  const isTopicMentorLocked = mentorLockedTopicIds.has(t.id);
                                  const isLocked = isStudent && (
                                    isTopicMentorLocked ||
                                    (!isSubCompleted && (
                                      (s.id === next_subtopic?.id && next_topic_locked) ||
                                      (sidebarFrontierIdx !== -1 && globalIdx > sidebarFrontierIdx)
                                    ))
                                  );

                                  const pill = (
                                    <Link
                                      key={s.id}
                                      to={isLocked ? '#' : `/subtopic/${s.id}`}
                                      onClick={(e) => {
                                        if (isLocked) { e.preventDefault(); return; }
                                        setIsSyllabusOpen(false);
                                      }}
                                      className={`flex items-center justify-between p-2 rounded-sm border transition-all ${
                                        isCurrent
                                          ? 'bg-[#194BFB]/5 border-[#194BFB] ring-1 ring-[#194BFB]/10'
                                          : isLocked
                                            ? 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
                                            : 'bg-white border-slate-200 hover:border-[#194BFB] hover:shadow-sm'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        {/* State icon */}
                                        <div className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 border ${
                                          isSubCompleted
                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                            : isLocked
                                              ? 'bg-slate-100 border-slate-200'
                                              : isCurrent
                                                ? 'bg-[#194BFB]/10 border-[#194BFB]/50'
                                                : 'bg-white border-slate-200'
                                        }`}>
                                          {isSubCompleted
                                            ? <Check className="h-2 w-2 stroke-[3]" />
                                            : isLocked
                                              ? <Lock className="h-2 w-2 text-slate-400" />
                                              : isCurrent
                                                ? <div className="h-1.5 w-1.5 rounded-full bg-[#194BFB]" />
                                                : <div className="h-1 w-1 rounded-full bg-slate-300" />
                                          }
                                        </div>
                                        <span className={`text-[13px] font-bold truncate ${
                                          isCurrent ? 'text-[#194BFB]' : isLocked ? 'text-slate-400' : 'text-slate-700'
                                        }`}>{s.title}</span>
                                      </div>
                                      {isCurrent && <div className="h-1.5 w-1.5 rounded-full bg-[#194BFB] animate-pulse shrink-0 ml-2" />}
                                    </Link>
                                  );

                                  return isLocked ? (
                                    <TooltipProvider key={s.id}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="cursor-not-allowed">{pill}</div>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="bg-slate-900 text-white border-none rounded-sm text-[10px] font-bold p-3 shadow-xl flex items-center gap-2 animate-in zoom-in-95">
                                          <Lock className="h-3 w-3" />
                                          {isTopicMentorLocked || (s.id === next_subtopic?.id && next_topic_locked && next_topic_lock_reason === 'mentor_locked')
                                            ? "Your mentor hasn't unlocked this topic yet"
                                            : `Complete "${si > 0 ? topicSubs[si - 1].title : 'previous topic'}" to unlock`}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : pill;
                                })}
                              </div>
                            </div>
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

          {subtopic.video_url ? (
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
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0">
                    <Button size="sm" disabled className="rounded-sm h-8 px-3 font-bold text-[10px] uppercase tracking-widest gap-2 pointer-events-none">
                      <div className="h-4 w-4 rounded-full bg-current/20 flex items-center justify-center">
                        <Video className="h-2.5 w-2.5" />
                      </div>
                      Recordings
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-slate-900 text-white border-none rounded-sm text-[10px] font-bold p-3 shadow-xl flex items-center gap-2">
                  <Video className="h-3 w-3" />
                  No recorded session for this topic yet
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#0A0A0A] font-['Outfit'] mb-4">
          {subtopic.title}
        </h1>

        {/* Completion Banner */}
        {isStudent && isCompleted && (
          task?.task_type === 'project' && submission && submission.status !== 'approved' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 mb-6 flex items-center gap-2">
              <Clock className="text-amber-500 h-4 w-4 shrink-0" />
              <span className="text-sm text-amber-700">
                Submitted — awaiting mentor review. XP will be awarded on approval.
              </span>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-sm p-3 mb-6 flex items-center gap-2">
              <CheckCircle className="text-green-500 h-4 w-4 shrink-0" />
              <span className="text-sm text-green-700">
                You completed this subtopic{completedAt ? ` on ${fmtDate(completedAt, { day: "numeric", month: "short", year: "numeric" })}` : ""}
              </span>
              {!task && (
                <button
                  onClick={handleUndoComplete}
                  className="ml-auto text-xs text-slate-400 hover:text-red-400 transition-colors"
                >
                  Undo completion
                </button>
              )}
            </div>
          )
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
                    <div className="markdown-content-dark">
                      <ReactMarkdown>{task.description}</ReactMarkdown>
                    </div>
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
                  <div className="bg-slate-50/50 border border-slate-100 p-6 rounded-sm markdown-content">
                    <ReactMarkdown>{task.instructions || "No specific instructions provided."}</ReactMarkdown>
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

                  {task.task_type === "coding" ? (
                    /* ── CODING TASK: Monaco editor + Judge0 auto-grading ── */
                    isStudent && (
                      <div className="space-y-4 animate-in fade-in duration-300">
                        {/* Sample test cases */}
                        {task.sample_test_cases?.length > 0 && (
                          <div>
                            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-3">Sample Test Cases</h4>
                            <div className="space-y-2">
                              {task.sample_test_cases.map((tc, i) => (
                                <div key={tc.id} className="grid grid-cols-2 gap-2 text-xs font-mono">
                                  <div>
                                    <div className="text-[9px] uppercase font-bold text-slate-400 mb-1">Input {i + 1}</div>
                                    <pre className="bg-slate-900 text-slate-100 p-3 rounded-sm overflow-x-auto">{tc.input || "(empty)"}</pre>
                                  </div>
                                  <div>
                                    <div className="text-[9px] uppercase font-bold text-slate-400 mb-1">Expected Output {i + 1}</div>
                                    <pre className="bg-slate-900 text-emerald-400 p-3 rounded-sm overflow-x-auto">{tc.expected_output}</pre>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Editor */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center gap-2">
                              <Terminal className="h-3 w-3" /> Your Code
                            </h4>
                            <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded">
                              {task.language || "java"}
                            </span>
                          </div>
                          <div className="border border-slate-200 rounded-sm overflow-hidden">
                            <Editor
                              height="380px"
                              language={task.language === "cpp" ? "cpp" : task.language === "javascript" ? "javascript" : task.language === "python" ? "python" : "java"}
                              value={code}
                              onChange={(val) => setCode(val || "")}
                              theme="vs-dark"
                              options={{
                                minimap: { enabled: false },
                                fontSize: 14,
                                lineNumbers: "on",
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                tabSize: 4,
                              }}
                            />
                          </div>
                        </div>

                        {/* Stdin + Output panels */}
                        <div className="rounded-sm overflow-hidden border border-slate-800 bg-slate-900">
                          <div className="grid grid-cols-2 divide-x divide-slate-700">
                            {/* Left: stdin */}
                            <div className="flex flex-col">
                              <div className="px-3 py-2 bg-slate-800 flex items-center gap-2 border-b border-slate-700">
                                <Terminal className="h-3 w-3 text-slate-400" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Input (stdin)</span>
                              </div>
                              <textarea
                                className="w-full h-28 bg-transparent p-3 text-sm font-mono text-slate-300 outline-none resize-none placeholder-slate-600"
                                placeholder={"Enter input values here...\n(leave empty if no stdin)"}
                                value={stdin}
                                onChange={(e) => setStdin(e.target.value)}
                                disabled={runBusy}
                              />
                            </div>
                            {/* Right: output */}
                            <div className="flex flex-col">
                              <div className="px-3 py-2 bg-slate-800 flex items-center gap-2 border-b border-slate-700">
                                <Play className="h-3 w-3 text-slate-400" />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Output</span>
                                {runOutput && (
                                  <span className="ml-auto text-[9px] font-bold text-slate-500 uppercase">
                                    {runOutput.cpuTime}s · {runOutput.memory} KB
                                  </span>
                                )}
                              </div>
                              <div className="h-28 p-3 overflow-y-auto">
                                {runBusy ? (
                                  <div className="flex items-center gap-2 text-blue-400 text-xs animate-pulse">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Compiling &amp; running...
                                  </div>
                                ) : runOutput ? (
                                  <pre className={`text-xs font-mono whitespace-pre-wrap ${/error|exception/i.test(runOutput.output || "") ? "text-red-400" : "text-emerald-400"}`}>
                                    {runOutput.output || <span className="text-slate-500 italic">No output</span>}
                                  </pre>
                                ) : (
                                  <span className="text-slate-600 text-xs italic">Output will appear here after running</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Run Code button */}
                          <div className="border-t border-slate-700 p-2">
                            <Button
                              onClick={runCode}
                              disabled={runBusy || codeRunning}
                              className="w-full h-9 rounded-sm font-bold uppercase tracking-widest bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs"
                            >
                              {runBusy ? (
                                <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Running...</>
                              ) : (
                                <><Play className="h-3.5 w-3.5 mr-2 fill-current" /> Run Code</>
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px bg-slate-100" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Submit against test cases</span>
                          <div className="flex-1 h-px bg-slate-100" />
                        </div>

                        {/* Run & Submit button */}
                        <Button
                          onClick={submitCode}
                          disabled={codeRunning || isCompleted}
                          className="w-full h-11 rounded-sm font-bold uppercase tracking-widest bg-[#194BFB] hover:bg-[#0F3AE5] text-white shadow-lg shadow-blue-100"
                        >
                          {codeRunning ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running Tests...</>
                          ) : isCompleted ? (
                            <><CheckCircle2 className="h-4 w-4 mr-2" /> All Tests Passed</>
                          ) : (
                            <><Play className="h-4 w-4 mr-2" /> Run &amp; Submit</>
                          )}
                        </Button>

                        {/* Test results */}
                        {codeResults && (
                          <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className={`flex items-center gap-2 px-4 py-3 rounded-sm font-bold text-sm ${
                              codeResults.all_passed
                                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                                : codeResults.status === "compilation_error"
                                  ? "bg-red-50 border border-red-200 text-red-700"
                                  : "bg-amber-50 border border-amber-200 text-amber-700"
                            }`}>
                              {codeResults.all_passed
                                ? <><CheckCircle2 className="h-4 w-4" /> All test cases passed!</>
                                : codeResults.status === "compilation_error"
                                  ? <><XCircle className="h-4 w-4" /> Compilation Error</>
                                  : <><XCircle className="h-4 w-4" /> {codeResults.test_results?.filter(t => t.passed).length || 0} / {codeResults.test_results?.length || 0} test cases passed</>
                              }
                            </div>
                            {codeResults.test_results?.map((tr, i) => (
                              <div key={tr.test_case_id || i} className={`p-3 rounded-sm border text-xs font-mono ${tr.passed ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
                                <div className="flex items-center gap-2 font-bold mb-2">
                                  {tr.passed
                                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    : <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  }
                                  <span className={tr.passed ? "text-emerald-700" : "text-red-700"}>
                                    Test {i + 1} {tr.is_sample ? "(Sample)" : "(Hidden)"} — {tr.passed ? "Passed" : "Failed"}
                                  </span>
                                </div>
                                {!tr.passed && tr.is_sample && (
                                  <div className="grid grid-cols-2 gap-2 mt-2">
                                    {tr.input !== undefined && (
                                      <div>
                                        <div className="text-[9px] text-slate-500 mb-1">Input</div>
                                        <pre className="bg-white border border-slate-200 p-2 rounded text-slate-700 overflow-x-auto">{tr.input || "(empty)"}</pre>
                                      </div>
                                    )}
                                    {tr.expected_output !== undefined && (
                                      <div>
                                        <div className="text-[9px] text-slate-500 mb-1">Expected</div>
                                        <pre className="bg-white border border-slate-200 p-2 rounded text-emerald-700 overflow-x-auto">{tr.expected_output}</pre>
                                      </div>
                                    )}
                                    <div className="col-span-2">
                                      <div className="text-[9px] text-slate-500 mb-1">Your Output</div>
                                      <pre className="bg-white border border-red-200 p-2 rounded text-red-700 overflow-x-auto">{tr.actual_output || "(no output)"}</pre>
                                    </div>
                                  </div>
                                )}
                                {!tr.passed && !tr.is_sample && (
                                  <div className="mt-1 text-slate-500 text-[10px]">Hidden test case — output not shown.</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    /* ── PROJECT TASK: existing GitHub URL / file upload flow ── */
                    <>
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
                                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">PDF, ZIP, DOCX, PNG, JPG</div>
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
                                <Input type="file" accept=".pdf,.zip,.docx,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} className="rounded-sm border-slate-200 h-11 py-2 cursor-pointer" />
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
                    </>
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button
                        onClick={handleComplete}
                        disabled={busy || (isCompleted && next_topic_locked && user?.role !== 'mentor')}
                        className={`bg-emerald-500 hover:bg-emerald-600 text-white rounded-sm h-10 px-6 font-bold uppercase tracking-wider ${(isCompleted && next_topic_locked && user?.role !== 'mentor') ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        {busy ? "..." : (next_subtopic ? "Next Subtopic" : "Finish Course")}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {isCompleted && next_topic_locked && user?.role !== 'mentor' && (
                    <TooltipContent className="bg-red-500 text-white border-none rounded-sm text-[10px] font-bold p-3 shadow-xl shadow-red-100 flex items-center gap-2 animate-in zoom-in-95">
                      <Lock className="h-3 w-3" />
                      {next_topic_lock_reason === 'mentor_locked'
                        ? "Your mentor hasn't unlocked the next topic yet"
                        : 'Complete all required subtopics in this topic first'}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )
          ) : (
            next_subtopic ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block relative">
                      <Button
                        onClick={() => navigate(`/subtopic/${next_subtopic.id}`)}
                        disabled={(!isCompleted && user?.role !== 'mentor') || (next_topic_locked && user?.role !== 'mentor') || busy}
                        className={`bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-11 px-8 text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-100 ${((!isCompleted && user?.role !== 'mentor') || (next_topic_locked && user?.role !== 'mentor') || busy) ? 'pointer-events-none opacity-50' : ''}`}
                      >
                        {busy ? "..." : "Next Subtopic"} <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {user?.role !== 'mentor' && (!isCompleted || next_topic_locked) && (
                    <TooltipContent className="bg-red-500 text-white border-none rounded-sm text-[10px] font-bold p-3 shadow-xl shadow-red-100 flex items-center gap-2 animate-in zoom-in-95">
                      <Lock className="h-3 w-3" />
                      {next_topic_locked
                        ? (next_topic_lock_reason === 'mentor_locked'
                            ? 'Your mentor hasn\'t unlocked the next topic yet'
                            : 'Complete all required subtopics in this topic first')
                        : task?.task_type === 'coding'
                          ? 'Pass all test cases to unlock next subtopic'
                          : 'Submit your assignment to proceed to next subtopic'}
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
