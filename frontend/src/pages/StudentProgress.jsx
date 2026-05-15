import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import {
  BookOpen, Clock, Layers, Calendar, Trophy,
  ChevronDown, ChevronRight, CheckCircle, Circle,
  PlayCircle, ArrowRight
} from "lucide-react";

// Helper: format date as "12 May"
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Circular progress ring component
function ProgressRing({ pct }) {
  const r = 50;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#F1F5F9" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={r} fill="none"
        stroke="#194BFB" strokeWidth="10"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text x="60" y="55" textAnchor="middle" dominantBaseline="middle"
        className="font-['Outfit']" style={{ fill: "#1E293B", fontSize: "18px", fontWeight: 700 }}>
        {pct}%
      </text>
      <text x="60" y="72" textAnchor="middle" dominantBaseline="middle"
        style={{ fill: "#94A3B8", fontSize: "10px" }}>
        complete
      </text>
    </svg>
  );
}

function findNextIncomplete(modules) {
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      if (!lesson.is_completed) {
        return { lesson_id: lesson.id, lesson_title: lesson.title, module_title: mod.title };
      }
    }
  }
  return null;
}

export default function StudentProgress() {
  const { user } = useAuth();
  const { studentId: paramStudentId } = useParams();
  const [searchParams] = useSearchParams();
  const batchId = searchParams.get("batchId");
  const navigate = useNavigate();
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedModules, setExpandedModules] = useState({});

  const fetchProgress = useCallback(async () => {
    const targetId = paramStudentId || user?.id;
    if (!targetId) return;
    try {
      const url = batchId 
        ? `/students/${targetId}/progress?batchId=${batchId}` 
        : `/students/${targetId}/progress`;
      const { data } = await api.get(url);
      setProgressData(data);
      // Auto-expand current module
      if (data.current_lesson) {
        const curMod = data.modules.find(m =>
          m.lessons.some(l => l.id === data.current_lesson?.lesson_id)
        );
        if (curMod) setExpandedModules({ [curMod.id]: true });
      } else if (data.modules?.length) {
        setExpandedModules({ [data.modules[0].id]: true });
      }
    } catch {
      toast.error("Failed to load progress data");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const markComplete = async (lessonId, moduleId) => {
    // Optimistic update
    setProgressData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const mod = updated.modules.find(m => m.id === moduleId);
      if (!mod) return prev;
      const lesson = mod.lessons.find(l => l.id === lessonId);
      if (!lesson || lesson.is_completed) return prev;
      lesson.is_completed = true;
      lesson.completed_at = new Date().toISOString();
      mod.completed_lessons += 1;
      mod.completion_percentage = Math.round(mod.completed_lessons / mod.total_lessons * 100);
      updated.completed_lessons += 1;
      updated.overall_percentage = Math.round(updated.completed_lessons / updated.total_lessons * 100);
      updated.current_lesson = findNextIncomplete(updated.modules);
      return updated;
    });
    toast.success("Lesson marked complete ✓");
    try {
      await api.post(`/lessons/${lessonId}/complete`, { time_spent_minutes: 0 });
    } catch {
      toast.error("Failed to save progress. Try again.");
      fetchProgress();
    }
  };

  const markIncomplete = async (lessonId, moduleId) => {
    setProgressData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const mod = updated.modules.find(m => m.id === moduleId);
      if (!mod) return prev;
      const lesson = mod.lessons.find(l => l.id === lessonId);
      if (!lesson || !lesson.is_completed) return prev;
      lesson.is_completed = false;
      lesson.completed_at = null;
      mod.completed_lessons = Math.max(0, mod.completed_lessons - 1);
      mod.completion_percentage = Math.round(mod.completed_lessons / mod.total_lessons * 100);
      updated.completed_lessons = Math.max(0, updated.completed_lessons - 1);
      updated.overall_percentage = Math.round(updated.completed_lessons / updated.total_lessons * 100);
      updated.current_lesson = findNextIncomplete(updated.modules);
      return updated;
    });
    try {
      await api.delete(`/lessons/${lessonId}/complete`);
    } catch {
      toast.error("Failed to undo. Try again.");
      fetchProgress();
    }
  };

  const toggleModule = (modId) => {
    setExpandedModules(prev => ({ ...prev, [modId]: !prev[modId] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white font-['IBM_Plex_Sans']">
        <Navbar />
        <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading your progress…</div>
      </div>
    );
  }

  if (!progressData || !progressData.course_title) {
    return (
      <div className="min-h-screen bg-white font-['IBM_Plex_Sans']">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <BookOpen className="h-12 w-12 text-slate-200 mx-auto mb-4" />
          <h2 className="font-['Outfit'] text-xl font-semibold text-slate-700 mb-2">No Course Enrolled</h2>
          <p className="text-slate-400 text-sm mb-6">You haven't been assigned to a batch yet. Contact your mentor.</p>
          <Link to={user?.role === "mentor" || user?.role === "admin" ? "/mentor?tab=progress" : "/dashboard"} className="text-[#194BFB] text-sm hover:underline">← Back to Progress List</Link>
        </div>
      </div>
    );
  }

  const {
    course_title, batch_name, overall_percentage, total_lessons,
    completed_lessons, total_time_spent_minutes, current_lesson, modules
  } = progressData;

  const completedModules = modules.filter(m => m.completion_percentage === 100).length;
  const totalHours = Math.floor(total_time_spent_minutes / 60);
  const totalMins = total_time_spent_minutes % 60;
  const allCompletions = modules.flatMap(m => m.lessons.filter(l => l.is_completed && l.completed_at));
  const firstCompletedAt = allCompletions.length
    ? new Date(Math.min(...allCompletions.map(l => new Date(l.completed_at))))
    : null;
  const daysSince = firstCompletedAt
    ? Math.max(1, Math.round((Date.now() - firstCompletedAt) / 86400000))
    : 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-['IBM_Plex_Sans']">
      <Navbar />

      {/* Hero Section */}
      <div className="bg-white border-b border-slate-200 px-6 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-start gap-8">
            {/* Left */}
            <div className="flex-1">
              <div className="mb-4">
                <Link 
                  to={user?.role === "mentor" || user?.role === "admin" ? "/mentor?tab=progress" : "/dashboard"} 
                  className="text-[#194BFB] text-xs font-semibold hover:underline flex items-center gap-1"
                >
                  ← Back to Progress List
                </Link>
              </div>
              <h1 className="font-['Outfit'] text-xl font-semibold text-slate-800">{course_title}</h1>
              <p className="text-sm text-slate-400 mt-1">{batch_name}</p>

              <div className="mt-5">
                <p className="text-[10px] uppercase text-slate-400 mb-1 tracking-wider">
                  {paramStudentId ? "Current Lesson" : "Continue where you left off"}
                </p>
                {current_lesson ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-sm p-3 flex items-center gap-3">
                    <BookOpen className="text-[#194BFB] w-5 h-5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{current_lesson.lesson_title}</div>
                      <div className="text-xs text-slate-500 truncate">{current_lesson.module_title}</div>
                    </div>
                    {!paramStudentId && (
                      <button
                        onClick={() => navigate(`/lesson/${current_lesson.lesson_id}`)}
                        className="ml-auto bg-[#194BFB] text-white text-xs px-3 py-1.5 rounded-sm shrink-0 hover:bg-[#0F3AE5] transition-colors"
                      >
                        Continue →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-100 rounded-sm p-3 flex items-center gap-3">
                    <Trophy className="text-yellow-500 w-5 h-5" />
                    <span className="text-sm font-semibold text-slate-800">Course Complete! 🎉</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Ring */}
            <div className="flex flex-col items-center gap-2">
              <ProgressRing pct={overall_percentage} />
            </div>
          </div>

          {/* Stats Row */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-6">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <span><strong className="text-slate-800">{completed_lessons}/{total_lessons}</strong> Lessons</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>
                <strong className="text-slate-800">
                  {total_time_spent_minutes < 60 ? `${total_time_spent_minutes} min` : `${totalHours}h ${totalMins}m`}
                </strong> Spent
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Layers className="w-4 h-4 text-slate-400" />
              <span><strong className="text-slate-800">{completedModules}/{modules.length}</strong> Modules Done</span>
            </div>
            {daysSince > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span><strong className="text-slate-800">{daysSince} days</strong> Learning Streak</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Module Accordion */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-4">Course Content</p>

        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden divide-y divide-slate-100">
          {modules.map((mod) => {
            const isExpanded = !!expandedModules[mod.id];
            const isDone = mod.completion_percentage === 100;
            const barColor = isDone ? "bg-green-500" : mod.completion_percentage > 0 ? "bg-[#194BFB]" : "bg-slate-200";

            return (
              <div key={mod.id}>
                {/* Module Header */}
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="w-full flex items-center gap-3 py-3 px-4 cursor-pointer hover:bg-slate-50 transition-colors text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  }
                  <span className="text-sm font-semibold text-slate-700">{mod.title}</span>
                  <span className="text-xs text-slate-400 ml-1">{mod.completed_lessons}/{mod.total_lessons}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all`}
                        style={{ width: `${mod.completion_percentage}%` }}
                      />
                    </div>
                    {isDone && <CheckCircle className="text-green-500 w-4 h-4" />}
                  </div>
                </button>

                {/* Lessons */}
                {isExpanded && (
                  <div>
                    {mod.lessons.map((lesson) => {
                      const isCurrent = current_lesson?.lesson_id === lesson.id;
                      return (
                        <div
                          key={lesson.id}
                          className="flex items-center gap-3 py-2.5 pl-10 pr-4 border-t border-slate-50 hover:bg-slate-50 cursor-pointer group"
                          onClick={() => navigate(`/lesson/${lesson.id}`)}
                        >
                          {/* Status icon */}
                          {lesson.is_completed
                            ? <CheckCircle className="text-green-500 w-4 h-4 shrink-0" />
                            : isCurrent
                              ? <PlayCircle className="text-[#194BFB] w-4 h-4 shrink-0 animate-pulse" />
                              : <Circle className="text-slate-300 w-4 h-4 shrink-0" />
                          }

                          {/* Title */}
                          <span className={`text-sm truncate flex-1 ${
                            lesson.is_completed ? "text-slate-500"
                              : isCurrent ? "text-[#194BFB] font-medium"
                              : "text-slate-700"
                          }`}>
                            {lesson.title}
                          </span>

                          {/* Right side */}
                          <div
                            className="ml-auto flex items-center gap-2"
                            onClick={e => e.stopPropagation()}
                          >
                            {lesson.is_completed && (
                              <>
                                <span className="text-xs text-slate-300">{fmtDate(lesson.completed_at)}</span>
                                {lesson.time_spent_minutes > 0 && (
                                  <span className="text-xs text-slate-300">{lesson.time_spent_minutes}m</span>
                                )}
                                {!paramStudentId && (
                                  <button
                                    onClick={() => markIncomplete(lesson.id, mod.id)}
                                    className="text-xs text-slate-300 hover:text-red-400 transition-colors ml-1"
                                  >
                                    Undo
                                  </button>
                                )}
                              </>
                            )}
                            {!lesson.is_completed && isCurrent && !paramStudentId && (
                              <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-sm">Continue</span>
                            )}
                            {!lesson.is_completed && !paramStudentId && (
                              <button
                                onClick={() => markComplete(lesson.id, mod.id)}
                                className="text-xs text-slate-400 hover:text-green-600 transition-colors"
                              >
                                Mark done
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
