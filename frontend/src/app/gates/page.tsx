"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldAlert, Search, CheckCircle2, XCircle, Clock, AlertCircle, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/async-state";
import { slaLabel } from "@/components/gates/gate-card";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { getGateColor, getStatusColor, cn } from "@/lib/utils";

export default function GatesPage() {
  const { data, error, loading, reload } = useApi(() => api.listGates(), [], { refreshMs: 15_000 });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const gates = data ?? [];
  const q = searchQuery.toLowerCase();
  const filtered = gates.filter(
    (g) =>
      (filterStatus === "all" || g.status === filterStatus) &&
      (g.name.toLowerCase().includes(q) || g.client.toLowerCase().includes(q) || g.gate_id.toLowerCase().includes(q))
  );
  const count = (s: string) => gates.filter((g) => g.status === s).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-blue-600" />
            Human Gates Hub
          </h1>
          <p className="text-slate-600 text-sm mt-1">The machine prepares. A person decides. Open a gate to review its evidence and decide.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              aria-label="Search gates"
              placeholder="Search client or gate…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-md border border-slate-300 bg-white pl-9 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <select
            aria-label="Filter by status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 font-medium focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="escalated">Escalated</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {[
          [Clock, "text-amber-500", "Pending", count("pending")],
          [AlertCircle, "text-purple-600", "Escalated", count("escalated")],
          [CheckCircle2, "text-emerald-600", "Approved", count("approved")],
          [XCircle, "text-red-600", "Rejected", count("rejected")],
          [AlertCircle, "text-red-600", "Urgent (≤6h SLA)", gates.filter((g) => g.urgent).length],
        ].map(([Icon, color, label, value]) => {
          const I = Icon as typeof Clock;
          return (
            <div key={label as string} className="bg-white px-4 py-2.5 border rounded-md shadow-sm text-sm font-medium flex gap-2 items-center">
              <I className={cn("w-4 h-4", color as string)} />
              <span className="text-slate-600">{label as string}:</span>
              <span className="text-lg font-bold text-slate-900">{value as number}</span>
            </div>
          );
        })}
      </div>

      {loading ? (
        <LoadingState label="Loading gates…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState title={gates.length === 0 ? "No gate decisions yet" : "No gates match your filters"} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-auto pb-6">
          {filtered.map((gate) => {
            const open = gate.status === "pending" || gate.status === "escalated";
            return (
              <Card key={gate.id} className="hover:border-slate-400 transition-all flex flex-col justify-between bg-white">
                <CardContent className="p-5 flex flex-col h-full justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-2">
                        <span className={cn("px-2 py-1 text-xs font-bold rounded-md", getGateColor(gate.gate_id))}>{gate.gate_id}</span>
                        <Link href={`/gates/${gate.id}`} className="font-semibold text-slate-900 hover:text-blue-600 transition-colors">
                          {gate.name}
                        </Link>
                      </div>
                      <Badge variant="outline" className={cn("capitalize font-semibold", getStatusColor(gate.status))}>
                        {gate.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">{gate.description}</p>
                  </div>

                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-800">{gate.client}</span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">Tier {gate.tier}</span>
                      </div>
                      {open && (
                        <div className={cn("flex items-center space-x-1", gate.urgent ? "text-red-600 font-semibold" : "text-slate-500")}>
                          {gate.urgent ? <AlertCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          <span>{slaLabel(gate)}</span>
                        </div>
                      )}
                    </div>
                    <Link href={`/gates/${gate.id}`}>
                      <Button variant="outline" size="sm" className="w-full text-slate-800 font-medium">
                        <Eye className="w-3.5 h-3.5 mr-1.5" /> {open ? "Review & decide" : "View decision"}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
