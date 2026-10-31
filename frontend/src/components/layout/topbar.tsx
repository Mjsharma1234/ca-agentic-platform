"use client";

import { Bell, Search, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  
  const getPageTitle = () => {
    if (pathname === '/') return 'Partner Dashboard';
    if (pathname.startsWith('/gates')) return 'Human Gates Hub';
    if (pathname.startsWith('/clients')) return 'Client Management';
    if (pathname.startsWith('/documents')) return 'Document Triage & OCR Hub';
    if (pathname.startsWith('/returns')) return 'Returns Assembly & 38 Rules';
    if (pathname.startsWith('/calendar')) return 'Statutory Compliance Calendar';
    if (pathname.startsWith('/reconciliation')) return 'Bank & Tally Reconciler';
    if (pathname.startsWith('/billing')) return 'Billing & Invoicing';
    if (pathname.startsWith('/settings')) return 'Platform Settings';
    return 'Platform';
  };

  const getInitials = (name?: string) => {
    if (!name) return "CA";
    const parts = name.replace(/CA\s+/i, "").trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case "PARTNER":
        return <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">Partner</span>;
      case "SENIOR_MANAGER":
      case "MANAGER":
        return <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">Manager</span>;
      case "ARTICLE_TRAINEE":
        return <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">Article</span>;
      case "CLIENT_USER":
        return <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded">Client</span>;
      default:
        return <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded">{role || "User"}</span>;
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold text-slate-900">{getPageTitle()}</h1>
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search clients, GSTINs..." 
            className="h-9 w-64 rounded-md border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
        </div>
        
        <button className="relative rounded-full p-2 hover:bg-slate-100 transition-colors">
          <Bell className="h-5 w-5 text-slate-600" />
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            3
          </span>
        </button>

        <div className="h-8 w-px bg-slate-200 mx-2"></div>
        
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white shadow-sm">
            {getInitials(user?.full_name)}
          </div>
          <div className="hidden flex-col md:flex">
            <span className="text-sm font-semibold text-slate-900 leading-none">
              {user?.full_name || "CA Practitioner"}
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              {getRoleBadge(user?.role)}
              {user?.membership_no && (
                <span className="text-[10px] text-slate-500 font-mono">
                  {user.membership_no}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => logout()}
            title="Log Out & Switch User"
            className="ml-2 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
