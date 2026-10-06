"use client";

import { use, useState } from "react";
import { demoGates } from "@/lib/demo-data";
import { EvidenceViewer } from "@/components/gates/evidence-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getGateColor } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Check, X, ShieldAlert, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useRouter } from "next/navigation";

export default function GateApprovalPage({ params }: { params: Promise<{ gateId: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const gateId = unwrappedParams.gateId;
  const gate = demoGates.find(g => g.id === gateId) || demoGates[0];
  
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject" | "escalate" | null>(null);

  const handleAction = (type: "approve" | "reject" | "escalate") => {
    setActionType(type);
    setConfirmOpen(true);
  };

  const submitAction = () => {
    // In real app, call API here
    setConfirmOpen(false);
    setTimeout(() => {
      router.push("/gates");
    }, 500);
  };

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center gap-4 mb-4">
        <Link href="/gates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <span className={cn("px-2 py-1 text-xs font-bold rounded-md", getGateColor(gate.type))}>
              {gate.type}
            </span>
            <h1 className="text-xl font-bold text-slate-900">{gate.name}</h1>
            <span className="text-sm font-medium text-slate-500">| {gate.id}</span>
          </div>
          <p className="text-sm text-slate-600 mt-1">{gate.client}</p>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-hidden pb-4">
        {/* Left Panel: Evidence Pack (60%) */}
        <div className="w-[60%] flex flex-col h-full bg-white rounded-lg border shadow-sm p-6 overflow-auto">
          <EvidenceViewer gateType={gate.type} />
        </div>

        {/* Right Panel: Decision Form (40%) */}
        <div className="w-[40%] flex flex-col gap-4">
          <Card className="flex-1 flex flex-col">
            <div className="p-4 border-b bg-slate-50">
              <h2 className="font-semibold text-slate-900">Decision Form</h2>
            </div>
            <CardContent className="p-6 flex-1 flex flex-col">
              <div className="space-y-4 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-1">Gate Context</h3>
                  <p className="text-sm text-slate-600">{gate.description}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded border">
                    <span className="block text-xs text-slate-500 mb-1">Tier Level</span>
                    <span className="font-semibold">{gate.tier}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded border">
                    <span className="block text-xs text-slate-500 mb-1">SLA Remaining</span>
                    <span className={cn("font-semibold", gate.urgent ? "text-red-600" : "")}>
                      {gate.slaRemaining} hours
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Reviewer Notes <span className={actionType === 'reject' ? "text-red-500" : "text-slate-400"}>*</span>
                </label>
                <textarea 
                  className="w-full flex-1 border rounded-md p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Enter reasoning for your decision (mandatory for rejections)..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {gate.tier === 'L3' && (
                <div className="mt-4 bg-amber-50 border border-amber-200 p-3 rounded-md flex gap-3">
                  <input type="checkbox" id="legal" className="mt-1" />
                  <label htmlFor="legal" className="text-xs text-amber-900">
                    I have reviewed the evidence pack and assume professional responsibility for this authorization.
                  </label>
                </div>
              )}
            </CardContent>
            
            <div className="p-4 border-t bg-slate-50 grid grid-cols-3 gap-3">
              <Button 
                variant="outline" 
                className="text-purple-700 hover:text-purple-800 hover:bg-purple-50 border-purple-200"
                onClick={() => handleAction("escalate")}
              >
                <ShieldAlert className="w-4 h-4 mr-2" /> Escalate
              </Button>
              <Button 
                variant="destructive"
                onClick={() => handleAction("reject")}
              >
                <X className="w-4 h-4 mr-2" /> Reject
              </Button>
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleAction("approve")}
              >
                <Check className="w-4 h-4 mr-2" /> Approve
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Decision">
        <div className="space-y-4">
          <p className="text-slate-700">
            You are about to <strong className={
              actionType === 'approve' ? 'text-emerald-600' :
              actionType === 'reject' ? 'text-red-600' : 'text-purple-600'
            }>{actionType?.toUpperCase()}</strong> gate {gate.id}.
          </p>
          
          {actionType === 'reject' && note.length < 10 && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Please provide detailed notes (at least 10 characters) explaining the rejection.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button 
              className={
                actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' :
                actionType === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
              }
              onClick={submitAction}
              disabled={actionType === 'reject' && note.length < 10}
            >
              Confirm {actionType}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
