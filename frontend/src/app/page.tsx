"use client";

import { Users, ShieldAlert, Calendar, ShieldCheck, Eye } from "lucide-react";
import Link from "next/link";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DeadlineTimeline } from "@/components/dashboard/deadline-timeline";
import { FilingTracker } from "@/components/dashboard/filing-tracker";
import { GateCard } from "@/components/gates/gate-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/async-state";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { formatIndianCurrency } from "@/lib/utils";

const REFRESH_MS = 15_000;

const severityClass = (s: string) =>
  s === "CRITICAL" ? "bg-red-600 text-white" : s === "HIGH" ? "bg-orange-500 text-white" : "bg-amber-500 text-white";

export default function DashboardPage() {
  const overview = useApi(() => api.getOverview(), [], { refreshMs: REFRESH_MS });
  const exceptions = useApi(() => api.getExceptions(), [], { refreshMs: REFRESH_MS });
  const gates = useApi(() => api.listGates("pending"), [], { refreshMs: REFRESH_MS });

  const o = overview.data;
  const urgentGates = (gates.data ?? []).filter((g) => g.urgent);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {overview.error && <ErrorState message={overview.error} onRetry={overview.reload} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard title="Active Clients" value={o ? o.clients_count : "—"} icon={Users} />
        <StatsCard title="Pending Gate Approvals" value={o ? o.pending_gates : "—"} icon={ShieldAlert} urgent={urgentGates.length > 0} />
        <StatsCard title="Deadlines in 30 days" value={o ? o.upcoming_deadlines : "—"} icon={Calendar} />
        <StatsCard title="ITC on verified invoices" value={o ? formatIndianCurrency(o.itc_safeguarded_inr) : "—"} icon={ShieldCheck} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-red-200 bg-white">
            <CardHeader className="bg-red-50/60 border-b pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-red-900 flex items-center gap-2 text-base">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  Exception Triage
                </CardTitle>
                <Badge variant="destructive">{exceptions.data?.length ?? 0} Active</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {exceptions.loading ? (
                <LoadingState />
              ) : exceptions.error ? (
                <div className="p-4">
                  <ErrorState message={exceptions.error} onRetry={exceptions.reload} />
                </div>
              ) : !exceptions.data || exceptions.data.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No open exceptions" hint="SLA breaches, escalations and low-confidence extractions show up here." />
                </div>
              ) : (
                <ul className="divide-y">
                  {exceptions.data.map((ex) => (
                    <li key={ex.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={severityClass(ex.severity)}>{ex.severity}</Badge>
                          <span className="font-bold text-sm text-slate-900">{ex.client}</span>
                        </div>
                        <p className="text-sm text-slate-700">{ex.details}</p>
                      </div>
                      {ex.gate_id && (
                        <Link href={`/gates/${ex.gate_id}`}>
                          <Button size="sm" variant="outline" className="text-slate-900 font-semibold">
                            <Eye className="w-3.5 h-3.5 mr-1" /> Review
                          </Button>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Urgent Pending Human Gates</h2>
              <Link href="/gates" className="text-sm font-semibold text-blue-600 hover:underline">
                View All Gates →
              </Link>
            </div>
            {gates.loading ? (
              <LoadingState />
            ) : gates.error ? (
              <ErrorState message={gates.error} onRetry={gates.reload} />
            ) : urgentGates.length === 0 ? (
              <EmptyState title="No urgent gates" hint="Gates due within 6 hours or past SLA appear here." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {urgentGates.map((g) => (
                  <GateCard key={g.id} gate={g} />
                ))}
              </div>
            )}
          </div>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-slate-900">Return Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <FilingTracker />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-slate-900">Upcoming Statutory Deadlines</CardTitle>
            </CardHeader>
            <CardContent>
              <DeadlineTimeline />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
