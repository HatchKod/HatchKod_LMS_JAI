import { useState, useEffect, useMemo } from "react";
import { api, formatApiError } from "../../lib/api";
import { fmtDate, istDay, istMonth } from "../../lib/dateUtils";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { 
  Video, 
  Search, 
  PlayCircle, 
  ChevronDown, 
  ChevronRight,
  Clock,
  Calendar,
  Loader2,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth";

export default function RecordingsLibrary() {
  const { user } = useAuth();
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedModules, setExpandedModules] = useState({});

  useEffect(() => {
    const load = async () => {
      if (!user?.batch_id) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get(`/batches/${user.batch_id}/recordings`);
        setRecordings(data);
        
        // Default all modules to expanded
        const modules = [...new Set(data.map(r => r.module_title))];
        const expanded = {};
        modules.forEach(m => expanded[m] = true);
        setExpandedModules(expanded);
      } catch (e) {
        toast.error(formatApiError(e.response?.data?.detail) || "Failed to load recordings");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.batch_id]);

  const filtered = useMemo(() => {
    return recordings.filter(r => 
      (r.custom_topic || r.lesson_title || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.module_title || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [recordings, search]);

  const grouped = useMemo(() => {
    return filtered.reduce((acc, rec) => {
      const module = rec.module_title || "Other";
      if (!acc[module]) acc[module] = [];
      acc[module].push(rec);
      return acc;
    }, {});
  }, [filtered]);

  const toggleModule = (moduleName) => {
    setExpandedModules(prev => ({ ...prev, [moduleName]: !prev[moduleName] }));
  };

  if (loading) return <SkeletonLoader />;

  if (recordings.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-sm bg-slate-50/30">
        <Video className="h-12 w-12 text-slate-200 mb-4" />
        <h3 className="text-sm font-bold text-slate-900">No recordings yet</h3>
        <p className="text-[10px] text-slate-400 mt-1 max-w-[240px] uppercase tracking-widest font-bold">
          Recordings will appear here after your mentor uploads them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-['IBM_Plex_Sans']">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-['Outfit'] font-bold tracking-tight text-slate-900">Class Recordings</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{recordings.length} total sessions recorded</p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by lesson or module..."
            className="pl-9 h-10 rounded-sm border-slate-200 text-sm focus:ring-[#194BFB] bg-white"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-slate-200 rounded-sm">
          <XCircle className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">No recordings match your search.</p>
          <button onClick={() => setSearch("")} className="text-[#194BFB] text-[10px] font-bold uppercase tracking-widest mt-2 hover:underline">Clear search</button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([moduleName, moduleRecordings]) => (
            <div key={moduleName} className="space-y-4">
              <button 
                onClick={() => toggleModule(moduleName)}
                className="flex items-center gap-2 group w-full text-left"
              >
                <div className="shrink-0">
                  {expandedModules[moduleName] ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                </div>
                <h3 className="text-[10px] uppercase font-bold text-slate-500 tracking-[0.2em]">{moduleName}</h3>
                <div className="h-[1px] flex-1 bg-slate-100" />
                <span className="text-[10px] font-bold text-slate-300">{moduleRecordings.length} Recordings</span>
              </button>

              {expandedModules[moduleName] && (
                <div className="grid grid-cols-1 gap-3">
                  {moduleRecordings.map(rec => (
                    <RecordingCard key={rec.id} recording={rec} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordingCard({ recording }) {
  const day = istDay(recording.scheduled_at);
  const month = istMonth(recording.scheduled_at);

  return (
    <Card className="p-3 rounded-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 transition-all group">
      <div className="flex items-center gap-4">
        <div className="bg-slate-100 rounded-sm p-1.5 text-center min-w-[45px] shrink-0 border border-slate-200">
          <div className="text-sm font-bold text-slate-700 leading-none">{day}</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{month}</div>
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-slate-800 truncate group-hover:text-[#194BFB] transition-colors">
            {recording.custom_topic || recording.lesson_title || "Live Class"}
          </h4>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">
            <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> {recording.duration_minutes ? `${recording.duration_minutes} min` : 'Duration unknown'}</div>
            <span className="text-slate-200">|</span>
            <div>Uploaded {fmtDate(recording.uploaded_at, { day: 'numeric', month: 'short' })}</div>
          </div>
        </div>

        <Button 
          onClick={() => window.open(recording.url, '_blank')}
          className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-9 px-4 text-xs font-bold uppercase tracking-widest shadow-sm shadow-blue-100 shrink-0"
        >
          <PlayCircle className="h-3.5 w-3.5 mr-2" /> Watch
        </Button>
      </div>
    </Card>
  );
}

function SkeletonLoader() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between">
        <div className="h-8 w-48 bg-slate-100 animate-pulse rounded-sm" />
        <div className="h-10 w-64 bg-slate-100 animate-pulse rounded-sm" />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="space-y-4">
          <div className="h-4 w-32 bg-slate-100 animate-pulse rounded-sm" />
          <div className="grid grid-cols-1 gap-3">
            {[1, 2].map(j => (
              <div key={j} className="h-16 bg-slate-100 animate-pulse rounded-sm border border-slate-200" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
