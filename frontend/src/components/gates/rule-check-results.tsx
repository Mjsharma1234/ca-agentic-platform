import { demoRuleChecks } from "@/lib/demo-data";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function RuleCheckResults() {
  const summary = {
    passed: demoRuleChecks.filter(r => r.status === 'passed').length,
    failed: demoRuleChecks.filter(r => r.status === 'failed').length,
    warning: demoRuleChecks.filter(r => r.status === 'warning').length,
  };

  return (
    <div className="space-y-4 border rounded-md p-4 bg-white">
      <div className="flex gap-4 pb-4 border-b">
        <div className="flex flex-col items-center p-3 bg-emerald-50 rounded-md flex-1">
          <span className="text-2xl font-bold text-emerald-600">{summary.passed}</span>
          <span className="text-xs text-emerald-800 uppercase font-semibold">Passed</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-red-50 rounded-md flex-1">
          <span className="text-2xl font-bold text-red-600">{summary.failed}</span>
          <span className="text-xs text-red-800 uppercase font-semibold">Failed</span>
        </div>
        <div className="flex flex-col items-center p-3 bg-amber-50 rounded-md flex-1">
          <span className="text-2xl font-bold text-amber-600">{summary.warning}</span>
          <span className="text-xs text-amber-800 uppercase font-semibold">Warnings</span>
        </div>
      </div>
      
      <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
        {demoRuleChecks.slice(0, 15).map((rule) => (
          <div key={rule.id} className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-md">
            <div className="mt-0.5">
              {rule.status === 'passed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              {rule.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
              {rule.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
            </div>
            <div className="flex-1">
              <p className={cn(
                "text-sm font-medium",
                rule.status === 'failed' ? "text-red-700" : "text-slate-800"
              )}>
                {rule.name}
              </p>
              {rule.detail && (
                <p className="text-xs text-slate-500 mt-0.5">{rule.detail}</p>
              )}
            </div>
          </div>
        ))}
        {demoRuleChecks.length > 15 && (
          <div className="text-center text-xs text-slate-500 py-2">
            + {demoRuleChecks.length - 15} more rules checked
          </div>
        )}
      </div>
    </div>
  );
}
