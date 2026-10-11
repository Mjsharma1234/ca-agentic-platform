"use client";

import { useState } from "react";
import { DeltaTable } from "@/components/evidence/delta-table";
import { VendorRiskGauge } from "@/components/gates/vendor-risk-gauge";
import { RuleCheckResults } from "@/components/gates/rule-check-results";
import { DscSigningCeremony } from "@/components/gates/dsc-signing-ceremony";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgingChart } from "@/components/evidence/aging-chart";
import { AlertCircle, CheckCircle2, XCircle, Clock, FileCheck, ShieldAlert } from "lucide-react";

interface EvidenceViewerProps {
  gateType: string;
}

const initialImsInvoices = [
  { id: 'IMS-1', invNo: 'JSW/26-27/1042', date: '03/10/2026', vendor: 'JSW Steel Coated Products Ltd', gstin: '27AAACJ4321M1Z2', taxable: 850000, tax: 153000, riskScore: 92, poMatch: '100% Matched', action: 'ACCEPT' as 'ACCEPT' | 'REJECT' | 'HOLD' },
  { id: 'IMS-2', invNo: 'SHV-2026-412', date: '05/10/2026', vendor: 'Shree Ganesh Dyeing Works', gstin: '24AABCS9821E1Z1', taxable: 150000, tax: 27000, riskScore: 41, poMatch: 'Rate Variance', action: 'HOLD' as 'ACCEPT' | 'REJECT' | 'HOLD' },
  { id: 'IMS-3', invNo: 'FAKE/9910/26', date: '06/10/2026', vendor: 'Sunrise Traders (Suspended GSTIN)', gstin: '27AABCS1111F1Z0', taxable: 210000, tax: 37800, riskScore: 14, poMatch: 'No PO Found', action: 'REJECT' as 'ACCEPT' | 'REJECT' | 'HOLD' },
  { id: 'IMS-4', invNo: 'RPL/26-27/08821', date: '04/10/2026', vendor: 'Reliance Polymers Ltd', gstin: '27AAACR5055K1Z8', taxable: 450000, tax: 81000, riskScore: 96, poMatch: '100% Matched', action: 'ACCEPT' as 'ACCEPT' | 'REJECT' | 'HOLD' },
];

