import { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { BookOpen, Video, ArrowLeft, Github, FileUp, Link2, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Clock, Trash2, Edit3, RefreshCcw, Check, Lock } from "lucide-react";
import StatusPill from "../components/StatusPill";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";

export default function LessonView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "content";
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

  const load = async () => {
    setError("");
    try {
      const res = await api.get(`/lessons/${id}`);
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
      setError(formatApiError(e.response?.data?.detail) || "Failed to load lesson");
    }
  };

  useEffect(() => {
    load();
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
      await api.post(`/lessons/${id}/submit`, { submission_url: finalUrl, submission_text: text });
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
    setBusy(true);
    try {
      await api.post(`/lessons/${id}/complete`);
      if (next_lesson) {
        navigate(`/lesson/${next_lesson.id}`);
      } else {
        navigate(`/course/${course.id}`);
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to complete lesson");
    } finally {
      setBusy(false);
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

  if (!data) return <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center text-slate-500">Loading lesson...</div>;

  const { lesson, course, module, task, submission, prev_lesson, next_lesson, lesson_index, total_lessons } = data;
  const contentBlocks = lesson.content ? lesson.content.split(/\n---\n/).filter(b => b.trim()) : [];
  const isStudent = user?.role === "student";
  const canResubmit = !submission || submission.status === "rework" || isEditing;

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
    if (!content) return <p className="italic text-slate-500">No content for this lesson yet.</p>;

    return content.split("\n\n").map((block, i) => {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) return null;

      // Code block
      if (trimmedBlock.startsWith("```")) {
        const code = trimmedBlock.replace(/```/g, "").trim();
        return (
          <pre key={i} className="bg-[#0A0A0A] text-[#10B981] p-4 rounded-sm font-mono text-sm overflow-x-auto my-6 border border-white/10">
            {code}
          </pre>
        );
      }

      // Headings
      if (trimmedBlock.startsWith("# ")) return <h2 key={i} className="text-2xl font-bold mt-8 mb-4 text-[#0A0A0A]">{trimmedBlock.slice(2)}</h2>;
      if (trimmedBlock.startsWith("## ")) return <h3 key={i} className="text-xl font-semibold mt-6 mb-3 text-[#0A0A0A]">{trimmedBlock.slice(3)}</h3>;
      if (trimmedBlock.startsWith("### ")) return <h4 key={i} className="text-lg font-semibold mt-5 mb-2 text-[#0A0A0A]">{trimmedBlock.slice(4)}</h4>;

      // Lists
      const lines = trimmedBlock.split("\n");
      if (lines.every(line => line.trim().startsWith("- ") || line.trim().startsWith("* "))) {
        return (
          <ul key={i} className="list-disc ml-6 my-4 space-y-2">
            {lines.map((line, li) => <li key={li} className="text-slate-700">{line.trim().slice(2)}</li>)}
          </ul>
        );
      }
      if (lines.every(line => /^\d+\.\s/.test(line.trim()))) {
        return (
          <ol key={i} className="list-decimal ml-6 my-4 space-y-2">
            {lines.map((line, li) => <li key={li} className="text-slate-700">{line.trim().replace(/^\d+\.\s/, "")}</li>)}
          </ol>
        );
      }

      // Default paragraph
      return <p key={i} className="leading-relaxed mb-4 text-slate-700">{trimmedBlock}</p>;
    });
  };

  return (
    <div className="min-h-screen bg-white font-['IBM_Plex_Sans']">
      {/* Custom Sticky Top Bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-border h-14 flex items-center px-4 justify-between">
        <div className="flex items-center gap-6 overflow-hidden mr-4">
          <Link to={user ? (user.role === 'admin' ? '/admin' : user.role === 'mentor' ? '/mentor' : '/dashboard') : "/"} className="flex items-center gap-2 shrink-0">
            <img src="/logo.png" alt="HatchKod" className="h-7 w-auto object-contain" />
            <span className="font-[Outfit] text-base font-extrabold tracking-tight text-[#0A0A0A]">HatchKod</span>
          </Link>

          <div className="h-6 w-[1px] bg-slate-200 shrink-0" />

          <nav className="hidden md:flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
            <Sheet>
              <SheetTrigger asChild>
                <button className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-sm text-slate-600 hover:text-[#194BFB] hover:border-[#194BFB] transition-all whitespace-nowrap group">
                  <BookOpen className="h-3.5 w-3.5 text-[#194BFB]" />
                  <span className="font-bold">Module {lesson_index || 1}: {module?.title}</span>
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
                        <div className="space-y-2 ml-9">
                          {m.lessons?.map((l) => {
                            const isCurrent = l.id === id;
                            const isCompleted = l.completed;
                            const isLocked = !l.unlocked && user?.role === 'student';
                            return (
                              <Link 
                                key={l.id} 
                                to={isLocked ? '#' : `/lesson/${l.id}`}
                                className={`flex items-center justify-between p-3 rounded-sm border transition-all ${isCurrent ? 'bg-[#194BFB]/5 border-[#194BFB] ring-1 ring-[#194BFB]/10' : (isLocked ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-[#194BFB] hover:shadow-sm')}`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 border ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-200'}`}>
                                    {isCompleted ? <Check className="h-3 w-3 stroke-[3]" /> : (isLocked ? <Lock className="h-2.5 w-2.5 text-slate-400" /> : <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />)}
                                  </div>
                                  <span className={`text-sm font-bold truncate ${isCurrent ? 'text-[#194BFB]' : (isLocked ? 'text-slate-400' : 'text-slate-700')}`}>{l.title}</span>
                                </div>
                                {isCurrent && <div className="h-1.5 w-1.5 rounded-full bg-[#194BFB] animate-pulse" />}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-sm shadow-sm">
              <FileText className="h-3.5 w-3.5 text-[#F59E0B]" />
              <span className="font-bold text-slate-900">{lesson.title}</span>
            </div>
          </nav>

          {/* Mobile Breadcrumb (Simplified) */}
          <Link to={`/course/${course?.id}`} className="md:hidden flex items-center gap-2 text-slate-600 font-bold text-[10px] uppercase tracking-wider bg-slate-100 px-3 py-1.5 rounded-sm">
            <ArrowLeft className="h-3.5 w-3.5" /> Syllabus
          </Link>
        </div>
        
        <div className="flex items-center gap-3">
          {lesson.video_url && (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[#10B981] hover:bg-[#0D9668] text-white rounded-sm h-8 px-3 font-bold text-[10px] uppercase tracking-widest gap-2 shrink-0">
                  <div className="h-4 w-4 rounded-full bg-white/20 flex items-center justify-center">
                    <Video className="h-2.5 w-2.5" />
                  </div>
                  Recordings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-none rounded-sm">
                <DialogHeader className="p-4 bg-white border-b border-border text-left">
                  <DialogTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
                    <Video className="h-4 w-4 text-[#10B981]" />
                    Session Recording — {lesson.title}
                  </DialogTitle>
                </DialogHeader>
                <div className="aspect-video w-full">
                  <iframe
                    src={getEmbedUrl(lesson.video_url)}
                    title={lesson.title}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}


          <div className="h-8 w-8 rounded-full bg-[#F4F5F7] border border-border flex items-center justify-center overflow-hidden">
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] font-bold text-slate-400">{user?.name?.charAt(0) || "U"}</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto py-8 px-6 min-h-[calc(100vh-120px)] flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 text-[#194BFB] px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 border border-blue-100">
                <BookOpen className="h-3 w-3" />
                {mode === 'task' ? 'Homework' : 'Lesson'}
              </div>
              {submission?.status === 'approved' && (
                <div className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider">
                  Completed
                </div>
              )}
            </div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#0A0A0A] font-['Outfit'] mb-8">
            {lesson.title}
          </h1>

        {mode === 'content' ? (
          <div className="prose prose-slate prose-lg max-w-4xl mx-auto pb-48">
            {renderContent(contentBlocks[currentPage])}
          </div>
        ) : (
          /* Task Mode */
          task && (
            <div className="border border-border rounded-sm overflow-hidden bg-white shadow-sm max-w-4xl mx-auto w-full">
              <div className="bg-[#F8FAFC] border-b border-border p-5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.2em] mb-1">Task</div>
                  <h3 className="font-['Outfit'] font-extrabold text-xl text-[#0A0A0A]">{task.description}</h3>
                </div>
                {submission && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border ${submission.status === 'rework' ? 'border-orange-200 bg-orange-50 text-orange-600' : (submission.status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-amber-200 bg-amber-50 text-[#F59E0B]')} text-[10px] font-bold uppercase tracking-widest shadow-sm`}>
                    {submission.status === 'rework' ? <RefreshCcw className="h-3 w-3" /> : (submission.status === 'approved' ? <ClipboardCheck className="h-3 w-3" /> : <Clock className="h-3 w-3" />)}
                    {submission.status}
                  </div>
                )}
              </div>
              
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
                  
                  {submission && !isEditing ? (
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
                              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="h-8 text-slate-600 hover:text-[#194BFB] hover:bg-[#194BFB]/5">
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
                          {isEditing && (
                            <Button variant="ghost" onClick={() => setIsEditing(false)} className="rounded-sm h-11 font-bold text-slate-500">
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
          )
        )}
      </main>

      {/* Sticky Navigation Footer */}
      <footer className="sticky bottom-0 bg-white border-t border-border p-4 flex items-center justify-between mt-auto">
        <div className="w-1/3">
          {mode === 'task' ? (
            <Button asChild variant="outline" className="rounded-sm border-slate-200 hover:border-[#194BFB] hover:text-[#194BFB] group transition-all h-10">
              <Link to={`/lesson/${id}?mode=content`}>
                <ChevronLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" />
                <span className="hidden sm:inline">Back to Content</span>
              </Link>
            </Button>
          ) : prev_lesson ? (
            <Button asChild variant="outline" className="rounded-sm border-slate-200 hover:border-[#194BFB] hover:text-[#194BFB] group transition-all h-10">
              <Link to={`/lesson/${prev_lesson.id}`}>
                <ChevronLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" />
                <span className="hidden sm:inline">Previous Lesson</span>
              </Link>
            </Button>
          ) : <div />}
        </div>

        <div className="w-1/3 text-center">
          {mode === 'content' && total_lessons > 0 && (
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
              Page {currentPage + 1} / {contentBlocks.length}
            </span>
          )}
          {mode === 'task' && (
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
              Lesson {lesson_index} / {total_lessons}
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
                <Link to={`/lesson/${id}?mode=task`}>
                  Go to Task
                  <ClipboardCheck className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={busy} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-sm h-10 px-6 font-bold uppercase tracking-wider">
                {busy ? "..." : (next_lesson ? "Next Lesson" : "Finish Course")}
              </Button>
            )
          ) : (
            next_lesson ? (
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button asChild className={`rounded-sm h-10 px-6 font-bold uppercase tracking-wider ${submission?.status === 'approved' ? 'bg-[#194BFB] hover:bg-[#0F3AE5] text-white shadow-lg shadow-blue-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200 pointer-events-none'}`}>
                        <Link to={submission?.status === 'approved' ? `/lesson/${next_lesson.id}` : '#'}>
                          Next Lesson
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {submission?.status !== 'approved' && (
                    <TooltipContent side="top" className="bg-slate-900 text-white border-none text-[10px] font-bold uppercase tracking-widest px-3 py-2">
                      Complete & Get Approval first
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
