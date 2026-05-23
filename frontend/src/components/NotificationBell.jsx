import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fmtDate } from "../lib/dateUtils";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { 
  Bell, 
  BellOff, 
  Video, 
  PlayCircle, 
  Clock, 
  ClipboardList, 
  X,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function NotificationBell({ initialUnreadCount }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Unread Count Query
  const { data: unreadData } = useQuery({
    queryKey: ["notifications", "unread-count", user?.id],
    queryFn: async () => {
      const { data } = await api.get("/notifications/unread-count");
      return data;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 30, // 30 seconds
    initialData: initialUnreadCount !== undefined ? { count: initialUnreadCount } : undefined,
  });

  const unreadCount = unreadData?.count ?? 0;

  // Notifications List Query
  const { 
    data: notifications = [], 
    isLoading: loading,
    refetch: refetchNotifications 
  } = useQuery({
    queryKey: ["notifications", "list", user?.id],
    queryFn: async () => {
      const { data } = await api.get("/notifications");
      return data;
    },
    enabled: isOpen && !!user?.id,
    staleTime: 1000 * 60, // 1 minute
  });

  useEffect(() => {
    if (!user?.id) return;

    // Realtime subscription
    const dbChannel = supabase
      .channel('notifications-db-' + user.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.' + user.id
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count", user.id] });
        queryClient.invalidateQueries({ queryKey: ["notifications", "list", user.id] });
        if (payload.new.type !== 'class_reminder') {
          showNotificationToast(payload.new);
        }
      })
      .subscribe();

    const broadcastChannel = supabase
      .channel(`user-notifications-${user.id}`)
      .on('broadcast', { event: 'new-reminder' }, ({ payload }) => {
        queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count", user.id] });
        queryClient.invalidateQueries({ queryKey: ["notifications", "list", user.id] });
        showNotificationToast(payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [user?.id, queryClient]);

  const handleJoinClass = async (sessionId) => {
    if (!sessionId) {
      navigate('/dashboard');
      return;
    }
    try {
      const { data } = await api.post(`/sessions/${sessionId}/join`);
      if (data.meeting_url) {
        window.open(data.meeting_url, '_blank');
        toast.success("Joining class! Good luck 🎯");
      } else {
        navigate('/dashboard');
      }
    } catch (e) {
      toast.error("Could not join class. Please go to dashboard.");
      navigate('/dashboard');
    }
  };

  const showNotificationToast = (data) => {
    if (data.type === 'class_live') {
      toast.success(data.title, {
        description: data.body,
        duration: 8000,
        action: {
          label: 'Join Now',
          onClick: () => handleJoinClass(data.related_session_id)
        }
      });
    } else if (data.type === 'class_reminder') {
      toast.warning("Class Reminder", {
        description: data.body || "Your mentor is waiting for you to join the class.",
        duration: 15000,
        icon: <Bell className="h-4 w-4 text-amber-600 animate-bounce" />,
        action: {
          label: 'Join Class',
          onClick: () => handleJoinClass(data.related_session_id)
        }
      });
    } else {
      toast.info(data.title, {
        description: data.body,
        duration: 5000
      });
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleDropdown = () => {
    setIsOpen(prev => !prev);
    // React Query handles the fetch automatically via enabled: isOpen && !!user?.id
  };

  const markAllRead = async () => {
    try {
      await api.post("/notifications/mark-read", { all: true });
      queryClient.setQueryData(["notifications", "list", user?.id],
        (old = []) => old.map(n => ({ ...n, is_read: true }))
      );
      queryClient.setQueryData(["notifications", "unread-count", user?.id], { count: 0 });
      toast.success("All notifications marked as read");
    } catch (e) {
      toast.error("Failed to mark all as read");
    }
  };

  const markOneRead = async (id) => {
    try {
      await api.post("/notifications/mark-read", { notification_ids: [id] });
      queryClient.setQueryData(["notifications", "list", user?.id],
        (old = []) => old.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      queryClient.setQueryData(["notifications", "unread-count", user?.id],
        (old) => ({ count: Math.max(0, (old?.count ?? 1) - 1) })
      );
    } catch (e) {
      console.error(e);
    }
  };

  const deleteOne = async (e, id, wasUnread) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      queryClient.setQueryData(["notifications", "list", user?.id],
        (old = []) => old.filter(n => n.id !== id)
      );
      if (wasUnread) {
        queryClient.setQueryData(["notifications", "unread-count", user?.id],
          (old) => ({ count: Math.max(0, (old?.count ?? 1) - 1) })
        );
      }
    } catch (e) {
      toast.error("Failed to delete notification");
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSecs = Math.floor((now - date) / 1000);
    
    if (diffInSecs < 60) return "Just now";
    if (diffInSecs < 3600) return `${Math.floor(diffInSecs / 60)} min ago`;
    if (diffInSecs < 86400) return `${Math.floor(diffInSecs / 3600)}h ago`;
    if (diffInSecs < 604800) return `${Math.floor(diffInSecs / 86400)}d ago`;
    
    return fmtDate(date, { day: 'numeric', month: 'short' });
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'class_live':
        return <div className="bg-green-100 p-2 rounded-full"><Video className="h-4 w-4 text-green-600" /></div>;
      case 'recording_uploaded':
        return <div className="bg-blue-100 p-2 rounded-full"><PlayCircle className="h-4 w-4 text-blue-600" /></div>;
      case 'class_reminder':
        return <div className="bg-amber-100 p-2 rounded-full"><Clock className="h-4 w-4 text-amber-600" /></div>;
      case 'assignment_due':
        return <div className="bg-red-100 p-2 rounded-full"><ClipboardList className="h-4 w-4 text-red-600" /></div>;
      default:
        return <div className="bg-slate-100 p-2 rounded-full"><Bell className="h-4 w-4 text-slate-500" /></div>;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={toggleDropdown}
        className="relative p-2 text-slate-600 hover:text-slate-900 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 bg-[#EF4444] text-white text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 border-2 border-white translate-x-1/4 -translate-y-1/4 animate-in zoom-in duration-300">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[480px] bg-white border border-slate-200 rounded-sm shadow-2xl z-[100] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-['Outfit'] font-bold text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-sm">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button 
                onClick={markAllRead}
                className="text-[10px] font-bold text-[#194BFB] hover:underline uppercase tracking-wider"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 bg-slate-100 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-100 rounded w-3/4" />
                      <div className="h-2 bg-slate-100 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <BellOff className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm font-medium">No notifications</p>
                <p className="text-[10px] uppercase tracking-widest font-bold mt-1">You're all caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map(n => (
                  <div 
                    key={n.id}
                    onClick={() => {
                      if (!n.is_read) markOneRead(n.id);
                    }}
                    className={`flex items-start gap-3 px-4 py-4 cursor-pointer transition-colors relative group ${!n.is_read ? 'bg-blue-50/50 hover:bg-blue-50' : 'bg-white hover:bg-slate-50'}`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {getTypeIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.is_read ? 'font-bold text-slate-900' : 'text-slate-700 font-medium'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2">
                        {formatTime(n.created_at)}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => deleteOne(e, n.id, !n.is_read)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded-full transition-all"
                    >
                      <X className="h-3 w-3 text-slate-400" />
                    </button>
                    {!n.is_read && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#194BFB]" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-2 border-t border-slate-100 text-center bg-slate-50/50">
              <button className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">
                Showing recent {notifications.length} notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
