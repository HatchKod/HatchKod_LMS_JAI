import { useState, useEffect, useCallback } from "react";
import { api, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Lock, Unlock, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";

export default function BatchTopicAccess({ batches }) {
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [topics, setTopics] = useState([]);
  const [unlockedIds, setUnlockedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null); // topic_id currently being toggled

  const selectedBatch = batches.find((b) => b.id === selectedBatchId);

  const loadAccess = useCallback(async (batchId) => {
    setLoading(true);
    try {
      const [topicsRes, accessRes] = await Promise.all([
        api.get(`/batches/${batchId}/topics`),
        api.get(`/batches/${batchId}/topics/access`),
      ]);
      setTopics(topicsRes.data || []);
      setUnlockedIds(new Set(accessRes.data || []));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load topics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBatchId) loadAccess(selectedBatchId);
    else { setTopics([]); setUnlockedIds(new Set()); }
  }, [selectedBatchId, loadAccess]);

  const toggle = async (topicId, currentlyUnlocked) => {
    setBusy(topicId);
    try {
      if (currentlyUnlocked) {
        await api.delete(`/batches/${selectedBatchId}/topics/${topicId}/unlock`);
        setUnlockedIds((prev) => { const next = new Set(prev); next.delete(topicId); return next; });
        toast.success("Topic locked for students");
      } else {
        await api.post(`/batches/${selectedBatchId}/topics/${topicId}/unlock`);
        setUnlockedIds((prev) => new Set([...prev, topicId]));
        toast.success("Topic unlocked for students");
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Action failed");
    } finally {
      setBusy(null);
    }
  };

  // Group topics by module title for display
  const grouped = topics.reduce((acc, t) => {
    const key = t.module_title || "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Batch selector */}
      <div className="flex items-center gap-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 shrink-0">Batch</div>
        <div className="relative">
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="appearance-none border border-border rounded-sm px-3 py-2 pr-8 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#194BFB] min-w-[220px]"
          >
            <option value="">Select a batch…</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} {b.course_title ? `— ${b.course_title}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        </div>
      </div>

      {!selectedBatchId && (
        <div className="border border-dashed border-border rounded-sm p-10 text-center text-sm text-slate-400">
          Select a batch to manage topic access.
        </div>
      )}

      {selectedBatchId && loading && (
        <div className="border border-border rounded-sm p-8 text-center text-sm text-slate-400">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#194BFB] mx-auto mb-3" />
          Loading topics…
        </div>
      )}

      {selectedBatchId && !loading && topics.length === 0 && (
        <div className="border border-dashed border-border rounded-sm p-10 text-center text-sm text-slate-400">
          No topics found for this batch's course.
        </div>
      )}

      {selectedBatchId && !loading && topics.length > 0 && (
        <div className="border border-border rounded-sm overflow-hidden">
          <div className="border-b border-border p-3 bg-[#F4F5F7] flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Topics — {selectedBatch?.name}
            </div>
            <div className="text-[10px] text-slate-400">
              {unlockedIds.size} / {topics.length} unlocked
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {Object.entries(grouped).map(([moduleName, moduleTopics]) => (
              <div key={moduleName}>
                {/* Module header */}
                <div className="px-4 py-2 bg-slate-50 text-[10px] uppercase tracking-[0.18em] text-slate-400 font-semibold">
                  {moduleName}
                </div>
                {moduleTopics.map((t, idx) => {
                  const isFirst = topics.indexOf(t) === 0;
                  const isUnlocked = isFirst || unlockedIds.has(t.id);
                  const isBusy = busy === t.id;

                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isUnlocked
                          ? <Unlock className="h-4 w-4 text-emerald-500 shrink-0" />
                          : <Lock className="h-4 w-4 text-slate-300 shrink-0" />
                        }
                        <span className="text-sm text-slate-700">{t.title}</span>
                        {isFirst && (
                          <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-medium">
                            Always open
                          </span>
                        )}
                      </div>

                      {!isFirst && (
                        <Button
                          size="sm"
                          variant={isUnlocked ? "outline" : "default"}
                          disabled={isBusy}
                          onClick={() => toggle(t.id, isUnlocked)}
                          className={`rounded-sm text-xs h-7 px-3 ${
                            isUnlocked
                              ? "border-red-200 text-red-600 hover:bg-red-50"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                          }`}
                        >
                          {isBusy ? (
                            <span className="flex items-center gap-1.5">
                              <span className="animate-spin h-3 w-3 border border-current rounded-full border-t-transparent" />
                              {isUnlocked ? "Locking…" : "Unlocking…"}
                            </span>
                          ) : isUnlocked ? "Lock" : "Unlock"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
