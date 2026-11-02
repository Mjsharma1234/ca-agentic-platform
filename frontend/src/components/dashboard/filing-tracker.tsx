"use client";

import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/async-state";

export function FilingTracker() {
  const { data, error, loading, reload } = useApi(() => api.getFilingTracker(), [], { refreshMs: 30_000 });

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const total = data.completed + data.in_progress + data.not_started;
  if (total === 0) return <EmptyState title="No returns in the pipeline yet" hint="Returns appear here once they are assembled for a client." />;
  const pct = Math.round((data.completed / total) * 100);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4 text-center">
        {[
          ["Filed & acknowledged", data.completed, "text-emerald-600"],
          ["In progress", data.in_progress, "text-amber-600"],
          ["Not started", data.not_started, "text-slate-600"],
        ].map(([label, value, color]) => (
          <div key={label as string} className="rounded-md border bg-slate-50 p-4">
            <div className={`text-2xl font-bold ${color}`}>{value as number}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Progress value={pct} className="h-2 flex-1" />
        <span className="w-12 text-right text-xs font-bold text-slate-700">{pct}%</span>
      </div>
    </div>
  );
}
