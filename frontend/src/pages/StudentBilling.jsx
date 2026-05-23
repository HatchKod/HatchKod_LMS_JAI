import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { fmtDate } from "../lib/dateUtils";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useAuth } from "../lib/auth";
import { fetchPaymentStatus, fetchMyPaymentHistory, createRazorpayOrder, verifyRazorpayPayment } from "../lib/payment";
import { 
  CreditCard, Loader2, Calendar, CheckCircle2, ShieldCheck,
  HelpCircle, ArrowUpRight, History, Receipt, IndianRupee,
  Clock, AlertTriangle, Tag, X, ChevronDown, ChevronUp, Zap
} from "lucide-react";
import { toast } from "sonner";

export default function StudentBilling() {
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Referral code state
  const [refExpanded, setRefExpanded] = useState(false);
  const [refInput, setRefInput] = useState("");
  const [refApplied, setRefApplied] = useState(null); // { code, referrer_name, discount }
  const [refLoading, setRefLoading] = useState(false);

  // Auto-fill referral code from localStorage if captured at register
  useEffect(() => {
    const saved = localStorage.getItem("hk_ref");
    if (saved) {
      setRefInput(saved);
      setRefExpanded(true);
    }
  }, []);

  const handleApplyReferral = async () => {
    if (!refInput.trim()) return;
    setRefLoading(true);
    try {
      const res = await api.post("/referral/validate", { code: refInput.trim() });
      setRefApplied({ code: refInput.trim(), referrer_name: res.data.referrer_name, discount: res.data.discount });
      toast.success(`Referral code applied! ₹${res.data.discount} discount from ${res.data.referrer_name}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid referral code.");
      setRefApplied(null);
    } finally {
      setRefLoading(false);
    }
  };

  const clearReferral = () => {
    setRefApplied(null);
    setRefInput("");
    localStorage.removeItem("hk_ref");
  };

  const loadData = async () => {
    try {
      const [statusData, historyData] = await Promise.all([
        fetchPaymentStatus(),
        fetchMyPaymentHistory()
      ]);
      setStatus(statusData);
      setHistory(historyData);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to load payment details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayOnline = async (amount, paymentType) => {
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error("Failed to load Razorpay SDK. Check your internet connection.");
        return;
      }

      const orderPayload = { amount: amount, payment_type: paymentType };
      if (refApplied?.code) orderPayload.referral_code = refApplied.code;
      const order = await createRazorpayOrder(orderPayload);
      
      const options = {
        key: "rzp_test_SrKC5KJ2yJhtWF",
        amount: order.amount,
        currency: order.currency,
        name: "HatchKod LMS",
        description: paymentType === "full" ? "Full Lifetime Access" : paymentType === "partial" ? "Partial Access Tier" : "Balance Due Payment",
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyPayload = {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              payment_type: paymentType,
              amount: amount
            };
            const res = await verifyRazorpayPayment(verifyPayload);
            if (res.status === "success") {
              toast.success("Payment verified! Refreshing your account…");
              localStorage.removeItem("hk_ref"); // Clear referral after successful payment
            } else {
              toast.error("Payment verification failed.");
            }
          } catch (err) {
            toast.error("Failed to verify payment with server.");
          }
          // Full reload clears all stale state (tier, dashboard, billing)
          setTimeout(() => window.location.reload(), 1500);
        },
        prefill: {
          name: user?.name || "",
          email: user?.email || ""
        },
        theme: {
          color: "#194BFB"
        }
      };
      
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not initialize online payment");
    }
  };

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col justify-between">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-[#194BFB] animate-spin" />
        </div>
      </div>
    );
  }

  const getTierBadgeColor = (tier) => {
    switch (tier) {
      case "full":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "partial":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "demo":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "expired":
      default:
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col justify-between font-sans selection:bg-[#194BFB] selection:text-white relative overflow-hidden">
      {/* Background grid pattern matching design system */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#111_1px,transparent_1px),linear-gradient(to_bottom,#111_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-40" />
      
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-10 z-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-['Outfit']">Billing & Subscriptions</h1>
          <p className="text-slate-400 mt-1">Review your payments history, active tier access configuration, or upgrade your plan.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Status & Actions Column */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-[#222] bg-[#111] p-6 sm:p-8 rounded-none relative">
              <div className="absolute top-0 right-0 h-4 w-4 bg-[#194BFB]" />
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#222] pb-6 mb-6">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold font-mono">Current Plan</div>
                  <h2 className="text-xl font-black tracking-tight text-white font-['Outfit'] mt-1">
                    {status?.access_tier === "full" ? "FULL LIFETIME ACCESS" : 
                     status?.access_tier === "partial" ? "PARTIAL FOUNDATION ACCESS" : 
                     status?.access_tier === "expired" ? "EXPIRED TRIAL ACCESS" : "DEMO TRIAL ACCESS"}
                  </h2>
                </div>
                <div>
                  <span className={`px-3 py-1 text-xs font-mono font-bold tracking-widest uppercase border rounded-none ${getTierBadgeColor(status?.access_tier)}`}>
                    {status?.access_tier}
                  </span>
                </div>
              </div>

              {/* Grid stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="border border-[#222] bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-mono font-bold uppercase">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Total Amount Paid
                  </div>
                  <div className="mt-2 text-2xl font-black tracking-tight text-white font-['Outfit'] flex items-center">
                    <IndianRupee className="h-5 w-5 mr-0.5 text-slate-400" />
                    {status?.amount_paid?.toLocaleString("en-IN") || 0}
                  </div>
                </div>

                <div className="border border-[#222] bg-[#0A0A0A] p-5">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-mono font-bold uppercase">
                    {status?.balance_due > 0 ? (
                      <Clock className="h-4 w-4 text-amber-500" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    )}
                    Balance Pending
                  </div>
                  <div className="mt-2 text-2xl font-black tracking-tight text-white font-['Outfit'] flex items-center">
                    <IndianRupee className="h-5 w-5 mr-0.5 text-slate-400" />
                    {status?.balance_due?.toLocaleString("en-IN") || 0}
                  </div>
                </div>
              </div>

              {/* Dynamic Actions for payments */}
              {status?.balance_due > 0 && (
                <div className="mt-8 border-t border-[#222] pt-6 space-y-4">
                  <div className="inline-flex items-center gap-2 border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-400 font-mono tracking-wider uppercase">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Payment Pending
                  </div>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Complete your payment online to gain instant, automated access to additional syllabus courses, lab models, and mentor support.
                  </p>

                  {/* Referral Code Section */}
                  <div className="border border-[#222] bg-[#0A0A0A]">
                    {user?.referred_by && status?.amount_paid > 0 ? (
                      <div className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400">
                        <span className="flex items-center gap-2 font-mono font-bold uppercase tracking-wider">
                          <Tag className="h-3.5 w-3.5 text-slate-500" />
                          <span className="text-slate-500">Referral Code Already Used ({user.referred_by})</span>
                        </span>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setRefExpanded(!refExpanded)}
                          className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          <span className="flex items-center gap-2 font-mono font-bold uppercase tracking-wider">
                            <Tag className="h-3.5 w-3.5 text-[#194BFB]" />
                            {refApplied ? (
                              <span className="text-emerald-400">✓ Referral Applied — ₹{refApplied.discount} OFF</span>
                            ) : user?.referred_by && status?.amount_paid === 0 ? (
                              <span className="text-emerald-400">✓ Referral Applied ({user.referred_by}) — ₹500 OFF</span>
                            ) : (
                              "Have a referral code? Save ₹500"
                            )}
                          </span>
                          {refExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        {refExpanded && (
                          <div className="px-4 pb-4 border-t border-[#222] pt-3">
                            {refApplied ? (
                              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                                <div>
                                  <span className="text-emerald-400 text-xs font-bold font-mono">{refApplied.code}</span>
                                  <span className="text-slate-400 text-xs ml-2">from {refApplied.referrer_name}</span>
                                </div>
                                <button onClick={clearReferral} className="text-slate-500 hover:text-red-400 transition-colors">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : user?.referred_by && status?.amount_paid === 0 ? (
                               <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                                <div>
                                  <span className="text-emerald-400 text-xs font-bold font-mono">{user.referred_by}</span>
                                  <span className="text-slate-400 text-xs ml-2">Referral discount automatically applied to your first payment.</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={refInput}
                                  onChange={e => setRefInput(e.target.value.toUpperCase())}
                                  placeholder="e.g. HK-AB12CD"
                                  className="flex-1 bg-[#111] border border-[#333] text-white text-xs font-mono px-3 py-2 focus:outline-none focus:border-[#194BFB] uppercase"
                                />
                                <Button
                                  onClick={handleApplyReferral}
                                  disabled={refLoading || !refInput.trim()}
                                  className="bg-[#194BFB] hover:bg-[#194BFB]/80 text-white text-xs font-bold uppercase tracking-wider rounded-none h-auto px-4"
                                >
                                  {refLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {(() => {
                    const effectiveDiscount = refApplied?.discount || (user?.referred_by && status?.amount_paid === 0 ? 500 : 0);
                    return (
                      <div className="flex flex-col sm:flex-row gap-4 pt-2">
                    {status?.access_tier === "partial" ? (
                      <Button
                        onClick={() => handlePayOnline(status.pricing.balance_amount, "balance")}
                        className="flex-1 bg-[#194BFB] hover:bg-[#194BFB]/80 text-white text-xs font-bold tracking-wider uppercase rounded-none h-11 transition-all flex items-center justify-center gap-2"
                      >
                        <CreditCard className="h-4 w-4" />
                        Pay Balance ₹{status.pricing.balance_amount.toLocaleString("en-IN")} Online
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={() => handlePayOnline(status.pricing.partial_amount, "partial")}
                          className="flex-1 bg-transparent border border-[#333] hover:bg-[#194BFB] hover:text-white text-xs font-bold tracking-wider uppercase rounded-none h-11 transition-all flex items-center justify-center gap-2"
                        >
                          <CreditCard className="h-4 w-4" />
                          Pay Partial ₹{Math.max(0, status.pricing.partial_amount - effectiveDiscount).toLocaleString("en-IN")}
                          {effectiveDiscount > 0 && <span className="line-through text-slate-400 text-[10px]">₹{status.pricing.partial_amount.toLocaleString("en-IN")}</span>}
                        </Button>
                        <Button
                          onClick={() => handlePayOnline(status.pricing.full_amount, "full")}
                          className="flex-1 bg-[#194BFB] hover:bg-[#194BFB]/80 text-white text-xs font-bold tracking-wider uppercase rounded-none h-11 transition-all flex items-center justify-center gap-2"
                        >
                          <CreditCard className="h-4 w-4" />
                          Pay Full ₹{Math.max(0, status.pricing.full_amount - effectiveDiscount).toLocaleString("en-IN")}
                          {effectiveDiscount > 0 && <span className="line-through text-slate-400 text-[10px]">₹{status.pricing.full_amount.toLocaleString("en-IN")}</span>}
                        </Button>
                      </>
                    )}
                  </div>
                    );
                  })()}
                </div>
              )}
            </Card>

            {/* Payments History Table */}
            <Card className="border-[#222] bg-[#111] p-6 sm:p-8 rounded-none">
              <div className="flex items-center justify-between border-b border-[#222] pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-[#194BFB]" />
                  <h3 className="font-bold text-sm tracking-wider uppercase text-white">Payment Transactions</h3>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="border border-[#222] bg-[#0A0A0A] p-8 text-center text-slate-500 text-xs font-mono">
                  No payment records logged for this account yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#222] text-slate-500 uppercase text-[10px] tracking-wider">
                        <th className="pb-3 font-semibold">Date</th>
                        <th className="pb-3 font-semibold">Type</th>
                        <th className="pb-3 font-semibold">Details/Notes</th>
                        <th className="pb-3 font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222]">
                      {history.map((p) => (
                        <tr key={p.id} className="text-slate-300 hover:bg-[#194BFB]/5">
                          <td className="py-4 flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-slate-600" />
                            {fmtDate(p.created_at, { year: "numeric", month: "short", day: "numeric" })}
                          </td>
                          <td className="py-4">
                            <span className={`px-2 py-0.5 text-[10px] uppercase font-bold border ${
                              p.payment_type === "full" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            }`}>
                              {p.payment_type}
                            </span>
                          </td>
                          <td className="py-4 text-slate-400 max-w-[200px] truncate" title={p.notes}>
                            {p.notes || "Recorded by Admin"}
                          </td>
                          <td className="py-4 text-right text-white font-bold font-sans">
                            ₹{p.amount?.toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">

            {/* Upgrade nudge — inline in layout, above Support card */}
            {status && status.access_tier !== "full" && (
              <div
                className="overflow-hidden"
                style={{
                  background: "linear-gradient(145deg, #07102b 0%, #0a0a0a 100%)",
                  border: "1px solid rgba(25,75,251,0.45)",
                  boxShadow: "0 0 0 1px rgba(25,75,251,0.08), 0 0 28px rgba(25,75,251,0.4), 0 0 60px rgba(25,75,251,0.12)",
                }}
              >
                <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-[#194BFB] to-transparent" />
                <div className="px-4 py-3.5 flex items-start gap-3">
                  <div className="relative flex-shrink-0 mt-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#194BFB] opacity-20" />
                    <div className="relative h-8 w-8 rounded-full bg-[#194BFB]/15 border border-[#194BFB]/35 flex items-center justify-center">
                      <Zap className="h-3.5 w-3.5 text-[#194BFB]" />
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[#194BFB] font-mono mb-1">
                      Upgrade Required
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">
                      Complete payment to unlock{" "}
                      <span className="text-white font-bold">all modules & labs</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            <Card className="border-[#222] bg-[#111] p-6 rounded-none space-y-6">
              <h3 className="text-xs font-black tracking-[0.2em] uppercase text-[#194BFB]">Support and Help</h3>
              
              <div className="space-y-4">
                <div className="border border-[#222] bg-[#0A0A0A] p-4 text-xs space-y-2">
                  <div className="font-bold text-white mb-1">Need Payment Support?</div>
                  <div className="text-[11px] text-slate-400 leading-relaxed">
                    If you ran into an issue or made a manual bank transfer, contact support to manually activate your syllabus.
                  </div>
                </div>

                <div className="border border-[#222] bg-[#0A0A0A] p-4 text-xs space-y-1">
                  <div className="font-bold text-white mb-1">Contact Information</div>
                  <div className="text-[11px] text-slate-400">Email: support@hatchkod.in</div>
                  <div className="text-[11px] text-slate-400">Phone: +91 97048 97596</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#222] bg-[#0A0A0A]/50 px-6 py-6 text-center text-xs text-slate-500 z-10 font-mono">
        &copy; {new Date().getFullYear()} HatchKod. Security Secured &bull; Strict Non-Refundable Trial Policies
      </footer>

    </div>
  );
}
