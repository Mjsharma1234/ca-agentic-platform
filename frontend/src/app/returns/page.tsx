"use client";

import { useState, useEffect, useCallback } from "react";
import { formatIndianCurrency } from "@/lib/utils";
import { api, ReconciliationResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Briefcase,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Eye,
  Loader2,
  Download,
  FileCheck,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import Link from "next/link";

interface ReturnItem {
  id: string;
  client: string;
  gstin: string;
  type: string;
  period: string;
  taxableLiability: number;
  itcClaimed: number;
  netPayable: number;
  stage: string;
  progress: number;
  rulesPassed: string;
}

const STAGE_PROGRESS: Record<string, number> = {
  DRAFT: 10, RULES_CHECKED: 30, REVIEW_PENDING: 50, REVIEWED: 65, SIGNING_PENDING: 80, SIGNED: 90, FILED: 100, ACKNOWLEDGED: 100,
};

function mapReturn(r: any): ReturnItem {
  const status = String(r.status ?? "DRAFT");
  return {
    id: String(r.id),
    client: String(r.client ?? r.client_name ?? "Unknown client"),
    gstin: String(r.gstin ?? ""),
    type: String(r.return_type ?? ""),
    period: String(r.period ?? ""),
    taxableLiability: Number(r.total_tax_liability ?? 0),
    itcClaimed: Number(r.total_itc_claimed ?? 0),
    netPayable: Number(r.net_tax_payable ?? 0),
    stage: status.replace(/_/g, " "),
    progress: STAGE_PROGRESS[status] ?? 50,
    rulesPassed: r.rules_total ? `${r.rules_passed ?? 0} / ${r.rules_total} Passed` : "Not evaluated",
  };
}

export default function ReturnsPage() {
  const [returnsList, setReturnsList] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Deterministic Reco State
  const [isReconciling, setIsReconciling] = useState(false);
  const [recoResult, setRecoResult] = useState<ReconciliationResult | null>(null);
  const [isExportingXml, setIsExportingXml] = useState(false);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await api.get<any[]>("/returns/");
    if (res.error || !Array.isArray(res.data)) setLoadError(res.error || "Could not load returns.");
    else setReturnsList(res.data.map(mapReturn));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  const handleRunReconciliation = async () => {
    setIsReconciling(true);
    setActionError(null);
    const res = await api.getReconciliation();
    if (res.error || !res.data) setActionError(res.error || "Reconciliation failed.");
    else setRecoResult(res.data);
    setIsReconciling(false);
  };

  const handleExportTallyXml = async () => {
    setIsExportingXml(true);
    setActionError(null);
    const finalXml = await api.exportTallyXml();
    if (!finalXml) {
      setActionError("Tally XML export failed. Run the reconciliation first or retry.");
      setIsExportingXml(false);
      return;
    }

    const blob = new Blob([finalXml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TallyPrime_Purchase_Import_${new Date().toISOString().slice(0, 10)}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportingXml(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-600" />
            Returns Assembly & 38-Rule Engine (Agent GS-5)
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Deterministic GSTR-1, 1A, and 3B engine with Rule 88C/88D math, Section 17(5) reversal, and TallyPrime XML bridge
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportTallyXml}
            disabled={isExportingXml}
            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          >
            <Download className="w-4 h-4 mr-1 text-emerald-600" />
            {isExportingXml ? "Exporting..." : "Export Tally XML"}
          </Button>

          <Button
            onClick={handleRunReconciliation}
            disabled={isReconciling}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm"
          >
            {isReconciling ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Running Reco...
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4 mr-1.5" /> Run 2B & IMS Reco
              </>
            )}
          </Button>

        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Live Reconciliation Results Section */}
      {recoResult && (
        <Card className="bg-white border-2 border-indigo-200 shadow-sm">
          <CardHeader className="py-3 px-5 bg-indigo-50/60 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-indigo-950 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                Live Deterministic Reconciliation Output
              </CardTitle>
              <p className="text-xs text-indigo-700 mt-0.5">
                Evaluated across Books vs GSTR-2B feed. Zero LLM calculation. All rules verified against CGST Rules 88C/88D & Sec 17(5).
              </p>
            </div>
            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300">
              {recoResult.summary.total_books_records} books / {recoResult.summary.total_gstr2b_records} 2B records
            </Badge>
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            {/* 4 Summary Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50 border rounded-lg">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Exact 2B Matches</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{recoResult.exact_matches.length} Vouchers</div>
                <div className="text-xs text-emerald-600 font-semibold mt-0.5">Ready for Table 4(A)(5)</div>
              </div>

              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg">
                <div className="text-[11px] font-semibold text-amber-700 uppercase">Value Mismatch (88D)</div>
                <div className="text-xl font-bold text-amber-900 mt-1">{recoResult.value_mismatches.length} Vouchers</div>
                <div className="text-xs text-amber-700 font-semibold mt-0.5">Difference capped automatically</div>
              </div>

              <div className="p-3 bg-rose-50/60 border border-rose-200 rounded-lg">
                <div className="text-[11px] font-semibold text-rose-700 uppercase">Sec 17(5) Blocked</div>
                <div className="text-xl font-bold text-rose-900 mt-1">{formatIndianCurrency(recoResult.summary.blocked_itc_17_5)}</div>
                <div className="text-xs text-rose-700 font-semibold mt-0.5">Reversed in Table 4(B)(1)</div>
              </div>

              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                <div className="text-[11px] font-semibold text-emerald-700 uppercase">Net Eligible ITC</div>
                <div className="text-xl font-bold text-emerald-900 mt-1">{formatIndianCurrency(recoResult.summary.eligible_itc)}</div>
                <div className="text-xs text-emerald-700 font-semibold mt-0.5">Table 4(C) Claim Value</div>
              </div>
            </div>

            {/* GSTR-3B Table 4 Computed Breakdown */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-4 py-2 text-xs font-bold text-slate-800 uppercase tracking-wide border-b">
                GSTR-3B Table 4 Auto-Computed Tax Payload
              </div>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 border-b">
                  <tr>
                    <th className="p-2.5">Table 4 Line Item</th>
                    <th className="p-2.5 text-right">IGST (₹)</th>
                    <th className="p-2.5 text-right">CGST (₹)</th>
                    <th className="p-2.5 text-right">SGST (₹)</th>
                    <th className="p-2.5 text-right font-bold">Total ITC (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-800 font-medium">
                  <tr>
                    <td className="p-2.5 font-semibold text-slate-900">4(A)(5) All other ITC (Inward from 2B)</td>
                    <td className="p-2.5 text-right">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_A_5_all_other_itc.igst)}</td>
                    <td className="p-2.5 text-right">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_A_5_all_other_itc.cgst)}</td>
                    <td className="p-2.5 text-right">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_A_5_all_other_itc.sgst)}</td>
                    <td className="p-2.5 text-right font-bold text-indigo-900">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_A_5_all_other_itc.total)}</td>
                  </tr>
                  <tr className="bg-rose-50/40 text-rose-900">
                    <td className="p-2.5 font-semibold">4(B)(1) Ineligible ITC Reversal (Rule 38/42/43 & Sec 17(5))</td>
                    <td className="p-2.5 text-right">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_B_1_as_per_rule_38_42_43_and_17_5.igst)}</td>
                    <td className="p-2.5 text-right">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_B_1_as_per_rule_38_42_43_and_17_5.cgst)}</td>
                    <td className="p-2.5 text-right">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_B_1_as_per_rule_38_42_43_and_17_5.sgst)}</td>
                    <td className="p-2.5 text-right font-bold text-rose-800">-{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_B_1_as_per_rule_38_42_43_and_17_5.total)}</td>
                  </tr>
                  <tr className="bg-emerald-50/70 text-emerald-950 font-bold border-t-2 border-emerald-300">
                    <td className="p-2.5">4(C) Net ITC Available (4A - 4B)</td>
                    <td className="p-2.5 text-right">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_C_net_itc_available.igst)}</td>
                    <td className="p-2.5 text-right">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_C_net_itc_available.cgst)}</td>
                    <td className="p-2.5 text-right">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_C_net_itc_available.sgst)}</td>
                    <td className="p-2.5 text-right font-extrabold text-emerald-800">{formatIndianCurrency(recoResult.gstr_3b_table4.table_4_C_net_itc_available.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Exceptions & Mismatches */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-amber-50/40 border border-amber-200 rounded-md">
                <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Missing in 2B Feed (Vendor Default Risk): {recoResult.missing_in_2b.length} Invoices
                </div>
                <div className="text-xs text-amber-800">
                  Total Tax at Risk: {formatIndianCurrency(recoResult.summary.missing_in_2b)}. Automated notice draft queued for Gate G4.
                </div>
              </div>

              <div className="p-3 bg-blue-50/40 border border-blue-200 rounded-md">
                <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5 mb-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                  Unclaimed in Books (Available in 2B): {recoResult.unclaimed_in_books.length} Invoices
                </div>
                <div className="text-xs text-blue-800">
                  Total Tax {formatIndianCurrency(recoResult.summary.unclaimed_in_books)}. Tally XML payload generated for one-click import into client books.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Returns Pipeline Table */}
      <Card className="bg-white">
        <CardHeader className="py-3.5 px-5 border-b bg-slate-50">
          <CardTitle className="text-sm text-slate-900">Active Return Obligations & Gate Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 uppercase border-b">
              <tr>
                <th className="p-3.5">Client / GSTIN</th>
                <th className="p-3.5">Return / Period</th>
                <th className="p-3.5 text-right">Outward Tax</th>
                <th className="p-3.5 text-right">2B ITC Claimed</th>
                <th className="p-3.5 text-right">Net Cash Payable</th>
                <th className="p-3.5">38 Rule Engine</th>
                <th className="p-3.5 w-48">Pipeline Stage</th>
                <th className="p-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500">Loading returns...</td></tr>
              )}
              {!loading && loadError && (
                <tr><td colSpan={8} className="p-8 text-center text-red-700">
                  {loadError}
                  <button onClick={fetchReturns} className="underline font-semibold ml-2">Retry</button>
                </td></tr>
              )}
              {!loading && !loadError && returnsList.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500">No return obligations found.</td></tr>
              )}
              {returnsList.map((ret) => (
                <tr key={ret.id} className="hover:bg-slate-50">
                  <td className="p-3.5">
                    <div className="font-bold text-slate-900">{ret.client}</div>
                    <div className="font-mono text-slate-500">{ret.gstin}</div>
                  </td>
                  <td className="p-3.5">
                    <Badge className="bg-blue-100 text-blue-800 border border-blue-200">{ret.type}</Badge>
                    <div className="text-slate-500 mt-1">{ret.period}</div>
                  </td>
                  <td className="p-3.5 text-right font-semibold text-slate-900">
                    {formatIndianCurrency(ret.taxableLiability)}
                  </td>
                  <td className="p-3.5 text-right font-semibold text-emerald-700">
                    {formatIndianCurrency(ret.itcClaimed)}
                  </td>
                  <td className="p-3.5 text-right font-bold text-slate-900">
                    {formatIndianCurrency(ret.netPayable)}
                  </td>
                  <td className="p-3.5">
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" /> {ret.rulesPassed}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <div className="text-slate-800 font-semibold mb-1 flex items-center gap-1">
                      {ret.progress === 100 ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                      )}
                      {ret.stage}
                    </div>
                    <Progress value={ret.progress} className="h-2" />
                  </td>
                  <td className="p-3.5 text-center">
                    <Link href="/gates">
                      <Button variant="outline" size="sm" className="text-slate-900 font-semibold">
                        <Eye className="w-3.5 h-3.5 mr-1" /> Open Gates
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
