import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { LogOut, LayoutDashboard, GraduationCap } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const handleLogout = async () => { await logout(); nav("/login"); };

  const dashHref =
    user?.role === "admin" ? "/admin" : user?.role === "mentor" ? "/mentor" : "/dashboard";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-white" data-testid="navbar">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to={user ? dashHref : "/"} className="flex items-center gap-2" data-testid="brand-link">
          <span className="grid h-7 w-7 place-items-center bg-[#194BFB] text-white">
            <GraduationCap className="h-4 w-4" />
          </span>
          <span className="font-[Outfit] text-lg font-bold tracking-tight">HatchKod</span>
          <span className="hidden rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 sm:inline">
            LMS
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden text-xs uppercase tracking-widest text-slate-500 sm:inline" data-testid="user-role-badge">
                {user.role}
              </span>
              <span className="hidden text-sm text-slate-700 sm:inline" data-testid="user-name">{user.name}</span>
              <Button asChild size="sm" variant="outline" className="rounded-sm" data-testid="nav-dashboard-btn">
                <Link to={dashHref}><LayoutDashboard className="mr-1.5 h-4 w-4" />Dashboard</Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={handleLogout} className="rounded-sm" data-testid="nav-logout-btn">
                <LogOut className="mr-1.5 h-4 w-4" />Logout
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="rounded-sm" data-testid="nav-login-btn">
                <Link to="/login">Login</Link>
              </Button>
              <Button asChild size="sm" className="rounded-sm bg-[#194BFB] hover:bg-[#0F3AE5]" data-testid="nav-register-btn">
                <Link to="/register">Get Started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
