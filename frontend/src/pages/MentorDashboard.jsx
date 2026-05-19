import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { useAuth } from "../lib/auth";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import StatusPill from "../components/StatusPill";
import { 
  Github, 
  ExternalLink, 
  MessageSquare, 
  Video, 
  PlayCircle,
  Users,
  LayoutDashboard,
  ChevronDown,
  KeyRound,
  HelpCircle,
  Mail,
  Code2,
  Trophy,
  LogOut
} from "lucide-react";
import { toast } from "sonner";
import LiveClassManagement from "../components/LiveClassManagement";
import MentorRecordings from "../components/mentor/MentorRecordings";
// import MentorAttendance from "../components/mentor/MentorAttendance";
import MentorProgress from "../components/mentor/MentorProgress";
import { BarChart2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export default function MentorDashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [active, setActive] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "reviews");
  const [batches, setBatches] = useState([]);

  const load = async () => {
    const [s, p] = await Promise.all([api.get("/dashboard/mentor"), api.get("/submissions/pending")]);
    setStats(s.data); setPending(p.data);
  };
  useEffect(() => {
    load();
    api.get("/batches/mentor").then(r => setBatches(r.data || [])).catch(() => {});
  }, []);

  const selectSubmission = async (s) => {
    setActive({ id: s.id, isLoading: true, topic: s.topic, student: s.student });
    setFeedback("");
    try {
      const res = await api.get(`/submissions/${s.id}`);
      setActive(res.data);
    } catch (e) {
      setActive(null);
      toast.error("Failed to load submission details");
    }
  };

  const review = async (status) => {
    if (!active) return;
    setBusy(true);
    try {
      await api.post(`/submissions/${active.id}/review`, { status, feedback });
      toast.success(status === "approved" ? "Approved" : "Sent back for rework");
      setActive(null); setFeedback("");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-white" data-testid="mentor-dashboard">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 fade-in">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-2">Mentor Console</div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Management</h1>
          </div>
          <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-sm border border-slate-200">
            <button onClick={() => setActiveTab("reviews")} className={`px-4 py-1.5 text-xs font-bold rounded transition-all flex items-center gap-2 ${activeTab === 'reviews' ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
              <MessageSquare className="h-3 w-3" /> Review Queue
            </button>
            <button onClick={() => setActiveTab("live")} className={`px-4 py-1.5 text-xs font-bold rounded transition-all flex items-center gap-2 ${activeTab === 'live' ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
              <Video className="h-3 w-3" /> Live Classes
            </button>
            <button onClick={() => setActiveTab("recordings")} className={`px-4 py-1.5 text-xs font-bold rounded transition-all flex items-center gap-2 ${activeTab === 'recordings' ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
              <PlayCircle className="h-3 w-3" /> Recordings
            </button>
            <button onClick={() => setActiveTab("progress")} className={`px-4 py-1.5 text-xs font-bold rounded transition-all flex items-center gap-2 ${activeTab === 'progress' ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
              <BarChart2 className="h-3 w-3" /> Progress
            </button>
          </div>
        </div>

        {activeTab === "reviews" ? (
          <>
            {stats && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border">
                <StatBox label="Pending Reviews" value={stats.pending_reviews} accent="text-amber-600" />
                <StatBox label="Approved Total" value={stats.approved_total} accent="text-emerald-600" />
                <StatBox label="Students Assigned" value={stats.students_assigned} accent="text-[#194BFB]" />
              </div>
            )}

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
              <aside className="lg:col-span-4">
                <div className="border border-border rounded-sm">
                  <div className="border-b border-border p-3 bg-[#F4F5F7] text-[10px] uppercase tracking-[0.22em] text-slate-500">
                    Pending Submissions ({pending.length})
                  </div>
                  <div className="max-h-[60vh] overflow-auto">
                    {pending.length === 0 && (
                      <div className="p-6 text-sm text-slate-500" data-testid="mentor-no-pending">No pending submissions.</div>
                    )}
                    {pending.map((s) => (
                      <button key={s.id} onClick={() => selectSubmission(s)}
                        className={`w-full text-left p-3 border-b last:border-b-0 border-border hover:bg-slate-50 ${active?.id === s.id ? "bg-slate-50 border-l-2 border-l-[#194BFB]" : ""}`}
                        data-testid={`mentor-pending-row-${s.id}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm truncate">{s.topic?.title || "Topic"}</div>
                          <StatusPill status={s.status} />
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{s.student?.name || "Student"}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{new Date(s.submitted_at).toLocaleString()}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              <section className="lg:col-span-8">
                {active ? (
                  active.isLoading ? (
                    <div className="border border-dashed border-border rounded-sm p-20 text-center text-sm text-slate-500 bg-slate-50/50">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#194BFB] mx-auto mb-4" />
                      <div className="font-semibold text-slate-700">Loading submission details...</div>
                      <div className="text-xs text-slate-400 mt-1">Fetching student's implementation & task context</div>
                    </div>
                  ) : (
                    <Card className="rounded-sm border-border" data-testid="mentor-review-panel">
                      <div className="p-5 border-b border-border bg-[#F4F5F7]">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Reviewing</div>
                        <div className="font-[Outfit] text-xl font-semibold">{active.topic?.title}</div>
                        <div className="text-sm text-slate-600 mt-1">{active.student?.name} ({active.student?.email})</div>
                      </div>
                      <div className="p-5 space-y-4">
                        {active.task && (
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-1">Task</div>
                            <div className="text-sm">{active.task.description}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-1">Submission</div>
                          {active.submission_url && (
                            <a href={active.submission_url} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-2 font-mono text-sm text-[#194BFB] hover:underline" data-testid="mentor-submission-link">
                              <Github className="h-4 w-4" /> {active.submission_url}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {active.submission_text && (
                            <pre className="mt-2 font-mono text-xs whitespace-pre-wrap bg-[#F4F5F7] border border-border rounded-sm p-3">{active.submission_text}</pre>
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-1">Feedback</div>
                          <Textarea rows={5} value={feedback} onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Write feedback for the student" className="rounded-sm" data-testid="mentor-feedback-input" />
                        </div>
                        <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
                          <Button onClick={() => review("approved")} disabled={busy}
                            className="rounded-sm bg-emerald-600 hover:bg-emerald-700" data-testid="mentor-approve-btn">
                            Approve & Unlock
                          </Button>
                          <Button onClick={() => review("rework")} disabled={busy} variant="outline"
                            className="rounded-sm border-orange-500 text-orange-700 hover:bg-orange-50" data-testid="mentor-rework-btn">
                            Request Rework
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                ) : (
                  <div className="border border-dashed border-border rounded-sm p-10 text-center text-sm text-slate-500" data-testid="mentor-empty-state">
                    Select a submission from the left to start reviewing.
                  </div>
                )}
              </section>
            </div>
          </>
        ) : activeTab === "live" ? (
          <div className="mt-8">
            {user && <LiveClassManagement role="mentor" userId={user.id} />}
          </div>
        ) : activeTab === "recordings" ? (
          <div className="mt-8">
            <MentorRecordings />
          </div>
        ) : (
          <div className="mt-8">
            <MentorProgress batches={batches} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }) {
  return (
    <div className="bg-white p-5">
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className={`mt-2 font-[Outfit] text-3xl font-semibold tracking-tight ${accent || ""}`}>{value}</div>
    </div>
  );
}
