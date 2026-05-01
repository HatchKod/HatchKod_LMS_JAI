import { useEffect, useState, useMemo } from "react";
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
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { 
  Plus, 
  Trash2, 
  FolderTree, 
  Users, 
  BookOpen, 
  Layers, 
  FileText, 
  Clock, 
  CheckCircle,
  UserCheck,
  UserPlus
} from "lucide-react";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [activeTab, setActiveTab] = useState("courses");

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
    <div className="min-h-screen bg-[#F8FAFC]" data-testid="admin-dashboard">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 fade-in">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <div className="flex items-center justify-between border-b border-slate-200 mb-8">
            <TabsList className="bg-transparent h-auto p-0 gap-8">
              <TabsTrigger 
                value="courses" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#194BFB] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 py-3 text-sm font-medium transition-all"
                data-testid="tab-courses"
              >
                <FolderTree className="mr-2 h-4 w-4" />
                Courses
              </TabsTrigger>
              <TabsTrigger 
                value="users" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#194BFB] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 py-3 text-sm font-medium transition-all"
                data-testid="tab-users"
              >
                <Users className="mr-2 h-4 w-4" />
                Users
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center">
              {activeTab === "courses" ? (
                <CreateCourseDialog refresh={refresh} />
              ) : (
                <CreateUserDialog refresh={refresh} />
              )}
            </div>
          </div>
          
          <TabsContent value="courses" className="mt-0 outline-none">
            <CoursesPanel courses={courses} stats={stats} refresh={refresh} />
          </TabsContent>
          <TabsContent value="users" className="mt-0 outline-none">
            <UsersPanel students={students} mentors={mentors} stats={stats} refresh={refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ label, v, icon: Icon, color, accent }) {
  return (
    <div className={`bg-white py-3 px-5 border-l-4 ${color} shadow-sm rounded-lg flex items-center justify-between gap-5 transition-all hover:shadow-md`}>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-widest text-slate-400 font-bold leading-none mb-2">{label}</div>
        <div className={`font-[Outfit] text-xl font-bold ${accent || "text-slate-900"} leading-none`}>{v}</div>
      </div>
      <Icon className="h-5 w-5 text-slate-300 shrink-0" />
    </div>
  );
}

