"use client";

import { useState } from "react";
import { demoGates, GateDecisionItem } from "@/lib/demo-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Filter, Search, CheckCircle2, XCircle, Clock, AlertCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGateColor, getStatusColor, cn } from "@/lib/utils";
import Link from "next/link";

export default function GatesPage() {
  const [gates, setGates] = useState<GateDecisionItem[]>(demoGates);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const handleQuickDecision = (id: string, status: "approved" | "rejected") => {
    setGates((prev) =>
      prev.map((g) => (g.id === id ? { ...g, status } : g))
    );
  };

  const filteredGates = gates.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "all" || g.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-blue-600" />
            Human Gates Hub (18 Stopping Points)
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Law 1: The Machine Prepares. A Person Decides. Click Green ✓ to Accept or Red ✗ to Reject.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search client, gate ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-md border border-slate-300 bg-white pl-9 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 font-medium focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending Only</option>
            <option value="approved">Accepted (Approved)</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="flex flex-wrap gap-4">
        <div className="bg-white px-4 py-2.5 border rounded-md shadow-sm text-sm font-medium flex gap-2 items-center">
          <Clock className="w-4 h-4 text-amber-500" />
          <span className="text-slate-600">Pending Review:</span>
          <span className="text-lg font-bold text-slate-900">{gates.filter(g => g.status === 'pending').length}</span>
        </div>
        <div className="bg-white px-4 py-2.5 border rounded-md shadow-sm text-sm font-medium flex gap-2 items-center">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="text-slate-600">Accepted:</span>
          <span className="text-lg font-bold text-emerald-600">{gates.filter(g => g.status === 'approved').length}</span>
        </div>
        <div className="bg-white px-4 py-2.5 border rounded-md shadow-sm text-sm font-medium flex gap-2 items-center">
          <XCircle className="w-4 h-4 text-red-600" />
          <span className="text-slate-600">Rejected:</span>
          <span className="text-lg font-bold text-red-600">{gates.filter(g => g.status === 'rejected').length}</span>
        </div>
        <div className="bg-white px-4 py-2.5 border rounded-md shadow-sm text-sm font-medium flex gap-2 items-center">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-slate-600">Urgent (SLA &lt; 24h):</span>
          <span className="text-lg font-bold text-red-600">{gates.filter(g => g.urgent && g.status === 'pending').length}</span>
        </div>
      </div>

      {/* Gate Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-auto pb-6">
        {filteredGates.map((gate) => (
          <Card key={gate.id} className="hover:border-slate-400 transition-all flex flex-col justify-between bg-white">
            <CardContent className="p-5 flex flex-col h-full justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center space-x-2">
                    <span className={cn("px-2 py-1 text-xs font-bold rounded-md", getGateColor(gate.type))}>
                      {gate.type}
                    </span>
                    <Link href={`/gates/${gate.id}`} className="font-semibold text-slate-900 hover:text-blue-600 transition-colors">
                      {gate.name}
                    </Link>
                  </div>
                  <Badge variant="outline" className={cn("capitalize font-semibold", getStatusColor(gate.status))}>
                    {gate.status === 'approved' ? (
                      <span className="flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Accepted
                      </span>
                    ) : gate.status === 'rejected' ? (
                      <span className="flex items-center gap-1 text-red-700">
                        <XCircle className="w-3.5 h-3.5 text-red-600" /> Rejected
                      </span>
                    ) : (
                      gate.status
                    )}
                  </Badge>
                </div>

                <p className="text-sm text-slate-600 mb-4">
                  {gate.description}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-800">{gate.client}</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">Tier {gate.tier}</span>
                  </div>
                  <div className={cn(
                    "flex items-center space-x-1",
                    gate.urgent ? "text-red-600 font-semibold" : "text-slate-500"
                  )}>
                    {gate.urgent ? <AlertCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    <span>{gate.slaRemaining}h SLA</span>
                  </div>
                </div>

                {/* Action Bar with Green Accept & Red Reject Icons */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Link href={`/gates/${gate.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full text-slate-800 font-medium">
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> Inspect Pack
                    </Button>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleQuickDecision(gate.id, "approved")}
                    title="Accept / Approve Gate"
                    className={cn(
                      "px-3 py-1.5 rounded-md border text-xs font-bold flex items-center gap-1 transition-all",
                      gate.status === "approved"
                        ? "bg-emerald-600 text-white border-emerald-700"
                        : "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-600 hover:text-white"
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDecision(gate.id, "rejected")}
                    title="Reject Gate"
                    className={cn(
                      "px-3 py-1.5 rounded-md border text-xs font-bold flex items-center gap-1 transition-all",
                      gate.status === "rejected"
                        ? "bg-red-600 text-white border-red-700"
                        : "bg-red-50 text-red-700 border-red-300 hover:bg-red-600 hover:text-white"
                    )}
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
