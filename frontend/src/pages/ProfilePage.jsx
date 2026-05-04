import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { 
  User, Mail, Phone, Calendar, MapPin, Briefcase, 
  GraduationCap, Github, Linkedin, ExternalLink, 
  Edit3, Save, X, Check, Loader2, Award
} from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Section Edit States
  const [editPersonal, setEditPersonal] = useState(false);
  const [editGeneric, setEditGeneric] = useState(false);
  const [editAcademics, setEditAcademics] = useState({
    "10th": false,
    "12th": false,
    "UG": false
  });

  // Form States
  const [profileForm, setProfileForm] = useState({});
  const [academicForms, setAcademicForms] = useState({
    "10th": {},
    "12th": {},
    "UG": {}
  });

  const loadProfile = async () => {
    try {
      const res = await api.get("/students/profile");
      setData(res.data);
      setProfileForm(res.data.profile || {});
      
      const academicMap = {};
      ["10th", "12th", "UG"].forEach(level => {
        academicMap[level] = res.data.academics?.find(a => a.level === level) || {};
      });
      setAcademicForms(academicMap);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleProfileSave = async () => {
    try {
      await api.patch("/students/profile", profileForm);
      toast.success("Profile updated");
      setEditPersonal(false);
      setEditGeneric(false);
      loadProfile();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleAcademicSave = async (level) => {
    try {
      await api.patch(`/students/academics/${level}`, academicForms[level]);
      toast.success(`${level} details updated`);
      setEditAcademics({ ...editAcademics, [level]: false });
      loadProfile();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const calculateCompletion = () => {
    if (!data) return 0;
    const profileFields = ['phone', 'whatsapp', 'date_of_birth', 'gender', 'current_city', 'current_state', 'github_url', 'linkedin_url', 'resume_url'];
    const academicLevels = ['10th', '12th', 'UG'];
    
    let filled = 0;
    let total = profileFields.length + academicLevels.length;
    
    profileFields.forEach(f => {
      if (data.profile?.[f]) filled++;
    });
    
    academicLevels.forEach(lvl => {
      const record = data.academics?.find(a => a.level === lvl);
      if (record?.institution_name && record?.marks_percentage) filled++;
    });
    
    return Math.round((filled / total) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-[#194BFB] animate-spin" />
      </div>
    );
  }

  if (!data || !data.user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-800">Profile Unreachable</h2>
          <p className="text-slate-500 mt-1">We couldn't load your profile information. Please try again.</p>
        </div>
        <Button onClick={loadProfile} className="bg-[#194BFB] hover:bg-[#0F3AE5] rounded-sm">
          Retry Loading
        </Button>
      </div>
    );
  }

  const completion = calculateCompletion();

  return (
    <div className="min-h-screen bg-slate-50 font-['IBM_Plex_Sans'] pb-20">
      <Navbar />
      
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
        {/* Header Section */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#0A0A0A] font-['Outfit']">My Profile</h1>
            <p className="text-slate-500 mt-1">Manage your professional and academic details.</p>
          </div>
          <div className="hidden sm:flex items-center gap-3 bg-white px-4 py-2 rounded-full border border-border shadow-sm">
            <div className="relative h-10 w-10 flex items-center justify-center">
              <svg className="h-full w-full transform -rotate-90">
                <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-100" />
                <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-[#194BFB]" 
                        strokeDasharray={113} strokeDashoffset={113 - (113 * completion) / 100} />
              </svg>
              <span className="absolute text-[10px] font-bold text-[#194BFB]">{completion}%</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Completion</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8">
          
          {/* Personal Info Card */}
          <Card className="overflow-hidden border-border rounded-sm bg-white shadow-sm">
            <div className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-6">
                  <div className="relative group">
                    <Avatar className="h-20 w-20 border-2 border-white shadow-md ring-2 ring-[#194BFB]/10">
                      <AvatarFallback className="bg-[#194BFB] text-white text-2xl font-bold">
                        {data.user?.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "??"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1.5 rounded-full border-2 border-white shadow-sm">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-[#0A0A0A] font-['Outfit']">{data.user?.name || "User"}</h2>
                    <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                      <Mail className="h-3.5 w-3.5" />
                      {data.user?.email || "No email"}
                    </div>
                  </div>
                </div>
                {!editPersonal ? (
                  <Button variant="outline" size="sm" onClick={() => setEditPersonal(true)} className="rounded-sm gap-2">
                    <Edit3 className="h-4 w-4" /> Edit
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditPersonal(false); setProfileForm(data.profile || {}); }} className="rounded-sm">
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={handleProfileSave} className="bg-[#194BFB] hover:bg-[#0F3AE5] rounded-sm gap-2">
                      <Save className="h-4 w-4" /> Save
                    </Button>
                  </div>
                )}
              </div>

              {!editPersonal ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
                  <InfoItem icon={Phone} label="Phone Number" value={data.profile?.phone || "Not set"} />
                  <InfoItem icon={MessageCircle} label="WhatsApp" value={data.profile?.whatsapp || "Not set"} />
                  <InfoItem icon={Calendar} label="Date of Birth" value={data.profile?.date_of_birth || "Not set"} />
                  <InfoItem icon={User} label="Gender" value={data.profile?.gender || "Not set"} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-1 bg-slate-50/50 rounded-sm">
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input value={profileForm.phone || ""} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+91 00000 00000" className="rounded-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp Number</Label>
                    <Input value={profileForm.whatsapp || ""} onChange={e => setProfileForm({ ...profileForm, whatsapp: e.target.value })} placeholder="+91 00000 00000" className="rounded-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={profileForm.date_of_birth || ""} onChange={e => setProfileForm({ ...profileForm, date_of_birth: e.target.value })} className="rounded-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <select value={profileForm.gender || ""} onChange={e => setProfileForm({ ...profileForm, gender: e.target.value })} className="flex h-10 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Generic Details Section */}
          <Card className="border-border rounded-sm bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-8 py-5 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-[#194BFB]" />
                <h3 className="font-bold text-[#0A0A0A] uppercase tracking-wider text-xs">Professional & General</h3>
              </div>
              {!editGeneric ? (
                <Button variant="ghost" size="sm" onClick={() => setEditGeneric(true)} className="text-[#194BFB] hover:bg-[#194BFB]/5">
                  Edit Details
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setEditGeneric(false); setProfileForm(data.profile || {}); }}>Cancel</Button>
                  <Button size="sm" onClick={handleProfileSave} className="bg-[#194BFB] hover:bg-[#0F3AE5] h-8">Save</Button>
                </div>
              )}
            </div>
            <div className="p-8">
              {!editGeneric ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <InfoItem label="Current City" value={data.profile?.current_city || "Not set"} />
                    <InfoItem label="Current State" value={data.profile?.current_state || "Not set"} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <InfoItem label="Work Experience" value={data.profile?.work_experience || "Fresher"} />
                    <InfoItem label="Career Gap" value={data.profile?.career_gap || "None"} />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3 block">Preferred Job Locations</Label>
                    <div className="flex flex-wrap gap-2">
                      {data.profile?.preferred_locations?.length > 0 ? data.profile.preferred_locations.map((loc, i) => (
                        <span key={i} className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-medium border border-slate-200">{loc}</span>
                      )) : <span className="text-sm text-slate-400 italic">No locations added</span>}
                    </div>
                  </div>
                  
                  {/* Links */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                    <LinkCard icon={Github} label="GitHub" url={data.profile?.github_url} color="bg-slate-900" />
                    <LinkCard icon={Linkedin} label="LinkedIn" url={data.profile?.linkedin_url} color="bg-[#0077B5]" />
                    <LinkCard icon={ExternalLink} label="Resume" url={data.profile?.resume_url} color="bg-[#194BFB]" />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Current City</Label>
                      <Input value={profileForm.current_city || ""} onChange={e => setProfileForm({ ...profileForm, current_city: e.target.value })} className="rounded-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Current State</Label>
                      <Input value={profileForm.current_state || ""} onChange={e => setProfileForm({ ...profileForm, current_state: e.target.value })} className="rounded-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>Work Experience (Years/Description)</Label>
                      <Input value={profileForm.work_experience || ""} onChange={e => setProfileForm({ ...profileForm, work_experience: e.target.value })} className="rounded-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Career Gap (Years)</Label>
                      <Input type="number" value={profileForm.career_gap || 0} onChange={e => setProfileForm({ ...profileForm, career_gap: parseInt(e.target.value) || 0 })} className="rounded-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Preferred Locations (Comma separated)</Label>
                    <Input 
                      value={profileForm.preferred_locations?.join(", ") || ""} 
                      onChange={e => setProfileForm({ ...profileForm, preferred_locations: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} 
                      placeholder="e.g. Hyderabad, Bangalore, Pune"
                      className="rounded-sm" 
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label>GitHub URL</Label>
                      <Input value={profileForm.github_url || ""} onChange={e => setProfileForm({ ...profileForm, github_url: e.target.value })} placeholder="https://github.com/..." className="rounded-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>LinkedIn URL</Label>
                      <Input value={profileForm.linkedin_url || ""} onChange={e => setProfileForm({ ...profileForm, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/..." className="rounded-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Resume URL</Label>
                      <Input value={profileForm.resume_url || ""} onChange={e => setProfileForm({ ...profileForm, resume_url: e.target.value })} placeholder="Google Drive or Public link" className="rounded-sm" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Academic Sections */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-[#0A0A0A] font-['Outfit'] flex items-center gap-3">
              <GraduationCap className="h-6 w-6 text-[#194BFB]" /> Academic Background
            </h3>
            
            {["10th", "12th", "UG"].map(lvl => (
              <AcademicCard 
                key={lvl} 
                level={lvl} 
                data={academicForms[lvl]} 
                isEditing={editAcademics[lvl]}
                onEdit={() => setEditAcademics({ ...editAcademics, [lvl]: true })}
                onCancel={() => {
                  setEditAcademics({ ...editAcademics, [lvl]: false });
                  setAcademicForms({ ...academicForms, [lvl]: data.academics?.find(a => a.level === lvl) || {} });
                }}
                onSave={() => handleAcademicSave(lvl)}
                onChange={(form) => setAcademicForms({ ...academicForms, [lvl]: form })}
              />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</div>
      <div className="flex items-center gap-2 text-slate-800 font-medium">
        {Icon && <Icon className="h-4 w-4 text-slate-400" />}
        {value}
      </div>
    </div>
  );
}

function LinkCard({ icon: Icon, label, url, color }) {
  return (
    <a 
      href={url || "#"} 
      target="_blank" 
      rel="noreferrer"
      className={`flex items-center gap-3 p-3 rounded-sm border border-border transition-all ${!url ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-md hover:border-[#194BFB]/30'}`}
    >
      <div className={`h-8 w-8 ${color} rounded-sm flex items-center justify-center text-white`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
        <div className="text-xs font-bold text-slate-700 truncate">{url ? "View Link" : "Not Provided"}</div>
      </div>
    </a>
  );
}

function AcademicCard({ level, data, isEditing, onEdit, onCancel, onSave, onChange }) {
  const isUG = level === "UG";
  
  return (
    <Card className="border-border rounded-sm bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 text-white text-[10px] font-bold h-6 w-12 flex items-center justify-center rounded-sm uppercase tracking-wider">
            {level}
          </div>
          <h4 className="font-bold text-slate-900 text-sm">{isUG ? "Undergraduate Degree" : `${level} Standard`}</h4>
        </div>
        {!isEditing ? (
          <Button variant="ghost" size="sm" onClick={onEdit} className="text-[#194BFB] hover:bg-[#194BFB]/5 h-8">
            <Edit3 className="h-3.5 w-3.5 mr-2" /> Edit
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} className="h-8">Cancel</Button>
            <Button size="sm" onClick={onSave} className="bg-[#194BFB] hover:bg-[#0F3AE5] h-8">Save</Button>
          </div>
        )}
      </div>
      <div className="p-6">
        {!isEditing ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="sm:col-span-1">
              <InfoItem label="Institution" value={data.institution_name || "Not set"} />
            </div>
            <InfoItem label="Year of Passout" value={data.year_of_passout || "Not set"} />
            <InfoItem label="Marks (%)" value={data.marks_percentage ? `${data.marks_percentage}%` : "Not set"} />
            
            {isUG && (
              <>
                <InfoItem label="University Roll No" value={data.university_roll_no || "Not set"} />
                <InfoItem label="Course Name" value={data.course_name || "Not set"} />
                <InfoItem label="Branch/Specialization" value={data.branch || "Not set"} />
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="sm:col-span-3 space-y-2">
              <Label>Institution Name</Label>
              <Input value={data.institution_name || ""} onChange={e => onChange({ ...data, institution_name: e.target.value })} className="rounded-sm" />
            </div>
            <div className="space-y-2">
              <Label>Year of Passout</Label>
              <Input type="text" value={data.year_of_passout || ""} onChange={e => onChange({ ...data, year_of_passout: e.target.value })} placeholder="e.g. 2023" className="rounded-sm" />
            </div>
            <div className="space-y-2">
              <Label>Marks (%)</Label>
              <Input type="number" step="0.01" value={data.marks_percentage || ""} onChange={e => onChange({ ...data, marks_percentage: parseFloat(e.target.value) })} className="rounded-sm" />
            </div>
            {isUG && (
              <>
                <div className="space-y-2">
                  <Label>University Roll No</Label>
                  <Input value={data.university_roll_no || ""} onChange={e => onChange({ ...data, university_roll_no: e.target.value })} className="rounded-sm" />
                </div>
                <div className="space-y-2">
                  <Label>Course Name</Label>
                  <Input value={data.course_name || ""} onChange={e => onChange({ ...data, course_name: e.target.value })} placeholder="e.g. B.Tech, BCA" className="rounded-sm" />
                </div>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input value={data.branch || ""} onChange={e => onChange({ ...data, branch: e.target.value })} placeholder="e.g. CSE, Mechanical" className="rounded-sm" />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// Missing Lucide components used but not imported
function MessageCircle(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  )
}
