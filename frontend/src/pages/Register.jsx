import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";
import Navbar from "../components/Navbar";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  // Intercept referral code from URL ?ref= parameter
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      localStorage.setItem("hk_ref", ref);
      toast.info(`Referral code "${ref}" applied! You'll get ₹500 off at checkout.`);
    }
  }, [searchParams]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const ref_code = localStorage.getItem("hk_ref") || undefined;
    const res = await register({ ...form, email: form.email.trim().toLowerCase(), role: "student", ref_code });
    setBusy(false);
    if (!res.ok) { setError(res.error); toast.error(res.error); return; }
    // Clear the referral code after successful registration
    localStorage.removeItem("hk_ref");
    setSuccess(true);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="mx-auto max-w-md px-4 sm:px-6 py-16">
        {success ? (
          /* ── Success Screen ── */
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#10B981]/10 mb-6">
              <CheckCircle className="h-10 w-10 text-[#10B981]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Account Created!</h1>
            <p className="text-slate-500 text-sm mb-8">
              Your HatchKod account is ready. Please sign in to get started.
            </p>
            <Button
              onClick={() => nav("/login")}
              className="w-full rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] py-3"
            >
              Go to Login
            </Button>
            <p className="text-xs text-slate-400 mt-4">
              You'll be asked to log in each session to keep your account secure.
            </p>
          </div>
        ) : (
          /* ── Register Form ── */
          <>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-3">Create account</div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Start building.</h1>
            <p className="mt-2 text-slate-600 text-sm">Join the next batch of HatchKod developers.</p>

            <Card className="mt-8 rounded-sm border-border">
              <form onSubmit={submit} className="p-6 space-y-4" data-testid="register-form">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider">Full name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required className="rounded-sm" data-testid="register-name-input" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider">Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required className="rounded-sm" data-testid="register-email-input" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider">Password</Label>
                  <Input type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required className="rounded-sm" data-testid="register-password-input" />
                </div>
                {error && <div className="text-sm text-red-600" data-testid="register-error">{error}</div>}
                <Button type="submit" disabled={busy} className="w-full rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="register-submit-btn">
                  {busy ? "Creating…" : "Create account"}
                </Button>
                <div className="text-sm text-slate-600 text-center">
                  Already have an account?{" "}
                  <Link to="/login" className="text-[#194BFB] underline" data-testid="register-login-link">Sign in</Link>
                </div>
              </form>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
