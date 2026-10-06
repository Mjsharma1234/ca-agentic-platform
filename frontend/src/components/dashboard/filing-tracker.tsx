import { demoClients } from "@/lib/demo-data";
import { Progress } from "@/components/ui/progress";

const stages = [
  "Data Collected", 
  "Reconciled", 
  "Rules Checked", 
  "Under Review", 
  "Signed", 
  "Filed"
];

export function FilingTracker() {
  // Generate some semi-random progress for demo
  const clientProgress = demoClients.slice(0, 5).map((client, i) => {
    const stageIndex = Math.floor(Math.random() * stages.length);
    const progress = Math.round(((stageIndex + 1) / stages.length) * 100);
    
    return {
      client,
      type: i % 2 === 0 ? 'GSTR-1' : 'GSTR-3B',
      stage: stages[stageIndex],
      progress
    };
  });

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Return</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-1/3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {clientProgress.map((item, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">{item.client.name}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800">
                    {item.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{item.stage}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Progress value={item.progress} className="h-2 flex-1" />
                    <span className="text-xs font-medium text-slate-500 w-8">{item.progress}%</span>
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