function CreateCourseDialog({ refresh }) {
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-md bg-[#194BFB] hover:bg-[#0F3AE5] shadow-sm h-9 px-4 text-xs font-bold" data-testid="admin-new-course-btn">
          <Plus className="mr-2 h-3.5 w-3.5" />
          New Course
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-lg sm:max-w-[500px]">
        <form onSubmit={(e) => { e.preventDefault(); create(); }}>
          <DialogHeader><DialogTitle className="text-2xl font-bold">Create Course</DialogTitle></DialogHeader>
          <div className="space-y-4 my-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Title <span className="text-red-500">*</span></Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-md" data-testid="admin-course-title-input" placeholder="e.g. Full Stack Web Development" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description <span className="text-red-500">*</span></Label>
              <Textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-md min-h-[120px]" data-testid="admin-course-desc-input" placeholder="What will students learn in this course?" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Thumbnail URL (optional)</Label>
              <Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} className="rounded-md" placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full sm:w-auto rounded-md bg-[#194BFB] hover:bg-[#0F3AE5]">
              {busy ? "Creating..." : "Create Course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateUserDialog({ refresh }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student" });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await api.post("/admin/users", form);
      toast.success("User created"); setOpen(false); setForm({ name: "", email: "", password: "", role: "student" });
      refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-md bg-[#194BFB] hover:bg-[#0F3AE5] shadow-sm h-9 px-4 text-xs font-bold" data-testid="admin-add-user-btn">
          <UserPlus className="mr-2 h-3.5 w-3.5" />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-lg sm:max-w-[425px]">
        <form onSubmit={(e) => { e.preventDefault(); create(); }}>
          <DialogHeader><DialogTitle className="text-2xl font-bold">Create New User</DialogTitle></DialogHeader>
          <div className="space-y-4 my-6">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Name <span className="text-red-500">*</span></Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-md" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email <span className="text-red-500">*</span></Label>
              <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-md" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Password <span className="text-red-500">*</span></Label>
              <Input required minLength={6} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-md" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Role <span className="text-red-500">*</span></Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="mentor">Mentor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="w-full rounded-md bg-[#194BFB] hover:bg-[#0F3AE5]">
              {busy ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CoursesPanel({ courses, stats, refresh }) {
  const remove = async (id) => {
    if (!confirm("Delete course and all its content?")) return;
    try { await api.delete(`/courses/${id}`); toast.success("Deleted"); refresh(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const updateStatus = async (id, status) => {
    try { await api.put(`/courses/${id}/status`, { status }); toast.success("Status updated"); refresh(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      {stats && (
        <div className="flex flex-wrap gap-2">
          <Stat label="Courses" v={stats.courses} icon={BookOpen} color="border-blue-500" />
          <Stat label="Modules" v={stats.modules} icon={Layers} color="border-blue-500" />
          <Stat label="Lessons" v={stats.lessons} icon={FileText} color="border-blue-500" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {courses.map((c) => (
          <Card key={c.id} className="rounded-xl border-slate-200 p-6 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between" data-testid={`admin-course-card-${c.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    c.status === "published" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : 
                    c.status === "draft" ? "bg-slate-100 text-slate-600 border border-slate-200" : 
                    "bg-red-50 text-red-700 border border-red-100"
                  }`}>
                    {c.status}
                  </span>
                </div>
                <h3 className="font-[Outfit] text-xl font-bold text-slate-900 leading-tight">{c.title}</h3>
                <p className="text-sm text-slate-500 mt-2 line-clamp-3 leading-relaxed">{c.description}</p>
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <button onClick={() => remove(c.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Delete" data-testid={`admin-delete-course-${c.id}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select value={c.status} onValueChange={(v) => updateStatus(c.id, v)}>
                  <SelectTrigger className="h-9 w-full sm:w-32 text-xs rounded-md bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none rounded-md" data-testid={`admin-view-course-${c.id}`}>
                  <Link to={`/course/${c.id}`}>View</Link>
                </Button>
                <Button asChild size="sm" className="flex-1 sm:flex-none rounded-md bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid={`admin-edit-course-${c.id}`}>
                  <Link to={`/admin/course/${c.id}`}>Manage</Link>
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {courses.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border-2 border-dashed border-slate-200">
            <FolderTree className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-lg">No courses yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function UsersPanel({ students, mentors, stats, refresh }) {
  const assign = async (sid, mid) => {
    try {
      await api.post(`/users/${sid}/assign-mentor`, { mentor_id: mid });
      toast.success("Mentor assigned"); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const getInitials = (name) => {
    return name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "??";
  };

  const mentorStats = useMemo(() => {
    const counts = {};
    students.forEach(s => {
      if (s.assigned_mentor_id) {
        counts[s.assigned_mentor_id] = (counts[s.assigned_mentor_id] || 0) + 1;
      }
    });
    return counts;
  }, [students]);

  return (
    <div className="space-y-6">
      {stats && (
        <div className="flex flex-wrap gap-2">
          <Stat label="Students" v={stats.students} icon={Users} color="border-blue-500" />
          <Stat label="Mentors" v={stats.mentors} icon={UserCheck} color="border-blue-500" />
          <Stat label="Pending" v={stats.pending_submissions} icon={Clock} color="border-amber-500" accent="text-amber-600" />
          <Stat label="Approved" v={stats.approved_submissions} icon={CheckCircle} color="border-emerald-500" accent="text-emerald-600" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="rounded-xl border-slate-200 overflow-hidden bg-white shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#194BFB] font-bold">Students ({students.length})</div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {students.map((s) => (
              <div key={s.id} className="px-6 py-5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors group" data-testid={`admin-student-row-${s.id}`}>
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                    <AvatarFallback className="bg-slate-100 text-slate-600 text-xs font-bold">
                      {getInitials(s.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-bold text-slate-900 leading-tight">{s.name}</div>
                    <div className="text-xs text-slate-500 font-medium">{s.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={s.assigned_mentor_id || ""} onValueChange={(v) => assign(s.id, v)}>
                    <SelectTrigger className="h-8 w-40 text-[11px] rounded-md bg-white border-slate-200 group-hover:border-[#194BFB]/30 transition-colors" data-testid={`admin-assign-select-${s.id}`}>
                      <SelectValue placeholder="Assign mentor" />
                    </SelectTrigger>
                    <SelectContent>
                      {mentors.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          {m.name} ({mentorStats[m.id] || 0})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            {students.length === 0 && <div className="p-12 text-center text-slate-400 text-sm italic">No students registered yet.</div>}
          </div>
        </Card>

        <Card className="rounded-xl border-slate-200 overflow-hidden bg-white shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Mentors ({mentors.length})</div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {mentors.map((m) => (
              <div key={m.id} className="px-6 py-5 flex items-center gap-4 hover:bg-slate-50 transition-colors" data-testid={`admin-mentor-row-${m.id}`}>
                <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                  <AvatarFallback className="bg-slate-900 text-white text-xs font-bold">
                    {getInitials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-bold text-slate-900 leading-tight flex items-center gap-2">
                    {m.name}
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-[9px] text-blue-600 font-bold border border-blue-100">
                      {mentorStats[m.id] || 0} Students
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-medium">{m.email}</div>
                </div>
              </div>
            ))}
            {mentors.length === 0 && <div className="p-12 text-center text-slate-400 text-sm italic">No mentors registered yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
