"use client";

import { Bell, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export function Topbar() {
  const pathname = usePathname();
  
  const getPageTitle = () => {
    if (pathname === '/') return 'Partner Dashboard';
    if (pathname.startsWith('/gates')) return 'Human Gates Hub';
    if (pathname.startsWith('/clients')) return 'Client Management';
    if (pathname.startsWith('/documents')) return 'Document Triage';
    if (pathname.startsWith('/returns')) return 'Returns Assembly';
    return 'Platform';
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
        
        <div className="flex items-center space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-medium text-white">
            AS
          </div>
          <div className="hidden flex-col md:flex">
            <span className="text-sm font-medium leading-none">Amit Sharma</span>
            <span className="text-xs text-slate-500 mt-1">Partner</span>
          </div>
        </div>
      </div>
    </header>
  );
}
