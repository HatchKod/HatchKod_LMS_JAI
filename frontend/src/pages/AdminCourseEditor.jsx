import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { 
  ChevronLeft, 
  Settings, 
  Plus, 
  GripVertical, 
  Pencil, 
  Trash2, 
  Play, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Save, 
  Eye, 
  EyeOff,
  ChevronRight,
  MoreVertical,
  Layers,
  Layout,
  Video,
  Code
} from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter, 
  DialogTrigger 
} from "../components/ui/dialog";
import { Separator } from "../components/ui/separator";
import { ScrollArea } from "../components/ui/scroll-area";
import { Badge } from "../components/ui/badge";

export default function AdminCourseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [showDeleteModuleModal, setShowDeleteModuleModal] = useState(false);
  const [showDeleteLessonModal, setShowDeleteLessonModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch full course data
  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(`/courses/${id}/full`);
      setCourse(res.data.course);
      setModules(res.data.modules || []);
      // Auto-select first lesson if none selected
      if (!selectedLesson && res.data.modules?.[0]?.lessons?.[0]) {
        setSelectedLesson(res.data.modules[0].lessons[0]);
      }
    } catch (e) {
      toast.error("Failed to load course details");
    } finally {
      setLoading(false);
    }
  }, [id, selectedLesson]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- Course Actions ---
  const saveCourseSettings = async (settings) => {
    try {
      await api.patch(`/admin/courses/${id}`, settings);
      toast.success("Settings saved");
      setCourse({ ...course, ...settings });
      setShowSettings(false);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const togglePublish = async () => {
    const action = course.is_published ? "unpublish" : "publish";
    try {
      await api.post(`/admin/courses/${id}/${action}`);
      toast.success(`Course ${action}ed successfully`);
      setCourse({ ...course, is_published: !course.is_published });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || `Failed to ${action} course`);
    }
  };

  // --- Module Actions ---
  const handleAddModule = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await api.post(`/admin/courses/${id}/modules`, { 
        title: newTitle, 
        sequence_order: modules.length 
      });
      const newModule = { ...res.data, lessons: [] };
      setModules([...modules, newModule]);
      toast.success("Module added");
      setShowModuleModal(false);
      setNewTitle("");
    } catch (e) {
      toast.error("Failed to add module");
    }
  };

  const handleDeleteModule = async () => {
    if (!activeModuleId) return;
    try {
      await api.delete(`/admin/modules/${activeModuleId}`);
      setModules(modules.filter(m => m.id !== activeModuleId));
      toast.success("Module deleted");
      setShowDeleteModuleModal(false);
      setActiveModuleId(null);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  // --- Lesson Actions ---
  const handleAddLesson = async () => {
    if (!newTitle.trim() || !activeModuleId) return;
    try {
      const module = modules.find(m => m.id === activeModuleId);
      const res = await api.post(`/admin/modules/${activeModuleId}/lessons`, { 
        title: newTitle, 
        sequence_order: module.lessons?.length || 0 
      });
      const newModules = modules.map(m => 
        m.id === activeModuleId ? { ...m, lessons: [...(m.lessons || []), res.data] } : m
      );
      setModules(newModules);
      setSelectedLesson(res.data);
      toast.success("Lesson added");
      setShowLessonModal(false);
      setNewTitle("");
    } catch (e) {
      toast.error("Failed to add lesson");
    }
  };

  const updateLessonData = async (lessonId, data) => {
    setSaving(true);
    try {
      await api.put(`/admin/lessons/${lessonId}`, data);
      setModules(modules.map(m => ({
        ...m,
        lessons: m.lessons.map(l => l.id === lessonId ? { ...l, ...data } : l)
      })));
      if (selectedLesson?.id === lessonId) {
        setSelectedLesson({ ...selectedLesson, ...data });
      }
    } catch (e) {
      toast.error("Failed to save lesson");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLesson = async () => {
    if (!activeModuleId || !activeLessonId) return;
    try {
      await api.delete(`/admin/lessons/${activeLessonId}`);
      setModules(modules.map(m => 
        m.id === activeModuleId ? { ...m, lessons: m.lessons.filter(l => l.id !== activeLessonId) } : m
      ));
      if (selectedLesson?.id === activeLessonId) setSelectedLesson(null);
      toast.success("Lesson deleted");
      setShowDeleteLessonModal(false);
      setActiveLessonId(null);
    } catch (e) {
      toast.error("Failed to delete lesson");
    }
  };

  // --- Drag & Drop ---
  const onDragEnd = async (result) => {
    const { source, destination, type } = result;
    if (!destination) return;

    if (type === "module") {
      const items = Array.from(modules);
      const [reorderedItem] = items.splice(source.index, 1);
      items.splice(destination.index, 0, reorderedItem);
      setModules(items);
      try {
        await api.post("/admin/modules/reorder", { 
          ordered_ids: items.map(m => m.id) 
        });
      } catch (e) { toast.error("Reorder failed"); }
    } else {
      // Lesson reorder
      const sourceMid = source.droppableId;
      const destMid = destination.droppableId;
      if (sourceMid !== destMid) {
        toast.error("Cannot move lessons between modules yet.");
        return;
      }
      const module = modules.find(m => m.id === sourceMid);
      const items = Array.from(module.lessons);
      const [reorderedItem] = items.splice(source.index, 1);
      items.splice(destination.index, 0, reorderedItem);
      
      setModules(modules.map(m => m.id === sourceMid ? { ...m, lessons: items } : m));
      try {
        await api.post("/admin/lessons/reorder", { 
          ordered_ids: items.map(l => l.id) 
        });
      } catch (e) { toast.error("Reorder failed"); }
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-slate-400">Initializing Workspace...</div>;

  return (
    <div className="h-screen flex flex-col bg-white text-slate-900 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-slate-200 px-6 flex items-center justify-between shrink-0 bg-white z-10">
        <div className="flex items-center gap-6">
          <Link to="/admin" className="p-2 hover:bg-slate-100 rounded-sm transition">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="font-bold font-[Outfit] text-lg leading-none">{course.title}</h1>
              <Badge variant={course.is_published ? "default" : "secondary"} className="h-5 text-[10px] uppercase font-bold px-2 bg-slate-900 text-white rounded-sm">
                {course.is_published ? "Live" : "Draft"}
              </Badge>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold flex items-center gap-2">
              <span>{course.category}</span>
              <span>•</span>
              <span>{course.course_type}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Save className="h-3 w-3" /> Auto-saving enabled</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="h-9 border-slate-200 rounded-sm text-xs font-bold shadow-sm">
            <Settings className="h-4 w-4 mr-2" /> Course Settings
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button 
            onClick={togglePublish}
            variant={course.is_published ? "outline" : "default"} 
            size="sm" 
            className={`h-9 rounded-sm text-xs font-bold shadow-sm ${!course.is_published ? 'bg-[#10B981] hover:bg-[#059669]' : ''}`}
          >
            {course.is_published ? <><EyeOff className="h-4 w-4 mr-2" /> Unpublish</> : <><Eye className="h-4 w-4 mr-2" /> Publish Course</>}
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Structure */}
        <aside className="w-80 border-r border-slate-200 flex flex-col bg-[#F9FAFB] shrink-0">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-slate-500">Course Structure</span>
            <button onClick={() => { setNewTitle(""); setShowModuleModal(true); }} className="p-1.5 hover:bg-[#194BFB]/5 rounded-sm transition text-[#194BFB] border border-transparent hover:border-[#194BFB]/20">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <ScrollArea className="flex-1 px-3 py-4">
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="modules" type="module">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
                    {modules.map((module, mIndex) => (
                      <Draggable key={module.id} draggableId={module.id} index={mIndex}>
                        {(provided) => (
                          <div 
                            ref={provided.innerRef} 
                            {...provided.draggableProps}
                            className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
                          >
                            <div className="p-3.5 bg-slate-50/50 flex items-center justify-between border-b border-slate-100 group">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div {...provided.dragHandleProps} className="cursor-grab p-1 hover:bg-slate-200 rounded-sm text-slate-300 group-hover:text-slate-400 transition-colors">
                                  <GripVertical className="h-3.5 w-3.5" />
                                </div>
                                <span className="text-[12px] font-bold text-slate-900 truncate tracking-tight">{module.title}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={() => { setActiveModuleId(module.id); setNewTitle(""); setShowLessonModal(true); }} className="p-1 hover:bg-[#194BFB]/10 rounded-sm text-[#194BFB]" title="Add Lesson"><Plus className="h-3.5 w-3.5" /></button>
                                <button onClick={() => { setActiveModuleId(module.id); setShowDeleteModuleModal(true); }} className="p-1 hover:bg-red-50 rounded-sm text-red-500" title="Delete Module"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>

                            <Droppable droppableId={module.id} type="lesson">
                              {(lProvided) => (
                                <div {...lProvided.droppableProps} ref={lProvided.innerRef} className="p-1.5 space-y-1 min-h-[10px]">
                                  {module.lessons?.map((lesson, lIndex) => (
                                    <Draggable key={lesson.id} draggableId={lesson.id} index={lIndex}>
                                      {(lDraggable) => (
                                        <div
                                          ref={lDraggable.innerRef}
                                          {...lDraggable.draggableProps}
                                          {...lDraggable.dragHandleProps}
                                          onClick={() => setSelectedLesson(lesson)}
                                          className={`p-2.5 rounded-sm text-[13px] font-medium flex items-center justify-between group transition-all duration-200 ${
                                            selectedLesson?.id === lesson.id 
                                            ? 'bg-[#194BFB] text-white shadow-lg shadow-blue-100 ring-1 ring-blue-400' 
                                            : 'hover:bg-slate-50 text-slate-600 border border-transparent hover:border-slate-200'
                                          }`}
                                        >
                                          <div className="flex items-center gap-3 overflow-hidden">
                                            {lesson.video_url ? (
                                              <Video className={`h-3.5 w-3.5 shrink-0 ${selectedLesson?.id === lesson.id ? 'text-blue-100' : 'text-slate-400'}`} />
                                            ) : (
                                              <Layers className={`h-3.5 w-3.5 shrink-0 ${selectedLesson?.id === lesson.id ? 'text-blue-100' : 'text-slate-400'}`} />
                                            )}
                                            <span className="truncate tracking-tight">{lesson.title}</span>
                                          </div>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); setActiveModuleId(module.id); setActiveLessonId(lesson.id); setShowDeleteLessonModal(true); }}
                                            className={`opacity-0 group-hover:opacity-100 p-1 rounded-sm transition-all ${selectedLesson?.id === lesson.id ? 'hover:bg-white/20 text-white' : 'hover:bg-red-50 text-red-400'}`}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {lProvided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </ScrollArea>
        </aside>

        {/* Right Editor: Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-white">
          {selectedLesson ? (
            <div className="flex flex-col h-full">
              {/* Lesson Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                <div className="flex-1">
                  <input 
                    className="text-2xl font-bold font-[Outfit] bg-transparent border-none outline-none focus:ring-0 w-full"
                    value={selectedLesson.title}
                    onChange={(e) => setSelectedLesson({ ...selectedLesson, title: e.target.value })}
                    onBlur={() => updateLessonData(selectedLesson.id, { title: selectedLesson.title })}
                  />
                  <div className="text-[10px] text-slate-400 mt-1 uppercase font-bold flex items-center gap-2">
                    <span>Lesson Configuration</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-500">
                      {saving ? "Saving changes..." : <><CheckCircle2 className="h-3 w-3" /> All changes saved</>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Editor Tabs */}
              <Tabs defaultValue="learn" className="flex-1 flex flex-col">
                <div className="px-6 border-b border-slate-100 bg-[#FBFBFC]">
                  <TabsList className="h-12 bg-transparent gap-8">
                    <TabsTrigger value="learn" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#194BFB] data-[state=active]:text-[#194BFB] px-1 h-full text-xs font-bold uppercase tracking-wider">
                      <Layout className="h-3.5 w-3.5 mr-2" /> Topic Content
                    </TabsTrigger>
                    <TabsTrigger value="video" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#194BFB] data-[state=active]:text-[#194BFB] px-1 h-full text-xs font-bold uppercase tracking-wider">
                      <Video className="h-3.5 w-3.5 mr-2" /> Video Tutorial
                    </TabsTrigger>
                    <TabsTrigger value="task" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#194BFB] data-[state=active]:text-[#194BFB] px-1 h-full text-xs font-bold uppercase tracking-wider">
                      <Code className="h-3.5 w-3.5 mr-2" /> Hands-on Task
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#194BFB] data-[state=active]:text-[#194BFB] px-1 h-full text-xs font-bold uppercase tracking-wider">
                      <Settings className="h-3.5 w-3.5 mr-2" /> Advanced Settings
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-hidden relative">
                  <ScrollArea className="h-full">
                    <div className="max-w-4xl mx-auto p-10 space-y-8 pb-32">
                      <TabsContent value="learn" className="mt-0 outline-none space-y-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Topic Content (Markdown supported)</Label>
                            <span className="text-[10px] text-slate-400">Use --- to split content into multiple pages</span>
                          </div>
                          <Textarea 
                            className="min-h-[400px] font-mono text-sm border-slate-200 focus:border-[#194BFB] p-4 bg-slate-50/50 rounded-sm"
                            value={selectedLesson.content_html || ""}
                            onChange={(e) => setSelectedLesson({ ...selectedLesson, content_html: e.target.value })}
                            placeholder="# Welcome to Java\n\nPaste your markdown content here..."
                          />
                        </div>
                        <Button 
                          onClick={() => updateLessonData(selectedLesson.id, { content_html: selectedLesson.content_html })}
                          className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-10 px-6 font-bold shadow-lg shadow-blue-100"
                        >
                          Save Content
                        </Button>
                      </TabsContent>

                      <TabsContent value="video" className="mt-0 outline-none space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-3">
                            <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">YouTube / Video URL</Label>
                            <Input 
                              value={selectedLesson.video_url || ""}
                              onChange={(e) => setSelectedLesson({ ...selectedLesson, video_url: e.target.value })}
                              placeholder="https://..."
                              className="rounded-sm"
                            />
                            <p className="text-[10px] text-slate-400 italic">Paste the embed or public URL of the lesson video.</p>
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Estimated Duration (mins)</Label>
                            <Input 
                              type="number"
                              value={selectedLesson.estimated_minutes || 30}
                              onChange={(e) => setSelectedLesson({ ...selectedLesson, estimated_minutes: parseInt(e.target.value) })}
                              className="rounded-sm"
                            />
                          </div>
                        </div>
                        <Button 
                          onClick={() => updateLessonData(selectedLesson.id, { 
                            video_url: selectedLesson.video_url,
                            estimated_minutes: selectedLesson.estimated_minutes 
                          })}
                          className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-10 px-6 font-bold shadow-lg shadow-blue-100"
                        >
                          Update Video Settings
                        </Button>
                      </TabsContent>

                      <TabsContent value="task" className="mt-0 outline-none">
                        <TaskEditor lessonId={selectedLesson.id} />
                      </TabsContent>

                      <TabsContent value="settings" className="mt-0 outline-none space-y-8">
                         <div className="p-6 border border-slate-200 rounded-sm space-y-6 bg-slate-50/30">
                            <div className="space-y-4">
                              <Label className="text-sm font-bold">Visibility & Access</Label>
                              <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-sm">
                                <div>
                                  <div className="text-xs font-bold">Published Status</div>
                                  <div className="text-[10px] text-slate-400">Make this lesson visible to students</div>
                                </div>
                                <button 
                                  onClick={() => updateLessonData(selectedLesson.id, { is_published: !selectedLesson.is_published })}
                                  className={`h-6 w-11 rounded-full relative transition-colors ${selectedLesson.is_published ? 'bg-[#194BFB]' : 'bg-slate-200'}`}
                                >
                                  <div className={`absolute top-1 left-1 bg-white h-4 w-4 rounded-full transition-transform ${selectedLesson.is_published ? 'translate-x-5' : ''}`} />
                                </button>
                              </div>
                              
                              <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-sm">
                                <div>
                                  <div className="text-xs font-bold">Mandatory Completion</div>
                                  <div className="text-[10px] text-slate-400">Must be completed to unlock next topic</div>
                                </div>
                                <button 
                                  onClick={() => updateLessonData(selectedLesson.id, { is_mandatory: !selectedLesson.is_mandatory })}
                                  className={`h-6 w-11 rounded-full relative transition-colors ${selectedLesson.is_mandatory ? 'bg-[#194BFB]' : 'bg-slate-200'}`}
                                >
                                  <div className={`absolute top-1 left-1 bg-white h-4 w-4 rounded-full transition-transform ${selectedLesson.is_mandatory ? 'translate-x-5' : ''}`} />
                                </button>
                              </div>
                            </div>
                         </div>
                      </TabsContent>
                    </div>
                  </ScrollArea>
                </div>
              </Tabs>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
              <Layout className="h-16 w-16 mb-4 opacity-10" />
              <p className="text-sm font-bold uppercase tracking-widest opacity-30">Select a lesson to edit</p>
            </div>
          )}
        </main>
      </div>

      {/* Global Course Settings Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-xl rounded-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold font-[Outfit]">Course Configurations</DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-6">
            <div className="grid grid-cols-2 gap-6">
               <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-slate-500">Language</Label>
                  <Select defaultValue={course.language} onValueChange={(v) => saveCourseSettings({ language: v })}>
                    <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="Hindi">Hindi</SelectItem>
                    </SelectContent>
                  </Select>
               </div>
               <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-slate-500">Difficulty Level</Label>
                  <Select defaultValue={course.difficulty} onValueChange={(v) => saveCourseSettings({ difficulty: v })}>
                    <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
               </div>
            </div>
            
            <div className="space-y-2">
               <Label className="text-[10px] uppercase font-bold text-slate-500">Thumbnail URL</Label>
               <div className="flex gap-2">
                 <Input 
                   defaultValue={course.thumbnail_url} 
                   className="rounded-sm" 
                   id="thumbnail_input"
                   placeholder="https://..."
                 />
                 <Button onClick={() => saveCourseSettings({ thumbnail_url: document.getElementById('thumbnail_input').value })} className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] font-bold px-6">Apply</Button>
               </div>
            </div>

            <div className="space-y-2">
               <Label className="text-[10px] uppercase font-bold text-slate-500">Short Description</Label>
               <Textarea 
                 defaultValue={course.short_description} 
                 className="min-h-[100px] rounded-sm border-slate-200" 
                 id="desc_input"
               />
               <div className="flex justify-end mt-2">
                 <Button onClick={() => saveCourseSettings({ short_description: document.getElementById('desc_input').value })} className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] font-bold px-6">Save Description</Button>
               </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Module Modal */}
      <Dialog open={showModuleModal} onOpenChange={setShowModuleModal}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-[Outfit] font-extrabold text-xl">New Module</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-2 block">Module Title</Label>
            <Input 
              value={newTitle} 
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddModule()}
              placeholder="e.g. Getting Started with Java"
              autoFocus
              className="rounded-sm h-11"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowModuleModal(false)} className="rounded-sm font-bold">Cancel</Button>
            <Button onClick={handleAddModule} disabled={!newTitle.trim()} className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm font-bold px-8 shadow-lg shadow-blue-100">Create Module</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Lesson Modal */}
      <Dialog open={showLessonModal} onOpenChange={setShowLessonModal}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-[Outfit] font-extrabold text-xl">New Lesson</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-2 block">Lesson Title</Label>
            <Input 
              value={newTitle} 
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLesson()}
              placeholder="e.g. Variables and Data Types"
              autoFocus
              className="rounded-sm h-11"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowLessonModal(false)} className="rounded-sm font-bold">Cancel</Button>
            <Button onClick={handleAddLesson} disabled={!newTitle.trim()} className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm font-bold px-8 shadow-lg shadow-blue-100">Create Lesson</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Module Confirmation */}
      <Dialog open={showDeleteModuleModal} onOpenChange={setShowDeleteModuleModal}>
        <DialogContent className="sm:max-w-md rounded-sm border-red-100">
          <DialogHeader>
            <DialogTitle className="font-[Outfit] font-extrabold text-xl text-red-600">Delete Module</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-500 leading-relaxed">
              Are you sure you want to delete this module? All lessons within this module must be deleted first for this action to succeed.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowDeleteModuleModal(false)} className="rounded-sm font-bold">Cancel</Button>
            <Button onClick={handleDeleteModule} className="bg-red-600 hover:bg-red-700 text-white rounded-sm font-bold px-8">Confirm Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Lesson Confirmation */}
      <Dialog open={showDeleteLessonModal} onOpenChange={setShowDeleteLessonModal}>
        <DialogContent className="sm:max-w-md rounded-sm border-red-100">
          <DialogHeader>
            <DialogTitle className="font-[Outfit] font-extrabold text-xl text-red-600">Delete Lesson</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-500 leading-relaxed">
              Are you sure you want to delete this lesson? This action cannot be undone and all lesson content will be lost.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowDeleteLessonModal(false)} className="rounded-sm font-bold">Cancel</Button>
            <Button onClick={handleDeleteLesson} className="bg-red-600 hover:bg-red-700 text-white rounded-sm font-bold px-8">Confirm Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskEditor({ lessonId }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchTask = useCallback(async () => {
    try {
      const res = await api.get(`/lessons/${lessonId}`);
      if (res.data.tasks && res.data.tasks.length > 0) {
        setTask(res.data.tasks[0]);
      } else {
        setTask({
          description: "",
          instructions: "",
          expected_output: "",
          difficulty: "easy"
        });
      }
    } catch (e) {
      toast.error("Failed to load task");
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/admin/lessons/${lessonId}/task`, task);
      setTask(res.data);
      toast.success("Task updated");
    } catch (e) {
      toast.error("Failed to save task");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-10 text-xs font-bold text-slate-400">Loading Task...</div>;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Problem Description</Label>
        <Textarea 
          value={task.description}
          onChange={(e) => setTask({ ...task, description: e.target.value })}
          placeholder="What should the student build?"
          className="min-h-[120px] rounded-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-3">
          <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Instructions</Label>
          <Textarea 
            value={task.instructions}
            onChange={(e) => setTask({ ...task, instructions: e.target.value })}
            placeholder="Step by step guide..."
            className="min-h-[150px] rounded-sm"
          />
        </div>
        <div className="space-y-3">
          <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Expected Result</Label>
          <Textarea 
            value={task.expected_output}
            onChange={(e) => setTask({ ...task, expected_output: e.target.value })}
            placeholder="Example output or code snippet..."
            className="min-h-[150px] font-mono text-xs rounded-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-slate-100">
         <div className="flex items-center gap-3">
            <Label className="text-[10px] uppercase font-bold text-slate-400">Difficulty</Label>
            <Select value={task.difficulty} onValueChange={(v) => setTask({ ...task, difficulty: v })}>
              <SelectTrigger className="w-32 h-9 rounded-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
         </div>
         <Button onClick={save} disabled={busy} className="bg-[#194BFB] hover:bg-blue-700 text-white px-8 font-bold rounded-sm h-10">
           {busy ? "Saving..." : "Update Task Configuration"}
         </Button>
      </div>
    </div>
  );
}
