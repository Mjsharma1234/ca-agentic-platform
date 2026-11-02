import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuleCheck } from "@/lib/types";
import { EmptyState } from "@/components/ui/async-state";

/** Renders the deterministic rule-engine output attached to a gate's evidence pack. No rows are ever synthesised. */
export function RuleCheckResults({ results }: { results?: RuleCheck[] }) {
  if (!results || results.length === 0) {
    return <EmptyState title="No rule-engine results attached" hint="Rule checks appear here once the return has been assembled and validated." />;
  }
  const summary = {
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    warning: results.filter((r) => r.status === "warning").length,
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

      <ul className="space-y-2 max-h-64 overflow-y-auto pr-2">
        {results.map((rule) => (
          <li key={rule.id} className="flex items-start gap-3 p-2 hover:bg-slate-50 rounded-md">
            <div className="mt-0.5">
              {rule.status === "passed" && <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-label="Passed" />}
              {rule.status === "failed" && <XCircle className="w-4 h-4 text-red-500" aria-label="Failed" />}
              {rule.status === "warning" && <AlertTriangle className="w-4 h-4 text-amber-500" aria-label="Warning" />}
            </div>
            <div className="flex-1">
              <p className={cn("text-sm font-medium", rule.status === "failed" ? "text-red-700" : "text-slate-800")}>{rule.name}</p>
              {rule.detail && <p className="text-xs text-slate-500 mt-0.5">{rule.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
