import { demoGates } from "@/lib/demo-data";
import { GateCard } from "@/components/gates/gate-card";
import { ShieldAlert, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GatesPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-blue-600" />
            Human Gates Hub
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage and resolve pending platform decisions</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search gates..." 
              className="h-9 w-64 rounded-md border border-slate-200 bg-white pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <Button variant="outline" className="flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filter
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="bg-white px-4 py-2 border rounded-md shadow-sm text-sm font-medium flex gap-2 items-center">
          <span className="text-slate-500">Total Pending:</span>
          <span className="text-lg font-bold text-slate-900">{demoGates.filter(g => g.status === 'pending').length}</span>
        </div>
        <div className="bg-white px-4 py-2 border rounded-md shadow-sm text-sm font-medium flex gap-2 items-center">
          <span className="text-slate-500">Urgent (SLA &lt; 24h):</span>
          <span className="text-lg font-bold text-red-600">{demoGates.filter(g => g.urgent).length}</span>
        </div>
        <div className="bg-white px-4 py-2 border rounded-md shadow-sm text-sm font-medium flex gap-2 items-center">
          <span className="text-slate-500">L3 Partner Gates:</span>
          <span className="text-lg font-bold text-amber-600">{demoGates.filter(g => g.tier === 'L3').length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-auto pb-6">
        {demoGates.map(gate => (
          <GateCard key={gate.id} gate={gate} />
        ))}
      </div>
    </div>
  );
}
