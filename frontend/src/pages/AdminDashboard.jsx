import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
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
  UserPlus,
  MoreVertical,
  UserX,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Pencil,
  X,
  Eye,
  EyeOff
} from "lucide-react";
import { toast } from "sonner";
import AdminAttendance from "../components/admin/AdminAttendance";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [inactiveUsers, setInactiveUsers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [activeTab, setActiveTab] = useState("courses");
  const [selectedBatch, setSelectedBatch] = useState(null);

  const refresh = async () => {
    const [s, c, st, mt, inact, b] = await Promise.all([
      api.get("/dashboard/admin"),
      api.get("/admin/courses"),
      api.get("/users", { params: { role: "student" } }),
      api.get("/users", { params: { role: "mentor" } }),
      api.get("/users/inactive"),
      api.get("/admin/batches")
    ]);
    setStats(s.data); 
    setCourses(c.data); 
    setStudents(st.data); 
    setMentors(mt.data);
    setInactiveUsers(inact.data);
    setBatches(b.data);
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
              <TabsTrigger 
                value="batches" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#194BFB] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 py-3 text-sm font-medium transition-all"
                data-testid="tab-batches"
              >
                <LayoutGrid className="mr-2 h-4 w-4" />
                Batches
              </TabsTrigger>
              <TabsTrigger 
                value="attendance" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#194BFB] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 py-3 text-sm font-medium transition-all"
                data-testid="tab-attendance"
              >
                <Clock className="mr-2 h-4 w-4" />
                Attendance
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center">
              {activeTab === "users" ? (
                <CreateUserDialog refresh={refresh} />
              ) : activeTab === "batches" ? (
                <UpsertBatchDialog refresh={refresh} courses={courses} mentors={mentors} />
              ) : null}
            </div>
          </div>
          
          <TabsContent value="courses" className="mt-0 outline-none">
            <CoursesPanel courses={courses} stats={stats} refresh={refresh} />
          </TabsContent>
          <TabsContent value="users" className="mt-0 outline-none">
            <UsersPanel students={students} mentors={mentors} inactiveUsers={inactiveUsers} stats={stats} refresh={refresh} />
          </TabsContent>
          <TabsContent value="batches" className="mt-0 outline-none">
            <BatchesPanel 
              batches={batches} 
              selectedBatch={selectedBatch} 
              setSelectedBatch={setSelectedBatch} 
              refresh={refresh} 
              courses={courses} 
              mentors={mentors}
            />
          </TabsContent>
          <TabsContent value="attendance" className="mt-0 outline-none">
            <AdminAttendance />
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
  const navigate = useNavigate();
  const [showNewModal, setShowNewModal] = useState(false);
  const [newCourse, setNewCourse] = useState({
    title: "",
    course_type: "live",
    difficulty: "beginner",
    category: "Java",
    flow_type: "linear"
  });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!newCourse.title) return toast.error("Title is required");
    setBusy(true);
    try {
      const res = await api.post("/admin/courses", newCourse);
      toast.success("Course created");
      setShowNewModal(false);
      navigate(`/admin/course/${res.data.id}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm("Delete this course and all its content?")) return;
    try { 
      await api.delete(`/admin/courses/${id}`); 
      toast.success("Course deleted"); 
      refresh(); 
    } catch (e) { 
      toast.error(formatApiError(e.response?.data?.detail)); 
    }
  };

  const togglePublish = async (course) => {
    const action = course.is_published ? "unpublish" : "publish";
    try {
      await api.post(`/admin/courses/${course.id}/${action}`);
      toast.success(`Course ${action}ed`);
      refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const stats_published = courses.filter(c => c.is_published).length;
  const stats_drafts = courses.length - stats_published;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-4">
          <div className="bg-white px-4 py-2 border border-slate-200 rounded-sm shadow-sm">
            <div className="text-[10px] uppercase font-bold text-slate-400">Total</div>
            <div className="text-xl font-bold font-[Outfit]">{courses.length}</div>
          </div>
          <div className="bg-white px-4 py-2 border border-slate-200 rounded-sm shadow-sm">
            <div className="text-[10px] uppercase font-bold text-emerald-500">Published</div>
            <div className="text-xl font-bold font-[Outfit]">{stats_published}</div>
          </div>
          <div className="bg-white px-4 py-2 border border-slate-200 rounded-sm shadow-sm">
            <div className="text-[10px] uppercase font-bold text-slate-400">Drafts</div>
            <div className="text-xl font-bold font-[Outfit]">{stats_drafts}</div>
          </div>
        </div>
        <Button onClick={() => setShowNewModal(true)} className="rounded-sm bg-[#194BFB] hover:bg-blue-700 font-bold px-6">
          <Plus className="mr-2 h-4 w-4" /> New Course
        </Button>
      </div>

      <Card className="rounded-sm border-slate-200 overflow-hidden bg-white shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase tracking-wider font-bold text-slate-500 border-b border-slate-100">
              <th className="px-6 py-4">Thumbnail & Title</th>
              <th className="px-6 py-4">Category</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Difficulty</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-16 bg-slate-100 rounded-sm overflow-hidden flex items-center justify-center border border-slate-200 shrink-0">
                      {c.thumbnail_url ? (
                        <img src={c.thumbnail_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <BookOpen className="h-4 w-4 text-slate-300" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 leading-tight">{c.title}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Created by {c.created_by_name || 'Admin'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-medium px-2 py-1 bg-slate-100 rounded-sm">{c.category || 'Java'}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-medium capitalize">{c.course_type || 'live'}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm border ${
                    c.difficulty === 'beginner' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                    c.difficulty === 'intermediate' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                    'bg-rose-50 text-rose-600 border-rose-100'
                  }`}>
                    {c.difficulty || 'beginner'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-sm text-[10px] font-bold uppercase ${
                    c.is_published ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {c.is_published ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0 hover:bg-slate-100">
                      <Link to={`/admin/course/${c.id}`} title="Edit Content"><Pencil className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => togglePublish(c)}
                      className="h-8 w-8 p-0 hover:bg-slate-100 text-slate-500"
                      title={c.is_published ? "Unpublish" : "Publish"}
                    >
                      {c.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => remove(c.id)}
                      className="h-8 w-8 p-0 hover:text-red-600 hover:bg-red-50 text-slate-300 group-hover:text-slate-400"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan="6" className="py-20 text-center text-slate-400">
                  <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-10" />
                  <p>No courses found. Create one to get started.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-[Outfit]">Create New Course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Course Title</Label>
              <Input 
                placeholder="e.g. Java Masterclass 2024"
                value={newCourse.title}
                onChange={e => setNewCourse({...newCourse, title: e.target.value})}
                className="rounded-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Course Type</Label>
                <Select value={newCourse.course_type} onValueChange={v => setNewCourse({...newCourse, course_type: v})}>
                  <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live Class</SelectItem>
                    <SelectItem value="recorded">Recorded</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Difficulty</Label>
                <Select value={newCourse.difficulty} onValueChange={v => setNewCourse({...newCourse, difficulty: v})}>
                  <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Category</Label>
                <Input value={newCourse.category} onChange={e => setNewCourse({...newCourse, category: e.target.value})} className="rounded-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Content Flow</Label>
                <Select value={newCourse.flow_type} onValueChange={v => setNewCourse({...newCourse, flow_type: v})}>
                  <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear (Sequential)</SelectItem>
                    <SelectItem value="free_flow">Free Flow (Random)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewModal(false)} className="rounded-sm">Cancel</Button>
            <Button onClick={create} disabled={busy} className="bg-[#194BFB] hover:bg-blue-700 rounded-sm px-8 font-bold">
              {busy ? "Creating..." : "Start Building"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsersPanel({ students, mentors, inactiveUsers, stats, refresh }) {
  const [showInactive, setShowInactive] = useState(false);

  const assign = async (sid, mid) => {
    try {
      await api.post(`/users/${sid}/assign-mentor`, { mentor_id: mid });
      toast.success("Mentor assigned"); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const deactivate = async (user) => {
    if (!confirm(`Are you sure you want to deactivate ${user.name}? This cannot be undone from the app.`)) return;
    try {
      await api.patch(`/users/${user.id}/deactivate`);
      toast.success("User deactivated"); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const activate = async (user) => {
    if (!confirm(`Reactivate ${user.name}? They will regain access to the platform.`)) return;
    try {
      await api.patch(`/users/${user.id}/activate`);
      toast.success("User reactivated"); refresh();
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
    <div className="space-y-8">
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
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
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
                <div className="flex items-center gap-3">
                  <Select value={s.assigned_mentor_id || ""} onValueChange={(v) => assign(s.id, v)}>
                    <SelectTrigger className="h-8 w-40 text-[11px] rounded-md bg-white border-slate-200 group-hover:border-[#194BFB]/30 transition-colors" data-testid={`admin-assign-select-${s.id}`}>
                      <SelectValue placeholder="Assign mentor" />
                    </SelectTrigger>
                    <SelectContent>
                      {mentors.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => deactivate(s)} className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
                        <UserX className="mr-2 h-4 w-4" />
                        Deactivate
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
            {students.length === 0 && <div className="p-12 text-center text-slate-400 text-sm italic">No students registered yet.</div>}
          </div>
        </Card>

        <Card className="rounded-xl border-slate-200 overflow-hidden bg-white shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Mentors ({mentors.length})</div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {mentors.map((m) => (
              <div key={m.id} className="px-6 py-5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors group" data-testid={`admin-mentor-row-${m.id}`}>
                <div className="flex items-center gap-4">
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

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => deactivate(m)} className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
                      <UserX className="mr-2 h-4 w-4" />
                      Deactivate
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {mentors.length === 0 && <div className="p-12 text-center text-slate-400 text-sm italic">No mentors registered yet.</div>}
          </div>
        </Card>
      </div>

      <div className="pt-4">
        <button 
          onClick={() => setShowInactive(!showInactive)}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors text-sm font-bold uppercase tracking-widest group"
        >
          {showInactive ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Inactive Users ({inactiveUsers.length})
        </button>

        {showInactive && (
          <Card className="mt-4 rounded-xl border-slate-200 overflow-hidden bg-white shadow-sm border-dashed">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Joined</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inactiveUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-4 font-bold text-slate-900">{u.name}</td>
                      <td className="px-6 py-4 text-slate-500">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          u.role === "mentor" ? "bg-purple-50 text-purple-600 border border-purple-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 text-xs">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          onClick={() => activate(u)}
                          variant="ghost" 
                          size="sm" 
                          className="h-8 px-3 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-bold rounded-md"
                        >
                          <RotateCcw className="mr-2 h-3.5 w-3.5" />
                          Activate
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {inactiveUsers.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-slate-400 italic">No inactive users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function BatchesPanel({ batches, selectedBatch, setSelectedBatch, refresh, courses, mentors }) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Left Panel: Batch List */}
      <div className="w-full lg:w-[60%] space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-[Outfit] font-medium text-slate-900">Batches</h2>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {batches.map((b) => (
            <BatchCard 
              key={b.id} 
              batch={b} 
              isSelected={selectedBatch?.id === b.id}
              onSelect={() => setSelectedBatch(b)}
              refresh={refresh}
              courses={courses}
              mentors={mentors}
            />
          ))}
          {batches.length === 0 && (
            <div className="py-12 text-center text-slate-400 bg-white rounded-sm border border-dashed border-slate-200">
              No batches created yet.
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Student Management */}
      <div className="w-full lg:w-[40%] sticky top-24">
        {selectedBatch ? (
          <ManageStudentsPanel 
            batch={selectedBatch} 
            onClose={() => setSelectedBatch(null)} 
          />
        ) : (
          <Card className="p-12 flex flex-col items-center justify-center text-slate-400 border-dashed border-2 bg-slate-50/30">
            <Users className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">Select a batch to manage students</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function BatchCard({ batch, isSelected, onSelect, refresh, courses, mentors }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    try {
      await api.delete(`/admin/batches/${batch.id}`);
      toast.success("Batch deleted");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete batch");
    }
  };

  const statusStyles = {
    upcoming: "bg-slate-100 text-slate-600",
    active: "bg-[#10B981] text-white",
    completed: "bg-slate-800 text-slate-100"
  };

  return (
    <Card className={`p-4 rounded-sm border-slate-200 bg-white transition-all hover:bg-slate-50 ${isSelected ? 'border-l-4 border-l-[#194BFB] shadow-md' : 'border-l-4 border-l-transparent'}`}>
      <div className="flex justify-between items-start mb-1">
        <h3 className="font-medium text-sm text-slate-900">{batch.name}</h3>
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${statusStyles[batch.status]}`}>
          {batch.status}
        </span>
      </div>
      
      <div className="text-xs text-slate-500 flex items-center gap-2 mb-3">
        <span>{batch.course_title}</span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-600 font-medium">{batch.mentor_name}</span>
      </div>

      <div className="text-[11px] text-slate-400 mb-4">
        {batch.start_date ? `Started: ${new Date(batch.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : "No start date"}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold rounded-sm border-slate-200" onClick={onSelect}>
          <Users className="h-3 w-3 mr-1.5" /> Manage Students
        </Button>
        <UpsertBatchDialog batch={batch} refresh={refresh} courses={courses} mentors={mentors}>
          <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold rounded-sm border-slate-200">
            <Pencil className="h-3 w-3 mr-1.5" /> Edit
          </Button>
        </UpsertBatchDialog>
        
        {isDeleting ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-red-600 font-bold mr-1">Delete?</span>
            <Button size="sm" className="h-7 px-2 text-[10px] bg-red-600 hover:bg-red-700" onClick={confirmDelete}>Confirm</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => setIsDeleting(false)}>No</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold rounded-sm border-slate-200 hover:text-red-600 hover:border-red-200" onClick={() => setIsDeleting(true)}>
            <Trash2 className="h-3 w-3 mr-1.5" /> Delete
          </Button>
        )}
      </div>
    </Card>
  );
}

function ManageStudentsPanel({ batch, onClose }) {
  const [enrolled, setEnrolled] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [busy, setBusy] = useState(false);

  const loadData = async () => {
    try {
      const [resEnrolled, resAll] = await Promise.all([
        api.get(`/batches/${batch.id}/students`),
        api.get("/admin/students")
      ]);
      setEnrolled(resEnrolled.data);
      setAllStudents(resAll.data);
    } catch (e) {
      toast.error("Failed to load students");
    }
  };

  useEffect(() => { loadData(); }, [batch.id]);

  const addStudent = async () => {
    if (!selectedStudentId) return;
    setBusy(true);
    try {
      await api.post(`/admin/batches/${batch.id}/students`, { student_id: selectedStudentId });
      toast.success("Student added to batch");
      setSelectedStudentId("");
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to add student");
    } finally { setBusy(false); }
  };

  const removeStudent = async (sid) => {
    try {
      await api.delete(`/admin/batches/${batch.id}/students/${sid}`);
      toast.success("Student removed");
      loadData();
    } catch (e) {
      toast.error("Failed to remove student");
    }
  };

  const availableStudents = allStudents.filter(s => !enrolled.some(e => e.id === s.id));

  return (
    <Card className="rounded-sm border-slate-200 bg-white overflow-hidden shadow-lg">
      <div className="bg-slate-900 p-4 text-white flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">{batch.name} — Students</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Manage batch enrollment</p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Add Student Section */}
        <div className="space-y-2">
          <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Add Student to Batch</Label>
          <div className="flex gap-2">
            <select 
              className="flex-1 rounded-sm border border-slate-200 bg-slate-50 h-9 px-3 text-xs outline-none focus:ring-1 focus:ring-[#194BFB]"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              <option value="">Select a student...</option>
              {availableStudents.map(s => (
                <option key={s.id} value={s.id}>{s.name} — {s.email}</option>
              ))}
            </select>
            <Button size="sm" className="h-9 px-4 bg-[#194BFB] hover:bg-[#0F3AE5] text-xs font-bold rounded-sm" onClick={addStudent} disabled={busy || !selectedStudentId}>
              Add
            </Button>
          </div>
        </div>

        {/* Enrolled List */}
        <div className="space-y-3">
          <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center justify-between">
            Enrolled Students
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px]">{enrolled.length}</span>
          </Label>
          
          <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
            {enrolled.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-sm border border-slate-50 hover:border-slate-100 hover:bg-slate-50/50 group">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-blue-100 text-[#194BFB] flex items-center justify-center text-[10px] font-bold">
                    {(s.name || "Student").split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">{s.name}</div>
                    <div className="text-[10px] text-slate-500">{s.email}</div>
                  </div>
                </div>
                <button onClick={() => removeStudent(s.id)} className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {enrolled.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs italic bg-slate-50/50 rounded-sm border border-dashed border-slate-100">
                No students enrolled yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function UpsertBatchDialog({ refresh, courses, mentors, batch, children }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    course_id: "",
    mentor_id: "",
    start_date: "",
    status: "upcoming"
  });

  useEffect(() => {
    if (batch && open) {
      setForm({
        name: batch.name || "",
        course_id: batch.course_id || "",
        mentor_id: batch.mentor_id || "",
        start_date: batch.start_date || "",
        status: batch.status || "upcoming"
      });
    }
  }, [batch, open]);

  const save = async () => {
    if (!form.name || !form.course_id || !form.mentor_id) {
      toast.error("Please fill in required fields");
      return;
    }
    setBusy(true);
    try {
      if (batch) {
        await api.patch(`/admin/batches/${batch.id}`, form);
      } else {
        await api.post("/admin/batches", form);
      }
      toast.success("Batch saved");
      setOpen(false);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save batch");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] h-9 px-4 text-xs font-bold">
            <Plus className="mr-2 h-3.5 w-3.5" /> New Batch
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-[#194BFB] p-6 text-white">
          <DialogTitle className="text-2xl font-['Outfit'] font-bold">
            {batch ? "Edit Batch" : "Create New Batch"}
          </DialogTitle>
          <p className="text-blue-100 text-xs mt-1">Configure batch settings and assignment</p>
        </div>

        <div className="p-8 space-y-5 bg-white">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Batch Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="h-11 rounded-sm border-slate-200" placeholder="e.g. Java Morning Batch Jan" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Select Course *</Label>
            <select 
              className="w-full rounded-sm border border-slate-200 bg-white h-11 px-3 text-sm outline-none focus:ring-1 focus:ring-[#194BFB]"
              value={form.course_id}
              onChange={(e) => setForm({...form, course_id: e.target.value})}
            >
              <option value="">Select a course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Assign Mentor *</Label>
            <select 
              className="w-full rounded-sm border border-slate-200 bg-white h-11 px-3 text-sm outline-none focus:ring-1 focus:ring-[#194BFB]"
              value={form.mentor_id}
              onChange={(e) => setForm({...form, mentor_id: e.target.value})}
            >
              <option value="">Select a mentor...</option>
              {mentors.map(m => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Start Date</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({...form, start_date: e.target.value})} className="h-11 rounded-sm border-slate-200" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Status</Label>
              <select 
                className="w-full rounded-sm border border-slate-200 bg-white h-11 px-3 text-sm outline-none focus:ring-1 focus:ring-[#194BFB]"
                value={form.status}
                onChange={(e) => setForm({...form, status: e.target.value})}
              >
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1 rounded-sm font-bold text-slate-500 uppercase tracking-widest text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1 rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] font-bold uppercase tracking-widest text-xs shadow-lg shadow-blue-100" onClick={save} disabled={busy}>
              {busy ? "Saving..." : "Save Batch"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
