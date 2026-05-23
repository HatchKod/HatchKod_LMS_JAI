import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { api, formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { 
  LogOut, 
  LayoutDashboard, 
  ChevronDown, 
  KeyRound, 
  HelpCircle,
  MessageCircle,
  Mail,
  Code2,
  Trophy,
  Image,
  CreditCard,
  Gift
} from "lucide-react";
import { toast } from "sonner";
import NotificationBell from "./NotificationBell";

export default function Navbar({ unreadCount }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passData, setPassData] = useState({ new_password: "", confirm_password: "" });
  const [isUpdating, setIsUpdating] = useState(false);

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  const dashHref =
    user?.role === "admin" ? "/admin" : user?.role === "mentor" ? "/mentor" : "/dashboard";

  const getInitials = (name) => {
    if (!name) return "??";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (passData.new_password !== passData.confirm_password) {
      toast.error("Passwords do not match");
      return;
    }
    setIsUpdating(true);
    try {
      await api.post("/auth/update-password", passData);
      toast.success("Password updated successfully");
      setIsPasswordModalOpen(false);
      setPassData({ new_password: "", confirm_password: "" });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setIsUpdating(false);
    }
  };

  const isExpired = user?.access_tier === "expired";
  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-white" data-testid="navbar">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-10">
          <Link to={user ? dashHref : "/"} className="flex items-center gap-3 group transition-transform active:scale-95" data-testid="brand-link">
            <div className="relative h-10 w-10 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-lg overflow-hidden">
              <img src="/logo.png" alt="HatchKod" className="h-7 w-7 object-contain" />
            </div>
            <span className="font-['Outfit'] text-xl font-black tracking-tight text-[#0A0A0A] group-hover:text-[#194BFB] transition-colors">HatchKod</span>
          </Link>

          {user && (
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to={dashHref}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                  isActive(dashHref)
                    ? "text-[#194BFB] bg-[#194BFB]/5"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
                data-testid="nav-dashboard-link"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              {!isExpired && (
                <Link
                  to="/playground"
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                    isActive("/playground")
                      ? "text-[#194BFB] bg-[#194BFB]/5"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <HelpCircle className="h-4 w-4" />
                  Codepad
                </Link>
              )}
              {!isExpired && (
                <Link
                  to="/problems"
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                    location.pathname.startsWith("/problems")
                      ? "text-[#194BFB] bg-[#194BFB]/5"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <HelpCircle className="h-4 w-4" />
                  Challenges
                </Link>
              )}
              {user.role === "student" && !isExpired && (
                <Link
                  to="/referrals"
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                    isActive("/referrals")
                      ? "text-[#194BFB] bg-[#194BFB]/5"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <Gift className="h-4 w-4" />
                  Refer & Earn
                </Link>
              )}
              {user.role === "admin" && (
                <>
                  <Link
                    to="/admin/problems"
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                      isActive("/admin/problems")
                        ? "text-[#194BFB] bg-[#194BFB]/5"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <Code2 className="h-4 w-4" />
                    Challenge Management
                  </Link>
                  <Link
                    to="/admin/images"
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                      isActive("/admin/images")
                        ? "text-[#194BFB] bg-[#194BFB]/5"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <Image className="h-4 w-4" />
                    Image Library
                  </Link>
                  <Link
                    to="/admin/payments"
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                      isActive("/admin/payments")
                        ? "text-[#194BFB] bg-[#194BFB]/5"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <CreditCard className="h-4 w-4" />
                    Payments
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-4">
          {user && <NotificationBell initialUnreadCount={unreadCount} />}
          {user ? (
            <DropdownMenu>
              {/* ... user dropdown content ... */}
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-50 transition-colors outline-none group">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarFallback className="bg-[#194BFB] text-white text-xs font-bold">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium text-slate-700 group-hover:text-slate-900">
                    {user.name}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-transform duration-200" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-1">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.role === "student" && (
                  <DropdownMenuItem onClick={() => nav("/leaderboard")} className="cursor-pointer">
                    <Trophy className="mr-2 h-4 w-4" />
                    <span>Leaderboard</span>
                  </DropdownMenuItem>
                )}
                {user.role === "student" && (
                  <DropdownMenuItem onClick={() => nav("/profile")} className="cursor-pointer">
                    <Avatar className="mr-2 h-4 w-4">
                      <AvatarFallback className="bg-[#194BFB] text-white text-[8px] font-bold">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span>My Profile</span>
                  </DropdownMenuItem>
                )}
                {user.role === "student" && (
                  <DropdownMenuItem onClick={() => nav("/billing")} className="cursor-pointer">
                    <CreditCard className="mr-2 h-4 w-4 text-slate-500" />
                    <span>Billing & Payments</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setIsPasswordModalOpen(true)} className="cursor-pointer">
                  <KeyRound className="mr-2 h-4 w-4" />
                  <span>Change Password</span>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1.5">
                  Support
                </DropdownMenuLabel>
                <div className="px-2 py-1.5 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Mail className="h-3.5 w-3.5" />
                    <span>support@hatchkod.in</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>+91 97048 97596</span>
                  </div>
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : location.pathname !== "/login" ? (
            <div className="flex items-center gap-2">
              <Button asChild size="sm" className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]">
                <Link to="/login">Login</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdatePassword} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <Input
                id="new_password"
                type="password"
                required
                value={passData.new_password}
                onChange={(e) => setPassData({ ...passData, new_password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm New Password</Label>
              <Input
                id="confirm_password"
                type="password"
                required
                value={passData.confirm_password}
                onChange={(e) => setPassData({ ...passData, confirm_password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsPasswordModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdating} className="bg-[#194BFB] hover:bg-[#0F3AE5]">
                {isUpdating ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
