import { useState, useEffect } from "react";
import { api, formatApiError } from "../../lib/api";
import { fmtDate, fmtTime } from "../../lib/dateUtils";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { 
  Video, 
  Search, 
  ExternalLink, 
  Calendar, 
  Clock, 
  Filter, 
  ChevronDown,
  Loader2,
  PlayCircle,
  MoreVertical
} from "lucide-react";
import { toast } from "sonner";
import RecordingUpload from "./RecordingUpload";

export default function MentorRecordings() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterBatch, setFilterBatch] = useState("all");
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/mentor/recordings");
      setRecordings(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const batches = ["all", ...new Set(recordings.map(r => r.batch_name))];

  const filtered = filterBatch === "all" 
    ? recordings 
    : recordings.filter(r => r.batch_name === filterBatch);

  if (loading) return <SkeletonRows />;

  return (
    <div className="space-y-6 font-['IBM_Plex_Sans']">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-['Outfit'] font-bold tracking-tight text-slate-900">Recordings</h2>
          <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">
            {recordings.length} total
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-sm border border-slate-200">
        <Filter className="h-4 w-4 text-slate-400" />
        <select 
          value={filterBatch} 
          onChange={(e) => setFilterBatch(e.target.value)}
          className="bg-transparent text-xs font-bold uppercase tracking-wider text-slate-600 outline-none cursor-pointer"
        >
          {batches.map(b => <option key={b} value={b}>{b === 'all' ? 'All Batches' : b}</option>)}
        </select>
      </div>

      {recordings.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 rounded-sm">
          <Video className="h-10 w-10 text-slate-200 mb-3" />
          <p className="text-sm text-slate-500 font-medium">No recordings yet</p>
          <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Recordings appear here after you end a class and upload the link.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-[10px] uppercase font-bold text-slate-400 tracking-widest border-b border-slate-100">
            <div className="col-span-4">Lesson & Module</div>
            <div className="col-span-2">Batch</div>
            <div className="col-span-3">Date & Time</div>
            <div className="col-span-1">Duration</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          <div className="space-y-2">
            {filtered.map(r => (
              <RecordingRow 
                key={r.id} 
                recording={r} 
                isExpanded={expandedId === r.id}
                onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                onUpdate={(newUrl) => {
                  setRecordings(prev => prev.map(item => item.id === r.id ? { ...item, url: newUrl } : item));
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecordingRow({ recording, isExpanded, onToggle, onUpdate }) {
  const dateStr = fmtDate(recording.scheduled_at, { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = fmtTime(recording.scheduled_at, { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div className="group">
      <Card className={`rounded-sm border-slate-200 overflow-hidden transition-all duration-300 ${isExpanded ? 'ring-1 ring-[#194BFB] shadow-lg shadow-blue-50' : 'hover:border-slate-300 hover:shadow-md'}`}>
        {/* Desktop Layout */}
        <div className="hidden md:flex items-center p-5 gap-6">
          {/* Video Placeholder Box */}
          <div className="flex-shrink-0 w-32 h-20 bg-slate-100 rounded-sm flex items-center justify-center relative overflow-hidden group-hover:bg-slate-200 transition-colors">
            <Video className="h-8 w-8 text-slate-300 group-hover:text-[#194BFB] group-hover:scale-110 transition-all duration-500" />
            <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-bold px-1 py-0.5 rounded-sm">
              {recording.duration_minutes ? `${recording.duration_minutes}m` : '—'}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h4 className="text-base font-bold text-slate-900 truncate leading-tight">
                {recording.custom_topic || recording.lesson_title || "Live Class"}
              </h4>
              <span className="text-[9px] font-bold text-[#194BFB] bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-sm uppercase tracking-wider whitespace-nowrap">
                {recording.batch_name}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-60">
              {recording.lesson_title ? `${recording.module_title} • ${recording.lesson_title}` : (recording.module_title || "General Session")}
            </p>
            
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                <Calendar className="h-3 w-3 text-slate-300" />
                {dateStr}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                <Clock className="h-3 w-3 text-slate-300" />
                {timeStr}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.open(recording.url, '_blank')}
              className="h-10 px-4 text-xs font-bold uppercase tracking-widest border-slate-200 hover:border-[#194BFB] hover:text-[#194BFB] hover:bg-blue-50"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              Watch
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onToggle}
              className={`h-10 px-4 text-xs font-bold uppercase tracking-widest ${isExpanded ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-900'}`}
            >
              Update
            </Button>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden p-4 space-y-4">
          <div className="flex items-center gap-4">
             <div className="flex-shrink-0 w-20 h-14 bg-slate-100 rounded-sm flex items-center justify-center">
              <Video className="h-6 w-6 text-slate-300" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 truncate">{recording.lesson_title || "Live Class"}</h4>
              <p className="text-[9px] text-[#194BFB] font-bold uppercase tracking-widest mt-1">{recording.batch_name}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
             <Button 
              variant="outline" 
              onClick={() => window.open(recording.url, '_blank')}
              className="w-full h-10 rounded-sm border-slate-200 text-xs font-bold uppercase tracking-widest"
            >
              Watch
            </Button>
            <Button 
              onClick={onToggle} 
              className="w-full h-10 rounded-sm bg-slate-50 text-slate-600 hover:bg-slate-100 text-xs font-bold uppercase tracking-widest"
            >
              Update
            </Button>
          </div>
        </div>

        {/* Expanded Panel */}
        {isExpanded && (
          <div className="border-t border-slate-100 p-5 bg-slate-50/30 animate-in slide-in-from-top-2 duration-300">
            <RecordingUpload 
              sessionId={recording.class_session_id} 
              existingUrl={recording.url}
              onSuccess={(url) => {
                onUpdate(url);
                onToggle();
              }}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-slate-100 animate-pulse rounded-sm" />
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-sm border border-slate-200" />
      ))}
    </div>
  );
}
