import React, { useState, useEffect } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { 
  Plus, 
  Trash2, 
  ChevronLeft, 
  Settings2, 
  Check, 
  X,
  FileCode,
  Tag as TagIcon,
  Trash
} from "lucide-react";
import Navbar from "../../components/Navbar";
import { api, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";

export default function ProblemManagementPage() {
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentProblem, setCurrentProblem] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    difficulty: "Easy",
    tags: [],
    time_limit_seconds: 5,
    test_cases: [{ input: "", expected_output: "", is_sample: true, order_index: 0 }]
  });
  const [tagInput, setTagInput] = useState("");

  const load = async () => {
    try {
      const res = await api.get("/problems");
      setProblems(res.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleEdit = async (p) => {
    try {
      const res = await api.get(`/problems/${p.id}`);
      setCurrentProblem(p);
      setFormData(res.data);
      setIsEditing(true);
    } catch (err) {
      toast.error("Failed to load problem details");
    }
  };

  const handleCreateNew = () => {
    setCurrentProblem(null);
    setFormData({
      title: "",
      description: "",
      difficulty: "Easy",
      tags: [],
      time_limit_seconds: 5,
      test_cases: [{ input: "", expected_output: "", is_sample: true, order_index: 0 }]
    });
    setIsEditing(true);
  };

  const handleAddTestCase = () => {
    setFormData({
      ...formData,
      test_cases: [
        ...formData.test_cases,
        { input: "", expected_output: "", is_sample: false, order_index: formData.test_cases.length }
      ]
    });
  };

  const handleRemoveTestCase = (idx) => {
    const newTC = formData.test_cases.filter((_, i) => i !== idx);
    setFormData({ ...formData, test_cases: newTC });
  };

  const handleTagKeyDown = (e) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!formData.tags.includes(tagInput.trim())) {
        setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      }
      setTagInput("");
    }
  };

  const removeTag = (tag) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.test_cases.length === 0) {
      toast.error("At least one test case is required");
      return;
    }
    try {
      if (currentProblem) {
        await api.put(`/problems/${currentProblem.id}`, formData);
        toast.success("Problem updated");
      } else {
        await api.post("/problems", formData);
        toast.success("Problem created");
      }
      setIsEditing(false);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this problem?")) return;
    try {
      await api.delete(`/problems/${id}`);
      toast.success("Problem deleted");
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  if (isEditing) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <Navbar />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <Button 
            variant="ghost" 
            onClick={() => setIsEditing(false)}
            className="mb-6 flex items-center gap-2 text-slate-500"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Problems
          </Button>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="p-6 border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
                <Settings2 className="h-5 w-5 text-[#194BFB]" />
                <h2 className="text-xl font-bold text-slate-900">
                  {currentProblem ? "Edit Problem" : "Create New Problem"}
                </h2>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Problem Title</Label>
                  <Input 
                    value={formData.title} 
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="e.g. Sum of Two Integers"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select 
                    value={formData.difficulty} 
                    onValueChange={(v) => setFormData({...formData, difficulty: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Easy">Easy</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Time Limit (Seconds)</Label>
                  <Input 
                    type="number" 
                    value={formData.time_limit_seconds} 
                    onChange={(e) => setFormData({...formData, time_limit_seconds: parseInt(e.target.value)})}
                    required
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Tags (Press Enter to add)</Label>
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md border-slate-200 bg-white min-h-[42px] items-center">
                    {formData.tags.map(t => (
                      <Badge key={t} variant="secondary" className="gap-1 px-2 py-0.5">
                        {t}
                        <X className="h-3 w-3 cursor-pointer hover:text-red-500" onClick={() => removeTag(t)} />
                      </Badge>
                    ))}
                    <input 
                      className="border-none outline-none text-sm flex-1 bg-transparent px-1 min-w-[120px]"
                      placeholder={formData.tags.length === 0 ? "Add tags..." : ""}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                    />
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Problem Statement (Markdown supported)</Label>
                  <Textarea 
                    value={formData.description} 
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    rows={8}
                    placeholder="Describe the problem, input format, output format, and constraints..."
                    required
                    className="font-sans"
                  />
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <FileCode className="h-5 w-5 text-[#194BFB]" />
                  Test Cases
                </h3>
                <Button type="button" size="sm" onClick={handleAddTestCase} className="bg-[#194BFB] hover:bg-[#0F3AE5]">
                  <Plus className="h-4 w-4 mr-2" /> Add Test Case
                </Button>
              </div>

              {formData.test_cases.map((tc, idx) => (
                <Card key={idx} className="p-6 border-slate-200 shadow-sm relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${tc.is_sample ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-2">
                      <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Input</Label>
                      <Textarea 
                        className="font-mono text-sm h-24"
                        value={tc.input} 
                        onChange={(e) => {
                          const ntc = [...formData.test_cases];
                          ntc[idx].input = e.target.value;
                          setFormData({...formData, test_cases: ntc});
                        }}
                        placeholder="Raw input for the test case..."
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Expected Output</Label>
                      <Textarea 
                        className="font-mono text-sm h-24"
                        value={tc.expected_output} 
                        onChange={(e) => {
                          const ntc = [...formData.test_cases];
                          ntc[idx].expected_output = e.target.value;
                          setFormData({...formData, test_cases: ntc});
                        }}
                        placeholder="Expected exact output..."
                      />
                    </div>
                    <div className="flex flex-col justify-between items-end gap-4 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium text-slate-600">Sample</Label>
                        <Switch 
                          checked={tc.is_sample}
                          onCheckedChange={(v) => {
                            const ntc = [...formData.test_cases];
                            ntc[idx].is_sample = v;
                            setFormData({...formData, test_cases: ntc});
                          }}
                        />
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleRemoveTestCase(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex justify-end gap-4 pt-4 border-t border-slate-200">
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#194BFB] hover:bg-[#0F3AE5] px-8">
                {currentProblem ? "Update Problem" : "Create Problem"}
              </Button>
            </div>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-[Outfit] font-bold text-slate-900 mb-2">Problem Management</h1>
            <p className="text-slate-500">Manage your collection of coding challenges and test cases.</p>
          </div>
          <Button onClick={handleCreateNew} className="bg-[#194BFB] hover:bg-[#0F3AE5]">
            <Plus className="h-4 w-4 mr-2" /> New Problem
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-white animate-pulse rounded-lg border border-slate-200" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {problems.map(p => (
              <Card key={p.id} className="p-6 border-slate-200 shadow-sm hover:border-[#194BFB]/30 transition-colors group">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-slate-900 group-hover:text-[#194BFB] transition-colors">{p.title}</h3>
                      <Badge variant="secondary" className="rounded-sm text-[10px] uppercase font-bold px-2 py-0.5">
                        {p.difficulty}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {p.tags.map(t => (
                        <span key={t} className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                          <TagIcon className="h-3 w-3" /> {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(p)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(p.id)}>
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {problems.length === 0 && (
              <div className="text-center py-12 bg-white border border-dashed border-slate-300 rounded-lg">
                <FileCode className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-500 italic">No problems created yet. Start by creating your first challenge!</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
