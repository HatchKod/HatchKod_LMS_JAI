import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function ProtectedRoute({ children, roles, requiresBatch }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-slate-500" data-testid="route-loading">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    const home = user.role === "admin" ? "/admin" : user.role === "mentor" ? "/mentor" : "/dashboard";
    return <Navigate to={home} replace />;
  }

  if (user.role === "student" && user.access_tier === "expired") {
    const allowedPaths = ["/dashboard", "/billing"];
    if (!allowedPaths.includes(location.pathname)) {
      return <Navigate to="/billing" replace />;
    }
  }

  if (requiresBatch && user.role === "student" && !user.batch_id) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
