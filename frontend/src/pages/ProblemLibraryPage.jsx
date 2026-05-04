import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { toast } from "sonner";
import { Search, Filter, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "../components/ui/input";

export default function ProblemLibraryPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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

  const diffColors = {
    Easy: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    Medium: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    Hard: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  };

  const filtered = problems.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 fade-in">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-[Outfit] font-bold text-slate-900 mb-2">Problem Library</h1>
            <p className="text-slate-500">Master your skills with our curated collection of coding challenges.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search problems or tags..." 
              className="pl-10 h-10 rounded-md border-slate-200 bg-white shadow-sm"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-lg border border-slate-200" />
            ))}
          </div>
        ) : (
          <>
            <Card className="border-slate-200 shadow-sm overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">#</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Title</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-center">Difficulty</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Tags</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedItems.map((p, idx) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-6 py-4 text-sm text-slate-400 font-mono">
                          {(currentPage - 1) * itemsPerPage + idx + 1}
                        </td>
                        <td className="px-6 py-4">
                          <Link 
                            to={`/problems/${p.id}`} 
                            className="text-sm font-semibold text-slate-900 hover:text-[#194BFB] transition-colors flex items-center gap-2"
                          >
                            {p.title}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline" className={`rounded-sm text-[10px] uppercase font-bold px-2 py-0.5 ${diffColors[p.difficulty]}`}>
                            {p.difficulty}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {p.tags.map(t => (
                              <span key={t} className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {p.solved ? (
                            <div className="inline-flex items-center gap-1.5 text-emerald-500 font-bold text-xs uppercase tracking-wider">
                              <CheckCircle2 className="h-4 w-4" />
                              Solved
                            </div>
                          ) : p.attempted ? (
                            <div className="inline-flex items-center gap-1.5 text-amber-500 font-bold text-xs uppercase tracking-wider">
                              <AlertCircle className="h-4 w-4" />
                              Attempted
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center text-slate-500 italic">
                          No problems found matching your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white p-4 border border-slate-200 rounded-sm">
                <div className="text-xs text-slate-500 font-medium">
                  Showing <span className="font-bold text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-slate-900">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="font-bold text-slate-900">{filtered.length}</span> problems
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="h-8 rounded-sm text-[10px] font-bold uppercase tracking-widest border-slate-200"
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" /> Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="h-8 rounded-sm text-[10px] font-bold uppercase tracking-widest border-slate-200"
                  >
                    Next <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
