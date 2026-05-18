import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Users, AlertTriangle } from "lucide-react";

function initials(name) {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function PctBadge({ pct }) {
  const color = pct >= 75 ? "text-green-600" : pct >= 50 ? "text-yellow-500" : "text-red-500";
  return <span className={`font-semibold ${color}`}>{pct}%</span>;
}

function MiniBar({ pct }) {
  const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function MentorProgress({ batches = [] }) {
  const navigate = useNavigate();
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id || "");
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedBatchId) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/batches/${selectedBatchId}/progress-summary`);
        setProgress(data);
      } catch {
        toast.error("Failed to load progress data");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [selectedBatchId]);

  // Stats
  const avg = progress.length
    ? Math.round(progress.reduce((s, r) => s + r.overall_percentage, 0) / progress.length)
    : 0;
  const onTrack = progress.filter(r => r.overall_percentage >= 50).length;
  const behind = progress.filter(r => r.overall_percentage < 50).length;

  return (
    <div>
      {/* Batch Selector */}
      {batches.length > 1 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {batches.map(b => (
            <button
              key={b.id}
              onClick={() => setSelectedBatchId(b.id)}
              className={`px-4 py-1.5 text-xs font-bold rounded-sm border transition-all ${
                selectedBatchId === b.id
                  ? "bg-[#194BFB] text-white border-[#194BFB]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#194BFB]"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-sm p-4 flex items-center gap-3">
          <div className="h-9 w-9 bg-blue-50 rounded-sm flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-[#194BFB]" />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 tracking-wider">Avg Progress</div>
            <div className="text-xl font-bold font-['Outfit'] text-slate-800">{avg}%</div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-sm p-4 flex items-center gap-3">
          <div className="h-9 w-9 bg-green-50 rounded-sm flex items-center justify-center">
            <Users className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 tracking-wider">On Track</div>
            <div className="text-xl font-bold font-['Outfit'] text-green-600">{onTrack} students</div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-sm p-4 flex items-center gap-3">
          <div className="h-9 w-9 bg-red-50 rounded-sm flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 tracking-wider">Behind</div>
            <div className="text-xl font-bold font-['Outfit'] text-red-500">{behind} students</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
          <div className="col-span-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Student</div>
          <div className="col-span-3 text-[10px] uppercase tracking-wider text-slate-400 font-bold text-center">Course Done</div>
          <div className="col-span-3 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Progress</div>
          <div className="col-span-1 text-[10px] uppercase tracking-wider text-slate-400 font-bold text-center">Time</div>
          <div className="col-span-1 text-[10px] uppercase tracking-wider text-slate-400 font-bold text-right">Action</div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">Loading…</div>
        ) : progress.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-500 font-medium">No progress data yet.</p>
            <p className="text-xs text-slate-400 mt-1">Students need to mark topics complete for data to appear.</p>
          </div>
        ) : (
          progress.map((row) => (
            <div
              key={row.student_id}
              className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 items-center"
            >
              {/* Student */}
              <div className="col-span-4 flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                  {initials(row.student_name)}
                </div>
                <span className="text-sm truncate text-slate-700">{row.student_name}</span>
              </div>

              {/* Course Done */}
              <div className="col-span-3 text-sm text-center font-bold text-slate-600">
                {row.completed_topics} / {row.total_topics}
              </div>

              {/* Progress */}
              <div className="col-span-3 flex items-center gap-2">
                <PctBadge pct={row.overall_percentage} />
                <MiniBar pct={row.overall_percentage} />
              </div>

              {/* Time */}
              <div className="col-span-1 text-xs text-center text-slate-400">
                {row.total_time_spent_minutes > 0 ? `${row.total_time_spent_minutes}m` : "—"}
              </div>

              {/* Action */}
              <div className="col-span-1 text-right">
                <button
                  onClick={() => navigate(`/admin/students/${row.student_id}/progress?batchId=${selectedBatchId}`)}
                  className="text-xs border border-slate-200 rounded-sm px-2 py-1 text-slate-600 hover:border-[#194BFB] hover:text-[#194BFB] transition-colors"
                >
                  View
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
