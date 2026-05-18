import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { api, formatApiError } from "../../lib/api";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { 
  Video, 
  Clock, 
  WifiOff, 
  Calendar, 
  CalendarOff, 
  ArrowRight, 
  Link as LinkIcon, 
  CheckCircle2, 
  Loader2,
  Bell
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth";

export default function TodaysClasses() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(true);
  const [joiningId, setJoiningId] = useState(null);

  const batchId = user?.batch_id;

  // 1. Data Fetching
  const fetchAllSessions = useCallback(async () => {
    if (!batchId) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get(`/batches/${batchId}/sessions`);
      
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const todayList = data
        .filter(s => {
          const sDate = new Date(s.scheduled_at);
          return sDate >= startOfToday && sDate <= endOfToday;
        })
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

      const upcomingList = data
        .filter(s => {
          const sDate = new Date(s.scheduled_at);
          return sDate > endOfToday && s.status === 'scheduled';
        })
        .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

      setSessions(todayList);
      setUpcomingSessions(upcomingList);
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  // 2. Realtime Subscription
  useEffect(() => {
    if (!batchId) return;

    const channel = supabase
      .channel('student-classes-' + batchId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'class_sessions',
        filter: 'batch_id=eq.' + batchId
      }, (payload) => {
        // Fetch full data for the new session to get batch names etc.
        fetchAllSessions();
        toast.info('New class scheduled!', {
          icon: '📅',
          duration: 5000
        });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'class_sessions',
        filter: 'batch_id=eq.' + batchId
      }, (payload) => {
        setSessions(prev => prev.map(s =>
          s.id === payload.new.id
            ? { ...s, status: payload.new.status, meeting_url: payload.new.meeting_url, started_at: payload.new.started_at }
            : s
        ));

        if (payload.new.status === 'live') {
          toast.success('Your class is LIVE! Join Now', {
            duration: 8000,
            icon: '🟢'
          });
        }

        if (payload.new.status === 'ended') {
          toast.info('Class has ended.');
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'class_sessions'
      }, (payload) => {
        setSessions(prev => prev.filter(s => s.id !== payload.old.id));
        setUpcomingSessions(prev => prev.filter(s => s.id !== payload.old.id));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeConnected(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId]);

  // 3. Polling Fallback (Always run to ensure reliability)
  useEffect(() => {
    const interval = setInterval(async () => {
      for (const s of sessions) {
        if (s.status !== 'ended') {
          try {
            const { data: statusRes } = await api.get(`/sessions/${s.id}/status`);
            if (statusRes.status !== s.status) {
              setSessions(prev => prev.map(item => 
                item.id === s.id ? { ...item, status: statusRes.status, meeting_url: statusRes.meeting_url, started_at: statusRes.started_at } : item
              ));
            }
          } catch {}
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [realtimeConnected, sessions]);

  useEffect(() => {
    fetchAllSessions();
  }, [fetchAllSessions]);

  const handleJoin = async (sessionId) => {
    setJoiningId(sessionId);
    try {
      const { data } = await api.post(`/sessions/${sessionId}/join`);
      if (data.meeting_url) {
        window.open(data.meeting_url, '_blank');
        toast.success("Joining class! Good luck 🎯", { duration: 4000 });
      }
    } catch (e) {
      if (e.response?.status === 400) {
        toast.error("Class is not live yet.");
      } else {
        toast.error(formatApiError(e.response?.data?.detail));
      }
    } finally {
      setJoiningId(null);
    }
  };

  if (loading) return <SkeletonLoader />;

  return (
    <div className="space-y-6 font-['IBM_Plex_Sans']">
      {!realtimeConnected && <ReconnectingBanner />}

      <div className="flex flex-col gap-1">
        <h2 className="font-['Outfit'] font-bold text-lg text-slate-900 tracking-tight">Today's Classes</h2>
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {!batchId ? (
        <EmptyState message="You are not enrolled in a batch yet." icon={<CalendarOff className="w-10 h-10 text-slate-200" />} />
      ) : sessions.length === 0 ? (
        <EmptyState message="No classes scheduled for today" icon={<CalendarOff className="w-10 h-10 text-slate-200" />} />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sessions.map(session => (
            <ClassCard 
              key={session.id} 
              session={session} 
              isJoining={joiningId === session.id} 
              onJoin={() => handleJoin(session.id)} 
            />
          ))}
        </div>
      )}

      {/* UPCOMING SECTION */}
      <div className="pt-2">
        <h3 className="text-[10px] uppercase font-bold text-slate-400 tracking-[0.2em] mb-4">Upcoming Classes</h3>
        <div className="space-y-3">
          {upcomingSessions.length > 0 ? (
            upcomingSessions.map(s => <UpcomingRow key={s.id} session={s} />)
          ) : (
            <p className="text-xs text-slate-400 italic">No upcoming classes scheduled</p>
          )}
          <div className="sm:hidden mt-4">
            <button className="text-[10px] font-bold text-[#194BFB] uppercase tracking-widest">See all classes →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassCard({ session, onJoin, isJoining }) {
  const [duration, setDuration] = useState("00:00:00");
  const [countdown, setCountdown] = useState(null);
  const [pulseActive, setPulseActive] = useState(true);

  // Live Timer
  useEffect(() => {
    if (session.status !== 'live' || !session.started_at) return;
    
    const update = () => {
      const start = new Date(session.started_at);
      const diff = Math.floor((new Date() - start) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setDuration(`${h}:${m}:${s}`);

      // Stop pulsing after 30 seconds
      if (diff > 30) setPulseActive(false);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session.status, session.started_at]);

  // Countdown
  useEffect(() => {
    if (session.status !== 'scheduled') return;

    const update = () => {
      const start = new Date(session.scheduled_at);
      const now = new Date();
      const diff = start - now;

      if (diff <= 0) {
        setCountdown({ text: "Starting any moment...", color: "text-[#10B981]" });
        return;
      }

      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(mins / 60);

      if (hrs > 0) {
        setCountdown({ text: `Starts in ${hrs}h ${mins % 60}m`, color: "text-slate-400" });
      } else if (mins < 1) {
        setCountdown({ text: "Starting any moment...", color: "text-[#10B981]" });
      } else if (mins < 10) {
        setCountdown({ text: `Starts in ${mins} min`, color: "text-[#F59E0B]" });
      } else {
        setCountdown({ text: `Starts in ${mins} min`, color: "text-slate-400" });
      }
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [session.status, session.scheduled_at]);

  return (
    <Card className="bg-white border border-slate-200 rounded-sm p-4 hover:bg-slate-50 transition-colors shadow-sm overflow-hidden flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-800 truncate">{session.custom_topic || session.topic_title || "Live Class"}</h4>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{session.batch_name}</p>
        </div>
        <div className="shrink-0">
          <StatusBadge status={session.status} />
        </div>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
            <Clock className="w-3 h-3 text-slate-300" />
            <span>
              {session.status === 'live' ? 'Started' : 'Scheduled'} at {new Date(session.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {session.status === 'live' && (
            <span className="text-emerald-600 font-['JetBrains_Mono'] text-[9px] font-bold ml-5">
              (running {duration})
            </span>
          )}
          {session.status === 'scheduled' && countdown && (
            <p className={`text-[9px] font-bold uppercase tracking-wider ml-5 ${countdown.color}`}>{countdown.text}</p>
          )}
        </div>

        <div>
          {session.status === 'scheduled' && (
            <Button disabled className="bg-slate-50 text-slate-300 cursor-not-allowed rounded-sm text-[10px] font-bold uppercase tracking-widest px-6 h-9 border border-slate-100 shadow-none">
              Join Soon
            </Button>
          )}

          {session.status === 'live' && (
            <Button 
              onClick={onJoin} 
              disabled={isJoining}
              className={`bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm text-[10px] font-bold uppercase tracking-widest px-8 h-9 shadow-lg shadow-blue-100 transition-all ${
                pulseActive ? 'ring-2 ring-[#194BFB] ring-offset-2 animate-pulse' : ''
              }`}
            >
              {isJoining ? <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Joining...</> : "Join Now"}
            </Button>
          )}

          {session.status === 'ended' && (
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 h-9">
              <CheckCircle2 className="h-3.5 w-3.5 text-slate-200" /> Ended
            </div>
          )}
        </div>
      </div>

      {session.status === 'live' && !session.meeting_url && !isJoining && (
        <div className="bg-red-50 border border-red-100 rounded-sm p-2 mt-2 text-[9px] text-red-500 font-bold flex items-center gap-2">
          <Bell className="h-3 w-3" /> Meeting link unavailable
        </div>
      )}

    </Card>
  );
}

function UpcomingRow({ session }) {
  const sDate = new Date(session.scheduled_at);
  const day = sDate.getDate();
  const month = sDate.toLocaleString('en-US', { month: 'short' });
  const time = sDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 px-1 transition-colors">
      <div className="bg-slate-100 rounded-sm p-1.5 text-center min-w-[45px] shrink-0 border border-slate-200">
        <div className="text-sm font-bold text-slate-700 leading-none">{day}</div>
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{month}</div>
      </div>
      <div className="flex-1 min-w-0">
        <h5 className="text-sm font-semibold text-slate-700 truncate">{session.custom_topic || session.topic_title || "Live Class"}</h5>
        <div className="text-[10px] text-slate-400 flex items-center gap-2 font-medium">
          <span className="text-[#194BFB] font-bold">{session.batch_name}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span>{time}</span>
        </div>
      </div>
      <div className="shrink-0 bg-slate-50 border border-slate-100 text-[9px] font-bold text-slate-400 px-2 py-0.5 rounded-sm uppercase tracking-widest">
        Scheduled
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'live') return (
    <div className="bg-[#10B981] text-white text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 uppercase tracking-[0.1em] shadow-sm shadow-emerald-100">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
      </span>
      LIVE
    </div>
  );
  if (status === 'ended') return (
    <div className="bg-slate-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest">
      Ended
    </div>
  );
  return (
    <div className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 uppercase tracking-widest border border-slate-200">
      <Clock className="w-3 h-3" /> Scheduled
    </div>
  );
}

function ReconnectingBanner() {
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-sm px-4 py-2 flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
      <WifiOff className="text-yellow-500 w-4 h-4 shrink-0" />
      <span className="text-xs text-yellow-700 font-medium">Reconnecting to live updates... using backup polling.</span>
    </div>
  );
}

function EmptyState({ message, icon }) {
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-sm p-12 flex flex-col items-center justify-center text-center">
      {icon}
      <p className="mt-3 text-sm text-slate-500 font-medium">{message}</p>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-32 bg-slate-100 animate-pulse rounded-sm" />
      <div className="grid grid-cols-1 gap-4">
        {[1, 2].map(i => (
          <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-sm border border-slate-200" />
        ))}
      </div>
    </div>
  );
}
