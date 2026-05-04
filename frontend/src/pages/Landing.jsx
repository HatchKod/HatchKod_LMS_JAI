import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ArrowRight, Code2, GitBranch, ShieldCheck, Workflow } from "lucide-react";
import Navbar from "../components/Navbar";
import { useAuth } from "../lib/auth";

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pt-12 sm:pt-20 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-2 border border-border rounded-sm px-2 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-600 mb-6" data-testid="hero-eyebrow">
              <span className="h-1.5 w-1.5 bg-[#FF5500]" /> Learn-by-building. Backed by mentors.
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]" data-testid="hero-heading">
              Become a job-ready
              <br />
              developer.{" "}
              <span className="text-[#194BFB]">No fluff.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base sm:text-lg text-slate-600 leading-relaxed" data-testid="hero-subheading">
              HatchKod is a task-driven LMS for engineering students. Watch a lesson, build the task,
              push to GitHub, get mentor approval, then unlock the next lesson. No skipping ahead.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="hero-cta-login">
                <Link to={user ? "/dashboard" : "/login"}>
                  {user ? "Go to Dashboard" : "Sign In"} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
              {[
                { k: "Active", v: "Tasks" },
                { k: "Mentor", v: "Reviews" },
                { k: "Locked", v: "Progression" },
                { k: "GitHub", v: "Portfolio" },
              ].map((s) => (
                <div key={s.v} className="bg-white p-4">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{s.k}</div>
                  <div className="font-[Outfit] text-xl font-semibold mt-1">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="border border-border bg-[#0A0A0A] text-white p-6 font-mono text-xs leading-relaxed rounded-sm">
              <div className="flex items-center gap-1.5 mb-4">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="ml-2 text-slate-400">~/hatchkod/lesson-2</span>
              </div>
              <div><span className="text-emerald-400">$</span> git push origin main</div>
              <div className="text-slate-400">Submitting Task #2 to mentor…</div>
              <div className="text-amber-400">▸ Status: PENDING REVIEW</div>
              <div className="mt-3"><span className="text-emerald-400">$</span> hatchkod check</div>
              <div className="text-emerald-400">✓ Lesson 2 approved by Riya</div>
              <div className="text-[#9bb6ff]">→ Unlocking Lesson 3…</div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-[#F4F5F7]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-3">How it works</div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-2xl">
            One simple loop. Zero passive watching.
          </h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-px bg-border border border-border">
            {[
              { Icon: Code2, t: "Learn", d: "Watch the lesson and read the brief." },
              { Icon: GitBranch, t: "Build", d: "Code locally, push to GitHub." },
              { Icon: Workflow, t: "Submit", d: "Drop your repo URL into the lesson." },
              { Icon: ShieldCheck, t: "Approved", d: "Mentor reviews. Next lesson unlocks." },
            ].map(({ Icon, t, d }, i) => (
              <div key={t} className="bg-white p-6">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Step {i + 1}</div>
                <Icon className="mt-3 h-5 w-5 text-[#194BFB]" />
                <div className="mt-3 font-[Outfit] text-lg font-semibold">{t}</div>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>© {new Date().getFullYear()} HatchKod LMS</div>
          <div className="font-mono">build.deploy.repeat()</div>
        </div>
      </footer>
    </div>
  );
}
