import { Users, ShieldAlert, Calendar, ShieldCheck } from "lucide-react";
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
          {/* Exceptions Triage */}
          <Card className="border-red-100">
            <CardHeader className="bg-red-50/50 border-b pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-red-800 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" />
                  FO-2 Exception Triage
                </CardTitle>
                <Badge variant="destructive">{demoExceptions.length} Items</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {demoExceptions.map((ex) => (
                  <div key={ex.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={
                          ex.severity === 'CRITICAL' ? 'bg-red-600' : 
                          ex.severity === 'HIGH' ? 'bg-orange-500' : 'bg-amber-500'
                        }>
                          {ex.severity}
                        </Badge>
                        <span className="font-semibold text-sm text-slate-900">{ex.client}</span>
                      </div>
                      <p className="text-sm text-slate-600">{ex.description}</p>
                    </div>
                    <Link href={`/gates/${ex.gateId}`}>
                      <Button size="sm" variant="outline">Review</Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pending Gates */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Urgent Pending Gates</h2>
              <Link href="/gates" className="text-sm text-blue-600 hover:underline">View All →</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {demoGates.filter(g => g.urgent).map(gate => (
                <GateCard key={gate.id} gate={gate} />
              ))}
            </div>
          </div>

          {/* FO-1 Capacity Grid / Filing Tracker */}
          <Card>
            <CardHeader>
              <CardTitle>FO-1 Filing Capacity Grid</CardTitle>
            </CardHeader>
            <CardContent>
              <FilingTracker />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Area */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Deadlines</CardTitle>
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
