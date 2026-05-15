import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, BookOpen, Pencil, Eye, EyeOff, Trash } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";

export default function CourseList() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const loadCourses = async () => {
    try {
      const res = await api.get("/admin/courses");
      setCourses(res.data || []);
    } catch (e) {
      toast.error("Failed to load courses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handlePublishToggle = async (course) => {
    const action = course.is_published ? "unpublish" : "publish";
    try {
      await api.post(`/admin/courses/${course.id}/${action}`);
      toast.success(`Course ${action}ed`);
      setCourses(courses.map(c => 
        c.id === course.id ? { ...c, is_published: !c.is_published } : c
      ));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || `Failed to ${action} course`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this course? This cannot be undone.")) return;
    try {
      await api.delete(`/admin/courses/${id}`);
      toast.success("Course deleted");
      setCourses(courses.filter(c => c.id !== id));
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to delete course");
    }
  };

  const filteredCourses = courses.filter(c => {
    const matchesSearch = c.title?.toLowerCase().includes(search.toLowerCase()) || 
                          c.short_description?.toLowerCase().includes(search.toLowerCase());
    const matchesDiff = difficultyFilter === "All" || c.difficulty === difficultyFilter.toLowerCase();
    const matchesStatus = statusFilter === "All" || 
                          (statusFilter === "Published" && c.is_published) || 
                          (statusFilter === "Draft" && !c.is_published);
    return matchesSearch && matchesDiff && matchesStatus;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>Courses</h1>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-sm">{courses.length} total</span>
        </div>
        <button 
          onClick={() => navigate("/admin/courses/new")}
          className="flex items-center gap-2 bg-[#194BFB] text-white px-4 py-2 rounded-sm text-sm hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" /> New Course
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8 bg-white p-4 border border-slate-200 rounded-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input 
            type="text"
            placeholder="Search courses..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-sm text-sm focus:outline-none focus:border-[#194BFB]"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Difficulty:</span>
          {["All", "Beginner", "Intermediate", "Advanced"].map(d => (
            <button
              key={d}
              onClick={() => setDifficultyFilter(d)}
              className={`px-3 py-1 text-xs rounded-sm border transition ${difficultyFilter === d ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-l pl-4 ml-2">
          <span className="text-xs text-slate-500 font-medium">Status:</span>
          {["All", "Published", "Draft"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs rounded-sm border transition ${statusFilter === s ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-64 bg-slate-100 rounded-sm"></div>)}
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-sm">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No courses found matching criteria.</p>
          <button 
            onClick={() => navigate("/admin/courses/new")}
            className="mt-4 text-sm text-[#194BFB] font-medium"
          >
            Create your first course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map(course => (
            <div key={course.id} className="bg-white border border-slate-200 rounded-sm overflow-hidden hover:border-[#194BFB] transition flex flex-col group cursor-pointer" onClick={() => navigate(`/admin/course/${course.id}`)}>
              <div className="h-40 bg-slate-100 relative flex items-center justify-center border-b">
                {course.thumbnail_url ? (
                  <img src={course.thumbnail_url} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <BookOpen className="w-10 h-10 text-slate-300" />
                )}
                <div className={`absolute top-2 right-2 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm ${course.is_published ? "bg-green-500 text-white" : "bg-slate-500 text-white"}`}>
                  {course.is_published ? "Published" : "Draft"}
                </div>
              </div>
              
              <div className="p-4 flex-1">
                <h3 className="text-sm font-semibold text-slate-800 line-clamp-2" style={{ fontFamily: "Outfit, sans-serif" }}>
                  {course.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 h-8">
                  {course.short_description || course.description || "No description provided."}
                </p>
                
                <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
                  <span className={`px-2 py-0.5 rounded-sm capitalize ${
                    course.difficulty === 'beginner' ? 'bg-green-100 text-green-700' : 
                    course.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-700' : 
                    'bg-red-100 text-red-700'
                  }`}>
                    {course.difficulty || 'beginner'}
                  </span>
                  <span>•</span>
                  <span className="truncate max-w-[120px]">By {course.created_by_name || "Admin"}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 p-3 bg-slate-50 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <button 
                  onClick={() => navigate(`/admin/course/${course.id}`)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border bg-white px-2.5 py-1.5 rounded-sm"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                
                <button 
                  onClick={() => handlePublishToggle(course)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border bg-white px-2.5 py-1.5 rounded-sm"
                >
                  {course.is_published ? <><EyeOff className="w-3.5 h-3.5" /> Unpublish</> : <><Eye className="w-3.5 h-3.5" /> Publish</>}
                </button>

                <button 
                  onClick={() => handleDelete(course.id)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 border bg-white px-2.5 py-1.5 rounded-sm ml-auto opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
