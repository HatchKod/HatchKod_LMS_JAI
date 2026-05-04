import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

export default function Breadcrumbs({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-6 overflow-x-auto whitespace-nowrap pb-2 sm:pb-0 no-scrollbar" aria-label="Breadcrumb">
      <Link 
        to="/dashboard" 
        className="flex items-center gap-1.5 hover:text-[#194BFB] transition-colors shrink-0"
      >
        <div className="h-5 w-5 bg-white border border-slate-200 rounded-sm flex items-center justify-center">
          <Home className="h-3 w-3" />
        </div>
        <span className="hidden sm:inline">Home</span>
      </Link>

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2 shrink-0">
          <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          {item.to ? (
            <Link 
              to={item.to} 
              className="hover:text-[#194BFB] transition-colors max-w-[150px] sm:max-w-[200px] truncate"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-[#0A0A0A] font-bold max-w-[150px] sm:max-w-[200px] truncate">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
