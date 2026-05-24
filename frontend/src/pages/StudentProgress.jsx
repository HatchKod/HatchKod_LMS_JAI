import { useEffect, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen, Layers, Calendar, Trophy,
  ArrowRight, Lock
} from "lucide-react";

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

export default function StudentProgress() {
  const { user } = useAuth();
  const { studentId: paramStudentId } = useParams();
  const [searchParams] = useSearchParams();
  const batchId = searchParams.get("batchId");
  const navigate = useNavigate();
  const [activeBatchId, setActiveBatchId] = useState(batchId || null);

  // Payment gate (student own view only)
  const { data: paymentStatus } = useQuery({
    queryKey: ["payment-status", user?.id],
    queryFn: async () => {
      try {
        const { data } = await api.get("/payment/status");
        return data;
      } catch (err) {
        if (err.response?.status === 403 && err.response?.data?.detail?.code === "ACCESS_EXPIRED") {
          return { effective_tier: "expired" };
        }
        return null;
      }
    },
    enabled: !!user?.id && user?.role === "student" && !paramStudentId,
    staleTime: 1000 * 60 * 5,
  });

  // Enrolled batches — shared query key so dashboard prefetch populates this cache
  const { data: enrolledBatches } = useQuery({
    queryKey: ["enrolled-batches", user?.id],
    queryFn: async () => {
      const { data } = await api.get("/students/me/enrolled-batches");
      return data;
    },
    enabled: !!user?.id && user?.role === "student" && !paramStudentId,
    staleTime: 1000 * 60 * 5,
  });

  // Set active batch to first batch once loaded (if not already set from URL)
  useEffect(() => {
    if (!activeBatchId && enrolledBatches?.length > 0) {
      setActiveBatchId(enrolledBatches[0].batch_id);
    }
  }, [enrolledBatches, activeBatchId]);

  const targetId = paramStudentId || user?.id;
  const effectiveBatchId = paramStudentId ? batchId : activeBatchId;
  const progressEnabled = !!targetId && (
    !!paramStudentId ||
    user?.role !== "student" ||
    !!effectiveBatchId
  );

  // Progress data — cached per (user, batch); tab switching is instant on revisit
  const { data: progressData, isLoading: loading } = useQuery({
    queryKey: ["student-progress", targetId, effectiveBatchId ?? "default"],
    queryFn: async () => {
      const url = effectiveBatchId
        ? `/students/${targetId}/progress?batchId=${effectiveBatchId}`
        : `/students/${targetId}/progress`;
      const { data } = await api.get(url);
      return data;
    },
    enabled: progressEnabled,
    staleTime: 1000 * 60 * 3,
  });

  if (user?.role === "student" && (paymentStatus?.effective_tier === "expired" || user?.access_tier === "expired")) {
    navigate("/billing", { replace: true });
    return null;
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
    course_id, course_title, batch_name, overall_percentage, total_topics,
    completed_topics, total_subtopics, completed_subtopics, total_time_spent_minutes,
    completed_modules, total_modules, first_completed_at,
    current_topic, current_subtopic,
  } = progressData;

  const displayCompleted = completed_topics ?? completed_subtopics ?? 0;
  const displayTotal = total_topics ?? total_subtopics ?? 0;

  const displayCurrentTopic = current_topic ?? (current_subtopic ? {
    topic_title: current_subtopic.subtopic_title || current_subtopic.topic_title,
    module_title: current_subtopic.module_title
  } : null);

  const daysSince = first_completed_at
    ? Math.max(1, Math.round((Date.now() - new Date(first_completed_at)) / 86400000))
    : 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-['IBM_Plex_Sans']">
      <Navbar />

      {/* Course Switcher — shown when student is enrolled in multiple courses */}
      {!paramStudentId && enrolledBatches && enrolledBatches.length > 1 && (
        <div className="bg-white border-b border-slate-200 px-6 py-0">
          <div className="max-w-5xl mx-auto flex items-center gap-1 overflow-x-auto">
            {enrolledBatches.map((b) => (
              <button
                key={b.batch_id}
                onClick={() => setActiveBatchId(b.batch_id)}
                className={`shrink-0 px-5 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
                  b.batch_id === activeBatchId
                    ? "border-[#194BFB] text-[#194BFB]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {b.course_title}
              </button>
            ))}
          </div>
        </div>
      )}

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
                  const isCurrentLocked = current_subtopic?.tier_locked === true;

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
              <Layers className="w-4 h-4 text-slate-400" />
              <span><strong className="text-slate-800">{completed_modules}/{total_modules}</strong> Modules Done</span>
            </div>
            {daysSince > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span><strong className="text-slate-800">{daysSince} days</strong> Learning Streak</span>
              </div>
            )}
          </div>

          {/* CTA — navigate to course syllabus */}
          {!paramStudentId && course_id && (
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-400">View the full module and topic breakdown for this course.</p>
              <Link
                to={`/course/${course_id}`}
                className="inline-flex items-center gap-2 bg-[#194BFB] hover:bg-[#0F3AE5] text-white text-xs font-bold px-4 py-2 rounded-sm transition-colors shrink-0"
              >
                View Full Syllabus <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
