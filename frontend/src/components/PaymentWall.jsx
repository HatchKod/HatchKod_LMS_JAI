import React, { useState, useEffect } from "react";
import { Lock, Mail, MessageSquare, AlertCircle, CheckCircle, CreditCard, Tag, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "../lib/auth";
import { createRazorpayOrder, verifyRazorpayPayment } from "../lib/payment";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";

export default function PaymentWall() {
  const { user, logout } = useAuth();

  // ── Referral state ─────────────────────────────────────────────────────────
  const [refExpanded, setRefExpanded] = useState(false);
  const [refInput, setRefInput] = useState("");
  const [refApplied, setRefApplied] = useState(null); // { code, referrer_name, discount }
  const [refLoading, setRefLoading] = useState(false);

  // On mount — pre-fill from localStorage if a ?ref= was captured at register
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

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return; }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayOnline = async (baseAmount, paymentType) => {
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error("Failed to load Razorpay SDK. Check your internet connection.");
        return;
      }

      const discount = refApplied?.discount || 0;
      const finalAmount = Math.max(0, baseAmount - discount);

      const order = await createRazorpayOrder({
        amount: baseAmount,
        payment_type: paymentType,
        referral_code: refApplied?.code || null
      });

      const options = {
        key: "rzp_test_SrKC5KJ2yJhtWF",
        amount: order.amount,
        currency: order.currency,
        name: "HatchKod LMS",
        description: paymentType === "full" ? "Full Lifetime Access" : "Partial Access Tier",
        order_id: order.id,
        handler: async function (response) {
          try {
            const verifyPayload = {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              payment_type: paymentType,
              amount: baseAmount
            };
            const res = await verifyRazorpayPayment(verifyPayload);
            if (res.status === "success") {
              // Clear referral from localStorage after successful use
              localStorage.removeItem("hk_ref");
              toast.success("Payment verified! Access granted — refreshing your dashboard…");
            } else {
              toast.error("Payment verification failed.");
            }
          } catch (err) {
            toast.error("Failed to verify payment with server.");
          }
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

  const handleWhatsAppClick = () => {
    const message = encodeURIComponent(
      `Hello HatchKod Team,\n\nMy name is ${user?.name || "Student"} (${user?.email || ""}).\nI am requesting activation for my course tier.\n\nThank you!`
    );
    window.open(`https://wa.me/919704897596?text=${message}`, "_blank");
  };

  // ── Price display helpers ──────────────────────────────────────────────────
  const discount = refApplied?.discount || 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col justify-between font-sans selection:bg-[#194BFB] selection:text-white relative overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#111_1px,transparent_1px),linear-gradient(to_bottom,#111_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none opacity-40" />

      {/* Header */}
      <header className="border-b border-[#222] bg-[#0A0A0A]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-[#194BFB] flex items-center justify-center font-black text-sm tracking-tighter">
            HK
          </div>
          <span className="text-sm font-black tracking-[0.2em] uppercase">HatchKod <span className="text-[#194BFB]">LMS</span></span>
        </div>
        <Button
          variant="ghost"
          onClick={logout}
          className="text-xs font-semibold tracking-wider uppercase border border-[#333] hover:bg-[#194BFB] hover:text-white rounded-none h-9 px-4 transition-all"
        >
          Sign Out
        </Button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 z-10">
        <div className="w-full max-w-4xl border border-[#222] bg-[#111] p-8 sm:p-12 relative">
          {/* Accent corner */}
          <div className="absolute top-0 right-0 h-4 w-4 bg-[#194BFB]" />

          <div className="flex flex-col md:flex-row gap-12">
            {/* Left side: Notice */}
            <div className="flex-1 space-y-6">
              <div className="inline-flex items-center gap-2 border border-[#FF3B30]/30 bg-[#FF3B30]/10 px-3 py-1 text-xs text-[#FF3B30] font-mono tracking-wider uppercase">
                <AlertCircle className="h-3.5 w-3.5" />
                Demo Access Expired
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none text-white">
                YOUR TRIAL PERIOD HAS COMPLETED.
              </h1>

              <p className="text-slate-400 text-sm leading-relaxed">
                Thank you for trying out the HatchKod LMS. Your 5-session trial tier has expired. To continue your learning path, submit your enrollment payment.
              </p>

              {/* Student Details Card */}
              <div className="border border-[#222] bg-[#0A0A0A] p-4 font-mono text-xs space-y-1.5 text-slate-400">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Account Info</div>
                <div><span className="text-white">Student:</span> {user?.name}</div>
                <div><span className="text-white">Email:</span> {user?.email}</div>
                <div><span className="text-white">Status:</span> <span className="text-[#FF3B30] uppercase font-bold">EXPIRED_DEMO</span></div>
              </div>

              {/* ── Referral Code Section ────────────────────────── */}
              <div className="border border-[#222] bg-[#0A0A0A]">
                <button
                  onClick={() => setRefExpanded(!refExpanded)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold tracking-wider uppercase text-slate-400 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-[#194BFB]" />
                    Have a referral code? Save ₹500
                  </span>
                  {refExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {refExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[#222]">
                    {refApplied ? (
                      <div className="flex items-center justify-between bg-[#10B981]/10 border border-[#10B981]/30 px-3 py-2 mt-3">
                        <div className="flex items-center gap-2 text-xs text-[#10B981] font-mono">
                          <CheckCircle className="h-4 w-4 shrink-0" />
                          <span>
                            <span className="font-black">{refApplied.code}</span> applied — ₹{refApplied.discount} off via <span className="font-black">{refApplied.referrer_name}</span>
                          </span>
                        </div>
                        <button onClick={clearReferral} className="text-slate-500 hover:text-white ml-2">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-3">
                        <input
                          type="text"
                          value={refInput}
                          onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                          placeholder="HK-XXXXXX"
                          className="flex-1 bg-[#111] border border-[#333] px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-[#194BFB] uppercase"
                        />
                        <Button
                          onClick={handleApplyReferral}
                          disabled={refLoading || !refInput.trim()}
                          className="bg-[#194BFB] hover:bg-[#194BFB]/80 text-white text-xs font-bold tracking-wider uppercase rounded-none h-9 px-4"
                        >
                          {refLoading ? "…" : "Apply"}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right side: Payment Options */}
            <div className="flex-1 space-y-6">
              <h2 className="text-xs font-black tracking-[0.2em] uppercase text-[#194BFB]">Select Access Tier</h2>

              <div className="space-y-4">
                {/* Partial Tier */}
                <div className="border border-[#222] hover:border-[#194BFB] bg-[#0A0A0A] p-5 transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-sm tracking-wide">PARTIAL ACCESS</h3>
                      <p className="text-[11px] text-slate-500 mt-1">Unlock the initial phase &amp; foundation modules.</p>
                    </div>
                    <div className="text-right">
                      {discount > 0 && (
                        <div className="text-[11px] text-slate-500 line-through font-mono">₹2,500</div>
                      )}
                      <div className="font-black text-lg text-white">₹{(2500 - discount).toLocaleString("en-IN")}</div>
                      <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">INR</div>
                    </div>
                  </div>
                  <Button
                    onClick={() => handlePayOnline(2500, "partial")}
                    className="w-full mt-4 bg-transparent border border-[#333] hover:bg-[#194BFB] hover:text-white text-xs font-bold tracking-wider uppercase rounded-none h-10 transition-all flex items-center justify-center gap-2"
                  >
                    <CreditCard className="h-4 w-4" />
                    Pay ₹{(2500 - discount).toLocaleString("en-IN")} Online
                  </Button>
                </div>

                {/* Full Tier */}
                <div className="border border-[#194BFB] bg-[#194BFB]/5 p-5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 bg-[#194BFB] text-white font-mono text-[9px] font-black uppercase px-2 py-0.5 tracking-wider">
                    Recommended
                  </div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-sm tracking-wide text-white">FULL LIFETIME ACCESS</h3>
                      <p className="text-[11px] text-slate-400 mt-1">Access to all courses, modules, subtopics, and labs.</p>
                    </div>
                    <div className="text-right">
                      {discount > 0 && (
                        <div className="text-[11px] text-slate-500 line-through font-mono">₹8,500</div>
                      )}
                      <div className="font-black text-lg text-[#194BFB]">₹{(8500 - discount).toLocaleString("en-IN")}</div>
                      <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">INR</div>
                    </div>
                  </div>
                  <Button
                    onClick={() => handlePayOnline(8500, "full")}
                    className="w-full mt-4 bg-[#194BFB] hover:bg-[#194BFB]/80 text-white text-xs font-bold tracking-wider uppercase rounded-none h-10 transition-all flex items-center justify-center gap-2"
                  >
                    <CreditCard className="h-4 w-4" />
                    Pay ₹{(8500 - discount).toLocaleString("en-IN")} Online
                  </Button>
                </div>
              </div>

              {/* Support Links */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleWhatsAppClick}
                  className="flex-1 bg-[#25D366] hover:bg-[#20ba56] text-black font-black uppercase text-xs tracking-wider rounded-none h-11 flex items-center justify-center gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Share Receipt on WhatsApp
                </Button>
                <a
                  href="mailto:payments@hatchkod.com"
                  className="flex-1 border border-[#333] hover:bg-white hover:text-black font-black uppercase text-xs tracking-wider h-11 flex items-center justify-center gap-2 transition-all"
                >
                  <Mail className="h-4 w-4" />
                  Email Support
                </a>
              </div>
            </div>
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
