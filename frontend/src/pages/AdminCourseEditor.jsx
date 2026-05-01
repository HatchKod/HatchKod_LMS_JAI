import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function AdminCourseEditor() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);

  const load = async () => {
    const { data } = await api.get(`/courses/${id}`);
    setCourse(data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const addModule = async (title) => {
    try { await api.post(`/courses/${id}/modules`, { title, sequence_order: (course?.modules?.length || 0) }); toast.success("Module added"); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const delModule = async (mid) => {
    if (!confirm("Delete module?")) return;
    try { await api.delete(`/modules/${mid}`); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const addLesson = async (mid, payload, taskPayload) => {
    try {
      const { data: l } = await api.post(`/modules/${mid}/lessons`, payload);
      if (taskPayload?.description) {
        await api.post(`/lessons/${l.id}/task`, taskPayload);
      }
      toast.success("Lesson added"); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const delLesson = async (lid) => {
    if (!confirm("Delete lesson?")) return;
    try { await api.delete(`/lessons/${lid}`); load(); } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (!course) return (<div className="min-h-screen bg-white"><Navbar /><div className="p-6 text-sm text-slate-500">Loading…</div></div>);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 fade-in">
        <Link to="/admin" className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center"><ArrowLeft className="mr-1 h-3 w-3" />Back to Admin</Link>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-1">Editing Course</div>
            <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
          </div>
          <ModuleDialog onCreate={addModule} />
        </div>

        <div className="mt-8 space-y-6">
          {course.modules.map((m, mi) => (
            <Card key={m.id} className="rounded-sm border-border">
              <div className="p-4 bg-[#F4F5F7] border-b border-border flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Module {mi + 1}</div>
                  <div className="font-[Outfit] text-lg font-semibold">{m.title}</div>
                </div>
                <div className="flex items-center gap-2">
                  <LessonDialog onCreate={(p, t) => addLesson(m.id, p, t)} count={m.lessons.length} />
                  <button onClick={() => delModule(m.id)} className="text-slate-400 hover:text-red-600" data-testid={`admin-del-module-${m.id}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="divide-y divide-border">
                {m.lessons.map((l, li) => (
                  <div key={l.id} className="p-4 flex items-center justify-between gap-3" data-testid={`admin-lesson-row-${l.id}`}>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{li + 1}. {l.title}</div>
                      <div className="text-xs text-slate-500 truncate">{l.task ? `Task: ${l.task.description}` : "No task"}</div>
                    </div>
                    <button onClick={() => delLesson(l.id)} className="text-slate-400 hover:text-red-600" data-testid={`admin-del-lesson-${l.id}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                {m.lessons.length === 0 && <div className="p-4 text-sm text-slate-500">No lessons yet.</div>}
              </div>
            </Card>
          ))}
          {course.modules.length === 0 && <div className="text-sm text-slate-500">No modules yet. Create one to start.</div>}
        </div>
      </div>
    </div>
  );
}

function ModuleDialog({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="admin-new-module-btn"><Plus className="mr-1.5 h-4 w-4" />New Module</Button>
      </DialogTrigger>
      <DialogContent className="rounded-sm">
        <form onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try { await onCreate(title); setOpen(false); setTitle(""); }
          finally { setBusy(false); }
        }}>
          <DialogHeader><DialogTitle>New Module</DialogTitle></DialogHeader>
          <div className="space-y-4 my-4">
            <div>
              <Label className="text-xs uppercase tracking-wider">Title <span className="text-red-500">*</span></Label>
              <Input required value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-sm" data-testid="admin-module-title-input" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="admin-create-module-confirm">
              {busy ? "Creating…" : "Create"}
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
        <Button size="sm" variant="outline" className="rounded-sm" data-testid="admin-new-lesson-btn"><Plus className="mr-1.5 h-4 w-4" />Lesson</Button>
      </DialogTrigger>
      <DialogContent className="rounded-sm max-w-lg">
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
          <DialogHeader><DialogTitle>New Lesson</DialogTitle></DialogHeader>
          <div className="space-y-3 my-4 max-h-[60vh] overflow-auto pr-2">
            <div>
              <Label className="text-xs uppercase tracking-wider">Title <span className="text-red-500">*</span></Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-sm" data-testid="admin-lesson-title-input" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Video URL (optional)</Label>
              <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} className="rounded-sm" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Content <span className="text-red-500">*</span></Label>
              <Textarea required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="rounded-sm" />
            </div>
            <div className="border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-2">Attach a task (optional)</div>
              <div className="space-y-2">
                <Input placeholder="Task description" value={form.taskDesc} onChange={(e) => setForm({ ...form, taskDesc: e.target.value })} className="rounded-sm" data-testid="admin-task-desc-input" />
                <Textarea placeholder="Instructions" value={form.taskInstr} onChange={(e) => setForm({ ...form, taskInstr: e.target.value })} className="rounded-sm" data-testid="admin-task-instr-input" />
                <Textarea placeholder="Expected output (optional)" value={form.taskOutput} onChange={(e) => setForm({ ...form, taskOutput: e.target.value })} className="rounded-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="admin-create-lesson-confirm">
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
