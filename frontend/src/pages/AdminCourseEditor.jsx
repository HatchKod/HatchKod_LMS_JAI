import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Plus, Trash2, ArrowLeft, FileText, Video, Pencil, Save, X, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

export default function AdminCourseEditor() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [editingLessonId, setEditingLessonId] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/courses/${id}`);
      setCourse(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load course");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const addModule = async (title) => {
    try {
      await api.post(`/courses/${id}/modules`, { title, sequence_order: (course?.modules?.length || 0) });
      toast.success("Module added");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const delModule = async (mid) => {
    if (!confirm("Are you sure? This will delete all lessons in this module.")) return;
    try {
      await api.delete(`/modules/${mid}`);
      toast.success("Module deleted");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const addLesson = async (mid, payload, taskPayload) => {
    try {
      const { data: l } = await api.post(`/modules/${mid}/lessons`, payload);
      if (taskPayload?.description) {
        await api.post(`/lessons/${l.id}/task`, taskPayload);
      }
      toast.success("Lesson added successfully");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const delLesson = async (lid) => {
    if (!confirm("Delete this lesson?")) return;
    try {
      await api.delete(`/lessons/${lid}`);
      toast.success("Lesson deleted");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const updateLesson = async (lid, payload) => {
    try {
      await api.patch(`/lessons/${lid}`, payload);
      toast.success("Lesson updated");
      setEditingLessonId(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  if (!course) return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Navbar />
      <div className="p-12 text-center text-slate-500 font-medium">Loading course data...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F5F7] font-['IBM_Plex_Sans']">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 fade-in">
        <Link to="/admin" className="text-xs font-bold text-slate-500 hover:text-[#194BFB] inline-flex items-center uppercase tracking-wider mb-6 transition-colors">
          <ArrowLeft className="mr-1.5 h-3 w-3" /> Back to Dashboard
        </Link>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-bold mb-2">Course Management</div>
            <h1 className="text-4xl font-extrabold tracking-tight text-[#0A0A0A] font-['Outfit']">{course.title}</h1>
          </div>
          <ModuleDialog onCreate={addModule} />
        </div>

        <div className="space-y-8">
          {course.modules.map((m, mi) => (
            <div key={m.id} className="bg-white border border-border rounded-sm overflow-hidden shadow-sm">
              <div className="p-4 bg-[#F4F5F7]/50 border-b border-border flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Module {mi + 1}</div>
                  <div className="font-['Outfit'] text-xl font-bold text-[#0A0A0A]">{m.title}</div>
                </div>
                <div className="flex items-center gap-3">
                  <LessonDialog onCreate={(p, t) => addLesson(m.id, p, t)} count={m.lessons.length} />
                  <Button variant="ghost" size="icon" onClick={() => delModule(m.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-border">
                {m.lessons.map((l, li) => (
                  <div key={l.id} className="transition-all">
                    <div className={`p-4 flex items-center justify-between gap-4 group hover:bg-slate-50/50 ${editingLessonId === l.id ? "bg-slate-50 border-l-4 border-l-[#194BFB]" : "border-l-4 border-l-transparent"}`}>
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-xs font-mono font-bold text-slate-300 group-hover:text-slate-400 transition-colors w-4">{li + 1}</span>
                        <div className="min-w-0">
                          <div className="font-bold text-[#0A0A0A] truncate">{l.title}</div>
                          <div className="flex flex-wrap gap-2 mt-1.5">
                            {l.content ? (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 rounded-sm text-[10px] uppercase px-1.5 py-0 gap-1">
                                <FileText className="h-3 w-3" /> Content
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">No content</span>
                            )}
                            {l.video_url ? (
                              <Badge variant="outline" className="bg-[#194BFB]/5 text-[#194BFB] border-[#194BFB]/20 rounded-sm text-[10px] uppercase px-1.5 py-0 gap-1">
                                <Video className="h-3 w-3" /> Recording
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-medium">No recording</span>
                            )}
                            {l.task && (
                              <Badge variant="outline" className="bg-[#F59E0B]/5 text-[#F59E0B] border-[#F59E0B]/20 rounded-sm text-[10px] uppercase px-1.5 py-0 gap-1">
                                <ClipboardCheck className="h-3 w-3" /> Has Task
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => setEditingLessonId(editingLessonId === l.id ? null : l.id)} className="h-8 w-8 text-slate-400 hover:text-[#194BFB] hover:bg-blue-50">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => delLesson(l.id)} className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {editingLessonId === l.id && (
                      <div className="px-10 py-6 bg-slate-50 border-t border-border border-l-4 border-l-[#194BFB]">
                        <LessonInlineEdit lesson={l} onSave={(payload) => updateLesson(l.id, payload)} onCancel={() => setEditingLessonId(null)} />
                      </div>
                    )}
                  </div>
                ))}
                {m.lessons.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-400 italic">No lessons in this module yet.</div>
                )}
              </div>
            </div>
          ))}
          {course.modules.length === 0 && (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-sm p-12 text-center">
              <div className="text-slate-400 font-medium mb-4">Your course is empty. Start by adding your first module.</div>
              <ModuleDialog onCreate={addModule} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonInlineEdit({ lesson, onSave, onCancel }) {
  const [form, setForm] = useState({ title: lesson.title, content: lesson.content || "", video_url: lesson.video_url || "" });
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4">
        <div>
          <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 block">Lesson Title</Label>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="rounded-sm font-bold" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 block">Recording URL (optional)</Label>
          <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="Paste YouTube or Google Drive link" className="rounded-sm font-mono text-xs" />
          <p className="text-[10px] text-slate-400 mt-1 italic">Students open this via the "Recordings" button on the lesson page.</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">Lesson Content</Label>
            <span className="text-[9px] text-slate-400 uppercase font-bold">Use # for headings, ## for subheadings, - for bullet lists</span>
          </div>
          <Textarea 
            value={form.content} 
            onChange={(e) => setForm({ ...form, content: e.target.value })} 
            rows={12} 
            className="rounded-sm font-mono text-sm leading-relaxed" 
            placeholder={"# Introduction\n\nStart your lesson content here...\n\n- Point one\n- Point two\n\n```javascript\nconsole.log('Use triple backticks for code blocks');\n```"}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={busy} className="bg-[#194BFB] hover:bg-[#0F3AE5] rounded-sm text-xs font-bold uppercase tracking-wider px-6">
          <Save className="h-3.5 w-3.5 mr-2" /> {busy ? "Saving..." : "Save Changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="rounded-sm text-xs font-bold text-slate-500 uppercase tracking-wider">
          <X className="h-3.5 w-3.5 mr-2" /> Cancel
        </Button>
      </div>
    </form>
  );
}

function ModuleDialog({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] font-bold uppercase tracking-wider text-xs px-6">
          <Plus className="mr-2 h-4 w-4" /> New Module
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-sm">
        <form onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try { await onCreate(title); setOpen(false); setTitle(""); }
          finally { setBusy(false); }
        }}>
          <DialogHeader>
            <DialogTitle className="font-['Outfit'] font-bold text-xl text-[#0A0A0A]">New Module</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 block">Module Title <span className="text-red-500">*</span></Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-sm font-bold" placeholder="e.g., Getting Started" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] w-full font-bold uppercase tracking-wider">
              {busy ? "Creating..." : "Create Module"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LessonDialog({ onCreate, count }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", video_url: "", content: "", taskDesc: "", taskInstr: "", taskOutput: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-sm border-[#194BFB]/30 text-[#194BFB] hover:bg-[#194BFB] hover:text-white font-bold uppercase tracking-wider text-[10px] h-8 px-3">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Lesson
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-2xl">
        <form onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onCreate(
              { title: form.title, video_url: form.video_url, content: form.content, sequence_order: count },
              { description: form.taskDesc, instructions: form.taskInstr, expected_output: form.taskOutput },
            );
            setOpen(false);
            setForm({ title: "", video_url: "", content: "", taskDesc: "", taskInstr: "", taskOutput: "" });
          } finally { setBusy(false); }
        }}>
          <DialogHeader>
            <DialogTitle className="font-['Outfit'] font-bold text-2xl text-[#0A0A0A]">New Lesson</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
            <div className="space-y-4">
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 block">Title <span className="text-red-500">*</span></Label>
                <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-sm font-bold" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 block">Recording URL</Label>
                <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} className="rounded-sm font-mono text-xs" placeholder="YouTube link..." />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">Content <span className="text-red-500">*</span></Label>
                </div>
                <Textarea 
                  required 
                  value={form.content} 
                  onChange={(e) => setForm({ ...form, content: e.target.value })} 
                  className="rounded-sm font-mono text-xs h-[160px]" 
                  placeholder={"# Heading\n- Bullet point\n```\ncode\n```"}
                />
              </div>
            </div>

            <div className="space-y-4 bg-[#F4F5F7]/50 p-4 rounded-sm border border-border">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-2 flex items-center gap-2">
                <ClipboardCheck className="h-3.5 w-3.5" /> Lesson Task (Optional)
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Task Description</Label>
                  <Input placeholder="e.g., Build a login page" value={form.taskDesc} onChange={(e) => setForm({ ...form, taskDesc: e.target.value })} className="rounded-sm text-xs" />
                </div>
                <div>
                  <Label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Instructions</Label>
                  <Textarea placeholder="Step by step instructions..." value={form.taskInstr} onChange={(e) => setForm({ ...form, taskInstr: e.target.value })} className="rounded-sm text-xs h-[80px]" />
                </div>
                <div>
                  <Label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1 block">Expected Output</Label>
                  <Textarea placeholder="Code snippet or description of result" value={form.taskOutput} onChange={(e) => setForm({ ...form, taskOutput: e.target.value })} className="rounded-sm text-xs h-[60px] bg-[#0A0A0A] text-[#10B981] font-mono" />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-sm text-xs font-bold text-slate-500 uppercase tracking-wider">Cancel</Button>
            <Button type="submit" disabled={busy} className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] font-bold uppercase tracking-wider min-w-[120px]">
              {busy ? "Creating..." : "Create Lesson"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
