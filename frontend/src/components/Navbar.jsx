import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
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
  Gift,
  Menu,
  X,
  User,
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
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  const dashHref =
    user?.role === "admin" ? "/admin" : user?.role === "mentor" ? "/mentor" : "/dashboard";

  const getInitials = (name) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
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
  const isNoBatch = user?.role === "student" && !user?.batch_id;
  const isActive = (path) => location.pathname === path;
  const isPrefix = (path) => location.pathname.startsWith(path);

  // Shared nav link component used by both desktop and mobile
  const NavLink = ({ to, icon: Icon, children, prefix }) => {
    const active = prefix ? isPrefix(to) : isActive(to);
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
          active
            ? "text-[#194BFB] bg-[#194BFB]/5"
            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {children}
      </Link>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-white" data-testid="navbar">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">

          {/* Left: Logo + Desktop Nav */}
          <div className="flex items-center gap-8">
            <Link
              to={user ? dashHref : "/"}
              className="flex items-center gap-3 group transition-transform active:scale-95"
              data-testid="brand-link"
            >
              <div className="relative h-10 w-10 flex items-center justify-center bg-slate-50 border border-slate-100 rounded-lg overflow-hidden">
                <img src="/logo.png" alt="HatchKod" className="h-7 w-7 object-contain" />
              </div>
              <span className="font-['Outfit'] text-xl font-black tracking-tight text-[#0A0A0A] group-hover:text-[#194BFB] transition-colors">
                HatchKod
              </span>
            </Link>

            {user && (
              <nav className="hidden md:flex items-center gap-1">
                <NavLink to={dashHref} icon={LayoutDashboard} data-testid="nav-dashboard-link">
                  Dashboard
                </NavLink>
                {!isExpired && !isNoBatch && (
                  <NavLink to="/playground" icon={HelpCircle}>Codepad</NavLink>
                )}
                {!isExpired && !isNoBatch && (
                  <NavLink to="/problems" icon={HelpCircle} prefix>Challenges</NavLink>
                )}
                {user.role === "student" && !isExpired && (
                  <NavLink to="/referrals" icon={Gift}>Refer &amp; Earn</NavLink>
                )}
                {user.role === "admin" && (
                  <>
                    <NavLink to="/admin/problems" icon={Code2}>Challenge Management</NavLink>
                    <NavLink to="/admin/images" icon={Image}>Image Library</NavLink>
                    <NavLink to="/admin/payments" icon={CreditCard}>Payments</NavLink>
                  </>
                )}
              </nav>
            )}
          </div>

          {/* Right: Notifications + User dropdown + Hamburger */}
          <div className="flex items-center gap-3">
            {user && <NotificationBell initialUnreadCount={unreadCount} />}

            {user ? (
              <>
                {/* Desktop: user avatar dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="hidden md:flex items-center gap-2 p-1 rounded-full hover:bg-slate-50 transition-colors outline-none group">
                      <Avatar className="h-8 w-8 border border-border">
                        <AvatarFallback className="bg-[#194BFB] text-white text-xs font-bold">
                          {getInitials(user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden sm:inline text-sm font-medium text-slate-700 group-hover:text-slate-900">
                        {user.name}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
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
                        <span>Billing &amp; Payments</span>
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
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Mobile: hamburger toggle */}
                <button
                  className="md:hidden p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                  onClick={() => setMobileOpen((o) => !o)}
                  aria-label="Toggle menu"
                >
                  {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </>
            ) : location.pathname !== "/login" ? (
              <Button asChild size="sm" className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]">
                <Link to="/login">Login</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {/* Mobile Menu Panel */}
        {user && mobileOpen && (
          <div className="md:hidden border-t border-border bg-white shadow-lg">
            <div className="mx-auto max-w-7xl px-4 py-3 space-y-1">

              {/* User info */}
              <div className="flex items-center gap-3 px-3 py-2 mb-2">
                <Avatar className="h-9 w-9 border border-border">
                  <AvatarFallback className="bg-[#194BFB] text-white text-xs font-bold">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </div>

              <div className="border-t border-border pt-2">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Navigate
                </p>
                <NavLink to={dashHref} icon={LayoutDashboard}>Dashboard</NavLink>
                {!isExpired && !isNoBatch && (
                  <NavLink to="/playground" icon={HelpCircle}>Codepad</NavLink>
                )}
                {!isExpired && !isNoBatch && (
                  <NavLink to="/problems" icon={HelpCircle} prefix>Challenges</NavLink>
                )}
                {user.role === "student" && !isExpired && (
                  <NavLink to="/referrals" icon={Gift}>Refer &amp; Earn</NavLink>
                )}
                {user.role === "admin" && (
                  <>
                    <NavLink to="/admin/problems" icon={Code2}>Challenge Management</NavLink>
                    <NavLink to="/admin/images" icon={Image}>Image Library</NavLink>
                    <NavLink to="/admin/payments" icon={CreditCard}>Payments</NavLink>
                  </>
                )}
              </div>

              <div className="border-t border-border pt-2">
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Account
                </p>
                {user.role === "student" && (
                  <>
                    <NavLink to="/leaderboard" icon={Trophy}>Leaderboard</NavLink>
                    <NavLink to="/profile" icon={User}>My Profile</NavLink>
                    <NavLink to="/billing" icon={CreditCard}>Billing &amp; Payments</NavLink>
                  </>
                )}
                <button
                  onClick={() => { setMobileOpen(false); setIsPasswordModalOpen(true); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
                >
                  <KeyRound className="h-4 w-4 shrink-0" />
                  Change Password
                </button>
              </div>

              <div className="border-t border-border pt-2 pb-1">
                <div className="px-3 py-1.5 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Mail className="h-3.5 w-3.5" />
                    <span>support@hatchkod.in</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>+91 97048 97596</span>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

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
    </>
  );
}
