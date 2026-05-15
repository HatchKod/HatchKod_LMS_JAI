import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { 
  ArrowRight, 
  Code2, 
  GitBranch, 
  ShieldCheck, 
  Workflow, 
  Database, 
  Layers, 
  Cpu, 
  Globe,
  CheckCircle2,
  HelpCircle,
  Zap
} from "lucide-react";
import Navbar from "../components/Navbar";
import { useAuth } from "../lib/auth";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";

export default function Landing() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white selection:bg-[#194BFB]/10 selection:text-[#194BFB]">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-24 lg:pt-32 lg:pb-40">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 opacity-[0.03] pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#194BFB_1px,transparent_1px)] [background-size:40px_40px]" />
        </div>
        
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
            <div className="lg:col-span-7 relative z-10">
              <div className="inline-flex items-center gap-2 border border-[#194BFB]/20 bg-[#194BFB]/5 rounded-full px-4 py-1.5 text-[10px] sm:text-[11px] uppercase font-bold tracking-[0.2em] text-[#194BFB] mb-8 animate-fade-in">
                <Zap className="h-3.5 w-3.5 fill-[#194BFB]" /> The Future of Engineering Education
              </div>
              
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1] text-[#0A0A0A] font-['Outfit']" data-testid="hero-heading">
                Build real software.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#194BFB] to-[#FF5500]">Get real jobs.</span>
              </h1>
              
              <p className="mt-8 max-w-xl text-lg sm:text-xl text-slate-600 leading-relaxed font-medium" data-testid="hero-subheading">
                HatchKod is an elite, task-driven learning platform for engineering students. 
                Master full-stack engineering through production-grade tasks and 1-on-1 mentor reviews.
              </p>
              
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] px-10 h-14 text-base font-bold shadow-xl shadow-[#194BFB]/20 transition-all hover:scale-105 active:scale-95" data-testid="hero-cta-login">
                  <Link to={user ? "/dashboard" : "/login"}>
                    {user ? "Go to Dashboard" : "Sign In to Learning"} <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <div className="flex items-center gap-4 px-2">
                  <div className="flex -space-x-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-10 w-10 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                        {String.fromCharCode(64 + i)}
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    <span className="text-[#0A0A0A] font-bold">500+</span> students<br />building today
                  </div>
                </div>
              </div>

              <div className="mt-16 pt-10 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-8">
                <StatItem label="Active" value="Tasks" color="#194BFB" />
                <StatItem label="Mentor" value="Reviews" color="#FF5500" />
                <StatItem label="Locked" value="Progression" color="#059669" />
                <StatItem label="GitHub" value="Portfolio" color="#4B5563" />
              </div>
            </div>

            <div className="lg:col-span-5 relative group">
              <div className="absolute -inset-4 bg-gradient-to-tr from-[#194BFB]/10 to-[#FF5500]/10 rounded-xl blur-2xl opacity-50 group-hover:opacity-100 transition duration-1000"></div>
              <div className="relative border border-slate-800 bg-[#0A0A0A] text-white p-6 font-mono text-[11px] sm:text-xs leading-relaxed rounded-sm shadow-2xl overflow-hidden min-h-[360px] flex flex-col">
                <div className="flex items-center gap-1.5 mb-6 border-b border-white/5 pb-4">
                  <span className="h-3 w-3 rounded-full bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <span className="h-3 w-3 rounded-full bg-yellow-500/80 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="ml-3 text-slate-500 tracking-wider font-bold">~/hatchkod/batch-2026/backend</span>
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex gap-2">
                    <span className="text-emerald-400 font-bold">$</span>
                    <span className="text-white">git push origin development</span>
                  </div>
                  <div className="text-slate-400 pl-4 animate-pulse">Compressing objects: 100% (8/8), done.</div>
                  <div className="text-slate-400 pl-4 italic">Writing objects: 100% (8/8), 2.45 KiB, done.</div>
                  <div className="text-blue-400 pl-4 font-bold">Total 8 (delta 5), reused 0 (delta 0)</div>
                  <div className="text-emerald-400 pl-4">→ Submitting Task #4: "Spring Boot Security Integration"</div>
                  
                  <div className="mt-6 pt-6 border-t border-white/5 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                      <span className="text-amber-400 font-bold tracking-tight">MENTOR REVIEW IN PROGRESS</span>
                    </div>
                    <div className="text-slate-500 text-[10px]">Mentor: Jayaprakash K.</div>
                  </div>

                  <div className="mt-8 animate-bounce-slow">
                    <span className="text-emerald-400 font-bold">$</span>
                    <span className="text-[#9bb6ff] ml-2">hatchkod status --check</span>
                    <div className="mt-1 text-emerald-400 font-bold bg-emerald-400/10 px-2 py-1 rounded inline-block">✓ TASK APPROVED! Unlocking Lesson 5...</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="py-20 bg-[#F8FAFC] border-y border-slate-100 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-[11px] uppercase tracking-[0.3em] text-slate-500 font-bold mb-4">Enterprise Tech Stack</h2>
            <p className="text-slate-600 font-medium">We only teach what the industry actually uses.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-60 hover:opacity-100 transition-opacity duration-500 grayscale hover:grayscale-0">
            <TechIcon Icon={Database} label="PostgreSQL" />
            <TechIcon Icon={Layers} label="Spring Boot" />
            <TechIcon Icon={Code2} label="Java" />
            <TechIcon Icon={Globe} label="React.js" />
            <TechIcon Icon={Cpu} label="AWS" />
            <TechIcon Icon={GitBranch} label="Git/GitHub" />
          </div>
        </div>
      </section>

      {/* Learning Path Section */}
      <section className="py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center lg:text-left">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-[#194BFB] font-bold mb-6">Learning Framework</div>
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#0A0A0A] font-['Outfit'] leading-[1.1]">
                Stop passive watching.
                <br />
                <span className="text-slate-400">Start active building.</span>
              </h2>
              <p className="mt-6 text-lg text-slate-600 leading-relaxed max-w-xl">
                The HatchKod curriculum is a series of engineering challenges. 
                You cannot move to Lesson 2 until you have successfully built and pushed the task for Lesson 1. 
                Real progress requires real code.
              </p>
              
              <div className="mt-12 space-y-8">
                <FeatureItem 
                  title="Zero Skipping" 
                  desc="Sequential unlocking ensures no gaps in your knowledge." 
                />
                <FeatureItem 
                  title="Human-in-the-loop" 
                  desc="Real mentors review your GitHub code, not just automated scripts." 
                />
                <FeatureItem 
                  title="GitHub Portfolio" 
                  desc="Every lesson completed adds a production-ready commit to your profile." 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-4 pt-12 sm:pt-24">
                <ProcessCard step="01" title="Learn" desc="Watch high-density lessons and read technical documentation." />
                <ProcessCard step="02" title="Build" desc="Implement the task locally on your own machine." />
              </div>
              <div className="space-y-4">
                <ProcessCard step="03" title="Submit" desc="Push your code to GitHub and submit the URL for review." />
                <ProcessCard step="04" title="Level Up" desc="Get approval, earn XP, and unlock the next milestone." />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-[#F8FAFC] border-t border-slate-100">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight font-['Outfit']">Frequently Asked Questions</h2>
            <p className="mt-4 text-slate-600">Everything you need to know about the HatchKod system.</p>
          </div>
          
          <Accordion type="single" collapsible className="space-y-4">
            <FaqItem value="item-1" question="Is this suitable for absolute beginners?">
              Yes. We start from the absolute basics of Java and Web fundamentals. However, the pace is intense because we focus on job-readiness in a short timeframe.
            </FaqItem>
            <FaqItem value="item-2" question="Who are the mentors?">
              Our mentors are professional software engineers currently working in the industry. They review your code according to production standards.
            </FaqItem>
            <FaqItem value="item-3" question="Can I learn at my own pace?">
              Yes. HatchKod is self-paced, but you must complete the tasks sequentially. Most students finish the core program in 4-6 months.
            </FaqItem>
            <FaqItem value="item-4" question="How does the GitHub integration work?">
              For every task, you'll provide a GitHub repository link. Our system tracks your submissions, and mentors review the actual code diffs you've pushed.
            </FaqItem>
          </Accordion>
        </div>
      </section>

      {/* Removed Final CTA Section since registration is Admin-only */}

      <footer className="border-t border-slate-100 bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-8 text-sm text-slate-500">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="HatchKod" className="h-8 w-auto" />
            <span className="font-[Outfit] font-bold text-slate-900">HatchKod</span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span>Empowering Coders. Building Futures.</span>
          </div>
          <div className="flex items-center gap-8 font-medium">
            <Link to="/login" className="hover:text-[#194BFB] transition-colors">Sign In</Link>
            <Link to="/leaderboard" className="hover:text-[#194BFB] transition-colors">Leaderboard</Link>
            <a href="mailto:support@hatchkod.in" className="hover:text-[#194BFB] transition-colors">Support</a>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="font-mono text-[10px] text-slate-400 uppercase tracking-widest">© {new Date().getFullYear()} HatchKod LMS</div>
            <div className="font-mono text-[10px] text-[#194BFB]">build.deploy.repeat()</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatItem({ label, value, color }) {
  return (
    <div>
      <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">{label}</div>
      <div className="font-['Outfit'] text-xl sm:text-2xl font-bold mt-1 text-slate-900" style={{ color: '#0A0A0A' }}>{value}</div>
      <div className="h-1 w-6 mt-2 rounded-full" style={{ backgroundColor: color }} />
    </div>
  );
}

function TechIcon({ Icon, label }) {
  return (
    <div className="flex flex-col items-center gap-3 transition-transform hover:-translate-y-1">
      <div className="h-14 w-14 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
        <Icon className="h-7 w-7 text-slate-700" />
      </div>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
  );
}

function FeatureItem({ title, desc }) {
  return (
    <div className="flex gap-4">
      <div className="mt-1 h-5 w-5 shrink-0 rounded-full bg-[#194BFB]/10 flex items-center justify-center">
        <CheckCircle2 className="h-3.5 w-3.5 text-[#194BFB]" />
      </div>
      <div>
        <h4 className="font-bold text-[#0A0A0A]">{title}</h4>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function ProcessCard({ step, title, desc }) {
  return (
    <div className="bg-white p-8 border border-slate-100 rounded-sm shadow-sm hover:shadow-xl hover:border-[#194BFB]/30 transition-all group">
      <div className="text-4xl font-['Outfit'] font-black text-slate-100 group-hover:text-[#194BFB]/10 transition-colors leading-none">{step}</div>
      <h3 className="mt-4 font-['Outfit'] text-xl font-extrabold text-[#0A0A0A]">{title}</h3>
      <p className="mt-2 text-sm text-slate-500 leading-relaxed font-medium">{desc}</p>
    </div>
  );
}

function FaqItem({ value, question, children }) {
  return (
    <AccordionItem value={value} className="border border-slate-200 bg-white rounded-sm px-2 overflow-hidden shadow-sm">
      <AccordionTrigger className="hover:no-underline font-bold text-slate-900 px-4 py-4 text-left">
        {question}
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 text-slate-600 font-medium leading-relaxed">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
