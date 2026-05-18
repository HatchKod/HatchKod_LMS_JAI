import { useState, useEffect, useRef } from "react";
import { api, formatApiError } from "../../lib/api";
import { 
  X, 
  CheckCircle, 
  XCircle, 
  Download,
  Loader2,
  AlertCircle,
  UploadCloud,
  FileText,
  UserCheck
} from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "../ui/avatar";

export default function SessionAttendance({ sessionId, sessionTopic, sessionDate, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // File Upload & Draft Staging States
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [draftRecords, setDraftRecords] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const fileInputRef = useRef(null);

  const fetchAttendance = async () => {
    try {
      const { data } = await api.get(`/sessions/${sessionId}/attendance`);
      setRecords(data);
    } catch (e) {
      toast.error("Failed to load attendance records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [sessionId]);

  const handleOverride = async (studentId, newStatus) => {
    try {
      await api.patch(`/sessions/${sessionId}/attendance/${studentId}`, {
        status: newStatus,
        override_reason: "Manual override by mentor"
      });
      setRecords(prev => prev.map(r => 
        r.student_id === studentId 
          ? { ...r, status: newStatus, override_reason: "Manual override by mentor" } 
          : r
      ));
      toast.success("Attendance updated successfully");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to update");
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadSummary(null);
      setDraftRecords(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith(".csv") || droppedFile.name.endsWith(".html") || droppedFile.name.endsWith(".htm"))) {
      setFile(droppedFile);
      setUploadSummary(null);
      setDraftRecords(null);
    } else {
      toast.error("Please drop a valid .csv or .html file.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post(`/sessions/${sessionId}/attendance/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      setUploadSummary(data);
      setDraftRecords(data.draft_records || []);
      toast.success("Google Meet attendance processed! Review the draft below.");
      setFile(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to parse attendance file");
    } finally {
      setUploading(false);
    }
  };

  const toggleDraftStatus = (studentId) => {
    setDraftRecords(prev => prev.map(r => {
      if (r.student_id === studentId) {
        const nextStatus = r.recommended_status === "present" ? "absent" : "present";
        return {
          ...r,
          recommended_status: nextStatus,
          override_reason: nextStatus === "present" 
            ? (r.duration_minutes > 0 ? `Meet duration: ${Math.max(1, Math.round(r.duration_minutes))} min` : "Manual override by mentor")
            : "Manual override by mentor"
        };
      }
      return r;
    }));
  };

  const handleSaveDraft = async () => {
    if (!draftRecords) return;
    setSavingDraft(true);

    try {
      const finalPayload = draftRecords.map(r => ({
        student_id: r.student_id,
        status: r.recommended_status,
        joined_at: r.joined_at,
        override_reason: r.override_reason
      }));

      await api.post(`/sessions/${sessionId}/attendance/bulk-save`, {
        records: finalPayload
      });

      toast.success("Attendance published and saved!");
      setDraftRecords(null);
      fetchAttendance(); // Reload records to reflect published values
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save attendance");
    } finally {
      setSavingDraft(false);
    }
  };

  const exportCSV = () => {
    const headers = ["Student Name", "Status", "Joined At", "Duration (Min)", "Override Reason"];
    const rows = records.map(r => {
      const durationMatch = r.override_reason && r.override_reason.match(/Meet duration:\s*(\d+)/i);
      const duration = durationMatch ? durationMatch[1] : (r.joined_at && r.left_at ? Math.round((new Date(r.left_at) - new Date(r.joined_at)) / 60000) : "");
        
      return [
        r.student_name,
        r.status.toUpperCase(),
        r.joined_at ? new Date(r.joined_at).toLocaleTimeString() : "—",
        duration,
        r.override_reason || ""
      ];
    });
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance-${sessionTopic.replace(/\s+/g, '-')}-${new Date(sessionDate).toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = {
    present: records.filter(r => r.status === 'present').length,
    absent: records.filter(r => r.status === 'absent').length,
    total: records.length
  };

  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-right duration-300 font-['IBM_Plex_Sans']">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800 font-['Outfit']">{sessionTopic}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
            {new Date(sessionDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
          <X className="h-5 w-5 text-slate-400" />
        </button>
      </div>
      {draftRecords ? (
        /* Staging Area View */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Staging Info Alert */}
          <div className="p-4 bg-amber-50 border-b border-amber-100 text-amber-800 space-y-1">
            <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 font-['Outfit']">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Attendance Review Staging Area
            </h4>
            <p className="text-[10px] font-medium leading-relaxed opacity-90">
              Verify the parsed Google Meet data below. Click the final status button next to any student to toggle it, then click Publish to commit to database.
            </p>
          </div>

          {/* Staging List */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10 font-['Outfit']">
                <tr className="border-b border-slate-100">
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Student</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Meet Duration</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Calculated</th>
                  <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Final Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {draftRecords.map(r => {
                  const formatDuration = (mins) => {
                    if (!mins || mins <= 0) return "—";
                    if (mins < 1) {
                      const secs = Math.round(mins * 60);
                      return `${secs} sec`;
                    }
                    return `${Math.round(mins)} min`;
                  };
                  const durationText = formatDuration(r.duration_minutes);

                  return (
                    <tr key={r.student_id} className="group hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border border-slate-200">
                            <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                              {r.name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="text-sm font-bold text-slate-700 block">{r.name}</span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">{r.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {durationText !== "—" ? (
                          <div className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-sm border border-slate-200 inline-block">
                            <span className="text-[10px] font-bold tracking-wider">{durationText}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <StatusBadge status={r.recommended_status} />
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => toggleDraftStatus(r.student_id)}
                          className={`px-3 py-1 rounded-sm text-[10px] font-black uppercase tracking-widest border transition-all ${
                            r.recommended_status === "present"
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                              : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                          }`}
                        >
                          {r.recommended_status === "present" ? "Present" : "Absent"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Staging Actions Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
            <Button
              onClick={handleSaveDraft}
              disabled={savingDraft}
              className="flex-1 bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm text-xs font-bold uppercase tracking-widest h-11"
            >
              {savingDraft ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
              ) : (
                "Save & Publish Attendance"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraftRecords(null);
                setUploadSummary(null);
              }}
              className="border-slate-200 text-slate-500 rounded-sm text-xs font-bold uppercase tracking-widest h-11 px-6 bg-white hover:bg-slate-50"
            >
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Upload Zone */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Verify Google Meet Attendance
            </h4>
            
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
              className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-sm p-5 text-center cursor-pointer transition-all bg-white hover:bg-blue-50/20 flex flex-col items-center justify-center gap-2"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".csv,.html,.htm" 
                className="hidden" 
              />
              {file ? (
                <>
                  <FileText className="h-8 w-8 text-blue-500 animate-bounce" />
                  <p className="text-xs font-bold text-slate-700 truncate max-w-[250px]">{file.name}</p>
                  <p className="text-[9px] text-slate-400 uppercase font-medium">Ready to upload & parse</p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-8 w-8 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  <p className="text-xs font-bold text-slate-600">Drag & drop or click to upload</p>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wide font-medium">Supports Google Meet CSV / HTML exports</p>
                </>
              )}
            </div>

            {file && (
              <div className="flex gap-2">
                <Button 
                  onClick={handleUpload} 
                  disabled={uploading} 
                  className="flex-1 bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm text-[10px] font-bold uppercase tracking-widest h-9"
                >
                  {uploading ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Parsing report...</>
                  ) : "Upload & Sync"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setFile(null)} 
                  className="border-slate-200 text-slate-500 rounded-sm text-[10px] font-bold uppercase tracking-widest h-9 px-4"
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Upload Summary Card */}
            {uploadSummary && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-sm p-4 space-y-2">
                <div className="flex items-start gap-2 text-emerald-800">
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold font-['Outfit']">Attendance Sync Complete!</p>
                    <p className="text-[10px] font-medium text-emerald-600 mt-0.5">
                      Matched {uploadSummary.matched} of {uploadSummary.total_enrolled} enrolled students.
                    </p>
                  </div>
                </div>

                {uploadSummary.unmatched_names && uploadSummary.unmatched_names.length > 0 && (
                  <div className="pt-2 border-t border-emerald-100/50">
                    <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider mb-1">
                      Unmatched names in call file ({uploadSummary.unmatched}):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {uploadSummary.unmatched_names.map((name, i) => (
                        <span key={i} className="bg-amber-100 text-amber-800 text-[8px] font-bold px-1.5 py-0.5 rounded-sm">
                          {name}
                        </span>
                      ))}
                    </div>
                    <p className="text-[8px] text-amber-600/90 mt-1 italic leading-tight">
                      Note: These names did not match any registered students in this batch. Use manual overrides below if needed.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Summary Chips */}
          <div className="p-4 bg-slate-50/50 flex gap-2 overflow-x-auto no-scrollbar">
            <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-sm border border-emerald-100 flex items-center gap-2 shrink-0">
              <CheckCircle className="h-3 w-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Present: {stats.present}</span>
            </div>
            <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded-sm border border-red-100 flex items-center gap-2 shrink-0">
              <XCircle className="h-3 w-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Absent: {stats.absent}</span>
            </div>
            <div className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-sm border border-slate-200 flex items-center gap-2 shrink-0 ml-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider">Total: {stats.total}</span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest">Loading records...</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-slate-100">
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Student</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Meet Duration</th>
                    <th className="p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right pr-8">Manual Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map(r => {
                    // Parse duration from override reason text (e.g. "Meet duration: 45 min")
                    const durationMatch = r.override_reason && r.override_reason.match(/Meet duration:\s*(\d+)/i);
                    const durationText = durationMatch 
                      ? `${durationMatch[1]} min` 
                      : (r.joined_at && r.left_at ? `${Math.round((new Date(r.left_at) - new Date(r.joined_at)) / 60000)} min` : "—");

                    return (
                      <tr key={r.student_id} className="group hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8 border border-slate-200">
                              <AvatarFallback className="bg-slate-100 text-slate-600 text-[10px] font-bold">
                                {r.student_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="text-sm font-bold text-slate-700 block">{r.student_name}</span>
                              <span className="text-[9px] text-slate-400 block mt-0.5">{r.student_email || "No email"}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="p-4 text-center">
                          {durationText !== "—" ? (
                            <div className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-sm border border-slate-200 inline-block">
                              <span className="text-[10px] font-bold tracking-wider">{durationText}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-4 text-right pr-8">
                          <div className="space-y-1 inline-block text-left">
                            <select 
                              value={r.status}
                              onChange={(e) => handleOverride(r.student_id, e.target.value)}
                              className="text-[10px] font-bold uppercase tracking-wider bg-white border border-slate-200 rounded-sm px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="present">Present</option>
                              <option value="absent">Absent</option>
                            </select>
                            {r.override_reason && !r.override_reason.includes("Meet duration") && (
                              <div className="flex items-center gap-1 text-blue-500 justify-end">
                                <AlertCircle className="h-2.5 w-2.5" />
                                <span className="text-[8px] font-bold uppercase tracking-tighter">Overridden</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/30">
            <Button 
              variant="outline" 
              className="w-full h-11 border-slate-200 text-slate-600 font-bold uppercase tracking-widest text-xs gap-2 hover:bg-white"
              onClick={exportCSV}
              disabled={records.length === 0}
            >
              <Download className="h-4 w-4" />
              Export Verification Sheet (CSV)
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  switch (status) {
    case 'present':
      return (
        <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-sm border border-emerald-100 w-fit">
          <CheckCircle className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Present</span>
        </div>
      );
    case 'absent':
      return (
        <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-0.5 rounded-sm border border-red-100 w-fit">
          <XCircle className="h-3 w-3" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Absent</span>
        </div>
      );
    default:
      return null;
  }
}
