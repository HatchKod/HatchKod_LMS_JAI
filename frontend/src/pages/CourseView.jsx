import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Lock, CheckCircle2, PlayCircle } from "lucide-react";
import StatusPill from "../components/StatusPill";
import { useAuth } from "../lib/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { toast } from "sonner";

export default function CourseView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await api.get(`/courses/${id}`);
      setCourse(data);
    })();
  }, [id]);

  if (!course) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="mx-auto max-w-7xl p-6 text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 fade-in">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-2">Course</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="course-title">{course.title}</h1>
        <p className="mt-2 text-slate-600 max-w-2xl">{course.description}</p>

        <div className="mt-8 space-y-6">
          {course.modules.map((m, mi) => (
            <Card key={m.id} className="rounded-sm border-border" data-testid={`module-card-${m.id}`}>
              <div className="border-b border-border p-4 bg-[#F4F5F7] flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Module {mi + 1}</div>
                  <div className="font-[Outfit] text-lg font-semibold">{m.title}</div>
                </div>
                <div className="font-mono text-xs text-slate-500">{m.lessons.length} lessons</div>
              </div>
              <div>
                {m.lessons.map((l, li) => {
                  const locked = user?.role === "student" && !l.unlocked;
                  return (
                    <LessonRow key={l.id} lesson={l} li={li} locked={locked} />
                  );
                })}
              </div>
            </Card>
          ))}
          {course.modules.length === 0 && (
            <div className="text-sm text-slate-500">No modules yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonRow({ lesson, li, locked }) {
  const Inner = (
    <div 
      onClick={() => locked && toast.error("Complete the previous lesson to unlock this one")}
      className={`flex items-center justify-between gap-4 p-4 border-b last:border-b-0 border-border ${locked ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50 cursor-pointer"}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid h-7 w-7 place-items-center bg-[#F4F5F7] border border-border font-mono text-xs">
          {li + 1}
        </span>
        <div className="min-w-0">
          <div className="font-medium truncate">{lesson.title}</div>
          <div className="text-xs text-slate-500 truncate">
            {lesson.task ? "Has task" : "No task"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {lesson.submission && <StatusPill status={lesson.submission.status} />}
        {lesson.completed && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {locked ? <Lock className="h-4 w-4 text-slate-400" /> : <PlayCircle className="h-4 w-4 text-[#194BFB]" />}
      </div>
    </div>
  );
  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div data-testid={`lesson-row-locked-${lesson.id}`}>{Inner}</div>
        </TooltipTrigger>
        <TooltipContent side="right">
          Complete previous task to unlock
        </TooltipContent>
      </Tooltip>
    );
  }
  return <Link to={`/lesson/${lesson.id}`} data-testid={`lesson-row-${lesson.id}`}>{Inner}</Link>;
}
