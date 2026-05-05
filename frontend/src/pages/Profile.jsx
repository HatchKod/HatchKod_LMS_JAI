import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Card } from "../components/ui/card";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { 
  User, 
  Mail, 
  ShieldCheck, 
  BookOpen, 
  GraduationCap, 
  Phone,
  Calendar,
  Award
} from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/profile");
        setProfileData(data);
      } catch (err) {
        toast.error("Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getInitials = (name) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="mx-auto max-w-7xl p-6 text-sm text-slate-500">Loading profile...</div>
      </div>
    );
  }

  const { stats, mentor } = profileData;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 fade-in">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Left Column: Avatar & Basic Info */}
          <div className="md:col-span-1 space-y-6">
            <Card className="p-6 text-center rounded-sm border-border bg-white shadow-sm">
              <Avatar className="h-24 w-24 mx-auto border-4 border-[#194BFB]/10">
                <AvatarFallback className="bg-[#194BFB] text-white text-2xl font-bold">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{user.name}</h2>
              <p className="text-sm text-slate-500 font-medium uppercase tracking-wider mt-1">{user.role}</p>
              
              <div className="mt-8 pt-8 border-t border-border space-y-4">
                <div className="flex items-center gap-3 text-sm text-slate-600 px-2">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span className="truncate">{user.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600 px-2">
                  <ShieldCheck className="h-4 w-4 text-slate-400" />
                  <span>Account Verified</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 rounded-sm border-border bg-white shadow-sm">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Learning Stats</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <BookOpen className="h-4 w-4 text-[#194BFB]" />
                    <span>Tasks Completed</span>
                  </div>
                  <span className="font-mono font-bold text-[#194BFB]">{stats.completed_lessons}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Award className="h-4 w-4 text-amber-500" />
                    <span>Achievements</span>
                  </div>
                  <span className="font-mono font-bold text-slate-700">0</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Detailed Info & Mentor */}
          <div className="md:col-span-2 space-y-6">
            <Card className="overflow-hidden rounded-sm border-border bg-white shadow-sm">
              <div className="bg-[#194BFB] h-2"></div>
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <User className="h-5 w-5 text-[#194BFB]" />
                    Personal Information
                  </h3>
                  <Button variant="outline" size="sm" className="rounded-sm text-xs" disabled>
                    Edit Profile
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-8 gap-x-12">
                  <InfoItem label="Full Name" value={user.name} Icon={User} />
                  <InfoItem label="Email Address" value={user.email} Icon={Mail} />
                  <InfoItem label="College / University" value="HatchKod Institute" Icon={GraduationCap} placeholder />
                  <InfoItem label="Phone Number" value="+91 XXXXX XXXXX" Icon={Phone} placeholder />
                  <InfoItem label="Joined On" value={new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} Icon={Calendar} />
                  <InfoItem label="Learning Track" value="Full Stack Engineering" Icon={Award} />
                </div>
              </div>
            </Card>

            {mentor && (
              <Card className="p-8 rounded-sm border-border bg-white shadow-sm border-l-4 border-l-emerald-500">
                <div className="flex items-start gap-6">
                  <Avatar className="h-16 w-16 border-2 border-emerald-100">
                    <AvatarFallback className="bg-emerald-500 text-white font-bold">
                      {getInitials(mentor.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-1">Your Mentor</h3>
                    <h4 className="text-xl font-bold text-slate-900">{mentor.name}</h4>
                    <p className="text-sm text-slate-500 mt-1">{mentor.email}</p>
                    <div className="mt-4 flex items-center gap-2">
                      <Button size="sm" className="rounded-sm bg-emerald-600 hover:bg-emerald-700 h-8 text-xs">
                        Contact Mentor
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {!mentor && user.role === "student" && (
              <Card className="p-8 rounded-sm border-border bg-slate-50 border-dashed text-center">
                <p className="text-sm text-slate-500 italic">No mentor assigned yet. You'll be assigned a mentor once you start submitting tasks.</p>
              </Card>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, Icon, placeholder = false }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`text-sm font-medium ${placeholder ? "text-slate-400 italic" : "text-slate-700"}`}>
        {value}
      </div>
    </div>
  );
}