export function EvidenceViewer({ gateType }: EvidenceViewerProps) {
  const [imsInvoices, setImsInvoices] = useState(initialImsInvoices);
  const [ocrFields, setOcrFields] = useState({
    invNo: "SHV-2026-412",
    invDate: "05/10/2026",
    gstin: "24AABCS9821E1Z1",
    taxable: "1,50,000",
    igst: "27,000",
    total: "1,77,000"
  });

  const updateImsAction = (id: string, newAction: 'ACCEPT' | 'REJECT' | 'HOLD') => {
    setImsInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, action: newAction } : inv));
  };

  if (gateType === 'G2') {
    return (
      <div className="flex flex-col h-full space-y-4">
        <div className="flex justify-between items-center border-b pb-2">
          <h2 className="text-lg font-semibold text-slate-900">Gate G2: Low-Confidence OCR Extraction Review</h2>
          <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
            Confidence: 0.86 (Threshold: 0.95)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
          {/* Simulated Scanned Tax Invoice with Bounding Boxes */}
          <Card className="h-full bg-slate-100 border-2 border-slate-300 flex flex-col justify-between p-4">
            <div className="bg-white border shadow-sm rounded p-4 text-xs text-slate-900 font-mono space-y-3">
              <div className="border-b pb-2 flex justify-between items-start">
                <div>
                  <div className="font-bold text-sm text-slate-900">SHREE GANESH DYEING WORKS</div>
                  <div className="text-slate-600">Plot 42, GIDC Pandesara, Surat, GJ</div>
                </div>
                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold">TAX INVOICE</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-1.5 border border-emerald-500 bg-emerald-50/40 rounded">
                  <span className="text-[10px] text-slate-500 block">Invoice No (Conf: 0.99)</span>
                  <span className="font-bold text-slate-900">{ocrFields.invNo}</span>
                </div>
                <div className="p-1.5 border border-emerald-500 bg-emerald-50/40 rounded">
                  <span className="text-[10px] text-slate-500 block">Date (Conf: 0.98)</span>
                  <span className="font-bold text-slate-900">{ocrFields.invDate}</span>
                </div>
              </div>

              <div className="p-2 border-2 border-red-500 bg-red-50/60 rounded relative">
                <span className="absolute -top-2 right-2 bg-red-600 text-white text-[9px] px-1.5 py-0.2 rounded font-bold">
                  LOW CONFIDENCE: 0.86 (Smudged Ink)
                </span>
                <span className="text-[10px] text-red-700 block font-semibold">Supplier GSTIN Bounding Box:</span>
                <span className="font-bold text-sm tracking-wider text-slate-900">{ocrFields.gstin}</span>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-[11px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border p-1 text-left text-slate-800">HSN / Description</th>
                    <th className="border p-1 text-right text-slate-800">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border p-1 text-slate-900">5407 - Polyester Grey Fabric Dyeing</td>
                    <td className="border p-1 text-right font-bold text-slate-900">{ocrFields.taxable}</td>
                  </tr>
                  <tr>
                    <td className="border p-1 text-slate-900">IGST @ 18%</td>
                    <td className="border p-1 text-right font-bold text-slate-900">{ocrFields.igst}</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="border p-1 text-slate-900">Total Invoice Value</td>
                    <td className="border p-1 text-right text-emerald-700">₹{ocrFields.total}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-xs text-slate-600 flex items-center justify-between pt-2">
              <span>Source: WhatsApp Business API (WABA Photo)</span>
              <span className="text-emerald-700 font-semibold">✓ 150 DPI Normalized</span>
            </div>
          </Card>

          {/* Editable Extracted Fields Table */}
          <Card>
            <CardHeader className="py-3 px-4 border-b bg-slate-50">
              <CardTitle className="text-sm text-slate-900">Extracted Fields (Click to Correct)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700 font-medium w-2/5">Invoice Number</td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={ocrFields.invNo}
                        onChange={(e) => setOcrFields({ ...ocrFields, invNo: e.target.value })}
                        className="border border-slate-300 rounded px-2.5 py-1.5 w-full text-slate-900 bg-white font-medium"
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700 font-medium">Invoice Date</td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={ocrFields.invDate}
                        onChange={(e) => setOcrFields({ ...ocrFields, invDate: e.target.value })}
                        className="border border-slate-300 rounded px-2.5 py-1.5 w-full text-slate-900 bg-white font-medium"
                      />
                    </td>
                  </tr>
                  <tr className="border-b bg-amber-50">
                    <td className="p-3 text-slate-900 font-semibold flex items-center gap-2">
                      Supplier GSTIN
                      <span className="px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded font-bold">86%</span>
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={ocrFields.gstin}
                        onChange={(e) => setOcrFields({ ...ocrFields, gstin: e.target.value })}
                        className="border-2 border-amber-500 rounded px-2.5 py-1.5 w-full text-slate-900 bg-white font-mono font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700 font-medium">Taxable Value (₹)</td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={ocrFields.taxable}
                        onChange={(e) => setOcrFields({ ...ocrFields, taxable: e.target.value })}
                        className="border border-slate-300 rounded px-2.5 py-1.5 w-full text-slate-900 bg-white font-medium"
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-slate-700 font-medium">IGST @ 18% (₹)</td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={ocrFields.igst}
                        onChange={(e) => setOcrFields({ ...ocrFields, igst: e.target.value })}
                        className="border border-slate-300 rounded px-2.5 py-1.5 w-full text-slate-900 bg-white font-medium"
                      />
                    </td>
                  </tr>
                  <tr className="bg-emerald-50">
                    <td className="p-3 text-emerald-800 font-bold text-xs uppercase" colSpan={2}>
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Deterministic Arithmetic Checksum Verified: ₹1,50,000 + ₹27,000 = ₹1,77,000
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (gateType === 'G3') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center border-b pb-2">
          <h2 className="text-lg font-semibold text-slate-900">Gate G3: IMS Inward Invoice Triage & Commit</h2>
          <span className="text-xs font-semibold bg-blue-100 text-blue-800 px-2.5 py-1 rounded">
            Law 4: Client Proposes, Firm Commits
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="py-3 border-b bg-slate-50">
              <CardTitle className="text-sm text-slate-900">Portfolio Supplier Risk Profile</CardTitle>
            </CardHeader>
            <CardContent className="p-5 flex flex-col items-center">
              <VendorRiskGauge score={78} />
              <div className="mt-4 w-full space-y-2 text-sm">
                <div className="flex justify-between items-center pb-1.5 border-b">
                  <span className="text-slate-600">GSTR-1 / 3B Filing Consistency</span>
                  <span className="font-semibold text-emerald-700">94% On-Time</span>
                </div>
                <div className="flex justify-between items-center pb-1.5 border-b">
                  <span className="text-slate-600">Suspended GSTIN Alert</span>
                  <span className="font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs">1 Vendor Flagged</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Net Eligible ITC to Commit</span>
                  <span className="font-bold text-emerald-700">₹2,34,000</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 border-b bg-slate-50">
              <CardTitle className="text-sm text-slate-900">GS-2 Agent Triage Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                  <div className="text-lg font-bold text-emerald-700">
                    {imsInvoices.filter(i => i.action === 'ACCEPT').length}
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-800">ACCEPT</div>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <Clock className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                  <div className="text-lg font-bold text-amber-700">
                    {imsInvoices.filter(i => i.action === 'HOLD').length}
                  </div>
                  <div className="text-[11px] font-semibold text-amber-800">PEND / HOLD</div>
                </div>
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
                  <XCircle className="w-5 h-5 text-red-600 mx-auto mb-1" />
                  <div className="text-lg font-bold text-red-700">
                    {imsInvoices.filter(i => i.action === 'REJECT').length}
                  </div>
                  <div className="text-[11px] font-semibold text-red-800">REJECT</div>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                <h4 className="text-xs font-bold text-slate-700 uppercase mb-1">Agent Reasoning (GS-2)</h4>
                <p className="text-xs text-slate-700 leading-relaxed">
                  • <strong>2 invoices Accepted:</strong> 100% 3-way PO + E-Way Bill match.<br />
                  • <strong>1 invoice Held:</strong> Rate discrepancy vs PO; keeps ITC alive for next cycle.<br />
                  • <strong>1 invoice Rejected:</strong> Vendor GSTIN <code className="text-red-600 font-bold">27AABCS1111F1Z0</code> suspended retroactively by CBIC.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Interactive Per-Invoice Accept / Reject Table */}
        <Card>
          <CardHeader className="py-3 px-4 border-b bg-slate-50">
            <CardTitle className="text-sm text-slate-900">IMS Inward Invoices — Click Green (Accept) or Red (Reject) Icons to Override</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 uppercase border-b">
                <tr>
                  <th className="p-3">Invoice / Date</th>
                  <th className="p-3">Supplier & GSTIN</th>
                  <th className="p-3 text-right">ITC Tax (₹)</th>
                  <th className="p-3 text-center">Risk Score</th>
                  <th className="p-3 text-center">Selected Status</th>
                  <th className="p-3 text-center">Accept / Reject Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {imsInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{inv.invNo}</div>
                      <div className="text-slate-500">{inv.date}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{inv.vendor}</div>
                      <div className="font-mono text-slate-500">{inv.gstin}</div>
                    </td>
                    <td className="p-3 text-right font-bold text-slate-900">
                      ₹{inv.tax.toLocaleString('en-IN')}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        inv.riskScore >= 80 ? 'bg-emerald-100 text-emerald-800' :
                        inv.riskScore >= 40 ? 'bg-amber-100 text-amber-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {inv.riskScore}/100
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {inv.action === 'ACCEPT' && (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> ACCEPT
                        </span>
                      )}
                      {inv.action === 'HOLD' && (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-bold">
                          <Clock className="w-3.5 h-3.5 text-amber-600" /> HOLD
                        </span>
                      )}
                      {inv.action === 'REJECT' && (
                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2.5 py-1 rounded-full font-bold">
                          <XCircle className="w-3.5 h-3.5 text-red-600" /> REJECT
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateImsAction(inv.id, 'ACCEPT')}
                          title="Accept Invoice"
                          className={`p-1.5 rounded-md border transition-all flex items-center gap-1 font-semibold ${
                            inv.action === 'ACCEPT'
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" /> Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => updateImsAction(inv.id, 'HOLD')}
                          title="Hold Invoice"
                          className={`p-1.5 rounded-md border transition-all flex items-center gap-1 font-semibold ${
                            inv.action === 'HOLD'
                              ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          <Clock className="w-4 h-4" /> Hold
                        </button>
                        <button
                          type="button"
                          onClick={() => updateImsAction(inv.id, 'REJECT')}
                          title="Reject Invoice"
                          className={`p-1.5 rounded-md border transition-all flex items-center gap-1 font-semibold ${
                            inv.action === 'REJECT'
                              ? 'bg-red-600 text-white border-red-700 shadow-sm'
                              : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                          }`}
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>
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

  if (gateType === 'G4') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-end border-b pb-2">
          <h2 className="text-lg font-semibold text-slate-900">Gate G4: ITC Position & GSTR-2B Reconciliation</h2>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase font-bold">Total ITC Protected</p>
            <p className="text-xl font-bold text-emerald-600">₹16,85,000</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-800 text-sm">Books vs GSTR-2B Delta (Table 4 Reconciliation)</h3>
          <DeltaTable />
        </div>
        
        <div className="space-y-4 pt-2">
          <h3 className="font-semibold text-slate-800 text-sm">Rule 37 Aging Monitor (180-Day Supplier Payment Reversal Risk)</h3>
          <AgingChart />
        </div>
      </div>
    );
  }

  if (gateType === 'G6') {
    return (
      <div className="space-y-6 h-full flex flex-col">
        <div className="flex justify-between items-center border-b pb-2">
          <h2 className="text-lg font-semibold text-slate-900">Gate G6: Four-Eyes Return Verification (38 Rules)</h2>
          <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded text-xs font-semibold flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-600" />
            PREPARER != REVIEWER VERIFIED
          </div>
        </div>
        
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-md text-sm flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p>
            <strong>Four-Eyes Statutory Control:</strong> Prepared by <em>RohanK (Article Assistant)</em>. You are signing off as Independent Reviewer <em>(CA Sneha)</em> before Partner DSC execution.
          </p>
        </div>
        
        <div className="flex-1 overflow-auto pr-2">
          <h3 className="font-semibold text-slate-800 text-sm mb-3">Stratum 1 Deterministic 38 Rule Check Report</h3>
          <RuleCheckResults />
        </div>
      </div>
    );
  }

  if (gateType === 'G7') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center border-b pb-2">
          <h2 className="text-lg font-semibold text-slate-900">Gate G7: Partner Class-3 DSC Statutory Signing</h2>
          <div className="bg-red-100 text-red-800 px-3 py-1 rounded text-xs font-bold">
            TIER L3 PARTNER ONLY
          </div>
        </div>
        
        <div className="bg-slate-900 text-emerald-400 p-4 rounded-md font-mono text-xs overflow-auto max-h-48 border border-slate-700">
          <div className="text-slate-400 mb-2">// Signed GSTN Schema Payload Preview (GSTR-3B)</div>
          <pre>{`{
  "gstin": "07DDDSA3456J1Z1",
  "ret_period": "102026",
  "sup_details": {
    "osup_det": { "txval": 4250000, "iamt": 382500, "camt": 191250, "samt": 191250 }
  },
  "itc_elg": {
    "itc_avl": [{ "ty": "OTH", "iamt": 310000, "camt": 145000, "samt": 145000 }]
  },
  "idem_hmac": "8f9d2a7c4e1b6039a5c8d2e4f1a09b8c7d6e5f4a3b2c1d0e"
}`}</pre>
        </div>
        
        <div className="text-xs text-slate-700 font-mono break-all bg-slate-100 p-2.5 border rounded">
          Payload SHA-256 Digest: 
          <span className="text-slate-900 font-bold ml-2">
            e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
          </span>
        </div>
        
        <DscSigningCeremony />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-2">
        <h2 className="text-lg font-semibold text-slate-900">Gate {gateType}: DRC-01C Rule 88D Intimation & DRC-03 Pack</h2>
        <span className="bg-red-100 text-red-800 px-3 py-1 rounded text-xs font-bold flex items-center gap-1">
          <ShieldAlert className="w-4 h-4" /> 5-DAY BUFFER SLA
        </span>
      </div>
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="bg-red-50 border border-red-200 p-4 rounded-md text-sm text-red-900">
            <strong>GSTN Automated Notice Ref:</strong> ZD3610260049120 (Rule 88D ITC Excess Claim Intimation).<br />
            Unresolved DRC-01C locks outward GSTR-1 filing after 7 days under Rule 59(6).
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-slate-50 rounded border">
              <span className="text-xs text-slate-500 block">Differential Tax Demand</span>
              <span className="text-lg font-bold text-slate-900">₹1,12,000</span>
            </div>
            <div className="p-3 bg-slate-50 rounded border">
              <span className="text-xs text-slate-500 block">Deterministic Sec 50 Interest (18% p.a.)</span>
              <span className="text-lg font-bold text-amber-700">₹2,485 (15 Days)</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900">
            <strong>GS-5 Pre-Compiled Defense Note:</strong> Difference arises solely from import IGST BOE #884920 dated 28/09/2026 appearing in Oct 2B. Part-B reply + linked DRC-03 draft ready for Partner attestation.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
