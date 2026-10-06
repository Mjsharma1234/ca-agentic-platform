import { FilingTracker } from "@/components/dashboard/filing-tracker";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus } from "lucide-react";

export default function ReturnsPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-600" />
            Returns Assembly & Filing
          </h1>
          <p className="text-slate-500 text-sm mt-1">Track return preparation progress across clients</p>
        </div>
        
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4 mr-2" /> Assemble Return
        </Button>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-6">
        <FilingTracker />
      </div>
    </div>
  );
}
