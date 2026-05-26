import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  ChevronLeft,
  ChevronDown,
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
  Code,
  Terminal
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
import MDEditor from "@uiw/react-md-editor";

export default function AdminCourseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubtopic, setSelectedSubtopic] = useState(null);
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [activeSubtopicId, setActiveSubtopicId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showSubtopicModal, setShowSubtopicModal] = useState(false);
  const [showDeleteModuleModal, setShowDeleteModuleModal] = useState(false);
  const [showDeleteTopicModal, setShowDeleteTopicModal] = useState(false);
  const [showDeleteSubtopicModal, setShowDeleteSubtopicModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Collapse state: undefined/missing key = expanded (true)
  const [openModules, setOpenModules] = useState({});
  const [openTopics, setOpenTopics] = useState({});
  const isModuleOpen = (id) => openModules[id] !== false;
  const isTopicOpen = (id) => openTopics[id] !== false;
  const toggleModule = (id) => setOpenModules(p => ({ ...p, [id]: !isModuleOpen(id) }));
  const toggleTopic = (id) => setOpenTopics(p => ({ ...p, [id]: !isTopicOpen(id) }));

  // Fetch full course data
  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(`/courses/${id}/full`);
      setCourse(res.data.course);
      setModules(res.data.modules || []);
      // Auto-select first subtopic if none selected
      if (!selectedSubtopic && res.data.modules?.[0]?.topics?.[0]?.subtopics?.[0]) {
        setSelectedSubtopic(res.data.modules[0].topics[0].subtopics[0]);
      }
    } catch (e) {
      toast.error("Failed to load course details");
    } finally {
      setLoading(false);
    }
  }, [id]);

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
    if (!newTitle.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const res = await api.post(`/admin/courses/${id}/modules`, { 
        title: newTitle, 
        sequence_order: modules.length 
      });
      const newModule = { ...res.data, topics: [] };
      setModules([...modules, newModule]);
      toast.success("Module added");
      setShowModuleModal(false);
      setNewTitle("");
    } catch (e) {
      toast.error("Failed to add module");
    } finally {
      setIsSaving(false);
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

  // --- Topic Actions ---
  const handleAddTopic = async () => {
    if (!newTitle.trim() || !activeModuleId || isSaving) return;
    setIsSaving(true);
    try {
      const module = modules.find(m => m.id === activeModuleId);
      const res = await api.post(`/admin/modules/${activeModuleId}/topics`, { 
        title: newTitle, 
        sequence_order: module.topics?.length || 0 
      });
      const newModules = modules.map(m => 
        m.id === activeModuleId ? { ...m, topics: [...(m.topics || []), { ...res.data, subtopics: [] }] } : m
      );
      setModules(newModules);
      toast.success("Topic added");
      setShowTopicModal(false);
      setNewTitle("");
    } catch (e) {
      toast.error("Failed to add topic");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTopic = async () => {
    if (!activeTopicId) return;
    try {
      await api.delete(`/admin/topics/${activeTopicId}`);
      setModules(modules.map(m => ({
        ...m,
        topics: (m.topics || []).filter(t => t.id !== activeTopicId)
      })));
      toast.success("Topic deleted");
      setShowDeleteTopicModal(false);
      setActiveTopicId(null);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const updateTopicData = async (topicId, data) => {
    setSaving(true);
    try {
      await api.put(`/admin/topics/${topicId}`, data);
      setModules(modules.map(m => ({
        ...m,
        topics: (m.topics || []).map(t => t.id === topicId ? { ...t, ...data } : t)
      })));
      toast.success("Topic updated");
    } catch (e) {
      toast.error("Failed to update topic");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubtopic = async () => {
    if (!newTitle.trim() || !activeTopicId || isSaving) return;
    setIsSaving(true);
    try {
      const res = await api.post(`/admin/topics/${activeTopicId}/subtopics`, { 
        title: newTitle, 
        sequence_order: 0 // Will be handled by state logic below
      });
      
      const newModules = modules.map(m => ({
        ...m,
        topics: (m.topics || []).map(t => {
          if (t.id === activeTopicId) {
            const subs = t.subtopics || [];
            return { ...t, subtopics: [...subs, { ...res.data, sequence_order: subs.length }] };
          }
          return t;
        })
      }));
      
      setModules(newModules);
      setSelectedSubtopic(res.data);
      toast.success("Subtopic added");
      setShowSubtopicModal(false);
      setNewTitle("");
    } catch (e) {
      toast.error("Failed to add subtopic");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSubtopicData = async (subtopicId, data) => {
    setSaving(true);
    try {
      await api.put(`/admin/subtopics/${subtopicId}`, data);
      setModules(modules.map(m => ({
        ...m,
        topics: (m.topics || []).map(t => ({
          ...t,
          subtopics: (t.subtopics || []).map(s => s.id === subtopicId ? { ...s, ...data } : s)
        }))
      })));
      if (selectedSubtopic?.id === subtopicId) {
        setSelectedSubtopic({ ...selectedSubtopic, ...data });
      }
    } catch (e) {
      toast.error("Failed to save subtopic");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubtopic = async () => {
    if (!activeSubtopicId) return;
    try {
      await api.delete(`/admin/subtopics/${activeSubtopicId}`);
      setModules(modules.map(m => ({
        ...m,
        topics: (m.topics || []).map(t => ({
          ...t,
          subtopics: (t.subtopics || []).filter(s => s.id !== activeSubtopicId)
        }))
      })));
      if (selectedSubtopic?.id === activeSubtopicId) setSelectedSubtopic(null);
      toast.success("Subtopic deleted");
      setShowDeleteSubtopicModal(false);
      setActiveSubtopicId(null);
    } catch (e) {
      toast.error("Failed to delete subtopic");
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
    } else if (type === "topic") {
      const moduleId = source.droppableId;
      const module = modules.find(m => m.id === moduleId);
      if (!module) return;
      
      const items = Array.from(module.topics || []);
      const [reorderedItem] = items.splice(source.index, 1);
      items.splice(destination.index, 0, reorderedItem);
      
      setModules(modules.map(m => m.id === moduleId ? { ...m, topics: items } : m));
      try {
        await api.post("/admin/topics/reorder", { 
          ordered_ids: items.map(t => t.id) 
        });
      } catch (e) { toast.error("Reorder failed"); }
    } else if (type === "subtopic") {
      const topicId = source.droppableId;
      const topic = modules.flatMap(m => m.topics || []).find(t => t.id === topicId);
      if (!topic) return;

      const items = Array.from(topic.subtopics || []);
      const [reorderedItem] = items.splice(source.index, 1);
      items.splice(destination.index, 0, reorderedItem);

      setModules(modules.map(m => ({
        ...m,
        topics: (m.topics || []).map(t => t.id === topicId ? { ...t, subtopics: items } : t)
      })));
      try {
        await api.post("/admin/subtopics/reorder", { 
          ordered_ids: items.map(s => s.id) 
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
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6 w-[296px] max-w-[296px]">
                    {modules.map((module, mIndex) => (
                      <Draggable key={module.id} draggableId={module.id} index={mIndex}>
                        {(provided) => (
                          <div 
                            ref={provided.innerRef} 
                            {...provided.draggableProps}
                            className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-[0_2px_4px_rgba(0,0,0,0.02)] w-full max-w-full"
                          >
                            {/* Module Header */}
                            <div className="p-3 bg-slate-50/80 flex items-center justify-between border-b border-slate-100 group gap-2">
                              <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                <div {...provided.dragHandleProps} className="cursor-grab p-1 hover:bg-slate-200 rounded-sm text-slate-300 group-hover:text-slate-400 transition-colors shrink-0">
                                  <GripVertical className="h-3.5 w-3.5" />
                                </div>
                                <button
                                  onClick={() => toggleModule(module.id)}
                                  className="p-0.5 hover:bg-slate-200 rounded-sm text-slate-400 transition-colors shrink-0"
                                  title={isModuleOpen(module.id) ? "Collapse module" : "Expand module"}
                                >
                                  {isModuleOpen(module.id)
                                    ? <ChevronDown className="h-3.5 w-3.5" />
                                    : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                                <span className="block flex-1 min-w-0 text-[11px] font-extrabold text-slate-900 truncate tracking-widest uppercase" title={`Module ${mIndex + 1}: ${module.title}`}>
                                  Module {mIndex + 1}: {module.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 transition-all shrink-0">
                                <button onClick={() => { setActiveModuleId(module.id); setNewTitle(""); setShowTopicModal(true); }} className="p-1 hover:bg-[#194BFB]/10 rounded-sm text-[#194BFB]" title="Add Topic"><Plus className="h-3.5 w-3.5" /></button>
                                <button onClick={() => { setActiveModuleId(module.id); setShowDeleteModuleModal(true); }} className="p-1 hover:bg-red-50 rounded-sm text-red-500" title="Delete Module"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>

                            {/* Topics Container */}
                            <Droppable droppableId={module.id} type="topic">
                              {(tProvided) => (
                                <div {...tProvided.droppableProps} ref={tProvided.innerRef} className={`p-2 space-y-4 bg-white w-full max-w-full ${isModuleOpen(module.id) ? 'min-h-[10px]' : 'min-h-0 hidden'}`}>
                                  {isModuleOpen(module.id) && (module.topics || []).map((topic, tIndex) => (
                                    <Draggable key={topic.id} draggableId={topic.id} index={tIndex}>
                                      {(tDraggable) => (
                                        <div ref={tDraggable.innerRef} {...tDraggable.draggableProps} className="space-y-2 w-full max-w-full">
                                          {/* Topic Row */}
                                          <div className={`flex items-center justify-between group/topic bg-slate-50/50 p-2 rounded-sm border border-slate-100 gap-2 ${!topic.is_published ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                                            <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                              <div {...tDraggable.dragHandleProps} className="cursor-grab p-1 hover:bg-slate-200 rounded-sm text-slate-300 group-hover/topic:text-slate-400 transition-colors shrink-0">
                                                <GripVertical className="h-3 w-3" />
                                              </div>
                                              <button
                                                onClick={() => toggleTopic(topic.id)}
                                                className="p-0.5 hover:bg-slate-200 rounded-sm text-slate-400 transition-colors shrink-0"
                                                title={isTopicOpen(topic.id) ? "Collapse topic" : "Expand topic"}
                                              >
                                                {isTopicOpen(topic.id)
                                                  ? <ChevronDown className="h-3 w-3" />
                                                  : <ChevronRight className="h-3 w-3" />}
                                              </button>
                                              <span className="block flex-1 min-w-0 text-[11px] font-bold text-slate-600 truncate uppercase tracking-tight" title={`Topic: ${topic.title}`}>
                                                Topic: {topic.title} {!topic.is_published && "(Hidden)"}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1 transition-all shrink-0">
                                              <button
                                                onClick={() => updateTopicData(topic.id, { is_published: !topic.is_published })}
                                                className={`p-1 rounded-sm transition-colors ${topic.is_published ? 'hover:bg-blue-50 text-blue-500' : 'hover:bg-slate-200 text-slate-400'}`}
                                                title={topic.is_published ? "Unpublish Topic" : "Publish Topic"}
                                              >
                                                {topic.is_published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                              </button>
                                              <button onClick={() => { setActiveTopicId(topic.id); setNewTitle(""); setShowSubtopicModal(true); }} className="p-1 hover:bg-[#194BFB]/10 rounded-sm text-[#194BFB]" title="Add Subtopic"><Plus className="h-3 w-3" /></button>
                                              <button onClick={() => { setActiveTopicId(topic.id); setShowDeleteTopicModal(true); }} className="p-1 hover:bg-red-50 rounded-sm text-red-500" title="Delete Topic"><Trash2 className="h-3 w-3" /></button>
                                            </div>
                                          </div>

                                          {/* Subtopics Container */}
                                          <Droppable droppableId={topic.id} type="subtopic">
                                            {(sProvided) => (
                                              <div {...sProvided.droppableProps} ref={sProvided.innerRef} className={`pl-4 space-y-1 w-full max-w-full ${isTopicOpen(topic.id) ? 'min-h-[5px]' : 'min-h-0 hidden'}`}>
                                                {isTopicOpen(topic.id) && (topic.subtopics || []).map((subtopic, sIndex) => (
                                                  <Draggable key={subtopic.id} draggableId={subtopic.id} index={sIndex}>
                                                    {(sDraggable) => (
                                                      <div
                                                        ref={sDraggable.innerRef}
                                                        {...sDraggable.draggableProps}
                                                        {...sDraggable.dragHandleProps}
                                                        onClick={() => setSelectedSubtopic(subtopic)}
                                                        className={`p-2 rounded-sm text-[12px] font-medium flex items-center justify-between group/sub transition-all duration-200 gap-2 ${
                                                          selectedSubtopic?.id === subtopic.id
                                                          ? 'bg-[#194BFB] text-white shadow-md ring-1 ring-blue-400'
                                                          : 'hover:bg-slate-50 text-slate-600 border border-transparent hover:border-slate-200'
                                                        }`}
                                                      >
                                                        <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                                          <FileText className={`h-3 w-3 shrink-0 ${selectedSubtopic?.id === subtopic.id ? 'text-blue-100' : 'text-slate-400'}`} />
                                                          <span className="block flex-1 min-w-0 truncate tracking-tight" title={subtopic.title}>{subtopic.title}</span>
                                                        </div>
                                                        <button
                                                          onClick={(e) => { e.stopPropagation(); setActiveSubtopicId(subtopic.id); setShowDeleteSubtopicModal(true); }}
                                                          className={`shrink-0 p-1 rounded-sm transition-all ${selectedSubtopic?.id === subtopic.id ? 'hover:bg-white/20 text-white' : 'hover:bg-red-50 text-red-400 opacity-50 group-hover/sub:opacity-100'}`}
                                                        >
                                                          <Trash2 className="h-2.5 w-2.5" />
                                                        </button>
                                                      </div>
                                                    )}
                                                  </Draggable>
                                                ))}
                                                {sProvided.placeholder}
                                              </div>
                                            )}
                                          </Droppable>
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {tProvided.placeholder}
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
        <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-white">
          {selectedSubtopic ? (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Subtopic Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                <div className="flex-1">
                  <input 
                    className="text-2xl font-bold font-[Outfit] bg-transparent border-none outline-none focus:ring-0 w-full"
                    value={selectedSubtopic.title}
                    onChange={(e) => setSelectedSubtopic({ ...selectedSubtopic, title: e.target.value })}
                    onBlur={() => updateSubtopicData(selectedSubtopic.id, { title: selectedSubtopic.title })}
                  />
                  <div className="text-[10px] text-slate-400 mt-1 uppercase font-bold flex items-center gap-2">
                    <span>Subtopic Configuration</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-500">
                      {saving ? "Saving changes..." : <><CheckCircle2 className="h-3 w-3" /> All changes saved</>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Editor Tabs */}
              <Tabs defaultValue="learn" className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-6 border-b border-slate-100 bg-[#FBFBFC] shrink-0">
                  <TabsList className="h-12 bg-transparent gap-8">
                    <TabsTrigger value="learn" className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#194BFB] data-[state=active]:text-[#194BFB] px-1 h-full text-xs font-bold uppercase tracking-wider">
                      <Layout className="h-3.5 w-3.5 mr-2" /> Subtopic Content
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

                <div className="flex-1 overflow-hidden relative min-h-0">
                  <ScrollArea className="h-full w-full">
                    <div className="max-w-4xl mx-auto p-10 space-y-8 pb-32">
                      <TabsContent value="learn" className="mt-0 outline-none space-y-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Subtopic Content (Markdown supported)</Label>
                            <span className="text-[10px] text-slate-400">Use --- to split content into multiple pages</span>
                          </div>
                          <MDEditor 
                            height={500}
                            value={selectedSubtopic.content_html || ""}
                            onChange={(val) => setSelectedSubtopic({ ...selectedSubtopic, content_html: val || "" })}
                            preview="edit"
                          />
                        </div>
                        <Button 
                          onClick={() => updateSubtopicData(selectedSubtopic.id, { content_html: selectedSubtopic.content_html })}
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
                              value={selectedSubtopic.video_url || ""}
                              onChange={(e) => setSelectedSubtopic({ ...selectedSubtopic, video_url: e.target.value })}
                              placeholder="https://..."
                              className="rounded-sm"
                            />
                            <p className="text-[10px] text-slate-400 italic">Paste the embed or public URL of the subtopic video.</p>
                          </div>
                          <div className="space-y-3">
                            <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Estimated Duration (mins)</Label>
                            <Input 
                              type="number"
                              value={selectedSubtopic.estimated_minutes || 30}
                              onChange={(e) => setSelectedSubtopic({ ...selectedSubtopic, estimated_minutes: parseInt(e.target.value) })}
                              className="rounded-sm"
                            />
                          </div>
                        </div>
                        <Button 
                          onClick={() => updateSubtopicData(selectedSubtopic.id, { 
                            video_url: selectedSubtopic.video_url,
                            estimated_minutes: selectedSubtopic.estimated_minutes 
                          })}
                          className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-10 px-6 font-bold shadow-lg shadow-blue-100"
                        >
                          Update Video Settings
                        </Button>
                      </TabsContent>

                      <TabsContent value="task" className="mt-0 outline-none">
                        <TaskEditor subtopicId={selectedSubtopic.id} />
                      </TabsContent>

                      <TabsContent value="settings" className="mt-0 outline-none space-y-8">
                         <div className="p-6 border border-slate-200 rounded-sm space-y-6 bg-slate-50/30">
                            <div className="space-y-4">
                              <Label className="text-sm font-bold">Visibility & Access</Label>
                              <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-sm">
                                <div>
                                  <div className="text-xs font-bold">Published Status</div>
                                  <div className="text-[10px] text-slate-400">Make this subtopic visible to students</div>
                                </div>
                                <button 
                                  onClick={() => updateSubtopicData(selectedSubtopic.id, { is_published: !selectedSubtopic.is_published })}
                                  className={`h-6 w-11 rounded-full relative transition-colors ${selectedSubtopic.is_published ? 'bg-[#194BFB]' : 'bg-slate-200'}`}
                                >
                                  <div className={`absolute top-1 left-1 bg-white h-4 w-4 rounded-full transition-transform ${selectedSubtopic.is_published ? 'translate-x-5' : ''}`} />
                                </button>
                              </div>
                              
                              <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-sm">
                                <div>
                                  <div className="text-xs font-bold">Mandatory Completion</div>
                                  <div className="text-[10px] text-slate-400">Must be completed for Topic progress</div>
                                </div>
                                <button 
                                  onClick={() => updateSubtopicData(selectedSubtopic.id, { is_mandatory: !selectedSubtopic.is_mandatory })}
                                  className={`h-6 w-11 rounded-full relative transition-colors ${selectedSubtopic.is_mandatory ? 'bg-[#194BFB]' : 'bg-slate-200'}`}
                                >
                                  <div className={`absolute top-1 left-1 bg-white h-4 w-4 rounded-full transition-transform ${selectedSubtopic.is_mandatory ? 'translate-x-5' : ''}`} />
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
              <p className="text-sm font-bold uppercase tracking-widest opacity-30">Select a subtopic to edit</p>
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
          <form onSubmit={(e) => { e.preventDefault(); handleAddModule(); }}>
            <div className="py-4">
              <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-2 block">Module Title</Label>
              <Input 
                value={newTitle} 
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Getting Started with Java"
                autoFocus
                className="rounded-sm h-11"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowModuleModal(false)} className="rounded-sm font-bold">Cancel</Button>
              <Button type="submit" disabled={!newTitle.trim() || isSaving} className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm font-bold px-8 shadow-lg shadow-blue-100">
                {isSaving ? "Creating..." : "Create Module"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Topic Modal */}
      <Dialog open={showTopicModal} onOpenChange={setShowTopicModal}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-[Outfit] font-extrabold text-xl">New Topic</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddTopic(); }}>
            <div className="py-4">
              <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-2 block">Topic Title</Label>
              <Input 
                value={newTitle} 
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Variables and Data Types"
                autoFocus
                className="rounded-sm h-11"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowTopicModal(false)} className="rounded-sm font-bold">Cancel</Button>
              <Button type="submit" disabled={!newTitle.trim() || isSaving} className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm font-bold px-8 shadow-lg shadow-blue-100">
                {isSaving ? "Creating..." : "Create Topic"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Subtopic Modal */}
      <Dialog open={showSubtopicModal} onOpenChange={setShowSubtopicModal}>
        <DialogContent className="sm:max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-[Outfit] font-extrabold text-xl">New Subtopic</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAddSubtopic(); }}>
            <div className="py-4">
              <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-2 block">Subtopic Title</Label>
              <Input 
                value={newTitle} 
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Primitive vs Reference Types"
                autoFocus
                className="rounded-sm h-11"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowSubtopicModal(false)} className="rounded-sm font-bold">Cancel</Button>
              <Button type="submit" disabled={!newTitle.trim() || isSaving} className="bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm font-bold px-8 shadow-lg shadow-blue-100">
                {isSaving ? "Creating..." : "Create Subtopic"}
              </Button>
            </DialogFooter>
          </form>
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
              Are you sure you want to delete this module? All topics within this module must be deleted first for this action to succeed.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowDeleteModuleModal(false)} className="rounded-sm font-bold">Cancel</Button>
            <Button onClick={handleDeleteModule} className="bg-red-600 hover:bg-red-700 text-white rounded-sm font-bold px-8">Confirm Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Topic Confirmation */}
      <Dialog open={showDeleteTopicModal} onOpenChange={setShowDeleteTopicModal}>
        <DialogContent className="sm:max-w-md rounded-sm border-red-100">
          <DialogHeader>
            <DialogTitle className="font-[Outfit] font-extrabold text-xl text-red-600">Delete Topic</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-500 leading-relaxed">
              Are you sure you want to delete this topic? All subtopics within must be deleted first.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowDeleteTopicModal(false)} className="rounded-sm font-bold">Cancel</Button>
            <Button onClick={handleDeleteTopic} className="bg-red-600 hover:bg-red-700 text-white rounded-sm font-bold px-8">Confirm Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Subtopic Confirmation */}
      <Dialog open={showDeleteSubtopicModal} onOpenChange={setShowDeleteSubtopicModal}>
        <DialogContent className="sm:max-w-md rounded-sm border-red-100">
          <DialogHeader>
            <DialogTitle className="font-[Outfit] font-extrabold text-xl text-red-600">Delete Subtopic</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-500 leading-relaxed">
              Are you sure you want to delete this subtopic? This action cannot be undone.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowDeleteSubtopicModal(false)} className="rounded-sm font-bold">Cancel</Button>
            <Button onClick={handleDeleteSubtopic} className="bg-red-600 hover:bg-red-700 text-white rounded-sm font-bold px-8">Confirm Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskEditor({ subtopicId }) {
  const EMPTY_TASK = { description: "", instructions: "", expected_output: "", difficulty: "easy", task_type: "project", language: "java" };
  const [task, setTask] = useState(EMPTY_TASK);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchTask = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/subtopics/${subtopicId}`);
      setTask(res.data.task ? { ...EMPTY_TASK, ...res.data.task } : EMPTY_TASK);
    } catch {
      toast.error("Failed to load task");
      setTask(EMPTY_TASK);
    } finally {
      setLoading(false);
    }
  }, [subtopicId]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/admin/subtopics/${subtopicId}/task`, task);
      setTask(prev => ({ ...EMPTY_TASK, ...prev, ...res.data }));
      toast.success("Task saved");
    } catch {
      toast.error("Failed to save task");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-slate-400 font-bold text-sm animate-pulse">Loading task configuration...</div>;

  return (
    <div className="space-y-8">
      {/* Task Type */}
      <div className="space-y-3">
        <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Task Type</Label>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "project", label: "Project / Manual Review", icon: FileText, hint: "Student submits a GitHub link or file. Mentor reviews and approves manually." },
            { value: "coding", label: "Coding / Auto-Graded", icon: Code, hint: "Student writes code in an embedded editor. Judge0 runs test cases. All pass → auto-complete." },
          ].map(({ value, label, icon: Icon, hint }) => (
            <button
              key={value}
              onClick={() => setTask(t => ({ ...t, task_type: value }))}
              className={`p-4 rounded-sm border-2 text-left transition-all ${task.task_type === value ? "border-[#194BFB] bg-[#194BFB]/5" : "border-slate-200 hover:border-slate-300"}`}
            >
              <div className={`flex items-center gap-2 font-bold text-sm mb-1 ${task.task_type === value ? "text-[#194BFB]" : "text-slate-600"}`}>
                <Icon className="h-4 w-4" /> {label}
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">{hint}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Language — coding only */}
      {task.task_type === "coding" && (
        <div className="space-y-3">
          <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Programming Language</Label>
          <Select value={task.language || "java"} onValueChange={(v) => setTask(t => ({ ...t, language: v }))}>
            <SelectTrigger className="w-52 h-10 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="java">Java</SelectItem>
              <SelectItem value="python">Python</SelectItem>
              <SelectItem value="javascript">JavaScript</SelectItem>
              <SelectItem value="cpp">C++</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Description */}
      <div className="space-y-3">
        <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Problem Description</Label>
        <Textarea
          value={task.description}
          onChange={(e) => setTask(t => ({ ...t, description: e.target.value }))}
          placeholder="What should the student build or implement?"
          className="min-h-[120px] rounded-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-3">
          <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Instructions</Label>
          <Textarea
            value={task.instructions}
            onChange={(e) => setTask(t => ({ ...t, instructions: e.target.value }))}
            placeholder="Step by step guide..."
            className="min-h-[150px] rounded-sm"
          />
        </div>
        <div className="space-y-3">
          <Label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Expected Result / Example</Label>
          <Textarea
            value={task.expected_output}
            onChange={(e) => setTask(t => ({ ...t, expected_output: e.target.value }))}
            placeholder="Example output or reference code..."
            className="min-h-[150px] font-mono text-xs rounded-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-6 border-t border-slate-100">
        <div className="flex items-center gap-3">
          <Label className="text-[10px] uppercase font-bold text-slate-400">Difficulty</Label>
          <Select value={task.difficulty} onValueChange={(v) => setTask(t => ({ ...t, difficulty: v }))}>
            <SelectTrigger className="w-32 h-9 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} disabled={busy} className="bg-[#194BFB] hover:bg-blue-700 text-white px-8 font-bold rounded-sm h-10">
          {busy ? "Saving..." : "Save Task"}
        </Button>
      </div>

      {/* Test Case Manager — only after task is saved as coding type */}
      {task.id && task.task_type === "coding" && (
        <TestCaseManager taskId={task.id} />
      )}
    </div>
  );
}

function TestCaseManager({ taskId }) {
  const [testCases, setTestCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newCase, setNewCase] = useState({ input: "", expected_output: "", is_sample: true });
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/tasks/${taskId}/test-cases`);
      setTestCases(res.data || []);
    } catch {
      toast.error("Failed to load test cases");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { loadCases(); }, [loadCases]);

  const addCase = async () => {
    if (!newCase.expected_output.trim()) { toast.error("Expected output is required"); return; }
    setSavingNew(true);
    try {
      const res = await api.post(`/tasks/${taskId}/test-cases`, { ...newCase, order_index: testCases.length });
      setTestCases(prev => [...prev, res.data]);
      setNewCase({ input: "", expected_output: "", is_sample: true });
      setAdding(false);
      toast.success("Test case added");
    } catch {
      toast.error("Failed to add test case");
    } finally {
      setSavingNew(false);
    }
  };

  const updateCase = async (tc) => {
    try {
      const res = await api.put(`/task-test-cases/${tc.id}`, {
        input: tc.input,
        expected_output: tc.expected_output,
        is_sample: tc.is_sample,
        order_index: tc.order_index,
      });
      setTestCases(prev => prev.map(c => c.id === tc.id ? res.data : c));
      setEditingId(null);
      toast.success("Test case updated");
    } catch {
      toast.error("Failed to update test case");
    }
  };

  const deleteCase = async (id) => {
    if (!confirm("Delete this test case?")) return;
    try {
      await api.delete(`/task-test-cases/${id}`);
      setTestCases(prev => prev.filter(c => c.id !== id));
      toast.success("Test case deleted");
    } catch {
      toast.error("Failed to delete test case");
    }
  };

  const toggleSample = async (tc) => {
    const updated = { ...tc, is_sample: !tc.is_sample };
    setTestCases(prev => prev.map(c => c.id === tc.id ? updated : c));
    try {
      await api.put(`/task-test-cases/${tc.id}`, {
        input: updated.input,
        expected_output: updated.expected_output,
        is_sample: updated.is_sample,
        order_index: updated.order_index,
      });
    } catch {
      toast.error("Failed to update");
      setTestCases(prev => prev.map(c => c.id === tc.id ? tc : c));
    }
  };

  return (
    <div className="space-y-4 pt-8 border-t-2 border-dashed border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-[#194BFB]" />
            <span className="text-sm font-extrabold text-slate-900 uppercase tracking-widest">Test Cases</span>
            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{testCases.length}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Sample cases are shown to students as examples. Hidden cases are used only for grading.
          </p>
        </div>
        <Button
          onClick={() => { setAdding(true); setEditingId(null); }}
          size="sm"
          className="h-9 bg-[#194BFB] text-white rounded-sm font-bold text-xs uppercase tracking-wider"
        >
          <Plus className="h-3.5 w-3.5 mr-2" /> Add Test Case
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-400 text-sm animate-pulse">Loading test cases...</div>
      ) : testCases.length === 0 && !adding ? (
        <div className="py-10 text-center border-2 border-dashed border-slate-200 rounded-sm">
          <Terminal className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-bold">No test cases yet</p>
          <p className="text-[10px] text-slate-400 mt-1">Add at least one test case for auto-grading to work.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {testCases.map((tc, i) =>
            editingId === tc.id ? (
              <TestCaseEditRow
                key={tc.id}
                tc={tc}
                index={i}
                onSave={updateCase}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={tc.id} className="border border-slate-200 rounded-sm bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">#{i + 1}</span>
                    <button
                      onClick={() => toggleSample(tc)}
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border transition-colors ${
                        tc.is_sample
                          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                          : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      {tc.is_sample ? "Sample · visible to student" : "Hidden · grading only"}
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => { setEditingId(tc.id); setAdding(false); }}
                      className="h-7 px-2 text-slate-500 hover:text-[#194BFB] text-xs"
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => deleteCase(tc.id)}
                      className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50 text-xs"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-slate-100">
                  <div className="p-4">
                    <div className="text-[9px] uppercase font-extrabold text-slate-400 mb-2 tracking-widest">Input</div>
                    <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-all min-h-[20px]">
                      {tc.input || <span className="text-slate-300 italic not-italic font-sans">No input</span>}
                    </pre>
                  </div>
                  <div className="p-4">
                    <div className="text-[9px] uppercase font-extrabold text-slate-400 mb-2 tracking-widest">Expected Output</div>
                    <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-all">{tc.expected_output}</pre>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Inline add form */}
      {adding && (
        <div className="border-2 border-dashed border-[#194BFB]/40 rounded-sm bg-blue-50/30 p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#194BFB]">New Test Case</span>
            <button
              onClick={() => setNewCase(prev => ({ ...prev, is_sample: !prev.is_sample }))}
              className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-colors ${
                newCase.is_sample
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}
            >
              {newCase.is_sample ? "Sample (visible to student)" : "Hidden (grading only)"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[9px] uppercase font-extrabold text-slate-400 tracking-widest">Input</Label>
              <Textarea
                value={newCase.input}
                onChange={(e) => setNewCase(prev => ({ ...prev, input: e.target.value }))}
                placeholder="stdin input (leave empty if none)"
                className="min-h-[80px] font-mono text-xs rounded-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[9px] uppercase font-extrabold text-slate-400 tracking-widest">Expected Output *</Label>
              <Textarea
                value={newCase.expected_output}
                onChange={(e) => setNewCase(prev => ({ ...prev, expected_output: e.target.value }))}
                placeholder="Expected stdout"
                className="min-h-[80px] font-mono text-xs rounded-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost" size="sm"
              onClick={() => { setAdding(false); setNewCase({ input: "", expected_output: "", is_sample: true }); }}
              className="rounded-sm font-bold"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={addCase}
              disabled={savingNew || !newCase.expected_output.trim()}
              className="bg-[#194BFB] text-white rounded-sm font-bold px-6"
            >
              {savingNew ? "Adding..." : "Add Test Case"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TestCaseEditRow({ tc, index, onSave, onCancel }) {
  const [edited, setEdited] = useState({ ...tc });

  return (
    <div className="border-2 border-[#194BFB]/30 rounded-sm bg-blue-50/20 p-5 space-y-4 animate-in fade-in duration-150">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#194BFB]">Editing #{index + 1}</span>
        <button
          onClick={() => setEdited(prev => ({ ...prev, is_sample: !prev.is_sample }))}
          className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-colors ${
            edited.is_sample
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-slate-100 text-slate-500 border-slate-200"
          }`}
        >
          {edited.is_sample ? "Sample (visible to student)" : "Hidden (grading only)"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-[9px] uppercase font-extrabold text-slate-400 tracking-widest">Input</Label>
          <Textarea
            value={edited.input}
            onChange={(e) => setEdited(prev => ({ ...prev, input: e.target.value }))}
            className="min-h-[80px] font-mono text-xs rounded-sm"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[9px] uppercase font-extrabold text-slate-400 tracking-widest">Expected Output *</Label>
          <Textarea
            value={edited.expected_output}
            onChange={(e) => setEdited(prev => ({ ...prev, expected_output: e.target.value }))}
            className="min-h-[80px] font-mono text-xs rounded-sm"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel} className="rounded-sm font-bold">Cancel</Button>
        <Button
          size="sm"
          onClick={() => onSave(edited)}
          disabled={!edited.expected_output.trim()}
          className="bg-[#194BFB] text-white rounded-sm font-bold px-6"
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
}
