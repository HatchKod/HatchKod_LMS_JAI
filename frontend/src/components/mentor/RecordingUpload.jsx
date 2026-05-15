import { useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { CheckCircle, Loader2, Save, Edit2 } from "lucide-react";
import { toast } from "sonner";

export default function RecordingUpload({ sessionId, onSuccess, existingUrl = null }) {
  const [url, setUrl] = useState(existingUrl || "");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(!existingUrl);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!url.trim()) {
      setError("Please enter a valid https:// link");
      return;
    }
    if (!url.startsWith("https://")) {
      setError("URL must start with https://");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = {
        url: url.trim(),
        duration_minutes: duration ? parseInt(duration) : null
      };
      const { data } = await api.post(`/sessions/${sessionId}/recording`, payload);
      toast.success("Recording saved successfully");
      setIsEditing(false);
      if (onSuccess) onSuccess(data.url);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to save recording");
    } finally {
      setBusy(false);
    }
  };

  if (!isEditing && url) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-sm p-3 flex items-center gap-3 animate-in fade-in duration-300">
        <div className="bg-green-100 p-1.5 rounded-full">
          <CheckCircle className="h-4 w-4 text-green-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-green-700 leading-tight">Recording saved</p>
          <p className="text-[10px] text-slate-500 truncate mt-0.5">{url}</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setIsEditing(true)}
          className="ml-auto h-7 text-[10px] uppercase font-bold border-green-200 text-green-700 hover:bg-green-100 hover:text-green-800"
        >
          Update
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-slate-50/50 border border-slate-200 rounded-sm p-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="space-y-2">
        <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center gap-2">
          <Save className="h-3 w-3" /> Recording Link
        </Label>
        <Input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(""); }}
          placeholder="https://drive.google.com/... or YouTube link"
          className="rounded-sm border-slate-200 h-10 text-sm focus:ring-[#194BFB] bg-white"
        />
        {error && <p className="text-[10px] text-red-500 font-bold">{error}</p>}
      </div>

      <div className="flex items-end gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
            Duration (Optional)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 45"
              className="w-24 rounded-sm border-slate-200 h-10 text-sm focus:ring-[#194BFB] bg-white"
            />
            <span className="text-[10px] text-slate-400 font-bold uppercase">minutes</span>
          </div>
        </div>

        <Button 
          onClick={handleSave} 
          disabled={busy}
          className="ml-auto bg-[#194BFB] hover:bg-[#0F3AE5] text-white rounded-sm h-10 px-6 text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-100"
        >
          {busy ? <><Loader2 className="h-3 w-3 animate-spin mr-2" /> Saving...</> : <><Save className="h-3 w-3 mr-2" /> Save Recording</>}
        </Button>
      </div>

      <p className="text-[10px] text-slate-400 font-medium italic border-t border-slate-100 pt-2">
        Supports: Google Drive, YouTube, Loom, or any https:// link
      </p>
    </div>
  );
}
