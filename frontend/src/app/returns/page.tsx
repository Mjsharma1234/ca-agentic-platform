"use client";

import { useState } from "react";
import { demoClients } from "@/lib/demo-data";
import { formatIndianCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Briefcase, Plus, CheckCircle2, Clock, ShieldCheck, Eye, Loader2 } from "lucide-react";
import Link from "next/link";

interface ReturnItem {
  id: string;
  client: string;
  gstin: string;
  type: "GSTR-1" | "GSTR-3B" | "GSTR-1A";
  period: string;
  taxableLiability: number;
  itcClaimed: number;
  netPayable: number;
  stage: string;
  progress: number;
  rulesPassed: string;
  gateLink: string;
}

const initialReturns: ReturnItem[] = [
  {
    id: "RET-201",
    client: "Rajesh Textiles Pvt Ltd",
    gstin: "27AAACR1234F1Z5",
    type: "GSTR-3B",
    period: "Oct 2026",
    taxableLiability: 845000,
    itcClaimed: 612000,
    netPayable: 233000,
    stage: "Gate G6 Four-Eyes Review",
    progress: 75,
    rulesPassed: "37 / 38 Passed (1 Warning)",
    gateLink: "/gates/G6-9845"
  },
  {
    id: "RET-202",
    client: "Mumbai Steel Corporation",
    gstin: "27BBBCM5678G1Z2",
    type: "GSTR-3B",
    period: "Oct 2026",
    taxableLiability: 2450000,
    itcClaimed: 1980000,
    netPayable: 470000,
    stage: "Gate G3 IMS Commit Pending",
    progress: 50,
    rulesPassed: "38 / 38 Passed",
    gateLink: "/gates/G3-9843"
  },
  {
    id: "RET-203",
    client: "Sharma & Sons Logistics",
    gstin: "07DDDSA3456J1Z1",
    type: "GSTR-1",
    period: "Oct 2026",
    taxableLiability: 510000,
    itcClaimed: 0,
    netPayable: 510000,
    stage: "Gate G7 Partner DSC Signing",
    progress: 90,
    rulesPassed: "38 / 38 Passed",
    gateLink: "/gates/G7-9846"
  },
  {
    id: "RET-204",
    client: "Global Tech Solutions LLP",
    gstin: "29CCCGT9012H1Z8",
    type: "GSTR-3B",
    period: "Oct 2026",
    taxableLiability: 690000,
    itcClaimed: 645000,
    netPayable: 45000,
    stage: "Filed & ARN Acknowledged",
    progress: 100,
    rulesPassed: "38 / 38 Passed",
    gateLink: "/gates/G4-9844"
  }
];

export default function ReturnsPage() {
  const [returnsList, setReturnsList] = useState<ReturnItem[]>(initialReturns);
  const [isAssembling, setIsAssembling] = useState(false);
  const [selectedClient, setSelectedClient] = useState(demoClients[4].name);

  const handleAssembleReturn = () => {
    setIsAssembling(true);
    setTimeout(() => {
      const clientObj = demoClients.find((c) => c.name === selectedClient) || demoClients[0];
      const newRet: ReturnItem = {
        id: `RET-${Math.floor(300 + Math.random() * 600)}`,
        client: clientObj.name,
        gstin: clientObj.gstin,
        type: "GSTR-3B",
        period: "Oct 2026",
        taxableLiability: 1120000,
        itcClaimed: 895000,
        netPayable: 225000,
        stage: "Gate G6 Four-Eyes Review",
        progress: 80,
        rulesPassed: "38 / 38 Passed",
        gateLink: "/gates/G6-9845"
      };
      setReturnsList((prev) => [newRet, ...prev]);
      setIsAssembling(false);
    }, 800);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-600" />
            Returns Assembly & 38-Rule Engine (Agent GS-5)
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Compile GSTN-compliant GSTR-1, 1A, and 3B payloads with deterministic 38-rule verification
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900"
          >
            {demoClients.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <Button
            onClick={handleAssembleReturn}
            disabled={isAssembling}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            {isAssembling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running 38 Rules...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" /> Assemble GSTR-3B
              </>
            )}
          </Button>
        </div>
      </div>

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
                    <Link href={ret.gateLink}>
                      <Button variant="outline" size="sm" className="text-slate-900 font-semibold">
                        <Eye className="w-3.5 h-3.5 mr-1" /> Open Gate
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
