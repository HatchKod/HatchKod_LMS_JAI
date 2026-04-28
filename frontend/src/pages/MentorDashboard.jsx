import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import StatusPill from "../components/StatusPill";
import { Github, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function MentorDashboard() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [active, setActive] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, p] = await Promise.all([api.get("/dashboard/mentor"), api.get("/submissions/pending")]);
    setStats(s.data); setPending(p.data);
  };
  useEffect(() => { load(); }, []);

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
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-2">Mentor Console</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Review Queue</h1>

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
                  <button key={s.id} onClick={() => { setActive(s); setFeedback(""); }}
                    className={`w-full text-left p-3 border-b last:border-b-0 border-border hover:bg-slate-50 ${active?.id === s.id ? "bg-slate-50 border-l-2 border-l-[#194BFB]" : ""}`}
                    data-testid={`mentor-pending-row-${s.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm truncate">{s.lesson?.title || "Lesson"}</div>
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
              <Card className="rounded-sm border-border" data-testid="mentor-review-panel">
                <div className="p-5 border-b border-border bg-[#F4F5F7]">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Reviewing</div>
                  <div className="font-[Outfit] text-xl font-semibold">{active.lesson?.title}</div>
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
            ) : (
              <div className="border border-dashed border-border rounded-sm p-10 text-center text-sm text-slate-500" data-testid="mentor-empty-state">
                Select a submission from the left to start reviewing.
              </div>
            )}
          </section>
        </div>
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
