import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { ArrowLeft, Github, FileUp, Link2 } from "lucide-react";
import StatusPill from "../components/StatusPill";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

export default function LessonView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
        // Auto-detect submission type
        if (sUrl.includes("/storage/v1/object/public/submissions/")) {
          setSubmissionType("file");
        } else {
          setSubmissionType("link");
        }
      }
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || "Failed to load lesson");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

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
      if (!file && !submission) { setSubmissionError("Please select a file"); return; }
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
      await api.delete(`/submissions/${submission.id}`);
      toast.success("Submission deleted");
      setIsEditing(false);
      setUrl("");
      setText("");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    } finally { setBusy(false); }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="mx-auto max-w-3xl p-6">
          <div className="border border-border rounded-sm p-6" data-testid="lesson-error">
            <div className="text-sm text-red-600">{error}</div>
            <Button asChild variant="outline" className="rounded-sm mt-4">
              <Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="mx-auto max-w-7xl p-6 text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { lesson, course, task, submission } = data;
  const isStudent = user?.role === "student";
  const canResubmit = !submission || submission.status === "rework" || isEditing;

  const getEmbedUrl = (url) => {
    if (!url) return url;
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes("youtube.com") && urlObj.searchParams.has("v")) {
        return `https://www.youtube.com/embed/${urlObj.searchParams.get("v")}`;
      }
      if (urlObj.hostname === "youtu.be") {
        return `https://www.youtube.com/embed${urlObj.pathname}`;
      }
      return url;
    } catch {
      return url;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 fade-in">
        <Link to={`/course/${course?.id}`} className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center" data-testid="back-to-course">
          <ArrowLeft className="mr-1 h-3 w-3" />Back to {course?.title}
        </Link>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight" data-testid="lesson-title">{lesson.title}</h1>

        <Card className="mt-6 rounded-sm border-border overflow-hidden">
          {lesson.video_url ? (
            <div className="aspect-video w-full bg-black">
              <iframe
                src={getEmbedUrl(lesson.video_url)}
                title={lesson.title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
                data-testid="lesson-video"
              />
            </div>
          ) : null}
          <div className="p-6">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Lesson Notes</div>
            <p className="mt-2 text-slate-700 whitespace-pre-wrap">{lesson.content}</p>
          </div>
        </Card>

        {task && (
          <Card className="mt-6 rounded-sm border-border" data-testid="task-card">
            <div className="border-b border-border p-5 bg-[#F4F5F7] flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Task</div>
                <div className="font-[Outfit] text-lg font-semibold">{task.description}</div>
              </div>
              {submission && <StatusPill status={submission.status} />}
            </div>
            <div className="p-5 space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-1">Instructions</div>
                <pre className="font-mono text-xs whitespace-pre-wrap text-slate-700 bg-[#F4F5F7] border border-border rounded-sm p-3">{task.instructions}</pre>
              </div>
              {task.expected_output && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-1">Expected output</div>
                  <pre className="font-mono text-xs whitespace-pre-wrap text-slate-700 bg-[#0A0A0A] text-white rounded-sm p-3">{task.expected_output}</pre>
                </div>
              )}

              {submission?.feedback && (
                <div className="border border-orange-300 bg-orange-50 rounded-sm p-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-orange-700 mb-1">Mentor Feedback</div>
                  <div className="text-sm text-orange-900 whitespace-pre-wrap" data-testid="mentor-feedback">{submission.feedback}</div>
                </div>
              )}

              {submission && (
                <div className="bg-[#F8FAFC] border border-border rounded-sm p-4">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-3">Your Current Submission</div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-sm bg-white border border-border flex items-center justify-center shrink-0">
                        {submission.submission_url.includes("/storage/v1/object/public/submissions/") ? (
                          <FileUp className="h-4 w-4 text-[#194BFB]" />
                        ) : (
                          <Github className="h-4 w-4 text-[#194BFB]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500 mb-0.5">{submission.submission_url.includes("/storage/v1/object/public/submissions/") ? "Uploaded File" : "GitHub Repository"}</div>
                        <a href={submission.submission_url} target="_blank" rel="noreferrer" 
                          className="text-sm font-semibold text-[#194BFB] hover:underline truncate block">
                          {submission.submission_url.split('/').pop()}
                        </a>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusPill status={submission.status} />
                      <div className="text-[10px] text-slate-400 mt-1 font-mono uppercase">
                        {new Date(submission.submitted_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isStudent && (
                <form onSubmit={submit} className="space-y-4 border-t border-border pt-4" data-testid="submission-form">
                  <div className="flex gap-2 mb-2">
                    <Button type="button" variant={submissionType === "link" ? "default" : "outline"} size="sm" 
                      className="rounded-sm text-[10px] h-7 px-3 uppercase tracking-wider" 
                      onClick={() => { 
                        setSubmissionType("link"); 
                        setSubmissionError(""); 
                        if (url.includes("/storage/v1/object/public/submissions/")) setUrl("");
                      }}>
                      <Link2 className="mr-1.5 h-3 w-3" /> GitHub Link
                    </Button>
                    <Button type="button" variant={submissionType === "file" ? "default" : "outline"} size="sm"
                      className="rounded-sm text-[10px] h-7 px-3 uppercase tracking-wider" 
                      onClick={() => { 
                        setSubmissionType("file"); 
                        setSubmissionError(""); 
                        if (url && !url.includes("/storage/v1/object/public/submissions/")) setUrl("");
                      }}>
                      <FileUp className="mr-1.5 h-3 w-3" /> File Upload
                    </Button>
                  </div>

                  {submissionType === "link" ? (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider flex items-center gap-1.5 text-slate-500">
                        <Github className="h-3 w-3" /> GitHub URL <span className="text-red-500">*</span>
                      </Label>
                      <Input value={url} onChange={(e) => { setUrl(e.target.value); setSubmissionError(""); }} placeholder="https://github.com/you/repo"
                        className="rounded-sm font-mono text-sm" disabled={!canResubmit} data-testid="submission-url-input" />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider flex items-center gap-1.5 text-slate-500">
                        <FileUp className="h-3 w-3" /> PDF or ZIP File <span className="text-red-500">*</span>
                      </Label>
                      <Input type="file" onChange={handleFileChange} accept=".pdf,.zip"
                        className="rounded-sm text-sm file:mr-4 file:py-1 file:px-3 file:rounded-sm file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" 
                        disabled={!canResubmit} data-testid="submission-file-input" />
                    </div>
                  )}
                  {submissionError && <div className="text-[11px] text-red-600 mt-1" data-testid="submission-error-msg">{submissionError}</div>}
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider">Notes (optional)</Label>
                    <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
                      placeholder="Anything the mentor should know" className="rounded-sm" disabled={!canResubmit} data-testid="submission-text-input" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={busy || !canResubmit}
                      className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="submission-submit-btn">
                      {busy ? "Submitting…" : (submission?.status === "rework" || isEditing ? "Save & Resubmit" : "Submit for review")}
                    </Button>
                    {!canResubmit && submission?.status === "pending" && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">Awaiting mentor review</span>
                        <div className="flex items-center gap-1 border-l border-border pl-3">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="text-xs h-7 px-2">
                            Edit
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={handleDelete} className="text-xs h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                    {submission?.status === "approved" && (
                      <span className="text-xs text-emerald-700">Approved. Next lesson unlocked.</span>
                    )}
                  </div>
                </form>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
