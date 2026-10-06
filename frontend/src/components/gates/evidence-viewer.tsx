import { DeltaTable } from "@/components/evidence/delta-table";
import { VendorRiskGauge } from "@/components/gates/vendor-risk-gauge";
import { RuleCheckResults } from "@/components/gates/rule-check-results";
import { DscSigningCeremony } from "@/components/gates/dsc-signing-ceremony";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgingChart } from "@/components/evidence/aging-chart";
import { AlertCircle } from "lucide-react";

interface EvidenceViewerProps {
  gateType: string;
}

export function EvidenceViewer({ gateType }: EvidenceViewerProps) {
  // Render different evidence packs based on gate type
  
  if (gateType === 'G2') {
    return (
      <div className="flex flex-col h-full space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 border-b pb-2">OCR Extraction Review</h2>
        <div className="grid grid-cols-2 gap-4 flex-1">
          <Card className="h-full bg-slate-50 border-dashed">
            <div className="h-full flex items-center justify-center text-slate-400 p-8 text-center">
              <div>
                <p className="mb-2">[Document Image Placeholder]</p>
                <p className="text-sm">Original invoice PDF rendered here</p>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader className="py-3 px-4 border-b bg-slate-50">
              <CardTitle className="text-sm">Extracted Data</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b"><td className="p-3 text-slate-500 w-1/3">Invoice No</td><td className="p-3 font-medium">INV-2023-001</td></tr>
                  <tr className="border-b"><td className="p-3 text-slate-500">Date</td><td className="p-3 font-medium">15/10/2023</td></tr>
                  <tr className="border-b bg-amber-50/50"><td className="p-3 text-slate-500 flex items-center gap-2">GSTIN <span className="w-2 h-2 rounded-full bg-amber-500" title="Low Confidence"></span></td>
                  <td className="p-3">
                    <input type="text" defaultValue="27AAACR1234F1Z5" className="border border-amber-300 rounded px-2 py-1 w-full bg-white focus:ring-2 focus:ring-amber-500 outline-none" />
                  </td></tr>
                  <tr className="border-b"><td className="p-3 text-slate-500">Taxable Val</td><td className="p-3 font-medium">₹1,50,000</td></tr>
                  <tr className="border-b"><td className="p-3 text-slate-500">IGST</td><td className="p-3 font-medium">₹27,000</td></tr>
                  <tr className="bg-emerald-50"><td className="p-3 text-emerald-700 font-medium text-xs uppercase" colSpan={2}>✓ Checksum Verified (Taxable + Tax = Total)</td></tr>
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
        <h2 className="text-lg font-semibold text-slate-900 border-b pb-2">IMS Commit Analysis</h2>
        
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardHeader className="py-3 border-b bg-slate-50">
              <CardTitle className="text-sm">Supplier Risk Profile</CardTitle>
            </CardHeader>
            <CardContent className="p-6 flex flex-col items-center">
              <VendorRiskGauge score={78} />
              <div className="mt-6 w-full space-y-3 text-sm">
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">Filing Consistency</span>
                  <span className="font-medium text-amber-600">Delayed</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-slate-500">GSTIN Status</span>
                  <span className="font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full text-xs">Active</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">PO Match</span>
                  <span className="font-medium">100% Matched</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 border-b bg-slate-50">
              <CardTitle className="text-sm">Agent Recommendation</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-center mb-6">
                <div className="inline-block bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-bold text-lg mb-2">
                  Action: ACCEPT
                </div>
                <p className="text-sm text-slate-600">Impact: ₹45,000 ITC to be claimed</p>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-md border border-slate-200">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Agent Reasoning</h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  Vendor risk score is acceptable (78/100). Invoice exactly matches PO #4992.
                  Supplier has filed GSTR-1, though historically delayed by 2-3 days. 
                  No section 17(5) block identified for these HS codes.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (gateType === 'G4') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-end border-b pb-2">
          <h2 className="text-lg font-semibold text-slate-900">ITC Position & Reconciliation</h2>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase font-bold">Total ITC at Risk</p>
            <p className="text-xl font-bold text-red-600">₹3,45,200</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <h3 className="font-medium text-slate-800 text-sm">Books vs 2B Delta (B2B)</h3>
          <DeltaTable />
        </div>
        
        <div className="space-y-4 pt-4">
          <h3 className="font-medium text-slate-800 text-sm">Rule 37 Aging (180 Days Reversal Risk)</h3>
          <AgingChart />
        </div>
      </div>
    );
  }

  if (gateType === 'G6') {
    return (
      <div className="space-y-6 h-full flex flex-col">
        <div className="flex justify-between items-center border-b pb-2">
          <h2 className="text-lg font-semibold text-slate-900">Four-Eyes Technical Review</h2>
          <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded text-xs font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            L3 GATE
          </div>
        </div>
        
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-sm flex gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>
            <strong>Warning:</strong> You are reviewing a return assembled by the agent system. Ensure you are not the same user who approved the L2 G4 gate for this client.
          </p>
        </div>
        
        <div className="flex-1 overflow-auto pr-2">
          <h3 className="font-medium text-slate-800 text-sm mb-3">Pre-Filing Rule Checks</h3>
          <RuleCheckResults />
        </div>
      </div>
    );
  }

  if (gateType === 'G7') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center border-b pb-2">
          <h2 className="text-lg font-semibold text-slate-900">Partner DSC Signing</h2>
          <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded text-xs font-semibold">
            FINAL AUTHORIZATION
          </div>
        </div>
        
        <div className="bg-slate-900 text-slate-300 p-4 rounded-md font-mono text-xs overflow-auto max-h-48 border border-slate-700">
          <div className="text-slate-500 mb-2">// Payload Preview (GSTR-1)</div>
          <pre>{`{
  "gstin": "27AAACR1234F1Z5",
  "fp": "102023",
  "gt": 15000000,
  "cur_gt": 1500000,
  "b2b": [
    {
      "ctin": "29CCCGT9012H1Z8",
      "inv": [
        {
          "inum": "INV-2023-001",
          "idt": "15-10-2023",
          "val": 177000,
          "pos": "29",
          "rchrg": "N",
          "itms": [ ... ]
        }
      ]
    }
  ]
}`}</pre>
        </div>
        
        <div className="text-xs text-slate-500 font-mono break-all bg-slate-50 p-2 border rounded">
          Payload Hash (SHA-256): 
          <span className="text-slate-900 font-bold ml-2">
            e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
          </span>
        </div>
        
        <DscSigningCeremony />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full text-slate-500">
      Evidence pack for {gateType} is not fully implemented in this demo.
    </div>
  );
}
