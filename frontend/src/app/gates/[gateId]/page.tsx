"use client";

import { use, useState } from "react";
import { demoGates } from "@/lib/demo-data";
import { EvidenceViewer } from "@/components/gates/evidence-viewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getGateColor, cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, ShieldAlert, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useRouter } from "next/navigation";

export default function GateApprovalPage({ params }: { params: Promise<{ gateId: string }> }) {
  const router = useRouter();
  const unwrappedParams = use(params);
  const gateId = unwrappedParams.gateId;
  const gate = demoGates.find(g => g.id === gateId) || demoGates[0];
  
  const [note, setNote] = useState("");
  const [legalChecked, setLegalChecked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject" | "escalate" | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<"pending" | "approved" | "rejected" | "escalated">(gate.status);

  const handleAction = (type: "approve" | "reject" | "escalate") => {
    setActionType(type);
    setConfirmOpen(true);
  };

  const submitAction = () => {
    if (actionType === "approve") setDecisionStatus("approved");
    if (actionType === "reject") setDecisionStatus("rejected");
    if (actionType === "escalate") setDecisionStatus("escalated");
    setConfirmOpen(false);
  };

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <Link href="/gates">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5 text-slate-900" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <span className={cn("px-2.5 py-1 text-xs font-bold rounded-md", getGateColor(gate.type))}>
                {gate.type}
              </span>
              <h1 className="text-xl font-bold text-slate-900">{gate.name}</h1>
              <span className="text-sm font-medium text-slate-500">| {gate.id}</span>
            </div>
            <p className="text-sm text-slate-600 mt-0.5">{gate.client}</p>
          </div>
        </div>

        {/* Status Banner */}
        <div className="flex items-center gap-2">
          {decisionStatus === "approved" && (
            <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-300 text-emerald-800 px-4 py-2 rounded-lg font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              GATE ACCEPTED & LOGGED TO WORM LEDGER
            </div>
          )}
          {decisionStatus === "rejected" && (
            <div className="flex items-center gap-2 bg-red-100 border border-red-300 text-red-800 px-4 py-2 rounded-lg font-bold text-sm">
              <XCircle className="w-5 h-5 text-red-600" />
              GATE REJECTED — RETURNED TO PREPARER
            </div>
          )}
          {decisionStatus === "escalated" && (
            <div className="flex items-center gap-2 bg-purple-100 border border-purple-300 text-purple-800 px-4 py-2 rounded-lg font-bold text-sm">
              <ShieldAlert className="w-5 h-5 text-purple-600" />
              ESCALATED TO SIGNING PARTNER
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden pb-4">
        {/* Left Panel: Evidence Pack (60%) */}
        <div className="w-full lg:w-[60%] flex flex-col h-full bg-white rounded-lg border shadow-sm p-6 overflow-auto">
          <EvidenceViewer gateType={gate.type} />
        </div>

        {/* Right Panel: Decision & Review/Suggestion Form (40%) */}
        <div className="w-full lg:w-[40%] flex flex-col gap-4">
          <Card className="flex-1 flex flex-col bg-white">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Human Gate Decision & Review Box</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                Tier {gate.tier} Authority
              </span>
            </div>
            <CardContent className="p-6 flex-1 flex flex-col">
              <div className="space-y-4 mb-5">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Gate Scope & Stopping Reason</h3>
                  <p className="text-sm text-slate-800 bg-slate-50 p-3 rounded border border-slate-200">{gate.description}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded border border-slate-200">
                    <span className="block text-xs text-slate-500 mb-1">Assigned Actor</span>
                    <span className="font-semibold text-slate-900 text-sm">{gate.assignedTo}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded border border-slate-200">
                    <span className="block text-xs text-slate-500 mb-1">SLA Remaining</span>
                    <span className={cn("font-semibold text-sm", gate.urgent ? "text-red-600" : "text-slate-900")}>
                      {gate.slaRemaining} hours
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <label className="block text-sm font-semibold text-slate-900 mb-2">
                  Reviewer Notes / Suggestions <span className="text-red-600">*</span>
                </label>
                <textarea 
                  className="w-full flex-1 min-h-[130px] border-2 border-slate-300 rounded-md p-3 text-sm text-slate-950 font-medium bg-white placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Type your review comments, adjustments, or rejection reasons here (text in black for high contrast)..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNote("Verified against GSTR-2B & original tax invoice. Approved for ITC claim.")}
                    className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded font-medium transition-colors"
                  >
                    + Quick Fill: Verified & Approved
                  </button>
                  <button
                    type="button"
                    onClick={() => setNote("Rejected due to GSTIN mismatch / Section 17(5) blocked credit exposure.")}
                    className="text-xs bg-red-50 hover:bg-red-100 text-red-800 border border-red-200 px-2.5 py-1 rounded font-medium transition-colors"
                  >
                    + Quick Fill: Reject Mismatch
                  </button>
                </div>
              </div>

              {gate.tier === 'L3' && (
                <div className="mt-4 bg-amber-50 border border-amber-300 p-3 rounded-md flex gap-3 items-start">
                  <input
                    type="checkbox"
                    id="legal"
                    checked={legalChecked}
                    onChange={(e) => setLegalChecked(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-emerald-600 cursor-pointer"
                  />
                  <label htmlFor="legal" className="text-xs text-amber-950 font-medium cursor-pointer">
                    I have personally examined the evidence pack and accept professional attestation responsibility under ICAI guidelines.
                  </label>
                </div>
              )}
            </CardContent>
            
            <div className="p-4 border-t bg-slate-50 grid grid-cols-3 gap-3">
              <Button 
                variant="outline" 
                className="text-purple-700 hover:text-purple-900 hover:bg-purple-100 border-purple-300 font-semibold"
                onClick={() => handleAction("escalate")}
              >
                <ShieldAlert className="w-4 h-4 mr-1.5 text-purple-600" /> Escalate
              </Button>
              <Button 
                onClick={() => handleAction("reject")}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold shadow-sm"
              >
                <XCircle className="w-4 h-4 mr-1.5 text-white" /> Reject
              </Button>
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
                onClick={() => handleAction("approve")}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5 text-white" /> Accept / Approve
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Gate Decision">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-slate-50">
            {actionType === 'approve' && <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />}
            {actionType === 'reject' && <XCircle className="w-8 h-8 text-red-600 shrink-0" />}
            {actionType === 'escalate' && <ShieldAlert className="w-8 h-8 text-purple-600 shrink-0" />}
            <p className="text-slate-900 text-sm">
              You are about to <strong className={
                actionType === 'approve' ? 'text-emerald-700' :
                actionType === 'reject' ? 'text-red-700' : 'text-purple-700'
              }>{actionType === 'approve' ? 'ACCEPT & APPROVE' : actionType?.toUpperCase()}</strong> gate <strong>{gate.id}</strong> for <strong>{gate.client}</strong>.
            </p>
          </div>
          
          {note && (
            <div className="p-3 bg-slate-100 rounded border text-xs text-slate-900">
              <span className="font-bold block mb-1 text-slate-700">Recorded Reviewer Note:</span>
              &ldquo;{note}&rdquo;
            </div>
          )}

          {actionType === 'reject' && note.trim().length < 5 && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-xs font-medium flex gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              Please enter a brief rejection note (or click the Quick Fill button) before rejecting.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="text-slate-900">Cancel</Button>
            <Button 
              className={cn(
                "text-white font-semibold",
                actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' :
                actionType === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
              )}
              onClick={submitAction}
              disabled={actionType === 'reject' && note.trim().length < 5}
            >
              {actionType === 'approve' && <CheckCircle2 className="w-4 h-4 mr-1.5" />}
              {actionType === 'reject' && <XCircle className="w-4 h-4 mr-1.5" />}
              Confirm {actionType === 'approve' ? 'Accept' : actionType}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
