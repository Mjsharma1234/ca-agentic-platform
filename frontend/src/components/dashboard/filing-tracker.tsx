import { demoClients } from "@/lib/demo-data";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock } from "lucide-react";

const stages = [
  "Data Collected", 
  "Reconciled", 
  "Rules Checked (38/38)", 
  "Gate G6 Review", 
  "Gate G7 Signed", 
  "Filed & ARN Verified"
];

export function FilingTracker() {
  // Deterministic progress per client (no Math.random hydration mismatch)
  const clientProgress = demoClients.slice(0, 5).map((client, i) => {
    const stageIndex = (i * 2 + 2) % stages.length;
    const progress = Math.round(((stageIndex + 1) / stages.length) * 100);
    
    return {
      client,
      type: i % 2 === 0 ? 'GSTR-3B' : 'GSTR-1',
      stage: stages[stageIndex],
      progress
    };
  });

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-600 uppercase bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 font-semibold">Client</th>
              <th className="px-4 py-3 font-semibold">Return</th>
              <th className="px-4 py-3 font-semibold">Current Stage</th>
              <th className="px-4 py-3 font-semibold w-1/3">Completion</th>
            </tr>
          </thead>
          <tbody>
            {clientProgress.map((item, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-900">{item.client.name}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
                    {item.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-700 font-medium flex items-center gap-1.5">
                  {item.progress === 100 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  {item.stage}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Progress value={item.progress} className="h-2 flex-1" />
                    <span className="text-xs font-bold text-slate-700 w-9">{item.progress}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
