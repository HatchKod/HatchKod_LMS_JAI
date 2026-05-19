import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import Navbar from "../components/Navbar";
import { Trophy, Flame, Target, Award, Crown, Medal, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";

export default function Leaderboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/gamification/leaderboard");
      setData(res.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getRankIcon = (rank) => {
    if (rank === 1) return <Crown className="h-6 w-6 text-yellow-500 fill-yellow-500/20" />;
    if (rank === 2) return <Medal className="h-6 w-6 text-slate-400 fill-slate-400/20" />;
    if (rank === 3) return <Medal className="h-6 w-6 text-amber-600 fill-amber-600/20" />;
    return <span className="text-sm font-bold text-slate-400">#{rank}</span>;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      
      <main className="max-w-4xl mx-auto py-12 px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-[#194BFB]/10 text-[#194BFB] px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-4 border border-[#194BFB]/20">
            <TrendingUp className="h-4 w-4" />
            Weekly Challenge
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 font-['Outfit'] tracking-tight mb-4">
            Leaderboard
          </h1>
          <p className="text-slate-500 max-w-lg mx-auto">
            Top performers this week. Keep learning and shipping projects to climb the ranks!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card className="border-none shadow-sm bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 bg-orange-50 rounded-xl flex items-center justify-center border border-orange-100">
                <Flame className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Streak</p>
                <p className="text-2xl font-black text-slate-900 font-['Outfit']">
                  {((data?.user_stats?.streak ?? user?.gamification?.streak) || 0) === 1 ? "1 Day" : `${(data?.user_stats?.streak ?? user?.gamification?.streak) || 0} Days`}
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-none shadow-sm bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
                <Target className="h-6 w-6 text-[#194BFB]" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Rank</p>
                <p className="text-2xl font-black text-slate-900 font-['Outfit']">#{data?.user_rank || "N/A"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100">
                <Award className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900 font-['Outfit']">Lvl {(data?.user_stats?.level ?? user?.gamification?.level) || 1}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Level</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-none shadow-xl shadow-slate-200/50 overflow-hidden bg-white">
          <CardHeader className="bg-white border-b border-slate-50 p-6">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Top Students This Week
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : data?.leaderboard.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {data.leaderboard.map((entry, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-center justify-between p-6 transition-colors ${entry.is_me ? 'bg-blue-50/50' : 'hover:bg-slate-50/50'}`}
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-8 flex justify-center">
                        {getRankIcon(entry.rank)}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${entry.is_me ? 'bg-[#194BFB] text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {entry.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">
                            {entry.name} {entry.is_me && <span className="ml-1 text-[10px] text-[#194BFB] bg-[#194BFB]/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">You</span>}
                          </p>
                          <p className="text-xs text-slate-400 font-medium">{entry.rank <= 3 ? "Champion" : "Elite Learner"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-[#194BFB] font-black text-lg">
                        {entry.xp}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">XP</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                  <TrendingUp className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium">No activity yet this week. Be the first to earn XP!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
