import { useState, useEffect, useRef } from "react";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger
} from "../components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { 
  Upload, 
  Image as ImageIcon, 
  Copy, 
  Search, 
  Loader2, 
  ExternalLink,
  FolderPlus,
  Folder,
  Calendar,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

export default function ImageLibrary() {
  const [images, setImages] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  
  // Accordion open state (values are folder names, or "__uncategorized__")
  const [accordionValue, setAccordionValue] = useState([]);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [folderSelect, setFolderSelect] = useState("java-full-stack");
  const [newFolderInput, setNewFolderInput] = useState("");
  const [folderError, setFolderError] = useState("");
  const fileInputRef = useRef(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [imagesRes, foldersRes] = await Promise.all([
        api.get("/admin/images"),
        api.get("/admin/images/folders")
      ]);
      setImages(imagesRes.data || []);
      setFolders(foldersRes.data || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load assets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter images by search query AND relative upload date
  const filteredImages = images.filter((img) => {
    const filename = img.key.substring(img.key.lastIndexOf("/") + 1).toLowerCase();
    const matchesSearch = filename.includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    if (dateFilter === "all") return true;
    if (!img.uploaded_at) return false;

    const uploadDate = new Date(img.uploaded_at);
    const now = new Date();
    const diffTime = Math.abs(now - uploadDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (dateFilter === "today") {
      return (
        uploadDate.getDate() === now.getDate() &&
        uploadDate.getMonth() === now.getMonth() &&
        uploadDate.getFullYear() === now.getFullYear()
      );
    }
    if (dateFilter === "7days") {
      return diffDays <= 7;
    }
    if (dateFilter === "30days") {
      return diffDays <= 30;
    }

    return true;
  });

  // Group and sort images
  const groups = {};
  folders.forEach(f => {
    groups[f] = [];
  });
  groups[""] = []; // Uncategorized group

  filteredImages.forEach(img => {
    const fKey = img.folder || "";
    if (!groups[fKey]) {
      groups[fKey] = [];
    }
    groups[fKey].push(img);
  });

  // Sort each group's images by uploaded_at newest first
  Object.keys(groups).forEach(fKey => {
    groups[fKey].sort((a, b) => {
      const dateA = new Date(a.uploaded_at || 0);
      const dateB = new Date(b.uploaded_at || 0);
      return dateB - dateA;
    });
  });

  // Unique list of non-empty grouped folders + uncategorized (if it has images)
  const activeFoldersList = [...folders].sort((a, b) => a.localeCompare(b));
  const finalFoldersList = [...activeFoldersList, ""];

  // Handle accordion auto-expansion based on filter triggers
  useEffect(() => {
    const foldersWithMatches = [];
    finalFoldersList.forEach(folder => {
      const items = groups[folder] || [];
      if (items.length > 0) {
        foldersWithMatches.push(folder || "__uncategorized__");
      }
    });

    if (dateFilter !== "all" || searchQuery.trim() !== "") {
      setAccordionValue(foldersWithMatches);
    } else {
      // By default: expand only the first folder that contains images
      const firstNonEmpty = finalFoldersList.find(f => (groups[f] || []).length > 0);
      if (firstNonEmpty !== undefined) {
        setAccordionValue([firstNonEmpty || "__uncategorized__"]);
      } else {
        setAccordionValue([]);
      }
    }
  }, [searchQuery, dateFilter, images, folders]);

  // Handle folder validation in form
  const handleNewFolderChange = (val) => {
    setNewFolderInput(val);
    const regex = /^[a-z0-9-]+$/;
    if (val && !regex.test(val)) {
      setFolderError("Folder name can only contain lowercase letters, numbers, and hyphens (e.g. java-basics).");
    } else {
      setFolderError("");
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Please select an image file first.");
      return;
    }

    let targetFolder = folderSelect;
    if (folderSelect === "__new__") {
      if (!newFolderInput.trim()) {
        setFolderError("Please enter a folder name.");
        return;
      }
      const regex = /^[a-z0-9-]+$/;
      if (!regex.test(newFolderInput)) {
        setFolderError("Folder name must only consist of lowercase letters, numbers, and hyphens.");
        return;
      }
      targetFolder = newFolderInput.trim();
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (targetFolder) {
      formData.append("folder", targetFolder);
    }

    setUploading(true);
    const toastId = toast.loading(`Uploading ${selectedFile.name}...`);

    try {
      await api.post("/admin/images/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      toast.success("Image uploaded successfully!", { id: toastId });
      
      // Reset Modal & State
      setIsUploadOpen(false);
      setSelectedFile(null);
      setFolderSelect("java-full-stack");
      setNewFolderInput("");
      setFolderError("");

      // Refresh Data Grid
      await fetchData();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed to upload image", { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
    toast.success("URL Copied to clipboard!", {
      description: url,
      duration: 2000,
    });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-10 fade-in">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-8 mb-8">
          <div>
            <h1 className="text-3xl font-black font-['Outfit'] tracking-tight text-slate-900 flex items-center gap-3">
              <div className="p-2 bg-[#194BFB]/5 border border-[#194BFB]/10 rounded-lg text-[#194BFB]">
                <ImageIcon className="h-6 w-6" />
              </div>
              Image Library
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-2 font-['Outfit']">
              Organize, search, and copy asset S3 URLs grouped by folders for lesson pages.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Dialog Upload Modal */}
            <Dialog open={isUploadOpen} onOpenChange={(open) => {
              if (!uploading) {
                setIsUploadOpen(open);
                if (!open) {
                  setSelectedFile(null);
                  setFolderSelect("java-full-stack");
                  setNewFolderInput("");
                  setFolderError("");
                }
              }
            }}>
              <DialogTrigger asChild>
                <Button className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] text-white font-bold h-10 px-6 shadow-sm flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Image
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md rounded-sm border-slate-200">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold font-['Outfit'] text-slate-900">Upload Image Asset</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUploadSubmit} className="space-y-5 py-4">
                  {/* File Pick Area */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Select Image File</label>
                    <div 
                      onClick={() => !uploading && fileInputRef.current?.click()}
                      className={`border-2 border-dashed border-slate-200 hover:border-[#194BFB] rounded-sm p-6 text-center cursor-pointer transition-colors bg-slate-50/50 ${uploading ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        disabled={uploading}
                      />
                      {selectedFile ? (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-[#194BFB] truncate max-w-xs mx-auto">{selectedFile.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                        </div>
                      ) : (
                        <div className="space-y-2 text-slate-400">
                          <Upload className="h-8 w-8 mx-auto opacity-40 text-slate-500" />
                          <p className="text-xs font-medium">Click to select an image file</p>
                          <p className="text-[10px] text-slate-400">PNG, JPG, SVG, WEBP, or GIF</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Folder Dropdown */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Destination Folder</label>
                    <select
                      value={folderSelect}
                      onChange={(e) => setFolderSelect(e.target.value)}
                      disabled={uploading}
                      className="w-full h-10 px-3 border border-slate-200 bg-white rounded-sm text-xs font-medium outline-none focus:border-[#194BFB] transition-colors"
                    >
                      <option value="">(Root / Uncategorized)</option>
                      {folders.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                      <option value="__new__">+ Create new folder...</option>
                    </select>
                  </div>

                  {/* Dynamic New Folder Creation input */}
                  {folderSelect === "__new__" && (
                    <div className="space-y-2 animate-fade-in">
                      <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">New Folder Name</label>
                      <Input
                        type="text"
                        placeholder="e.g. java-basics"
                        value={newFolderInput}
                        onChange={(e) => handleNewFolderChange(e.target.value)}
                        disabled={uploading}
                        className="h-10 text-xs font-medium rounded-sm border-slate-200 bg-white"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">lowercase letters, numbers, and hyphens only.</p>
                      {folderError && (
                        <div className="flex items-center gap-1.5 text-[10px] text-red-500 font-bold bg-red-50 border border-red-100 p-2 rounded-sm mt-1">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>{folderError}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <DialogFooter className="pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={uploading}
                      onClick={() => setIsUploadOpen(false)}
                      className="rounded-sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={uploading || !!folderError || !selectedFile}
                      className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] text-white font-bold h-10 px-6 shadow-sm flex items-center gap-2 shrink-0 min-w-[120px]"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Upload Asset
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search and Filters Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-8 bg-white p-4 border border-slate-200 rounded-sm shadow-sm">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search images by filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 border-slate-200 focus:border-[#194BFB] focus:ring-[#194BFB] rounded-sm bg-slate-50/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto md:justify-end">
            {/* Relative Date Filters */}
            <div className="flex items-center gap-2 border border-slate-200 rounded-sm bg-white px-2.5 h-10 shrink-0">
              <Calendar className="h-4 w-4 text-slate-400" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent border-none text-xs font-semibold outline-none text-slate-700 cursor-pointer pr-4"
              >
                <option value="all">All Dates</option>
                <option value="today">Uploaded Today</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
              </select>
            </div>

            {/* Total Counters */}
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold flex items-center gap-2 bg-slate-100/50 px-3.5 py-2.5 rounded-sm border border-slate-200/60 shrink-0">
              <span>Total: {images.length}</span>
              <span>•</span>
              <span className="text-[#194BFB]">Filtered: {filteredImages.length}</span>
            </div>
          </div>
        </div>

        {/* Main Content Accordion Grid */}
        {loading ? (
          <div className="py-32 flex flex-col items-center justify-center">
            <Loader2 className="h-10 w-10 text-[#194BFB] animate-spin mb-4" />
            <p className="text-sm font-extrabold uppercase tracking-widest text-slate-400 font-['Outfit']">
              Loading S3 assets...
            </p>
          </div>
        ) : filteredImages.length > 0 ? (
          <Accordion 
            type="multiple" 
            value={accordionValue} 
            onValueChange={setAccordionValue}
            className="space-y-6"
          >
            {finalFoldersList.map((folder) => {
              const imagesInFolder = groups[folder] || [];
              if (imagesInFolder.length === 0) return null;

              const isUncategorized = folder === "";
              const folderLabel = isUncategorized ? "Uncategorized Assets" : folder;
              const accordionItemKey = isUncategorized ? "__uncategorized__" : folder;

              return (
                <AccordionItem 
                  key={accordionItemKey} 
                  value={accordionItemKey}
                  className="bg-white border border-slate-200 rounded-sm overflow-hidden shadow-sm px-0 py-0"
                >
                  <AccordionTrigger className="w-full hover:no-underline hover:bg-slate-50/50 px-6 py-4 transition-colors border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-slate-800">
                      {isUncategorized ? (
                        <ImageIcon className="h-4 w-4 text-slate-400 shrink-0" />
                      ) : (
                        <Folder className="h-4 w-4 text-[#194BFB] shrink-0" />
                      )}
                      <span className="font-extrabold font-['Outfit'] text-sm tracking-tight capitalize">
                        {folderLabel}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 font-bold">
                        {imagesInFolder.length}
                      </span>
                    </div>
                  </AccordionTrigger>

                  <AccordionContent className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {imagesInFolder.map((img, index) => {
                        const filename = img.key.substring(img.key.lastIndexOf("/") + 1);
                        
                        // Strip uuid prefix if it contains an underscore or hyphen, or just render it nicely
                        let cleanFilename = filename;
                        if (filename.includes("_")) {
                          cleanFilename = filename.substring(filename.indexOf("_") + 1);
                        }
                        const displayName = cleanFilename.length > 25 ? `${cleanFilename.substring(0, 10)}...${cleanFilename.substring(cleanFilename.length - 10)}` : cleanFilename;
                        const fileSizeKB = img.size ? (img.size / 1024).toFixed(1) : null;
                        
                        return (
                          <Card 
                            key={index} 
                            onClick={() => copyToClipboard(img.url)}
                            className="rounded-sm border-slate-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-all duration-200 group cursor-pointer flex flex-col relative"
                          >
                            {/* Image Container */}
                            <div className="aspect-[4/3] w-full bg-slate-50 border-b border-slate-100 flex items-center justify-center p-4 relative overflow-hidden bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px]">
                              <img 
                                src={img.url} 
                                alt={displayName} 
                                className="max-w-full max-h-full object-contain rounded-sm transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                              />
                              
                              {/* Hover Overlay */}
                              <div className="absolute inset-0 bg-[#194BFB]/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2 text-white">
                                <div className="p-2 bg-white/20 rounded-full border border-white/30 backdrop-blur-sm">
                                  <Copy className="h-5 w-5" />
                                </div>
                                <span className="font-bold text-xs uppercase tracking-wider">Click to copy URL</span>
                              </div>
                            </div>

                            {/* Info Footer */}
                            <div className="p-3 flex items-center justify-between gap-3 bg-white flex-1">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-800 truncate" title={filename}>
                                  {displayName}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {fileSizeKB && (
                                    <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-100 rounded-sm px-1 shrink-0">
                                      {fileSizeKB} KB
                                    </span>
                                  )}
                                  <span className="text-[9px] text-slate-400 truncate font-mono">
                                    {img.url.substring(0, 30)}...
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-slate-400 hover:text-[#194BFB] hover:bg-slate-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(img.url);
                                  }}
                                  title="Copy S3 URL"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-slate-400 hover:text-slate-900 hover:bg-slate-50"
                                  asChild
                                  onClick={(e) => e.stopPropagation()}
                                  title="Open original image"
                                >
                                  <a href={img.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : (
          <div className="py-24 text-center bg-white rounded-sm border border-dashed border-slate-200 shadow-sm max-w-2xl mx-auto px-6">
            <div className="h-16 w-16 bg-[#194BFB]/5 border border-[#194BFB]/10 rounded-full flex items-center justify-center mx-auto mb-6 text-[#194BFB]">
              <ImageIcon className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-black font-['Outfit'] text-slate-900 mb-2">No Images Found</h3>
            <p className="text-sm text-slate-500 mb-6 font-['Outfit'] max-w-sm mx-auto">
              {searchQuery || dateFilter !== "all" 
                ? "No images match your current filter criteria. Try clearing them!" 
                : "Your S3 image library is currently empty. Upload your first course asset!"}
            </p>
            {!(searchQuery || dateFilter !== "all") && (
              <Button
                onClick={() => setIsUploadOpen(true)}
                className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5] text-white font-bold h-10 px-6 shadow-sm"
              >
                Upload First Image
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
