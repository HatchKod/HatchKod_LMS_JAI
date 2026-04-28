import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import Navbar from "../components/Navbar";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await register({ ...form, email: form.email.trim().toLowerCase() });
    setBusy(false);
    if (!res.ok) { setError(res.error); toast.error(res.error); return; }
    toast.success("Account created");
    const home = res.user.role === "mentor" ? "/mentor" : "/dashboard";
    nav(home);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="mx-auto max-w-md px-4 sm:px-6 py-16">
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
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider">I am a</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="rounded-sm" data-testid="register-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="mentor">Mentor</SelectItem>
                </SelectContent>
              </Select>
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
      </div>
    </div>
  );
}
