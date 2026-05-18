import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { Lock, CheckCircle2, Folder, ChevronDown, ChevronUp, Circle } from "lucide-react";
import StatusPill from "../components/StatusPill";
import { useAuth } from "../lib/auth";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";

export default function CourseView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [openModules, setOpenModules] = useState({});
  const [openTopics, setOpenTopics] = useState({});

  const load = async () => {
    const { data } = await api.get(`/courses/${id}`);
    setCourse(data);
    // Open all modules and topics by default
    if (data?.modules) {
      const mOpen = {};
      const tOpen = {};
      data.modules.forEach(m => {
        mOpen[m.id] = true;
        (m.topics || []).forEach(t => { tOpen[t.id] = true; });
      });
      setOpenModules(mOpen);
      setOpenTopics(tOpen);
    }
  };

  useEffect(() => {
    load();
    const channel = supabase.channel(`course_view_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courses', filter: `id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modules', filter: `course_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'topics' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtopics' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [id]);

  if (!course) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="max-w-4xl mx-auto py-16 px-6 text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  const toggleModule = (mid) => setOpenModules(p => ({ ...p, [mid]: !p[mid] }));
  const toggleTopic = (tid) => setOpenTopics(p => ({ ...p, [tid]: !p[tid] }));

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">

          {/* Header */}
          <div className="mb-8 text-center">
            <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Course</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900" data-testid="course-title">
              {course.title}
            </h1>
            {course.description && (
              <p className="mt-2 text-slate-500 text-sm max-w-2xl mx-auto">{course.description}</p>
            )}
          </div>

          {/* Syllabus title */}
          <div className="text-center text-base font-semibold text-slate-700 mb-6 border-b pb-4">
            Syllabus
          </div>

          {/* Modules */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {course.modules.map((m) => (
              <div key={m.id} data-testid={`module-card-${m.id}`}>
                {/* Module Row */}
                <button
                  onClick={() => toggleModule(m.id)}
                  className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Folder className="h-5 w-5 text-blue-500 fill-blue-100" />
                    <span className="font-semibold text-slate-800 text-sm">{m.title}</span>
                  </div>
                  {openModules[m.id]
                    ? <span className="text-slate-400 text-lg font-light">−</span>
                    : <span className="text-slate-400 text-lg font-light">+</span>
                  }
                </button>

                {/* Topics */}
                {openModules[m.id] && (
                  <div className="divide-y divide-slate-100">
                    {(m.topics || []).map((t) => (
                      <div key={t.id} className="bg-slate-50/50">
                        {/* Topic Row */}
                        <button
                          onClick={() => toggleTopic(t.id)}
                          className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-100/60 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`h-2.5 w-2.5 rounded-full ${t.unlocked === false ? 'bg-slate-300' : 'bg-blue-500'}`} />
                            <span className="font-medium text-slate-700 text-sm">{t.title}</span>
                          </div>
                          {openTopics[t.id]
                            ? <span className="text-slate-400 text-lg font-light">−</span>
                            : <span className="text-slate-400 text-lg font-light">+</span>
                          }
                        </button>

                        {/* Subtopics */}
                        {openTopics[t.id] && (
                          <div className="divide-y divide-slate-100/80">
                            {(t.subtopics || []).map((s) => {
                              const locked = user?.role === "student" && s.unlocked === false;
                              const type = s.task ? "Practice" : "Learn";
                              const typeColor = s.task ? "text-emerald-700 font-bold" : "text-blue-700 font-bold";

                              const Row = (
                                <div
                                  className={`flex items-center gap-4 px-8 py-3 ${
                                    locked
                                      ? "opacity-50 cursor-not-allowed bg-white"
                                      : "hover:bg-slate-100 cursor-pointer bg-white"
                                  } ${s.completed ? "bg-emerald-50/30" : ""}`}
                                >
                                  {/* Status icon */}
                                  <div className="shrink-0">
                                    {s.completed
                                      ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                      : locked
                                        ? <Lock className="h-4 w-4 text-slate-300" />
                                        : <div className="h-5 w-5 rounded-full border-2 border-slate-300" />
                                    }
                                  </div>

                                  {/* Type label */}
                                  <span className={`text-xs w-14 shrink-0 ${typeColor}`}>{type}</span>

                                  {/* Title */}
                                  <span className="text-sm text-slate-700 flex-1">{s.title}</span>

                                  {/* Submission status */}
                                  {s.submission && <StatusPill status={s.submission.status} />}
                                </div>
                              );

                              if (locked) return (
                                <Tooltip key={s.id}>
                                  <TooltipTrigger asChild>
                                    <div className="relative group/lock">
                                      <div className="absolute inset-0 z-10 cursor-not-allowed" />
                                      {Row}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent 
                                    side="right" 
                                    className="bg-[#FF0000] text-white border-none rounded-sm p-3 shadow-xl"
                                  >
                                    <div className="space-y-1">
                                      <div className="text-[10px] font-black tracking-[0.2em] uppercase opacity-80">Locked</div>
                                      <div className="text-[11px] font-bold">Complete the previous topic to unlock this one.</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              );

                              return (
                                <Link key={s.id} to={`/subtopic/${s.id}`} data-testid={`subtopic-row-${s.id}`}>
                                  {Row}
                                </Link>
                              );
                            })}
                            {(t.subtopics || []).length === 0 && (
                              <div className="px-8 py-3 text-xs text-slate-400 bg-white">No subtopics yet.</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {(m.topics || []).length === 0 && (
                      <div className="px-6 py-3 text-xs text-slate-400">No topics yet.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {course.modules.length === 0 && (
              <div className="px-5 py-8 text-sm text-slate-400 text-center">No content yet.</div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
