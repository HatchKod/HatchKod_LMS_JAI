import { Badge } from "../components/ui/badge";
import { CheckCircle2, Clock, RefreshCw } from "lucide-react";

export default function StatusPill({ status }) {
  const map = {
    approved: { label: "Approved", className: "border-emerald-500/40 bg-emerald-50 text-emerald-700", Icon: CheckCircle2 },
    pending: { label: "Pending", className: "border-amber-500/40 bg-amber-50 text-amber-700", Icon: Clock },
    rework: { label: "Rework", className: "border-orange-500/40 bg-orange-50 text-orange-700", Icon: RefreshCw },
    locked: { label: "Locked", className: "border-slate-300 bg-slate-50 text-slate-500", Icon: Clock },
  };
  const cfg = map[status] || map.pending;
  const Icon = cfg.Icon;
  return (
    <Badge variant="outline" className={`rounded-sm gap-1 uppercase tracking-wider ${cfg.className}`} data-testid={`status-pill-${status}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}
