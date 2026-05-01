import React, { useState } from "react";
import Editor from "@monaco-editor/react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import Navbar from "../components/Navbar";
import { Play, Terminal, Cpu, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";

const DEFAULT_JAVA_CODE = `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, HatchKod!");
    }
}`;

export default function PlaygroundPage() {
  const [code, setCode] = useState(DEFAULT_JAVA_CODE);
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState(null);
  const [busy, setBusy] = useState(false);

  const runCode = async () => {
    if (!code.trim()) {
      toast.error("Code cannot be empty");
      return;
    }
    setBusy(true);
    setOutput(null);
    try {
      const res = await api.post("/execute", { code, stdin });
      const runData = res.data;
      
      if (!runData || runData.output === undefined) {
        toast.error("Invalid response from execution engine");
        return;
      }

      setOutput(runData);
      toast.success("Execution completed");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to connect to execution engine");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 fade-in">
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-160px)]">
          {/* Editor Section */}
          <div className="flex-1 flex flex-col min-w-0">
            <Card className="flex-1 overflow-hidden border-slate-200 shadow-sm flex flex-col">
              <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#194BFB]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Main.java</span>
                </div>
                <Button 
                  onClick={runCode} 
                  disabled={busy}
                  className="h-8 rounded-md bg-[#194BFB] hover:bg-[#0F3AE5] px-4 text-xs font-bold transition-all shadow-sm active:scale-95"
                >
                  {busy ? (
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Running...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Run Code
                    </div>
                  )}
                </Button>
              </div>
              <div className="flex-1 min-h-0">
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
                  }}
                />
              </div>
            </Card>

            {/* stdin Section */}
            <Card className="mt-4 border-slate-200 shadow-sm overflow-hidden flex flex-col bg-slate-900">
              <div className="px-4 py-2 border-b border-white/5 bg-slate-800 flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Input (stdin)</span>
              </div>
              <textarea
                className="w-full h-24 bg-transparent p-4 text-sm font-mono text-slate-300 outline-none resize-none disabled:opacity-50"
                placeholder="Enter input values, one per line..."
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                disabled={busy}
              />
            </Card>
          </div>

          {/* Output Section */}
          <div className="w-full lg:w-[400px] flex flex-col shrink-0">
            <Card className="flex-1 flex flex-col border-slate-200 shadow-sm overflow-hidden bg-slate-900">
              <div className="px-4 py-3 border-b border-white/5 bg-slate-800 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Output</span>
              </div>
              
              <div className="flex-1 p-5 font-mono text-sm overflow-y-auto custom-scrollbar">
                {!output && !busy && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-3 opacity-50">
                    <Cpu className="h-8 w-8" />
                    <p>Click "Run Code" to execute your Java program</p>
                  </div>
                )}
                
                {busy && (
                  <div className="h-full flex flex-col items-center justify-center text-blue-400/50 space-y-3 animate-pulse">
                    <div className="h-8 w-8 border-4 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
                    <p>Compiling & Running...</p>
                  </div>
                )}

                {output && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {output.output && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Console Output</div>
                        <pre className={`whitespace-pre-wrap ${
                          /error|exception/i.test(output.output) ? "text-red-400 bg-red-400/5 p-2 rounded" : "text-emerald-400"
                        }`}>
                          {output.output}
                        </pre>
                      </div>
                    )}
                    
                    {!output.output && (
                      <div className="text-slate-500 italic">Program finished with no output.</div>
                    )}

                    <div className="pt-4 mt-4 border-t border-white/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">CPU Time</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#194BFB]/10 text-[#194BFB] border border-[#194BFB]/20">
                          {output.cpuTime}s
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Memory</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-white/5">
                          {output.memory} KB
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
