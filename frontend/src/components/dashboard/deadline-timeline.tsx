"use client";

import { Calendar, ArrowRight } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatDate, cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/async-state";

const dot = (type: string) => {
  if (type.includes("GSTR-1")) return "bg-blue-500";
  if (type.includes("GSTR-3B")) return "bg-emerald-500";
  if (type.includes("IMS")) return "bg-amber-500";
  if (type.includes("TDS")) return "bg-orange-500";
  if (type.includes("ITR")) return "bg-purple-500";
  return "bg-slate-500";
};

export function DeadlineTimeline() {
  const { data, error, loading, reload } = useApi(() => api.getDeadlines(), [], { refreshMs: 5 * 60_000 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-medium text-slate-900 mb-4">
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-blue-600" />
          <span>Next statutory cutoffs</span>
        </div>
        <Link href="/calendar" className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold">
          Full Calendar <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No deadlines in the next 45 days" />
      ) : (
        <ol className="relative border-l-2 border-slate-200 ml-3 space-y-5">
          {data.slice(0, 6).map((d) => (
            <li key={`${d.return_type}-${d.deadline_date}`} className="relative pl-6">
              <div
                className={cn(
                  "absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white",
                  dot(d.return_type),
                  d.is_critical && "ring-2 ring-red-200 ring-offset-1"
                )}
              />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    {d.return_type}
                    {d.is_critical && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">CRITICAL</span>}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {formatDate(d.deadline_date)} • {d.description}
                  </p>
                </div>
                <div
                  className={cn(
                    "mt-1 sm:mt-0 text-xs font-semibold px-2 py-0.5 rounded-md",
                    d.days_remaining <= 5 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                  )}
                >
                  {d.days_remaining > 0 ? `${d.days_remaining}d left` : d.days_remaining === 0 ? "Today" : "Overdue"}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
