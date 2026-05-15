import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { 
  ArrowLeft, Cog, Plus, GripVertical, ChevronDown, ChevronRight, 
  MoreHorizontal, BookOpen, ClipboardList, Loader2, Trash
} from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";

export default function CourseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  
  // UI State
  const [activeItem, setActiveItem] = useState(isNew ? { type: "course" } : null);
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [saveStatus, setSaveStatus] = useState(""); // "", "Saving...", "Saved ✓", "Save failed"
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isNew) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      setLoading(false);
      toast.error("Loading timed out. Please check your connection.");
    }, 10000); // 10 second timeout

    const loadData = async () => {
      try {
        const res = await api.get(`/courses/${id}/full`, { signal: controller.signal });
        clearTimeout(timeoutId);
        setCourse(res.data.course);
        setModules(res.data.modules);
        setActiveItem({ type: "course" });
      } catch (e) {
        if (e.name === 'AbortError' || e.code === 'ERR_CANCELED') return;
        toast.error("Failed to load course. " + (e.response?.data?.detail || ""));
        console.error("Load error:", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [id, isNew]);

  const autoSave = async (fn) => {
    setSaveStatus("Saving...");
    try {
      await fn();
      setSaveStatus("Saved ✓");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (e) {
      setSaveStatus("Save failed");
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
      setTimeout(() => setSaveStatus(""), 3000);
    }
  };

  const handleDragEnd = async (result) => {
    const { destination, source, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === "MODULE") {
      const newModules = Array.from(modules);
      const [removed] = newModules.splice(source.index, 1);
      newModules.splice(destination.index, 0, removed);
      setModules(newModules);
      
      autoSave(() => api.post(`/courses/${id}/modules/reorder`, {
        ordered_ids: newModules.map(m => m.id)
      }));
    } else if (type === "LESSON") {
      const sourceModId = source.droppableId;
      const destModId = destination.droppableId;
      
      const newModules = [...modules];
      const sourceMod = newModules.find(m => m.id === sourceModId);
      const destMod = newModules.find(m => m.id === destModId);
      
      if (sourceModId === destModId) {
        const newLessons = Array.from(sourceMod.lessons);
        const [removed] = newLessons.splice(source.index, 1);
        newLessons.splice(destination.index, 0, removed);
        sourceMod.lessons = newLessons;
        setModules(newModules);
        
        autoSave(() => api.post(`/modules/${sourceModId}/lessons/reorder`, {
          ordered_ids: newLessons.map(l => l.id)
        }));
      }
      // Cross-module drag could be implemented here, but requires API support for moving lessons
    }
  };

  const toggleModule = (modId, e) => {
    e?.stopPropagation();
    const newExp = new Set(expandedModules);
    if (newExp.has(modId)) newExp.delete(modId);
    else newExp.add(modId);
    setExpandedModules(newExp);
  };

  const addModule = async () => {
    if (isProcessing) return;
    const title = prompt("Module Title:");
    if (!title) return;
    setIsProcessing(true);
    try {
      const res = await api.post(`/courses/${id}/modules`, { title });
      const newMod = { ...res.data, lessons: [] };
      setModules([...modules, newMod]);
      const newExp = new Set(expandedModules);
      newExp.add(newMod.id);
      setExpandedModules(newExp);
      setActiveItem({ type: "module", data: newMod });
    } catch (e) {
      toast.error("Failed to add module");
    } finally {
      setIsProcessing(false);
    }
  };

  const addLesson = async (modId) => {
    if (isProcessing) return;
    const title = prompt("Lesson Title:", "New Lesson");
    if (!title) return;
    setIsProcessing(true);
    try {
      const res = await api.post(`/modules/${modId}/lessons`, { title });
      const newLes = res.data;
      setModules(modules.map(m => {
        if (m.id === modId) return { ...m, lessons: [...(m.lessons || []), newLes] };
        return m;
      }));
      
      const newExp = new Set(expandedModules);
      newExp.add(modId);
      setExpandedModules(newExp);
      
      handleLessonSelect(newLes.id, modId);
    } catch (e) {
      toast.error("Failed to add lesson");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLessonSelect = async (lessonId, moduleId) => {
    setSaveStatus("Loading...");
    try {
      const res = await api.get(`/lessons/${lessonId}`);
      setActiveItem({ type: "lesson", data: res.data, moduleId });
      setSaveStatus("");
    } catch (e) {
      toast.error("Failed to load lesson details");
      setSaveStatus("");
    }
  };

  // --- RENDERING PANELS ---

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#194BFB]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden">
      {/* LEFT PANEL: Navigator */}
      {!isNew && (
        <div className="w-72 border-r flex flex-col bg-slate-50/50">
          <div className="p-4 border-b bg-white">
            <button onClick={() => navigate("/admin/courses")} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Courses
            </button>
            <h2 className="text-sm font-semibold text-slate-800 mt-3 truncate" style={{ fontFamily: "Outfit, sans-serif" }}>
              {course?.title || "Untitled Course"}
            </h2>
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-sm ${course?.is_published ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                {course?.is_published ? "Published" : "Draft"}
              </span>
            </div>
          </div>

          <div 
            className={`p-3 flex items-center gap-3 cursor-pointer border-b transition ${activeItem?.type === 'course' ? 'bg-blue-50 text-[#194BFB] border-l-2 border-l-[#194BFB]' : 'hover:bg-slate-50 text-slate-600 hover:bg-slate-100 border-l-2 border-l-transparent'}`}
            onClick={() => setActiveItem({ type: "course" })}
          >
            <Cog className={`w-4 h-4 ${activeItem?.type === 'course' ? 'text-[#194BFB]' : 'text-slate-400'}`} />
            <span className={`text-sm font-semibold ${activeItem?.type === 'course' ? 'text-[#194BFB]' : 'text-slate-700'}`}>Course Settings</span>
          </div>

          <div className="flex-1 overflow-y-auto pb-20">
            <div className="px-4 py-3 text-xs uppercase text-slate-400 tracking-wider font-semibold">Modules</div>
            
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="modules" type="MODULE">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef}>
                    {modules.map((mod, index) => (
                      <Draggable key={mod.id} draggableId={mod.id} index={index}>
                        {(provided, snapshot) => (
                          <div 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`mb-1 ${snapshot.isDragging ? 'shadow-md bg-white' : ''}`}
                          >
                            <div 
                              className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer group transition-all ${activeItem?.data?.id === mod.id && activeItem?.type === 'module' ? 'bg-blue-50 text-[#194BFB] border-l-2 border-l-[#194BFB]' : 'hover:bg-slate-100 border-l-2 border-l-transparent text-slate-700'}`}
                              onClick={() => setActiveItem({ type: "module", data: mod })}
                            >
                              <div {...provided.dragHandleProps} className="p-1 cursor-grab text-slate-300 hover:text-slate-600 transition">
                                <GripVertical className="w-3.5 h-3.5" />
                              </div>
                              <div onClick={(e) => toggleModule(mod.id, e)} className="p-1 hover:bg-slate-200/50 rounded-sm transition">
                                {expandedModules.has(mod.id) ? <ChevronDown className="w-3.5 h-3.5 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
                              </div>
                              <span className={`text-sm flex-1 truncate ${activeItem?.data?.id === mod.id && activeItem?.type === 'module' ? 'font-bold' : 'font-medium'}`}>
                                {mod.title}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded-sm border shadow-sm">
                                  {mod.lessons?.length || 0}
                                </span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Delete module "${mod.title}" and its ${mod.lessons?.length || 0} lessons?`)) {
                                      api.delete(`/courses/${id}/modules/${mod.id}`).then(() => {
                                        setModules(modules.filter(m => m.id !== mod.id));
                                        if (activeItem?.data?.id === mod.id) setActiveItem({ type: "course" });
                                        toast.success("Module deleted");
                                      }).catch((err) => {
                                        toast.error(err.response?.data?.detail || "Delete failed");
                                      });
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-sm transition-all"
                                  title="Delete Module"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* LESSONS LIST */}
                            {expandedModules.has(mod.id) && (
                              <Droppable droppableId={mod.id} type="LESSON">
                                {(provided) => (
                                  <div {...provided.droppableProps} ref={provided.innerRef} className="pb-1">
                                    {(mod.lessons || []).map((lesson, lIdx) => (
                                      <Draggable key={lesson.id} draggableId={lesson.id} index={lIdx}>
                                        {(provided, snap) => (
                                          <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            className={`flex items-center gap-2 pl-10 pr-3 py-1.5 cursor-pointer group ${activeItem?.data?.id === lesson.id && activeItem?.type === 'lesson' ? 'bg-blue-50/50 text-[#194BFB] font-medium' : 'hover:bg-slate-100 text-slate-600'} ${snap.isDragging ? 'shadow-sm bg-white z-10' : ''}`}
                                            onClick={() => handleLessonSelect(lesson.id, mod.id)}
                                          >
                                            <div {...provided.dragHandleProps} className="cursor-grab opacity-30 hover:opacity-100">
                                              <GripVertical className="w-3 h-3" />
                                            </div>
                                            <BookOpen className="w-3 h-3 opacity-50" />
                                            <span className="text-xs truncate flex-1">{lesson.title}</span>
                                            {lesson.has_task && (
                                              <ClipboardList className="w-3 h-3 text-amber-500 flex-shrink-0" title="Has Task" />
                                            )}
                                          </div>
                                        )}
                                      </Draggable>
                                    ))}
                                    {provided.placeholder}
                                    
                                    <div 
                                      className="flex items-center gap-1 pl-12 py-1.5 text-xs text-slate-400 hover:text-[#194BFB] cursor-pointer mt-1"
                                      onClick={() => addLesson(mod.id)}
                                    >
                                      <Plus className="w-3 h-3" /> Add Lesson
                                    </div>
                                  </div>
                                )}
                              </Droppable>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            
            <button onClick={addModule} className="flex items-center gap-1.5 text-xs text-[#194BFB] font-medium px-4 py-3 mt-2 hover:bg-blue-50 w-full text-left transition">
              <Plus className="w-4 h-4" /> Add Module
            </button>
          </div>
        </div>
      )}

      {/* RIGHT PANEL: Editor */}
      <div className="flex-1 overflow-y-auto relative bg-white">
        {activeItem?.type === "course" && (
          <CourseSettingsForm 
            course={course} 
            isNew={isNew} 
            onSave={(c) => {
              setCourse(c);
              if (isNew) navigate(`/admin/courses/${c.id}/edit`, { replace: true });
            }}
          />
        )}
        
        {activeItem?.type === "module" && (
          <ModuleForm 
            module={activeItem.data} 
            courseId={id}
            onUpdate={(updated) => {
              setModules(modules.map(m => m.id === updated.id ? {...m, ...updated} : m));
              setActiveItem({ type: "module", data: {...activeItem.data, ...updated} });
            }}
            onDelete={(mid) => {
              setModules(modules.filter(m => m.id !== mid));
              setActiveItem({ type: "course" });
            }}
            autoSave={autoSave}
          />
        )}

        {activeItem?.type === "lesson" && (
          <LessonEditor 
            lesson={activeItem.data}
            moduleId={activeItem.moduleId}
            onUpdate={(updated) => {
              setModules(modules.map(m => {
                if (m.id !== activeItem.moduleId) return m;
                return {
                  ...m, 
                  lessons: m.lessons.map(l => l.id === updated.id ? {...l, ...updated} : l)
                };
              }));
              setActiveItem({ type: "lesson", data: {...activeItem.data, ...updated}, moduleId: activeItem.moduleId });
            }}
            onDelete={(lid) => {
              setModules(modules.map(m => {
                if (m.id !== activeItem.moduleId) return m;
                return { ...m, lessons: m.lessons.filter(l => l.id !== lid) };
              }));
              setActiveItem({ type: "module", data: modules.find(m => m.id === activeItem.moduleId) });
            }}
            autoSave={autoSave}
          />
        )}

        {/* Save Status Indicator */}
        {saveStatus && (
          <div className="fixed bottom-6 right-6 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 z-50 animate-in slide-in-from-bottom-2">
            {saveStatus === "Saving..." && <Loader2 className="w-3 h-3 animate-spin" />}
            {saveStatus}
          </div>
        )}
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS FOR RIGHT PANEL ---

function CourseSettingsForm({ course, isNew, onSave }) {
  const [formData, setFormData] = useState({
    title: "", description: "", short_description: "", thumbnail_url: "", difficulty: "beginner", language: "English"
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (course) setFormData({
      title: course.title || "",
      description: course.description || "",
      short_description: course.short_description || "",
      thumbnail_url: course.thumbnail_url || "",
      difficulty: course.difficulty || "beginner",
      language: course.language || "English"
    });
  }, [course]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.post("/admin/courses", formData);
        toast.success("Course created!");
        onSave(res.data);
      } else {
        await api.patch(`/admin/courses/${course.id}`, formData);
        toast.success("Settings saved");
        onSave({ ...course, ...formData });
      }
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to save course");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-semibold mb-6 text-slate-800" style={{ fontFamily: "Outfit, sans-serif" }}>
        {isNew ? "Create New Course" : "Course Settings"}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">COURSE TITLE *</label>
          <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full border rounded-sm p-2.5 text-sm focus:border-[#194BFB] focus:outline-none" placeholder="e.g. Java Programming for Beginners" />
        </div>
        
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-600">SHORT DESCRIPTION</label>
            <span className="text-xs text-slate-400">{formData.short_description.length}/120</span>
          </div>
          <input type="text" maxLength={120} value={formData.short_description} onChange={e => setFormData({...formData, short_description: e.target.value})} className="w-full border rounded-sm p-2.5 text-sm focus:border-[#194BFB] focus:outline-none" placeholder="One-line summary shown in course cards" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">FULL DESCRIPTION</label>
          <textarea rows={5} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border rounded-sm p-2.5 text-sm focus:border-[#194BFB] focus:outline-none resize-y" placeholder="Detailed course description..." />
        </div>

        <div className="flex gap-6">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">DIFFICULTY</label>
            <div className="flex rounded-sm border overflow-hidden">
              {['beginner', 'intermediate', 'advanced'].map(d => (
                <button type="button" key={d} onClick={() => setFormData({...formData, difficulty: d})} className={`flex-1 py-2 text-xs font-medium capitalize transition ${formData.difficulty === d ? "bg-[#194BFB] text-white" : "bg-white text-slate-600 hover:bg-slate-50 border-r last:border-r-0"}`}>{d}</button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">LANGUAGE</label>
            <select value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})} className="w-full border rounded-sm p-2 text-sm focus:border-[#194BFB] focus:outline-none bg-white">
              <option>English</option>
              <option>Hindi</option>
              <option>Telugu</option>
              <option>Tamil</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">THUMBNAIL URL</label>
          <input type="url" value={formData.thumbnail_url} onChange={e => setFormData({...formData, thumbnail_url: e.target.value})} className="w-full border border-slate-200 rounded-sm p-3 text-sm focus:border-[#194BFB] focus:ring-1 focus:ring-[#194BFB]/20 focus:outline-none transition-all" placeholder="https://images.pexels.com/..." />
          {formData.thumbnail_url && (
            <div className="mt-3 w-20 h-14 bg-slate-100 rounded-sm overflow-hidden border border-slate-200 shadow-sm">
              <img src={formData.thumbnail_url} alt="Preview" className="w-full h-full object-cover" onError={(e) => e.target.style.display='none'} />
            </div>
          )}
        </div>

        <div className="pt-4 border-t">
          <button type="submit" disabled={saving} className="bg-[#194BFB] text-white px-6 py-2.5 rounded-sm text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {isNew ? "Create Course" : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModuleForm({ module, courseId, onUpdate, onDelete, autoSave }) {
  const [title, setTitle] = useState(module.title);

  useEffect(() => setTitle(module.title), [module.title]);

  const handleBlur = () => {
    if (title === module.title || !title.trim()) return;
    autoSave(() => api.patch(`/courses/${courseId}/modules/${module.id}`, { title }));
    onUpdate({ id: module.id, title });
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete module "${module.title}"? All lessons inside must be deleted first.`)) return;
    try {
      await api.delete(`/courses/${courseId}/modules/${module.id}`);
      onDelete(module.id);
      toast.success("Module deleted");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-6 text-slate-800" style={{ fontFamily: "Outfit, sans-serif" }}>Edit Module</h2>
      
      <div className="mb-12">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">MODULE TITLE</label>
        <input 
          type="text" 
          value={title} 
          onChange={e => setTitle(e.target.value)}
          onBlur={handleBlur}
          className="w-full border rounded-sm p-3 text-sm focus:border-[#194BFB] focus:outline-none text-lg" 
        />
        <p className="text-xs text-slate-400 mt-2">Changes are saved automatically when you click away.</p>
      </div>

      <div className="border-t pt-8">
        <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-4">Danger Zone</h3>
        <div className="flex items-center justify-between border border-red-100 bg-red-50 p-4 rounded-sm">
          <div>
            <h4 className="text-sm font-semibold text-red-900">Delete Module</h4>
            <p className="text-xs text-red-700 mt-1">This module must be empty before it can be deleted.</p>
          </div>
          <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 text-sm bg-white rounded-sm hover:bg-red-50 transition">
            <Trash className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function LessonEditor({ lesson, moduleId, onUpdate, onDelete, autoSave }) {
  const [localSaveStatus, setLocalSaveStatus] = useState("");
  const [tab, setTab] = useState("content");
  const [title, setTitle] = useState(lesson.title);
  const [estTime, setEstTime] = useState(lesson.estimated_minutes || 30);
  
  // Tab states
  const [contentHtml, setContentHtml] = useState(lesson.content_html || "");
  const [previewMode, setPreviewMode] = useState(false);
  
  const [videoUrl, setVideoUrl] = useState(lesson.video_url || "");
  const [githubLink, setGithubLink] = useState(lesson.github_link || "");
  
  // Task state
  const [task, setTask] = useState(lesson.tasks && lesson.tasks.length > 0 ? lesson.tasks[0] : null);
  const [taskForm, setTaskForm] = useState({
    description: "", instructions: "", expected_output: "", difficulty: "easy"
  });

  useEffect(() => {
    setTitle(lesson.title);
    setEstTime(lesson.estimated_minutes || 30);
    setContentHtml(lesson.content_html || "");
    setVideoUrl(lesson.video_url || "");
    setGithubLink(lesson.github_link || "");
    
    const initialTask = lesson.tasks && lesson.tasks.length > 0 ? lesson.tasks[0] : null;
    setTask(initialTask);
    if (initialTask) {
      setTaskForm({
        description: initialTask.description || "",
        instructions: initialTask.instructions || "",
        expected_output: initialTask.expected_output || "",
        difficulty: initialTask.difficulty || "easy"
      });
    } else {
      setTaskForm({ description: "", instructions: "", expected_output: "", difficulty: "easy" });
    }
  }, [lesson]);

  const handleTitleBlur = () => {
    if (title !== lesson.title) {
      autoSave(() => api.patch(`/modules/${moduleId}/lessons/${lesson.id}`, { title }));
      onUpdate({ id: lesson.id, title });
    }
  };

  const handleTimeBlur = () => {
    if (estTime !== lesson.estimated_minutes) {
      autoSave(() => api.patch(`/modules/${moduleId}/lessons/${lesson.id}`, { estimated_minutes: parseInt(estTime) || 0 }));
      onUpdate({ id: lesson.id, estimated_minutes: parseInt(estTime) || 0 });
    }
  };

  const saveContent = () => {
    autoSave(() => api.patch(`/modules/${moduleId}/lessons/${lesson.id}`, { content_html: contentHtml }));
    onUpdate({ id: lesson.id, content_html: contentHtml });
  };

  const saveVideo = () => {
    autoSave(() => api.patch(`/modules/${moduleId}/lessons/${lesson.id}`, { video_url: videoUrl }));
    onUpdate({ id: lesson.id, video_url: videoUrl });
  };

  const saveGithub = () => {
    autoSave(() => api.patch(`/modules/${moduleId}/lessons/${lesson.id}`, { github_link: githubLink }));
    onUpdate({ id: lesson.id, github_link: githubLink });
  };

  const saveTask = async () => {
    if (!taskForm.description) return toast.error("Task description is required");
    setLocalSaveStatus("Saving...");
    try {
      const res = await api.post(`/lessons/${lesson.id}/task`, taskForm);
      setTask(res.data);
      onUpdate({ id: lesson.id, has_task: true, tasks: [res.data] });
      setLocalSaveStatus("Saved ✓");
      setTimeout(() => setLocalSaveStatus(""), 2000);
    } catch(e) {
      toast.error("Failed to save task");
      setLocalSaveStatus("Save failed");
      setTimeout(() => setLocalSaveStatus(""), 3000);
    }
  };

  const deleteTask = async () => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await api.delete(`/lessons/${lesson.id}/task`);
      setTask(null);
      setTaskForm({ description: "", instructions: "", expected_output: "", difficulty: "easy" });
      onUpdate({ id: lesson.id, has_task: false, tasks: [] });
      toast.success("Task deleted");
    } catch(e) {
      toast.error("Failed to delete task");
    }
  };

  const deleteLesson = async () => {
    if (!window.confirm(`Delete lesson "${lesson.title}" completely?`)) return;
    try {
      await api.delete(`/modules/${moduleId}/lessons/${lesson.id}`);
      onDelete(lesson.id);
      toast.success("Lesson deleted");
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const renderYoutubeEmbed = (url) => {
    if (!url) return null;
    let embedUrl = url;
    if (url.includes("watch?v=")) embedUrl = url.replace("watch?v=", "embed/");
    if (url.includes("youtu.be/")) embedUrl = url.replace("youtu.be/", "youtube.com/embed/");
    return (
      <iframe src={embedUrl} className="w-full h-64 border rounded-sm mt-4" allowFullScreen title="Video Preview" />
    );
  };

  return (
    <div className="p-8 max-w-3xl mx-auto pb-32">
      <div className="flex items-start justify-between mb-2">
        <input 
          type="text" 
          value={title} 
          onChange={e => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          className="text-2xl font-semibold text-slate-900 border-none outline-none w-full bg-transparent hover:bg-slate-50 transition p-1 -ml-1 rounded-sm"
          style={{ fontFamily: "Outfit, sans-serif" }}
          placeholder="Lesson Title"
        />
        <button onClick={deleteLesson} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-sm transition flex-shrink-0" title="Delete Lesson">
          <Trash className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500 mb-8 p-1">
        <span>Estimated time:</span>
        <input 
          type="number" 
          value={estTime} 
          onChange={e => setEstTime(e.target.value)}
          onBlur={handleTimeBlur}
          className="w-12 border-b border-slate-300 focus:border-[#194BFB] outline-none text-center bg-transparent"
        />
        <span>min</span>
      </div>

      <div className="flex border-b border-slate-200 mb-6">
        {[
          { id: "content", label: "Learn Content" },
          { id: "video", label: "Video" },
          { id: "github", label: "GitHub" },
          { id: "task", label: "Task" }
        ].map(t => (
          <button 
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-6 py-2.5 text-sm font-medium transition border-b-2 -mb-[1px] ${tab === t.id ? "text-[#194BFB] border-[#194BFB]" : "text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "content" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-end mb-2 gap-2">
              <button onClick={() => setPreviewMode(false)} className={`text-xs px-3 py-1 rounded-sm border ${!previewMode ? "bg-slate-100 text-slate-800" : "text-slate-500 bg-white"}`}>Write HTML</button>
              <button onClick={() => setPreviewMode(true)} className={`text-xs px-3 py-1 rounded-sm border ${previewMode ? "bg-slate-100 text-slate-800" : "text-slate-500 bg-white"}`}>Preview</button>
            </div>
            
            {!previewMode ? (
              <textarea 
                rows={15} 
                value={contentHtml} 
                onChange={e => setContentHtml(e.target.value)}
                className="w-full border rounded-sm p-4 text-sm font-mono focus:border-[#194BFB] focus:outline-none resize-y bg-slate-50"
                placeholder={`<h2>Introduction</h2>\n<p>In this lesson...</p>`}
              />
            ) : (
              <div 
                className="w-full border rounded-sm p-6 text-sm bg-white min-h-[350px] prose prose-slate max-w-none"
                dangerouslySetInnerHTML={{ __html: contentHtml || "<span class='text-slate-400'>No content preview</span>" }}
              />
            )}
            
            <button onClick={saveContent} className="mt-4 bg-[#194BFB] text-white px-5 py-2 rounded-sm text-sm font-medium hover:bg-blue-700">Save Content</button>
          </div>
        )}

        {tab === "video" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-xl">
            <label className="block text-sm font-medium text-slate-700 mb-1">Video URL</label>
            <input 
              type="url" 
              value={videoUrl} 
              onChange={e => setVideoUrl(e.target.value)}
              className="w-full border rounded-sm p-2.5 text-sm focus:border-[#194BFB] focus:outline-none"
              placeholder="https://youtube.com/watch?v=..."
            />
            <p className="text-xs text-slate-400 mt-1.5 mb-4">Supports YouTube or embeddable iframe URLs.</p>
            
            <button onClick={saveVideo} className="bg-[#194BFB] text-white px-5 py-2 rounded-sm text-sm font-medium hover:bg-blue-700 mb-6">Save Video</button>
            
            {renderYoutubeEmbed(videoUrl)}
          </div>
        )}

        {tab === "github" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-xl">
            <label className="block text-sm font-medium text-slate-700 mb-1">GitHub Repository Link</label>
            <input 
              type="url" 
              value={githubLink} 
              onChange={e => setGithubLink(e.target.value)}
              className="w-full border rounded-sm p-2.5 text-sm focus:border-[#194BFB] focus:outline-none"
              placeholder="https://github.com/..."
            />
            <p className="text-xs text-slate-400 mt-1.5 mb-4">Students will see a button linking to this repo.</p>
            
            <button onClick={saveGithub} className="bg-[#194BFB] text-white px-5 py-2 rounded-sm text-sm font-medium hover:bg-blue-700">Save Link</button>
          </div>
        )}

        {tab === "task" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {!task && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-sm mb-6 flex justify-between items-center">
                <span className="text-sm text-amber-800">No task attached to this lesson.</span>
              </div>
            )}
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">TASK DESCRIPTION *</label>
                <textarea rows={3} value={taskForm.description} onChange={e => setTaskForm({...taskForm, description: e.target.value})} className="w-full border rounded-sm p-3 text-sm focus:border-[#194BFB] outline-none" placeholder="Build a calculator..." />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">INSTRUCTIONS (Optional)</label>
                <textarea rows={5} value={taskForm.instructions} onChange={e => setTaskForm({...taskForm, instructions: e.target.value})} className="w-full border rounded-sm p-3 text-sm focus:border-[#194BFB] outline-none" placeholder="Step 1: Create a class...\nStep 2: Add methods..." />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">EXPECTED OUTPUT (Optional)</label>
                <textarea rows={2} value={taskForm.expected_output} onChange={e => setTaskForm({...taskForm, expected_output: e.target.value})} className="w-full border rounded-sm p-3 text-sm font-mono bg-slate-50 focus:border-[#194BFB] outline-none" placeholder="Sum: 8" />
              </div>
              
              <div className="w-48">
                <label className="block text-xs font-semibold text-slate-600 mb-1">DIFFICULTY</label>
                <select value={taskForm.difficulty} onChange={e => setTaskForm({...taskForm, difficulty: e.target.value})} className="w-full border rounded-sm p-2 text-sm focus:border-[#194BFB] outline-none bg-white">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              
              <div className="flex items-center gap-3 pt-4 border-t">
                <button onClick={saveTask} className="bg-[#194BFB] text-white px-5 py-2 rounded-sm text-sm font-medium hover:bg-blue-700">Save Task</button>
                {task && (
                  <button onClick={deleteTask} className="ml-auto text-red-500 hover:text-red-700 text-sm flex items-center gap-1.5 px-3 py-2">
                    <Trash className="w-4 h-4" /> Delete Task
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      {localSaveStatus && (
        <div className="fixed bottom-6 right-6 bg-slate-800 text-white 
        text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center 
        gap-2 z-50">
          {localSaveStatus === "Saving..." && (
            <Loader2 className="w-3 h-3 animate-spin" />
          )}
          {localSaveStatus}
        </div>
      )}
      </div>
    </div>
  );
}
