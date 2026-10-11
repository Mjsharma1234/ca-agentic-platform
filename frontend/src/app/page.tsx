"use client";

import { useState } from "react";
import { Users, ShieldAlert, Calendar, ShieldCheck, CheckCircle2, XCircle, Eye } from "lucide-react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { DeadlineTimeline } from "@/components/dashboard/deadline-timeline";
import { FilingTracker } from "@/components/dashboard/filing-tracker";
import { GateCard } from "@/components/gates/gate-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { demoStats, demoGates, demoExceptions } from "@/lib/demo-data";
import { formatIndianCurrency } from "@/lib/utils";
import Link from "next/link";

export default function DashboardPage() {
  const [exceptions, setExceptions] = useState(
    demoExceptions.map((ex) => ({ ...ex, status: "pending" as "pending" | "accepted" | "rejected" }))
  );

  const handleExceptionAction = (id: string, status: "accepted" | "rejected") => {
    setExceptions((prev) =>
      prev.map((ex) => (ex.id === id ? { ...ex, status } : ex))
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="Total Active Clients" 
          value={demoStats.activeClients} 
          icon={Users} 
          trend={demoStats.clientsTrend} 
        />
        <StatsCard 
          title="Pending Gate Approvals" 
          value={demoStats.pendingGates} 
          icon={ShieldAlert} 
          urgent={demoStats.urgentGates > 0}
        />
        <StatsCard 
          title="Returns Due This Month" 
          value={demoStats.returnsDue} 
          icon={Calendar} 
        />
        <StatsCard 
          title="ITC Safeguarded (MTD)" 
          value={formatIndianCurrency(demoStats.itcSafeguarded)} 
          icon={ShieldCheck} 
          trend={12}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Exceptions Triage with Green Accept & Red Reject Icons */}
          <Card className="border-red-200 bg-white">
            <CardHeader className="bg-red-50/60 border-b pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-red-900 flex items-center gap-2 text-base">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  FO-2 Unified Exception Triage & Anomaly Cluster
                </CardTitle>
                <Badge variant="destructive">
                  {exceptions.filter((e) => e.status === "pending").length} Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {exceptions.map((ex) => (
                  <div key={ex.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={
                          ex.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 
                          ex.severity === 'HIGH' ? 'bg-orange-500 text-white' : 'bg-amber-500 text-white'
                        }>
                          {ex.severity}
                        </Badge>
                        <span className="font-bold text-sm text-slate-900">{ex.client}</span>
                        {ex.status === "accepted" && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Accepted
                          </span>
                        )}
                        {ex.status === "rejected" && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                            <XCircle className="w-3.5 h-3.5 text-red-600" /> Rejected
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700">{ex.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleExceptionAction(ex.id, "accepted")}
                        title="Accept Triage Proposal"
                        className={`p-1.5 rounded-md border transition-colors flex items-center gap-1 text-xs font-bold ${
                          ex.status === "accepted"
                            ? "bg-emerald-600 text-white border-emerald-700"
                            : "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-600 hover:text-white"
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExceptionAction(ex.id, "rejected")}
                        title="Reject Exception"
                        className={`p-1.5 rounded-md border transition-colors flex items-center gap-1 text-xs font-bold ${
                          ex.status === "rejected"
                            ? "bg-red-600 text-white border-red-700"
                            : "bg-red-50 text-red-700 border-red-300 hover:bg-red-600 hover:text-white"
                        }`}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <Link href={`/gates/${ex.gateId}`}>
                        <Button size="sm" variant="outline" className="text-slate-900 font-semibold">
                          <Eye className="w-3.5 h-3.5 mr-1" /> Review
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pending Gates */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Urgent Pending Human Gates</h2>
              <Link href="/gates" className="text-sm font-semibold text-blue-600 hover:underline">View All Gates →</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {demoGates.filter(g => g.urgent).map(gate => (
                <GateCard key={gate.id} gate={gate} />
              ))}
            </div>
          </div>

          {/* FO-1 Capacity Grid / Filing Tracker */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-slate-900">FO-1 Filing Capacity & Return Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <FilingTracker />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Area */}
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
