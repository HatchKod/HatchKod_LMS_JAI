import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import {
  BookOpen, Clock, Layers, Calendar, Trophy,
  ChevronDown, ChevronRight, CheckCircle, Circle,
  PlayCircle, ArrowRight, Lock
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import PaymentWall from "../components/PaymentWall";

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
    for (const topic of mod.topics) {
      for (const sub of (topic.subtopics || [])) {
        if (!sub.is_completed) {
          return { topic_id: sub.id, topic_title: sub.title, module_title: mod.title };
        }
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
  const [expandedTopics, setExpandedTopics] = useState({});
  const [paymentStatus, setPaymentStatus] = useState(null);

  useEffect(() => {
    if (user?.role !== "student" || paramStudentId) return;
    (async () => {
      try {
        const { data } = await api.get("/payment/status");
        setPaymentStatus(data);
      } catch (err) {
        if (err.response?.status === 403 && err.response?.data?.detail?.code === "ACCESS_EXPIRED") {
          setPaymentStatus({ effective_tier: "expired" });
        }
      }
    })();
  }, [user?.access_tier, user?.role, paramStudentId]);

  const fetchProgress = useCallback(async () => {
    const targetId = paramStudentId || user?.id;
    if (!targetId) return;
    try {
      const url = batchId 
        ? `/students/${targetId}/progress?batchId=${batchId}` 
        : `/students/${targetId}/progress`;
      const { data } = await api.get(url);
      setProgressData(data);
      // Auto-expand current module and topic
      if (data.current_topic) {
        let curMod = null;
        let curTopic = null;
        for (const m of data.modules) {
          for (const t of m.topics) {
            if (t.subtopics?.some(s => s.id === data.current_topic?.topic_id)) {
              curMod = m;
              curTopic = t;
              break;
            }
          }
          if (curMod) break;
        }
        if (curMod) {
          setExpandedModules({ [curMod.id]: true });
          if (curTopic) {
            setExpandedTopics({ [curTopic.id]: true });
          }
        }
      } else if (data.modules?.length) {
        setExpandedModules({ [data.modules[0].id]: true });
        if (data.modules[0].topics?.length) {
          setExpandedTopics({ [data.modules[0].topics[0].id]: true });
        }
      }
    } catch {
      toast.error("Failed to load progress data");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  const markComplete = async (subtopicId, moduleId) => {
    // Optimistic update
    setProgressData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const mod = updated.modules.find(m => m.id === moduleId);
      if (!mod) return prev;
      
      let foundSubtopic = null;
      for (const topic of mod.topics) {
        const sub = topic.subtopics?.find(s => s.id === subtopicId);
        if (sub) {
          foundSubtopic = sub;
          break;
        }
      }
      
      if (!foundSubtopic || foundSubtopic.is_completed) return prev;
      foundSubtopic.is_completed = true;
      foundSubtopic.completed_at = new Date().toISOString();
      
      mod.completed_topics += 1;
      mod.completion_percentage = Math.round(mod.completed_topics / mod.total_topics * 100);
      updated.completed_topics += 1;
      updated.overall_percentage = Math.round(updated.completed_topics / updated.total_topics * 100);
      updated.current_topic = findNextIncomplete(updated.modules);
      return updated;
    });
    toast.success("Subtopic marked complete ✓");
    try {
      await api.post(`/subtopics/${subtopicId}/complete`, { time_spent_minutes: 0 });
    } catch {
      toast.error("Failed to save progress. Try again.");
      fetchProgress();
    }
  };

  const markIncomplete = async (subtopicId, moduleId) => {
    setProgressData(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const mod = updated.modules.find(m => m.id === moduleId);
      if (!mod) return prev;
      
      let foundSubtopic = null;
      for (const topic of mod.topics) {
        const sub = topic.subtopics?.find(s => s.id === subtopicId);
        if (sub) {
          foundSubtopic = sub;
          break;
        }
      }
      
      if (!foundSubtopic || !foundSubtopic.is_completed) return prev;
      foundSubtopic.is_completed = false;
      foundSubtopic.completed_at = null;
      
      mod.completed_topics = Math.max(0, mod.completed_topics - 1);
      mod.completion_percentage = Math.round(mod.completed_topics / mod.total_topics * 100);
      updated.completed_topics = Math.max(0, updated.completed_topics - 1);
      updated.overall_percentage = Math.round(updated.completed_topics / updated.total_topics * 100);
      updated.current_topic = findNextIncomplete(updated.modules);
      return updated;
    });
    try {
      await api.delete(`/subtopics/${subtopicId}/complete`);
    } catch {
      toast.error("Failed to undo. Try again.");
      fetchProgress();
    }
  };

  const toggleModule = (modId) => {
    setExpandedModules(prev => ({ ...prev, [modId]: !prev[modId] }));
  };

  const toggleTopic = (topicId) => {
    setExpandedTopics(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  if (user?.role === "student" && (paymentStatus?.effective_tier === "expired" || user?.access_tier === "expired")) {
    return <PaymentWall />;
  }

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
    course_title, batch_name, overall_percentage, total_topics,
    completed_topics, total_subtopics, completed_subtopics, total_time_spent_minutes, current_topic, current_subtopic, modules
  } = progressData;

  const displayCompleted = completed_topics ?? completed_subtopics ?? 0;
  const displayTotal = total_topics ?? total_subtopics ?? 0;

  const displayCurrentTopic = current_topic ?? (current_subtopic ? {
    topic_title: current_subtopic.subtopic_title || current_subtopic.topic_title,
    module_title: current_subtopic.module_title
  } : null);

  const completedModules = modules.filter(m => m.completion_percentage === 100).length;
  const totalHours = Math.floor(total_time_spent_minutes / 60);
  const totalMins = total_time_spent_minutes % 60;
  const allCompletions = modules.flatMap(m => (m.topics || []).flatMap(t => (t.subtopics || []).filter(s => s.is_completed && s.completed_at)));
  const firstCompletedAt = allCompletions.length
    ? new Date(Math.min(...allCompletions.map(s => new Date(s.completed_at))))
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

              {/* Mentor View Badge & Student Info Card */}
              {(user?.role === "mentor" || user?.role === "admin") && (
                <div className="mb-3 flex">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 font-['Outfit']">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    Mentor View Mode
                  </span>
                </div>
              )}

              {paramStudentId && progressData.student_name && (
                <div className="mb-4 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 max-w-md shadow-sm">
                  <div className="h-10 w-10 rounded-full bg-[#194BFB] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm border border-blue-200 font-['Outfit']">
                    {initials(progressData.student_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Viewing Student</div>
                    <div className="text-sm font-extrabold text-slate-800 truncate">{progressData.student_name}</div>
                    {progressData.student_email && <div className="text-[11px] text-slate-500 font-mono truncate">{progressData.student_email}</div>}
                  </div>
                </div>
              )}

              <h1 className="font-['Outfit'] text-2xl font-bold tracking-tight text-slate-800">{course_title}</h1>
              <p className="text-sm text-slate-500 mt-1">{batch_name}</p>

              <div className="mt-5">
                <p className="text-[10px] uppercase text-slate-400 mb-1 tracking-wider">
                  {paramStudentId ? "Current Incomplete Topic" : "Continue where you left off"}
                </p>
                {displayCurrentTopic ? (() => {
                  // Check if the current subtopic's module is tier-locked or lacks batch access
                  const currentModuleName = displayCurrentTopic.module_title;
                  const currentModule = modules.find(m => m.title === currentModuleName);
                  let isCurrentLocked = currentModule?.tier_locked === true;

                  if (!isCurrentLocked && current_subtopic?.subtopic_id) {
                    const foundSubtopic = currentModule?.topics?.flatMap(t => t.subtopics)?.find(s => s.id === current_subtopic.subtopic_id);
                    if (foundSubtopic && foundSubtopic.unlocked === false) {
                      isCurrentLocked = true;
                    }
                  }

                  return isCurrentLocked ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-sm p-3 flex items-center gap-3">
                      <Lock className="text-slate-400 w-5 h-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-500 truncate">{displayCurrentTopic.topic_title}</div>
                        <div className="text-xs text-slate-400 truncate">{displayCurrentTopic.module_title}</div>
                      </div>
                      <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-2 py-1 rounded font-bold uppercase tracking-wider">
                        Module Locked
                      </span>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-100 rounded-sm p-3 flex items-center gap-3">
                      <BookOpen className="text-[#194BFB] w-5 h-5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 truncate">{displayCurrentTopic.topic_title}</div>
                        <div className="text-xs text-slate-500 truncate">{displayCurrentTopic.module_title}</div>
                      </div>
                      {!paramStudentId && (
                        <button
                          onClick={() => navigate(
                            current_subtopic?.subtopic_id
                              ? `/subtopic/${current_subtopic.subtopic_id}`
                              : `/dashboard`
                          )}
                          className="ml-auto bg-[#194BFB] text-white text-xs px-3 py-1.5 rounded-sm shrink-0 hover:bg-[#0F3AE5] transition-colors"
                        >
                          Continue →
                        </button>
                      )}
                    </div>
                  );
                })() : (
                  <div className="bg-yellow-50 border border-yellow-100 rounded-sm p-3 flex items-center gap-3">
                    <Trophy className="text-yellow-500 w-5 h-5" />
                    <span className="text-sm font-semibold text-slate-800">Course Complete! 🎉</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Ring */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <ProgressRing pct={overall_percentage} />
            </div>
          </div>

          {/* Stats Row */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-6">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <span><strong className="text-slate-800">{displayCompleted}/{displayTotal}</strong> Subtopics Done</span>
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

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 shadow-sm">
          {modules.map((mod) => {
            const isExpanded = !!expandedModules[mod.id];
            const isDone = mod.completion_percentage === 100;
            const barColor = isDone ? "bg-green-500" : mod.completion_percentage > 0 ? "bg-[#194BFB]" : "bg-slate-200";
            const modCompleted = mod.completed_topics ?? mod.completed_subtopics ?? 0;
            const modTotal = mod.total_topics ?? mod.total_subtopics ?? 0;

            return (
              <div key={mod.id}>
                {/* Module Header */}
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="w-full flex items-center gap-3 py-4 px-5 cursor-pointer bg-white hover:bg-slate-50 transition-colors text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  }
                  <span className="text-sm font-extrabold text-slate-800">{mod.title}</span>
                  <span className="text-xs text-slate-400 ml-1 font-semibold">{modCompleted}/{modTotal}</span>
                  <div className="ml-auto flex items-center gap-3">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all`}
                        style={{ width: `${mod.completion_percentage}%` }}
                      />
                    </div>
                    {isDone && <CheckCircle className="text-green-500 w-4 h-4 shrink-0" />}
                  </div>
                </button>

                {/* Topics */}
                {isExpanded && (
                  <div className="divide-y divide-slate-100 bg-slate-50/30">
                    {(mod.topics || []).map((topic) => {
                      const isTopicExpanded = !!expandedTopics[topic.id];
                      const totalSub = topic.subtopics?.length || 0;
                      const doneSub = topic.subtopics?.filter(s => s.is_completed).length || 0;
                      const isTopicDone = totalSub > 0 && doneSub === totalSub;

                      return (
                        <div key={topic.id} className="border-b last:border-b-0 border-slate-100">
                          {/* Topic Row */}
                          <button
                            onClick={() => toggleTopic(topic.id)}
                            className="w-full flex items-center gap-3 py-3 pl-8 pr-5 hover:bg-slate-100/50 transition-colors text-left"
                          >
                            {isTopicExpanded
                              ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            }
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded shrink-0">Topic</span>
                            <span className={`text-sm font-semibold flex-1 ${isTopicDone ? "text-slate-500" : "text-slate-700"}`}>
                              {topic.title}
                            </span>
                            <span className="text-xs text-slate-400 font-medium">
                              {doneSub}/{totalSub} Done
                            </span>
                            {isTopicDone && <CheckCircle className="text-green-500 w-3.5 h-3.5 shrink-0" />}
                          </button>

                          {/* Subtopics */}
                          {isTopicExpanded && (
                            <div className="divide-y divide-slate-50 bg-white">
                              {(topic.subtopics || []).map((s) => {
                                const isCurrent = current_topic?.topic_id === s.id;
                                const isModLocked = mod.tier_locked && !s.is_completed;

                                if (isModLocked) {
                                  return (
                                    <TooltipProvider key={s.id}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div
                                            className="flex items-center gap-3 py-3 pl-14 pr-5 opacity-50 cursor-not-allowed bg-slate-50/50 group"
                                          >
                                            <Lock className="text-slate-400 w-4 h-4 shrink-0" />
                                            <span className="text-sm truncate flex-1 text-slate-400">{s.title}</span>
                                            <span className="ml-auto text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">Locked</span>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="bg-slate-800 text-white border-none rounded-md p-3 shadow-xl max-w-[200px]">
                                          <div className="text-[10px] font-black tracking-[0.2em] uppercase opacity-70 mb-1">Tier Locked</div>
                                          <div className="text-[11px] font-medium">Upgrade your plan to access this module.</div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  );
                                }

                                return (
                                  <div
                                    key={s.id}
                                    className="flex items-center gap-3 py-3 pl-14 pr-5 hover:bg-slate-50 cursor-pointer group"
                                    onClick={() => !paramStudentId && navigate(`/subtopic/${s.id}`)}
                                  >
                                    {/* Status icon */}
                                    {s.is_completed
                                      ? <CheckCircle className="text-green-500 w-4 h-4 shrink-0" />
                                      : isCurrent
                                        ? <PlayCircle className="text-[#194BFB] w-4 h-4 shrink-0 animate-pulse" />
                                        : <Circle className="text-slate-300 w-4 h-4 shrink-0" />
                                    }

                                    {/* Title */}
                                    <span className={`text-sm truncate flex-1 ${
                                      s.is_completed ? "text-slate-500"
                                        : isCurrent ? "text-[#194BFB] font-medium"
                                        : "text-slate-700"
                                    }`}>
                                      {s.title}
                                    </span>

                                    {/* Right side Actions */}
                                    <div
                                      className="ml-auto flex items-center gap-2"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      {s.is_completed && (
                                        <>
                                          <span className="text-xs text-slate-400 font-medium">{fmtDate(s.completed_at)}</span>
                                          {s.time_spent_minutes > 0 && (
                                            <span className="text-xs text-slate-400 bg-slate-100 px-1 py-0.5 rounded font-mono">{s.time_spent_minutes}m</span>
                                          )}
                                          {!paramStudentId && (
                                            <button
                                              onClick={() => markIncomplete(s.id, mod.id)}
                                              className="text-xs text-slate-400 hover:text-red-500 font-semibold transition-colors ml-1"
                                            >
                                              Undo
                                            </button>
                                          )}
                                        </>
                                      )}
                                      {!s.is_completed && isCurrent && !paramStudentId && (
                                        <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-sm font-semibold">Continue</span>
                                      )}
                                      {!s.is_completed && !paramStudentId && (
                                        <button
                                          onClick={() => markComplete(s.id, mod.id)}
                                          className="text-xs text-slate-400 hover:text-green-600 font-semibold transition-colors"
                                        >
                                          Mark done
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              {(topic.subtopics || []).length === 0 && (
                                <div className="py-2.5 pl-14 text-xs text-slate-400 font-medium">No subtopics available.</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {(mod.topics || []).length === 0 && (
                      <div className="py-3 pl-8 text-xs text-slate-400 font-medium">No topics available in this module.</div>
                    )}
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
