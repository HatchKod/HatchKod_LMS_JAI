import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Plus, Trash2, FolderTree, Users } from "lucide-react";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [mentors, setMentors] = useState([]);

  const refresh = async () => {
    const [s, c, st, mt] = await Promise.all([
      api.get("/dashboard/admin"),
      api.get("/courses"),
      api.get("/users", { params: { role: "student" } }),
      api.get("/users", { params: { role: "mentor" } }),
    ]);
    setStats(s.data); setCourses(c.data); setStudents(st.data); setMentors(mt.data);
  };
  useEffect(() => { refresh(); }, []);

  return (
    <div className="min-h-screen bg-white" data-testid="admin-dashboard">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 fade-in">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 mb-2">Admin Console</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Platform Control</h1>

        {stats && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-px bg-border border border-border">
            <Stat label="Courses" v={stats.courses} />
            <Stat label="Modules" v={stats.modules} />
            <Stat label="Lessons" v={stats.lessons} />
            <Stat label="Students" v={stats.students} />
            <Stat label="Mentors" v={stats.mentors} />
            <Stat label="Pending" v={stats.pending_submissions} accent="text-amber-600" />
            <Stat label="Approved" v={stats.approved_submissions} accent="text-emerald-600" />
          </div>
        )}

        <Tabs defaultValue="courses" className="mt-10">
          <TabsList className="rounded-sm">
            <TabsTrigger value="courses" data-testid="tab-courses"><FolderTree className="mr-1.5 h-4 w-4" />Courses</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users"><Users className="mr-1.5 h-4 w-4" />Users</TabsTrigger>
          </TabsList>
          <TabsContent value="courses" className="mt-6">
            <CoursesPanel courses={courses} refresh={refresh} />
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            <UsersPanel students={students} mentors={mentors} refresh={refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ label, v, accent }) {
  return (
    <div className="bg-white p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className={`mt-1 font-[Outfit] text-2xl font-semibold ${accent || ""}`}>{v}</div>
    </div>
  );
}

function CoursesPanel({ courses, refresh }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", thumbnail_url: "" });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!form.title) return;
    setBusy(true);
    try {
      await api.post("/courses", { ...form, status: "published" });
      toast.success("Course created"); setOpen(false); setForm({ title: "", description: "", thumbnail_url: "" });
      refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm("Delete course and all its content?")) return;
    try { await api.delete(`/courses/${id}`); toast.success("Deleted"); refresh(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold tracking-tight">All Courses</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="admin-new-course-btn"><Plus className="mr-1.5 h-4 w-4" />New Course</Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm">
            <DialogHeader><DialogTitle>Create Course</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs uppercase tracking-wider">Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-sm" data-testid="admin-course-title-input" /></div>
              <div><Label className="text-xs uppercase tracking-wider">Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-sm" data-testid="admin-course-desc-input" /></div>
              <div><Label className="text-xs uppercase tracking-wider">Thumbnail URL</Label>
                <Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} className="rounded-sm" /></div>
            </div>
            <DialogFooter>
              <Button onClick={create} disabled={busy} className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="admin-create-course-confirm">Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courses.map((c) => (
          <Card key={c.id} className="rounded-sm border-border p-5" data-testid={`admin-course-card-${c.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Course</div>
                <div className="font-[Outfit] text-lg font-semibold mt-1">{c.title}</div>
                <div className="text-sm text-slate-600 mt-1 line-clamp-2">{c.description}</div>
              </div>
              <button onClick={() => remove(c.id)} className="text-slate-400 hover:text-red-600" title="Delete" data-testid={`admin-delete-course-${c.id}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-sm" data-testid={`admin-view-course-${c.id}`}>
                <Link to={`/course/${c.id}`}>View</Link>
              </Button>
              <Button asChild size="sm" className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid={`admin-edit-course-${c.id}`}>
                <Link to={`/admin/course/${c.id}`}>Edit Modules / Lessons</Link>
              </Button>
            </div>
          </Card>
        ))}
        {courses.length === 0 && <div className="text-sm text-slate-500">No courses yet.</div>}
      </div>
    </div>
  );
}

function UsersPanel({ students, mentors, refresh }) {
  const assign = async (sid, mid) => {
    try {
      await api.post(`/users/${sid}/assign-mentor`, { mentor_id: mid });
      toast.success("Mentor assigned"); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="rounded-sm border-border">
        <div className="p-4 border-b border-border bg-[#F4F5F7]"><div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Students</div></div>
        <div className="divide-y divide-border">
          {students.map((s) => (
            <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" data-testid={`admin-student-row-${s.id}`}>
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-slate-500 font-mono">{s.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={s.assigned_mentor_id || ""} onValueChange={(v) => assign(s.id, v)}>
                  <SelectTrigger className="w-48 rounded-sm" data-testid={`admin-assign-select-${s.id}`}><SelectValue placeholder="Assign mentor" /></SelectTrigger>
                  <SelectContent>
                    {mentors.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          {students.length === 0 && <div className="p-4 text-sm text-slate-500">No students yet.</div>}
        </div>
      </Card>
      <Card className="rounded-sm border-border">
        <div className="p-4 border-b border-border bg-[#F4F5F7]"><div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Mentors</div></div>
        <div className="divide-y divide-border">
          {mentors.map((m) => (
            <div key={m.id} className="p-4" data-testid={`admin-mentor-row-${m.id}`}>
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-slate-500 font-mono">{m.email}</div>
            </div>
          ))}
          {mentors.length === 0 && <div className="p-4 text-sm text-slate-500">No mentors yet.</div>}
        </div>
      </Card>
    </div>
  );
}
