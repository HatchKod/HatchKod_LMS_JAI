import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Lock, CheckCircle2, PlayCircle, Folder, Circle, Plus, Minus, Check } from "lucide-react";
import StatusPill from "../components/StatusPill";
import { useAuth } from "../lib/auth";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { toast } from "sonner";
import Breadcrumbs from "../components/Breadcrumbs";

export default function CourseView() {
  const { id } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await api.get(`/courses/${id}`);
      setCourse(data);
    })();
  }, [id]);

  if (!course) {
    return (
    <div className="min-h-screen bg-slate-50/30">
      <Navbar />
      <TooltipProvider>
        <div className="max-w-4xl mx-auto py-16 px-6">
          <div className="mx-auto max-w-7xl p-6 text-sm text-slate-500">Loading…</div>
        </div>
      </TooltipProvider>
    </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-['IBM_Plex_Sans']">
      <Navbar />
      <TooltipProvider delayDuration={0}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 fade-in">
          <Breadcrumbs items={[{ label: course.title }]} />
          
          <div className="mb-12 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#194BFB] font-bold mb-3">Your Journey</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#0A0A0A] font-['Outfit']" data-testid="course-title">{course.title}</h1>
          <p className="mt-4 text-slate-500 max-w-2xl mx-auto text-lg">{course.description}</p>
        </div>

        <Card className="rounded-sm border-border overflow-hidden bg-white shadow-sm">
          <div className="border-b border-border p-6 bg-white flex items-center justify-center">
            <h2 className="text-xl font-bold font-['Outfit'] text-[#0A0A0A]">Syllabus</h2>
          </div>
          
          <Accordion type="multiple" className="divide-y divide-border">
            {course.modules.map((m, mi) => (
              <AccordionItem key={m.id} value={`module-${m.id}`} className="border-none">
                <AccordionTrigger className="px-6 py-5 hover:no-underline group transition-all [&[data-state=open]]:bg-slate-50/50">
                  <div className="flex items-center gap-4 text-left">
                    <div className="h-10 w-10 bg-amber-50 rounded-sm flex items-center justify-center border border-amber-100 shrink-0">
                      <Folder className="h-5 w-5 text-amber-500 fill-amber-500" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">Module {mi + 1}</div>
                      <div className="font-['Outfit'] text-lg font-bold text-[#0A0A0A] group-hover:text-[#194BFB] transition-colors">{m.title}</div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  <Accordion type="multiple" className="divide-y divide-slate-100">
                    {m.lessons.map((l, li) => {
                      const locked = user?.role === "student" && !l.unlocked;
                      return (
                        <LessonAccordion key={l.id} lesson={l} li={li} locked={locked} />
                      );
                    })}
                  </Accordion>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {course.modules.length === 0 && (
            <div className="p-12 text-center text-slate-500 font-medium bg-slate-50/50">No modules yet.</div>
          )}
        </Card>
      </div>
      </TooltipProvider>
    </div>
  );
}

function LessonAccordion({ lesson, li, locked }) {
  return (
    <AccordionItem value={`lesson-${lesson.id}`} className="border-none">
      <AccordionTrigger className="px-10 py-4 hover:no-underline group transition-all [&[data-state=open]]:bg-slate-50/30">
        <div className="flex items-center gap-4 text-left">
          <div className="h-2 w-2 rounded-full bg-[#194BFB] shadow-[0_0_8px_rgba(25,75,251,0.5)] shrink-0" />
          <div className={`font-bold text-base transition-colors flex items-center gap-3 ${locked ? "text-slate-400" : "text-[#0A0A0A] group-hover:text-[#194BFB]"}`}>
            {lesson.title}
            {locked && <Lock className="h-3 w-3" />}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="p-0">
        <div className="divide-y divide-slate-50">
          {/* Learn Item */}
          {lesson.content && (
            <SyllabusItem 
              lessonId={lesson.id}
              type="Learn"
              title={lesson.title}
              completed={lesson.completed}
              locked={locked}
            />
          )}
          {/* Practice Item */}
          {lesson.task && (
            <SyllabusItem 
              lessonId={lesson.id}
              type="Practice"
              title={lesson.task.description || `${lesson.title} Task`}
              completed={lesson.submission?.status === 'approved'}
              locked={locked}
            />
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function SyllabusItem({ lessonId, type, title, completed, locked }) {
  const content = (
    <div className={`flex items-center gap-12 px-16 py-4 transition-all ${locked ? "opacity-60 cursor-not-allowed bg-slate-50/30" : "hover:bg-slate-50/50 cursor-pointer"}`}>
      <div className="flex items-center gap-12 min-w-0 flex-1">
        <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${completed ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-200"}`}>
          {completed ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : (locked ? <Lock className="h-3 w-3 text-slate-400" /> : <div className="h-2 w-2 rounded-full bg-slate-200" />)}
        </div>
        <div className={`w-20 shrink-0 text-sm font-bold uppercase tracking-wider ${locked ? "text-slate-400" : "text-[#0A0A0A]"}`}>{type === 'Practice' ? 'Task' : type}</div>
        <div className={`text-base font-medium truncate ${locked ? "text-slate-400" : "text-slate-700"}`}>
          {title}
        </div>
      </div>
    </div>
  );

  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full">{content}</div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-slate-900 text-white font-bold border-none shadow-lg">
          Complete previous items to unlock
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link to={`/lesson/${lessonId}?mode=${type === 'Practice' ? 'task' : 'content'}`} className="block">
      {content}
    </Link>
  );
}
