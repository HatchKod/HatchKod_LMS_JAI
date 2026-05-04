import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Button } from "../components/ui/button";
import { ArrowRight, BookOpen, ListChecks, Flame, Clock } from "lucide-react";
import StatusPill from "../components/StatusPill";

export default function StudentDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/dashboard/student");
        setData(data);
      } catch {}
    })();
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="mx-auto max-w-7xl p-6 text-sm text-slate-500" data-testid="dashboard-loading">Loading dashboard…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" data-testid="student-dashboard">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 fade-in">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-2">Student Console</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="dashboard-heading">Continue Learning</h1>
        <p className="mt-1 text-slate-600 text-sm">Pick up where you left off and keep your streak alive.</p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border">
          <Stat label="Pending Tasks" value={data.pending_count} Icon={ListChecks} />
          <Stat label="Active Courses" value={data.courses.length} Icon={BookOpen} />
          <Stat label="Momentum" value="On Track" Icon={Flame} />
        </div>

        {data.next_lesson && (() => {
          const pending = data.pending_submissions.find(s => s.lesson_id === data.next_lesson.lesson.id);
          return (
            <Card className="mt-8 rounded-sm border-border overflow-hidden" data-testid="continue-learning-card">
              <div className="grid grid-cols-1 md:grid-cols-3">
                <div className="md:col-span-2 p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Next Up</div>
                    {pending && (
                      <div className="bg-amber-50 text-[#F59E0B] border border-amber-100 px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        Under Review
                      </div>
                    )}
                  </div>
                  <div className="mt-2 font-[Outfit] text-2xl font-semibold tracking-tight" data-testid="next-lesson-title">
                    {data.next_lesson.lesson.title}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{data.next_lesson.course.title}</div>
                  <Button asChild className={`mt-6 rounded-sm ${pending ? 'bg-slate-100 text-slate-900 hover:bg-slate-200 shadow-none border border-slate-200' : 'bg-[#194BFB] hover:bg-[#0F3AE5]'}`} data-testid="continue-learning-btn">
                    <Link to={`/lesson/${data.next_lesson.lesson.id}`}>
                      {pending ? "View Submission" : "Open lesson"} <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
                <div className="border-l border-border bg-[#0A0A0A] text-white p-6 font-mono text-xs flex flex-col justify-end">
                  <div className="text-slate-400">// status</div>
                  <div className={`${pending ? 'text-amber-400' : 'text-emerald-400'} mt-1`}>
                    ▸ {pending ? 'pending_approval' : 'ready_to_build'}
                  </div>
                  <div className="text-slate-400 mt-3">// next_action</div>
                  <div className="text-[#9bb6ff] mt-1">
                    {pending ? 'wait_for_mentor()' : 'open_lesson()'}
                  </div>
                </div>
              </div>
            </Card>
          );
        })()}

        <h2 className="mt-12 text-xl sm:text-2xl font-semibold tracking-tight">My Courses</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.courses.map(({ course, progress, completed_lessons, total_lessons }) => (
            <Card key={course.id} className="rounded-sm border-border p-5" data-testid={`course-card-${course.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Course</div>
                  <div className="mt-1 font-[Outfit] text-lg font-semibold">{course.title}</div>
                  <div className="mt-1 text-sm text-slate-600 line-clamp-2">{course.description}</div>
                </div>
                <div className="font-mono text-xs text-slate-500 whitespace-nowrap">{completed_lessons}/{total_lessons}</div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Progress value={progress} className="h-1.5 rounded-sm" />
                <span className="font-mono text-xs text-slate-700">{progress}%</span>
              </div>
              <Button asChild variant="outline" className="mt-4 rounded-sm" data-testid={`open-course-${course.id}`}>
                <Link to={`/course/${course.id}`}>View Course</Link>
              </Button>
            </Card>
          ))}
          {data.courses.length === 0 && (
            <div className="text-sm text-slate-500" data-testid="no-courses">No courses available yet.</div>
          )}
        </div>

        <h2 className="mt-12 text-xl sm:text-2xl font-semibold tracking-tight">Pending Submissions</h2>
        <div className="mt-4 border border-border rounded-sm overflow-hidden">
          {data.pending_submissions.length === 0 ? (
            <div className="p-6 text-sm text-slate-500" data-testid="no-pending">All caught up. Nothing pending.</div>
          ) : (
            data.pending_submissions.map((s) => (
              <Link key={s.id} to={`/lesson/${s.lesson_id}`}
                className="flex items-center justify-between p-4 border-b last:border-b-0 border-border hover:bg-slate-50" data-testid={`pending-row-${s.id}`}>
                <div>
                  <div className="font-medium">{s.lesson?.title || "Lesson"}</div>
                  <div className="text-xs text-slate-500 font-mono">submitted {new Date(s.submitted_at).toLocaleString()}</div>
                </div>
                <StatusPill status={s.status} />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, Icon }) {
  return (
    <div className="bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-[#194BFB]" />
      </div>
      <div className="mt-2 font-[Outfit] text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
