import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import Navbar from "../components/Navbar";
import { 
  Play, 
  Send, 
  Terminal, 
  ChevronLeft, 
  Cpu, 
  History, 
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Database
} from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import ReactMarkdown from "react-markdown";

const DEFAULT_JAVA_CODE = `public class Main {
    public static void main(String[] args) {
        // Write your code here
    }
}`;

export default function ProblemDetailPage() {
  const { id } = useParams();
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState(DEFAULT_JAVA_CODE);
  const [stdin, setStdin] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("description");
  
  // Results
  const [runResult, setRunResult] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [viewingHistoryCode, setViewingHistoryCode] = useState(null);

  const load = async () => {
    try {
      const res = await api.get(`/problems/${id}`);
      setProblem(res.data);
      // If there are submissions, use the latest one as starting code
      if (res.data.submissions?.length > 0) {
        setCode(res.data.submissions[0].code);
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleRun = async () => {
    if (busy) return;
    setBusy(true);
    setRunResult(null);
    setSubmitResult(null);
    setActiveTab("results");
    
    try {
      const res = await api.post("/execute", { code, stdin });
      setRunResult(res.data);
      toast.success("Run completed");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Execution failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (busy) return;
    if (!window.confirm("Submit your code against all test cases?")) return;
    
    setBusy(true);
    setSubmitResult(null);
    setRunResult(null);
    setActiveTab("results");

    try {
      const res = await api.post(`/problems/${id}/submit`, { code, language: "java" });
      setSubmitResult(res.data);
      if (res.data.status === "accepted") {
        toast.success("Accepted! All test cases passed.");
        if (res.data.gamification) {
          setTimeout(() => {
            toast.success(`+${res.data.gamification.xp_earned} XP earned! 🚀`, {
              description: `Level ${res.data.gamification.level} • Streak: ${res.data.gamification.streak} days`
            });
          }, 500);
        }
      } else {
        toast.error(`Submission status: ${res.data.status.replace('_', ' ')}`);
      }
      load(); // Refresh history
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  const diffColors = {
    Easy: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    Medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    Hard: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  };

  if (loading) return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#194BFB]/20 border-t-[#194BFB] rounded-full" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col h-screen overflow-hidden">
      <Navbar />
      
      {/* Sub-header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/problems" className="p-2 hover:bg-slate-100 rounded-md transition-colors text-slate-500">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              {problem.title}
              <Badge variant="outline" className={`rounded-sm text-[10px] uppercase font-bold px-2 py-0.5 ${diffColors[problem.difficulty]}`}>
                {problem.difficulty}
              </Badge>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRun} 
            disabled={busy}
            className="h-8 rounded-md font-bold text-xs"
          >
            <Play className="h-3.5 w-3.5 mr-2 fill-current" />
            Run
          </Button>
          <Button 
            size="sm" 
            onClick={handleSubmit} 
            disabled={busy}
            className="h-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
          >
            <Send className="h-3.5 w-3.5 mr-2" />
            Submit
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Problem Info */}
        <div className="w-1/2 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="bg-slate-50 border-b border-slate-200 rounded-none h-12 w-full justify-start px-4">
              <TabsTrigger value="description" className="data-[state=active]:bg-white data-[state=active]:shadow-none rounded-none h-full border-x border-transparent data-[state=active]:border-slate-200 gap-2">
                <FileText className="h-4 w-4" /> Description
              </TabsTrigger>
              <TabsTrigger value="results" className="data-[state=active]:bg-white data-[state=active]:shadow-none rounded-none h-full border-x border-transparent data-[state=active]:border-slate-200 gap-2">
                <Terminal className="h-4 w-4" /> Results {(runResult || submitResult) && "•"}
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-white data-[state=active]:shadow-none rounded-none h-full border-x border-transparent data-[state=active]:border-slate-200 gap-2">
                <History className="h-4 w-4" /> History
              </TabsTrigger>
            </TabsList>
            
            <div className="flex-1 overflow-y-auto p-6">
              <TabsContent value="description" className="m-0 space-y-8 pb-10">
                <div className="prose prose-slate max-w-none prose-sm prose-headings:font-[Outfit] prose-headings:font-bold">
                  <ReactMarkdown>{problem.description}</ReactMarkdown>
                </div>

                <div className="space-y-4 pt-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Sample Test Cases</h3>
                  {problem.test_cases.map((tc, idx) => (
                    <div key={idx} className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-md font-mono text-sm">
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Input</div>
                        <pre className="text-slate-700 whitespace-pre-wrap">{tc.input || "(no input)"}</pre>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Expected Output</div>
                        <pre className="text-slate-700 whitespace-pre-wrap">{tc.expected_output}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="results" className="m-0 h-full">
                {!runResult && !submitResult && !busy && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-10 space-y-4">
                    <Play className="h-12 w-12 opacity-20" />
                    <p className="max-w-xs">Run your code to see output, or Submit to check against all test cases.</p>
                  </div>
                )}

                {busy && (
                  <div className="h-full flex flex-col items-center justify-center text-[#194BFB] space-y-4">
                    <div className="h-10 w-10 border-4 border-[#194BFB]/20 border-t-[#194BFB] rounded-full animate-spin" />
                    <p className="font-medium animate-pulse">Running code...</p>
                  </div>
                )}

                {runResult && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 p-3 rounded-md border border-emerald-100">
                      <Terminal className="h-4 w-4" />
                      Execution Finished
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Standard Output</Label>
                        <pre className="bg-slate-900 text-slate-100 p-4 rounded-md font-mono text-sm whitespace-pre-wrap min-h-[100px]">
                          {runResult.output || "(No output)"}
                        </pre>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-white border border-slate-200 rounded-md flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                            <Clock className="h-3.5 w-3.5" /> CPU
                          </div>
                          <span className="font-mono text-sm font-bold text-slate-700">{runResult.cpuTime}s</span>
                        </div>
                        <div className="p-3 bg-white border border-slate-200 rounded-md flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                            <Database className="h-3.5 w-3.5" /> Memory
                          </div>
                          <span className="font-mono text-sm font-bold text-slate-700">{runResult.memory} KB</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {submitResult && (
                  <div className="space-y-6 pb-10">
                    <div className={`flex items-center gap-3 p-4 rounded-md border ${
                      submitResult.status === "accepted" 
                        ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                        : "bg-rose-50 border-rose-100 text-rose-700"
                    }`}>
                      {submitResult.status === "accepted" ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
                      <div>
                        <h3 className="font-bold text-lg uppercase tracking-tight">
                          {submitResult.status.replace('_', ' ')}
                        </h3>
                        <p className="text-sm opacity-80">
                          {submitResult.test_results.filter(r => r.passed).length} / {submitResult.test_results.length} test cases passed
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Detailed Results</h4>
                      <div className="space-y-2">
                        {submitResult.test_results.map((res, i) => (
                          <Card key={i} className="p-4 border-slate-200 shadow-none hover:bg-slate-50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-slate-400">#{i + 1}</span>
                                {res.passed ? (
                                  <Badge className="bg-emerald-500 text-white border-transparent text-[10px] uppercase font-bold px-1.5 h-5">Pass</Badge>
                                ) : (
                                  <Badge className="bg-rose-500 text-white border-transparent text-[10px] uppercase font-bold px-1.5 h-5">Fail</Badge>
                                )}
                                <span className="text-xs font-semibold text-slate-700">
                                  {res.is_sample ? "Sample Test Case" : "Hidden Test Case"}
                                </span>
                              </div>
                            </div>
                            
                            {!res.passed && res.is_sample && (
                              <div className="mt-3 p-3 bg-slate-900 rounded-md font-mono text-xs space-y-2">
                                <div className="text-rose-400">Actual Output:</div>
                                <pre className="text-white whitespace-pre-wrap">{res.actual_output || "(no output)"}</pre>
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="m-0">
                <div className="space-y-4">
                  {problem.submissions?.map((sub) => (
                    <Card key={sub.id} className="p-4 border-slate-200 shadow-sm flex items-center justify-between hover:border-[#194BFB]/30 transition-colors">
                      <div className="flex items-center gap-4">
                        {sub.status === "accepted" ? (
                          <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                            <XCircle className="h-5 w-5" />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-900 uppercase">
                            {sub.status.replace('_', ' ')}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {new Date(sub.submitted_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setViewingHistoryCode(sub.code)}>
                        View Code
                      </Button>
                    </Card>
                  ))}
                  {(!problem.submissions || problem.submissions.length === 0) && (
                    <div className="py-20 text-center text-slate-400">
                      <History className="h-10 w-10 mx-auto mb-3 opacity-20" />
                      <p>You haven't submitted anything yet.</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Right Panel: Editor & Controls */}
        <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden relative">
          <div className="h-2/3 border-b border-white/5 relative">
            <Editor
              height="100%"
              defaultLanguage="java"
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v || "")}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16 },
                fontFamily: "JetBrains Mono, Menlo, monospace",
                readOnly: !!viewingHistoryCode
              }}
            />
            {viewingHistoryCode && (
              <div className="absolute inset-x-0 top-0 bg-[#194BFB] text-white px-4 py-1 text-[10px] font-bold uppercase tracking-widest flex items-center justify-between z-10">
                Viewing Historical Submission
                <button onClick={() => setViewingHistoryCode(null)} className="hover:underline">Back to Editor</button>
              </div>
            )}
          </div>
          
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b border-white/5 bg-slate-800 flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Custom Input (stdin)</span>
            </div>
            <textarea
              className="flex-1 w-full bg-slate-900 p-4 text-sm font-mono text-slate-300 outline-none resize-none placeholder:text-slate-600"
              placeholder="Provide input for manual Run..."
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
      </div>

      {/* Code Modal for History View (optional, currently embedded in editor) */}
    </div>
  );
}
