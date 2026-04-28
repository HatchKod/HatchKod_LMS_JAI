import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
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
  return children;
}
