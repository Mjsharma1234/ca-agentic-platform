"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, ShieldCheck, Server, Database, CheckCircle2, Lock } from "lucide-react";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-blue-600" />
            Platform Architecture & Security Settings
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Sovereign Cloud Residency, GSP Failover Router, and AST Authority Sandbox Configuration
          </p>
        </div>
        {saved && (
          <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1">
            <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" /> Configuration Saved
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-white">
          <CardHeader className="border-b bg-slate-50 py-3.5">
            <CardTitle className="text-sm text-slate-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-600" />
              Sovereign Cloud & GSP Gateway
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4 text-sm">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Data Residency Region (DPDPA 2023)</label>
              <input
                type="text"
                readOnly
                value="Azure Central India (Pune) / AWS Mumbai (ap-south-1)"
                className="w-full border border-slate-300 rounded px-3 py-2 bg-slate-50 text-slate-900 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Primary & Failover GSP</label>
              <select className="w-full border border-slate-300 rounded px-3 py-2 bg-white text-slate-900 font-medium">
                <option>Primary: Iris GSP REST API → Backup: Masters India</option>
                <option>Primary: Cygnet GSP → Backup: ClearTax Enterprise</option>
              </select>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-slate-700 font-medium">Zero Data Retention (ZDR) Contract</span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Enforced
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader className="border-b bg-slate-50 py-3.5">
            <CardTitle className="text-sm text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-600" />
              Four Operating Laws & Security Guardrails
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-3 text-xs text-slate-800">
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <span><strong>Law 1:</strong> Zero Filing/Signing Tools in Agent Manifests</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <span><strong>Law 2:</strong> 100% Deterministic Python Tax Arithmetic</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <span><strong>Pillar 4:</strong> PostgreSQL 16 Row-Level Security (RLS)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <span><strong>Pillar 7:</strong> Ephemeral RAM HSM Signing (&lt;30s TTL)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="pt-2 flex justify-end">
              <Button
                onClick={() => setSaved(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                <ShieldCheck className="w-4 h-4 mr-1.5" /> Verify & Save Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
