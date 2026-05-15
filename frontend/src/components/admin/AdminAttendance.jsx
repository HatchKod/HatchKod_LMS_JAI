import { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { 
  Users, 
  ChevronRight, 
  ClipboardList, 
  Loader2,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { Dialog, DialogContent } from "../ui/dialog";
import MentorAttendance from "../mentor/MentorAttendance"; // Reusing the batch view

export default function AdminAttendance() {
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const { data } = await api.get("/admin/attendance-overview");
        setSummaries(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="h-10 w-10 animate-spin mb-2" />
      <p className="text-xs font-bold uppercase tracking-widest">Loading cross-batch stats...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 font-['Outfit']">Attendance Overview</h2>
          <p className="text-xs text-slate-500 font-medium">Cross-batch attendance trends and risk monitoring.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {summaries.length === 0 ? (
          <div className="col-span-full py-20 bg-white border border-dashed rounded-sm flex flex-col items-center text-slate-400">
            <ClipboardList className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-bold uppercase tracking-widest">No attendance data yet</p>
          </div>
        ) : (
          summaries.map(b => (
            <Card key={b.batch_id} className="group hover:border-blue-200 transition-all border-slate-200 rounded-sm bg-white overflow-hidden">
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 group-hover:text-[#194BFB] transition-colors">{b.batch_name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{b.course_title}</p>
                  </div>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                    b.avg_attendance_percentage >= 90 ? "bg-emerald-50 text-emerald-600" :
                    b.avg_attendance_percentage >= 75 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                  }`}>
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-2">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Students</p>
                    <p className="text-lg font-black text-slate-700">{b.total_students}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg Attendance</p>
                    <p className={`text-lg font-black ${
                      b.avg_attendance_percentage >= 90 ? "text-emerald-600" :
                      b.avg_attendance_percentage >= 75 ? "text-amber-500" : "text-red-600"
                    }`}>
                      {b.avg_attendance_percentage}%
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${
                        b.avg_attendance_percentage >= 90 ? "bg-emerald-500" :
                        b.avg_attendance_percentage >= 75 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${b.avg_attendance_percentage}%` }}
                    />
                  </div>
                  {b.avg_attendance_percentage < 75 && (
                    <div className="flex items-center gap-1.5 text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      <span className="text-[9px] font-bold uppercase tracking-tighter">Needs Attention</span>
                    </div>
                  )}
                </div>

                <Button 
                  onClick={() => setSelectedBatchId(b.batch_id)}
                  variant="outline" 
                  className="w-full h-10 border-slate-200 text-slate-600 font-bold uppercase tracking-widest text-[10px] group-hover:bg-[#194BFB] group-hover:text-white group-hover:border-[#194BFB] transition-all"
                >
                  Analyze Details <ChevronRight className="h-3 w-3 ml-2" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Batch Detail Modal */}
      <Dialog open={!!selectedBatchId} onOpenChange={() => setSelectedBatchId(null)}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto p-8 rounded-sm border-none shadow-2xl">
          {selectedBatchId && (
            <div className="animate-in fade-in zoom-in-95 duration-300">
              <MentorAttendance forcedBatchId={selectedBatchId} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
