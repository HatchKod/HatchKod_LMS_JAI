import { useState, useEffect } from "react";
import { Copy, Check, MessageSquare, Smartphone } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import Navbar from "../components/Navbar";
import { Card } from "../components/ui/card";
import { useNavigate } from "react-router-dom";

export default function StudentReferral() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [referralData, setReferralData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upiId, setUpiId] = useState("");
  const [upiSaving, setUpiSaving] = useState(false);
  const [upiSaved, setUpiSaved] = useState(false);

  useEffect(() => {
    if (user?.role !== "student") {
      nav("/");
      return;
    }

    (async () => {
      try {
        const { data } = await api.get("/student/referral");
        setReferralData(data);
        setUpiId(data.upi_id || "");
      } catch (_) {
      } finally {
        setLoading(false);
      }
    })();
  }, [user, nav]);

  const saveUpiId = async () => {
    if (!upiId.trim()) return;
    setUpiSaving(true);
    try {
      await api.put("/student/upi-id", { upi_id: upiId.trim() });
      setUpiSaved(true);
      setTimeout(() => setUpiSaved(false), 3000);
    } catch (_) {}
    setUpiSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="mx-auto max-w-7xl p-6 text-sm text-slate-500">Loading referrals…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 fade-in">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-2">Student Console</div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Refer & Earn</h1>
          <p className="mt-1 text-slate-600 text-sm">Share HatchKod with friends and earn rewards when they join.</p>
        </div>

        <div className="space-y-8">
          {/* Code Card - Full Width Horizontal */}
          <div className="bg-[#0A0A0A] text-white rounded-sm p-8 md:p-10 flex flex-col md:flex-row md:items-center justify-between gap-10 border border-[#222] relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 h-3 w-3 bg-[#194BFB]" />
            
            {/* Left: Code Info */}
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Your Referral Code</div>
              <div className="font-mono text-4xl md:text-5xl font-black text-white tracking-widest">
                {referralData?.my_code || "—"}
              </div>
              <p className="text-sm text-slate-400 mt-4 max-w-md">Share this code with friends. They get <span className="text-white font-bold">₹500 off</span> — you earn <span className="text-[#10B981] font-bold">₹1,500</span> per successful enrollment!</p>
            </div>

            {/* Middle: Actions */}
            <div className="flex-1 flex flex-col gap-3 w-full md:max-w-[280px]">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(referralData?.my_code || "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="w-full flex items-center justify-center gap-2 border border-[#333] hover:bg-[#194BFB] hover:border-[#194BFB] text-xs font-bold uppercase tracking-wider py-3.5 transition-all rounded-sm"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy Code"}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Join HatchKod with my referral code ${referralData?.my_code || ''} and get ₹500 off! Register here: ${window.location.origin}/register?ref=${referralData?.my_code || ''}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba56] text-black text-xs font-black uppercase tracking-wider py-3.5 transition-all rounded-sm"
              >
                <MessageSquare className="h-4 w-4" />
                Share via WhatsApp
              </a>
            </div>

            {/* Right: Stats */}
            <div className="grid grid-cols-3 gap-6 md:gap-8 border-t md:border-t-0 md:border-l border-[#222] pt-6 md:pt-0 md:pl-10">
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-black text-white">{referralData?.total_referrals ?? 0}</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1 font-bold">Referred</div>
              </div>
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-black text-[#F59E0B]">₹{(referralData?.pending_payout ?? 0).toLocaleString("en-IN")}</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1 font-bold">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-black text-[#10B981]">₹{(referralData?.total_earned ?? 0).toLocaleString("en-IN")}</div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1 font-bold">Earned</div>
              </div>
            </div>
          </div>

          {/* Referrals Table */}
          <Card className="bg-white border border-border rounded-sm overflow-hidden shadow-sm">
            <div className="px-6 py-5 border-b border-border bg-slate-50">
              <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Referral History</span>
            </div>

          {/* UPI ID Section */}
          <div className="bg-white border border-border rounded-sm p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-8 w-8 rounded-full bg-[#194BFB]/10 flex items-center justify-center">
                <Smartphone className="h-4 w-4 text-[#194BFB]" />
              </div>
              <div>
                <div className="font-bold text-slate-800 text-sm">Payment Details</div>
                <div className="text-xs text-slate-400">Add your UPI ID so we can send your payout directly</div>
              </div>
            </div>
            <div className="flex gap-3 items-center">
              <input
                type="text"
                value={upiId}
                onChange={e => setUpiId(e.target.value)}
                placeholder="e.g. yourname@upi or 9876543210@paytm"
                className="flex-1 border border-slate-200 rounded-sm px-4 py-2.5 text-sm focus:outline-none focus:border-[#194BFB] transition-colors"
              />
              <button
                onClick={saveUpiId}
                disabled={upiSaving || !upiId.trim()}
                className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-sm transition-all bg-[#194BFB] hover:bg-[#0F3AE5] text-white disabled:opacity-50"
              >
                {upiSaving ? "Saving…" : upiSaved ? "✓ Saved!" : "Save"}
              </button>
            </div>
            {upiSaved && (
              <p className="text-xs text-[#10B981] mt-2 font-medium">✓ UPI ID saved! Admin can now send payouts directly to you.</p>
            )}
          </div>
            {!referralData?.referrals?.length ? (
              <div className="p-16 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                  <MessageSquare className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-500">No referrals yet.</p>
                <p className="text-xs text-slate-400 mt-1">Share your code above to get started!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-white">
                      <th className="text-left px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">Student</th>
                      <th className="text-left px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">Date Joined</th>
                      <th className="text-left px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referralData.referrals.map((r, i) => (
                      <tr key={i} className="border-b last:border-0 border-border hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-5 font-semibold text-slate-800 whitespace-nowrap">{r.referred_name}</td>
                        <td className="px-8 py-5 text-xs text-slate-500 font-mono whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : "—"}</td>
                        <td className="px-8 py-5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-sm ${
                            r.status === "paid" ? "bg-[#10B981]/10 text-[#10B981]" :
                            r.status === "pending" ? "bg-[#194BFB]/10 text-[#194BFB]" :
                            r.status === "awaiting_full" ? "bg-amber-50 text-amber-600" :
                            r.status === "registered" ? "bg-slate-100 text-slate-500" :
                            "bg-red-50 text-red-500"
                          }`}>
                            {r.status === 'awaiting_full' ? 'Awaiting Full Payment' : r.status === 'pending' ? 'Ready for Payout' : r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
