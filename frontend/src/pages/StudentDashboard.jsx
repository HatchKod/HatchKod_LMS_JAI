import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fmtDate, fmtDateTime } from "../lib/dateUtils";
import Navbar from "../components/Navbar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Button } from "../components/ui/button";
import TodaysClasses from "../components/student/TodaysClasses";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import StatusPill from "../components/StatusPill";
import { Users, Award, Target, Flame, Trophy, Video, BookOpen, ListChecks, Clock, ArrowRight, TrendingUp } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function StudentDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("inprogress");

  // Dashboard Data Query
  const {
    data,
    isLoading: isDashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ["dashboard", "student", user?.id],
    queryFn: async () => {
      const { data } = await api.get("/dashboard/student");
      return data;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  useEffect(() => {
    if (user?.id) {
      const channel = supabase.channel(`student_batch_realtime_${user.id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'batch_students'
        }, () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard", "student", user.id] });
        })
        .subscribe();
        
      return () => supabase.removeChannel(channel);
    }
  }, [user?.id, queryClient]);

  // Silently prefetch each enrolled course so first click lands instantly
  useEffect(() => {
    if (!data?.courses?.length) return;
    const timers = data.courses.map(({ course }, index) =>
      setTimeout(() => {
        queryClient.prefetchQuery({
          queryKey: ["course", course.id],
          queryFn: async () => {
            const { data: courseData } = await api.get(`/courses/${course.id}`);
            return courseData;
          },
          staleTime: 1000 * 60 * 60,
        });
      }, index * 600)
    );
    return () => timers.forEach(clearTimeout);
  }, [data, queryClient]);

  // Silently prefetch progress page data so "View Progress" click is instant
  useEffect(() => {
    if (!user?.id || !data) return;
    const timer = setTimeout(async () => {
      try {
        let batches = queryClient.getQueryData(["enrolled-batches", user.id]);
        if (!batches) {
          const { data: batchData } = await api.get("/students/me/enrolled-batches");
          batches = batchData;
          queryClient.setQueryData(["enrolled-batches", user.id], batchData);
        }
        batches?.forEach((b, i) => {
          setTimeout(() => {
            queryClient.prefetchQuery({
              queryKey: ["student-progress", user.id, b.batch_id],
              queryFn: async () => {
                const { data: pd } = await api.get(`/students/${user.id}/progress?batchId=${b.batch_id}`);
                return pd;
              },
              staleTime: 1000 * 60 * 3,
            });
          }, i * 800);
        });
      } catch { /* silent — prefetch failure is not user-facing */ }
    }, 2000); // wait 2s after dashboard renders before background fetch
    return () => clearTimeout(timer);
  }, [data, user?.id, queryClient]);

  useEffect(() => {
    if (data && window.location.hash === "#courses-section") {
      const el = document.getElementById("courses-section");
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    }
  }, [data]);

  if (isDashboardLoading && !data) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="mx-auto max-w-7xl p-8 flex flex-col items-center justify-center min-h-[60vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#194BFB] mb-4" />
          <div className="text-sm text-slate-500 font-medium" data-testid="dashboard-loading">Initializing dashboard…</div>
        </div>
      </div>
    );
  }

  if (dashboardError && !data) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="mx-auto max-w-7xl p-8 flex flex-col items-center justify-center min-h-[60vh]">
          <div className="bg-red-50 text-red-600 p-6 rounded-sm border border-red-100 max-w-md text-center">
            <h3 className="font-bold text-lg mb-2">Something went wrong</h3>
            <p className="text-sm mb-6 opacity-90">
              {dashboardError.response?.data?.message || "Unable to load your dashboard. Please check your connection and try again."}
            </p>
            <Button 
              onClick={() => refetchDashboard()}
              className="bg-red-600 hover:bg-red-700 text-white rounded-sm px-8"
            >
              Retry Loading
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const inprogressCourses = data.courses.filter(c => c.progress < 100);
  const completedCourses = data.courses.filter(c => c.progress === 100);
  const currentCourses = activeTab === "inprogress" ? inprogressCourses : completedCourses;

  return (
    <div className="min-h-screen bg-[#F8FAFC]" data-testid="student-dashboard">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 fade-in">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-2">Student Console</div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight" data-testid="dashboard-heading">
            Welcome back, {data.mentor ? "ready to build?" : "ready to start?"}
          </h1>
          <p className="mt-1 text-slate-600 text-sm">Pick up where you left off and keep your streak alive.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <Stat label="Total XP" value={`${data.gamification?.total_xp || 0} XP`} Icon={Award} />
          <Stat label="Current Level" value={`Lvl ${data.gamification?.level || 1}`} Icon={Target} subtitle={`Next: ${100 - (data.gamification?.total_xp % 100)} XP`} />
          <Stat label="Daily Streak" value={`${data.gamification?.streak || 0} ${data.gamification?.streak === 1 ? 'Day' : 'Days'}`} Icon={Flame} />
          <Stat 
            label="Weekly Rank" 
            value={data.gamification?.weekly_rank === "N/A" ? "N/A" : `#${data.gamification?.weekly_rank}`} 
            Icon={Trophy} 
            link="/leaderboard"
            linkText="View Board"
          />
          <Stat
            label="My Progress"
            value="View →"
            Icon={TrendingUp}
            link="/student/progress"
            linkText="Open Progress"
          />
        </div>
        
        <div className="mb-12">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-bold mb-4">LIVE SESSIONS</div>
          <TodaysClasses />
        </div>

        {/* CONTINUE LEARNING BLOCK — temporarily commented out
        {data.next_topic && activeTab === "inprogress" && (() => {
          const pending = (data.pending_submissions || []).find(s => s.topic_id === data.next_topic.topic.id);
          const nextSubtopicId = data.next_topic.subtopic?.id;
          const isNextLocked = data.next_topic.subtopic?.tier_locked === true || data.next_topic.subtopic?.unlocked === false;

          return (
            <div className="mb-12">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-bold mb-4">CONTINUE LEARNING</div>
              <Card className="rounded-sm border-border overflow-hidden bg-white shadow-sm" data-testid="continue-learning-card">
                <div className="grid grid-cols-1 md:grid-cols-3">
                  <div className="md:col-span-2 p-8">
                    <div className="flex items-center gap-3 mb-3">
                      {isNextLocked ? (
                        <div className="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                          <BookOpen className="h-2.5 w-2.5" />
                          Module Locked
                        </div>
                      ) : pending ? (
                        <div className="bg-amber-50 text-[#F59E0B] border border-amber-100 px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-widest flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          Under Review
                        </div>
                      ) : (
                        <StatusPill status="ready_to_build" />
                      )}
                      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{data.next_topic.course.title}</span>
                    </div>
                    <div className="font-[Outfit] text-2xl font-bold tracking-tight text-slate-900" data-testid="next-topic-title">
                      {data.next_topic.topic.title}
                    </div>
                    <p className="mt-2 text-sm text-slate-500 line-clamp-1 italic">
                      {isNextLocked
                        ? "This module requires an upgraded plan. Contact your mentor to unlock access."
                        : '"The only way to learn a new programming language is by writing programs in it."'}
                    </p>
                    {isNextLocked ? (
                      <Button asChild className="mt-8 rounded-sm px-8 h-12 bg-slate-100 text-slate-700 hover:bg-slate-200 shadow-none border border-slate-200" data-testid="continue-learning-btn">
                        <Link to={`/course/${data.next_topic.course.id}`}>
                          View Syllabus <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild className={`mt-8 rounded-sm px-8 h-12 ${pending ? 'bg-slate-100 text-slate-900 hover:bg-slate-200 shadow-none border border-slate-200' : 'bg-[#194BFB] hover:bg-[#0F3AE5]'}`} data-testid="continue-learning-btn">
                        <Link to={nextSubtopicId ? `/subtopic/${nextSubtopicId}` : `/course/${data.next_topic.course.id}`}>
                          {pending ? "View Submission" : "Resume Learning"} <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                  <div className="border-l border-border bg-[#0A0A0A] text-white p-8 font-mono text-xs flex flex-col justify-center">
                    <div className="text-slate-500">// system_status</div>
                    <div className={`${isNextLocked ? 'text-slate-500' : pending ? 'text-amber-400' : 'text-emerald-400'} mt-1`}>
                      ▸ {isNextLocked ? 'tier_locked' : pending ? 'pending_approval' : 'ready_to_build'}
                    </div>
                    <div className="text-slate-500 mt-4">// next_execution</div>
                    <div className="text-[#9bb6ff] mt-1 italic">
                      {isNextLocked ? 'upgrade_plan()' : pending ? 'wait_for_mentor()' : `open_topic("${data.next_topic.topic.title.toLowerCase().replace(/ /g, "_")}")`}
                    </div>
                    <div className="mt-8 pt-4 border-t border-white/10 flex items-center gap-2 text-slate-400">
                      <div className={`h-2 w-2 rounded-full ${isNextLocked ? 'bg-slate-500' : pending ? 'bg-amber-500' : 'bg-emerald-500'} ${isNextLocked ? '' : 'animate-pulse'}`}></div>
                      <span>{isNextLocked ? 'Locked' : pending ? 'Waiting' : 'Active Session'}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          );
        })()} */}

        <div id="courses-section" className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {activeTab === "inprogress" ? "My Courses" : "Completed Excellence"}
          </h2>
          <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-sm border border-slate-200">
            <TabButton 
              label={`Inprogress (${inprogressCourses.length})`} 
              active={activeTab === "inprogress"} 
              onClick={() => setActiveTab("inprogress")} 
            />
            <TabButton 
              label={`Completed (${completedCourses.length})`} 
              active={activeTab === "completed"} 
              onClick={() => setActiveTab("completed")} 
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {currentCourses.map(({ course, progress, completed_topics, total_topics, module_count, mentor: courseMentor }) => (
            <Card key={course.id} className="rounded-sm border-border bg-white p-0 overflow-hidden shadow-sm hover:shadow-md transition-shadow group" data-testid={`course-card-${course.id}`}>
              <div className="flex flex-col md:flex-row">
                {/* Left Side: Course Info */}
                <div className="flex-1 p-6 md:p-8">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-[#194BFB] bg-[#194BFB]/5 px-2 py-0.5 rounded">
                          {course.status}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-slate-400">
                          {module_count} Modules • {total_topics} Topics
                        </span>
                      </div>
                      <h3 className="font-[Outfit] text-2xl font-bold text-slate-900 group-hover:text-[#194BFB] transition-colors">{course.title}</h3>
                      <p className="mt-2 text-sm text-slate-500 line-clamp-2 max-w-2xl">{course.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">MENTOR</div>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="bg-slate-100 text-slate-600 text-[8px] font-bold">
                            {courseMentor ? courseMentor.name.split(" ").map(n => n[0]).join("") : "??"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-semibold text-slate-700">{courseMentor?.name || "Unassigned"}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">START DATE</div>
                      <div className="text-xs font-semibold text-slate-700">{fmtDate(course.created_at)}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">COURSE TYPE</div>
                      <div className="text-xs font-semibold text-slate-700">Engineering</div>
                    </div>
                  </div>
                </div>

                {/* Right Side: Progress & Actions */}
                <div className="md:w-72 bg-slate-50 p-6 md:p-8 flex flex-col justify-between border-l border-border">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress</span>
                      <span className="font-mono text-sm font-bold text-slate-900">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2 rounded-full bg-slate-200" />
                    <div className="mt-2 text-[10px] text-right text-slate-400 font-medium">
                      {completed_topics} of {total_topics} topics approved
                    </div>
                  </div>

                  <div className="mt-8 flex flex-col gap-2">
                    <Button asChild className="w-full rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] h-10 shadow-sm" data-testid={`open-course-${course.id}`}>
                      <Link to={`/course/${course.id}`}>Continue Learning</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full rounded-sm border-slate-300 hover:bg-white h-10 text-slate-600">
                      <Link to={`/course/${course.id}`}>View Syllabus</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {currentCourses.length === 0 && (activeTab === "inprogress" ? (
            <Card className="p-12 text-center border-dashed bg-white">
              <BookOpen className="h-12 w-12 text-slate-200 mx-auto mb-4" />
              <p className="text-sm text-slate-500" data-testid="no-courses">No active courses. Time to start something new!</p>
            </Card>
          ) : (
            <Card className="p-12 text-center border-dashed bg-white">
              <Award className="h-12 w-12 text-slate-200 mx-auto mb-4" />
              <p className="text-sm text-slate-500">No completed courses yet. Keep pushing!</p>
            </Card>
          ))}
        </div>

        <h2 className="mt-16 text-xl font-bold tracking-tight text-slate-900 mb-6 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-[#194BFB]" />
          Pending Submissions
        </h2>
        <div className="bg-white border border-border rounded-sm overflow-hidden shadow-sm">
          {(data.pending_submissions || []).length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400 italic" data-testid="no-pending">All caught up. Nothing pending.</div>
          ) : (
            data.pending_submissions.map((s) => (
              <Link key={s.id} to={`/subtopic/${s.topic_id}`}
                className="flex items-center justify-between p-5 border-b last:border-b-0 border-border hover:bg-slate-50 transition-colors group" data-testid={`pending-row-${s.id}`}>
                <div>
                  <div className="font-bold text-slate-800 group-hover:text-[#194BFB]">{s.topic?.title || "Topic"}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">submitted {fmtDateTime(s.submitted_at)}</div>
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

function TabButton({ label, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-1.5 text-xs font-bold rounded transition-all ${
        active 
          ? "bg-white text-slate-900 shadow-sm border border-slate-200" 
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value, Icon, subtitle, link, linkText }) {
  const content = (
    <div className="bg-white p-6 rounded-sm border border-slate-100 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 group-hover:text-[#194BFB] transition-colors">{label}</span>
        <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-[#194BFB]/5 transition-colors">
          <Icon className="h-4 w-4 text-slate-400 group-hover:text-[#194BFB]" />
        </div>
      </div>
      <div className="font-['Outfit'] text-3xl font-black tracking-tight text-slate-900">{value}</div>
      {subtitle && <div className="mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subtitle}</div>}
      {link && (
        <Link to={link} className="mt-4 flex items-center text-[10px] font-bold text-[#194BFB] uppercase tracking-widest hover:underline gap-1">
          {linkText} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );

  return content;
}
