"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  ShieldAlert, 
  Briefcase, 
  Calendar,
  AlertTriangle,
  Settings,
  UserCircle
} from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/gates", label: "Gates Hub", icon: ShieldAlert },
  { href: "/returns", label: "Returns", icon: Briefcase },
  { href: "/calendar", label: "Calendar", icon: Calendar },
];

export function Sidebar() {
  const pathname = usePathname();
  const [killSwitchOpen, setKillSwitchOpen] = useState(false);

  return (
    <>
      <div className="flex h-screen w-64 flex-col border-r bg-slate-900 text-slate-50">
        <div className="flex h-16 items-center px-6 text-xl font-bold tracking-tight text-saffron-500">
          <span className="text-white mr-2">CA</span> Platform
        </div>
        
        <div className="flex-1 overflow-auto py-4">
          <nav className="space-y-1 px-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-slate-800 text-white" 
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 space-y-2">
          <button 
            onClick={() => setKillSwitchOpen(true)}
            className="flex w-full items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            EMERGENCY KILL SWITCH
          </button>
          
          <div className="pt-4 border-t border-slate-800 mt-4 space-y-1">
            <Link href="/settings" className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white">
              <Settings className="mr-3 h-5 w-5" /> Settings
            </Link>
            <div className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-slate-400">
              <UserCircle className="mr-3 h-5 w-5" /> 
              <div className="flex flex-col">
                <span className="text-white">Amit Sharma</span>
                <span className="text-xs text-slate-500">Partner</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal 
        isOpen={killSwitchOpen} 
        onClose={() => setKillSwitchOpen(false)}
        title="⚠️ EMERGENCY KILL SWITCH"
      >
        <div className="space-y-4">
          <p className="text-red-600 font-medium">
            WARNING: Activating the global kill switch will immediately halt ALL automated filings, IMS commits, and outbound communications for ALL clients.
          </p>
          <p className="text-sm text-slate-600">
            This action should only be taken in the event of a critical platform-wide anomaly or severe regulatory change requiring immediate suspension of all agentic activities.
          </p>
          <div className="pt-4 flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setKillSwitchOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              alert("Global Kill Switch Activated. All systems halted.");
              setKillSwitchOpen(false);
            }}>
              HALT ALL SYSTEMS
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
