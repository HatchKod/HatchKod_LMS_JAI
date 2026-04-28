import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import Navbar from "../components/Navbar";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await login(email.trim().toLowerCase(), password);
    setBusy(false);
    if (!res.ok) { setError(res.error); toast.error(res.error); return; }
    toast.success("Welcome back");
    const home = res.user.role === "admin" ? "/admin" : res.user.role === "mentor" ? "/mentor" : "/dashboard";
    nav(home);
  };

  const fillDemo = (role) => {
    if (role === "admin") { setEmail("admin@hatchkod.com"); setPassword("admin123"); }
    if (role === "mentor") { setEmail("mentor@hatchkod.com"); setPassword("mentor123"); }
    if (role === "student") { setEmail("student@hatchkod.com"); setPassword("student123"); }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="mx-auto max-w-md px-4 sm:px-6 py-16">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-3">Sign in</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Welcome back.</h1>
        <p className="mt-2 text-slate-600 text-sm">Continue your learning journey.</p>

        <Card className="mt-8 rounded-sm border-border">
          <form onSubmit={submit} className="p-6 space-y-4" data-testid="login-form">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required className="rounded-sm" data-testid="login-email-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required className="rounded-sm" data-testid="login-password-input" />
            </div>
            {error && <div className="text-sm text-red-600" data-testid="login-error">{error}</div>}
            <Button type="submit" disabled={busy} className="w-full rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="login-submit-btn">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <div className="text-sm text-slate-600 text-center">
              No account?{" "}
              <Link to="/register" className="text-[#194BFB] underline" data-testid="login-register-link">Create one</Link>
            </div>
          </form>
        </Card>

        <div className="mt-6 border border-border rounded-sm p-4 bg-[#F4F5F7]">
          <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-2">Demo accounts</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-sm" onClick={() => fillDemo("admin")} data-testid="demo-admin-btn">Admin</Button>
            <Button size="sm" variant="outline" className="rounded-sm" onClick={() => fillDemo("mentor")} data-testid="demo-mentor-btn">Mentor</Button>
            <Button size="sm" variant="outline" className="rounded-sm" onClick={() => fillDemo("student")} data-testid="demo-student-btn">Student</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
