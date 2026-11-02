"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, ShieldAlert, AlertTriangle } from "lucide-react";
import { EvidenceViewer } from "@/components/gates/evidence-viewer";
import { SigningRequestPanel } from "@/components/gates/signing-request-panel";
import { slaLabel } from "@/components/gates/gate-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ErrorState, LoadingState } from "@/components/ui/async-state";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { getGateColor, cn } from "@/lib/utils";
import type { Gate } from "@/lib/types";

type Action = "approve" | "reject" | "escalate";

export default function GateApprovalPage({ params }: { params: Promise<{ gateId: string }> }) {
  const { gateId } = use(params);
  const { data: gate, error, loading, reload, setData } = useApi(() => api.getGate(gateId), [gateId], { refreshMs: 10_000 });

  const [note, setNote] = useState("");
  const [legalChecked, setLegalChecked] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <LoadingState label="Loading gate…" />;
  if (error || !gate) return <ErrorState message={error ?? "Gate not found."} onRetry={reload} />;

  const open = gate.status === "pending" || gate.status === "escalated";
  const isSigning = gate.gate_id === "G7";
  const needsReason = action === "reject" || action === "escalate";
  const reasonTooShort = needsReason && note.trim().length < 3;
  const attestationMissing = gate.tier === "L3" && action === "approve" && !legalChecked;

  const submit = async () => {
    if (!action) return;
    setSubmitting(true);
    setActionError(null);
    const call =
      action === "approve" ? api.approveGate(gate.id, note) : action === "reject" ? api.rejectGate(gate.id, note) : api.escalateGate(gate.id, note);
    const res = await call;
    setSubmitting(false);
    if (res.error || !res.data) {
      setActionError(res.error ?? "The decision could not be recorded.");
      return;
    }
    setData(res.data as Gate);
    setAction(null);
    setNote("");
  };

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <Link href="/gates" aria-label="Back to gates">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5 text-slate-900" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <span className={cn("px-2.5 py-1 text-xs font-bold rounded-md", getGateColor(gate.gate_id))}>{gate.gate_id}</span>
              <h1 className="text-xl font-bold text-slate-900">{gate.name}</h1>
            </div>
            <p className="text-sm text-slate-600 mt-0.5">{gate.client}</p>
          </div>
        </div>

        {gate.status === "approved" && (
          <div className="flex items-center gap-2 bg-emerald-100 border border-emerald-300 text-emerald-800 px-4 py-2 rounded-lg font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" /> APPROVED &amp; SEALED IN AUDIT CHAIN
          </div>
        )}
        {gate.status === "rejected" && (
          <div className="flex items-center gap-2 bg-red-100 border border-red-300 text-red-800 px-4 py-2 rounded-lg font-bold text-sm">
            <XCircle className="w-5 h-5 text-red-600" /> REJECTED — RETURNED TO PREPARER
          </div>
        )}
        {gate.status === "escalated" && (
          <div className="flex items-center gap-2 bg-purple-100 border border-purple-300 text-purple-800 px-4 py-2 rounded-lg font-bold text-sm">
            <ShieldAlert className="w-5 h-5 text-purple-600" /> ESCALATED
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden pb-4">
        <div className="w-full lg:w-[60%] flex flex-col h-full bg-white rounded-lg border shadow-sm p-6 overflow-auto">
          <EvidenceViewer gate={gate} />
        </div>

        <div className="w-full lg:w-[40%] flex flex-col gap-4 overflow-auto">
          {isSigning && open && <SigningRequestPanel gate={gate} onSigned={reload} />}

          <Card className="flex flex-col bg-white">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Gate Decision</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                Tier {gate.tier} · needs {gate.required_role.toLowerCase()}
              </span>
            </div>
            <CardContent className="p-6 flex flex-col">
              <div className="space-y-4 mb-5">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Why this gate stopped</h3>
                  <p className="text-sm text-slate-800 bg-slate-50 p-3 rounded border border-slate-200">{gate.description}</p>
                </div>
                {open && (
                  <div className="bg-slate-50 p-3 rounded border border-slate-200">
                    <span className="block text-xs text-slate-500 mb-1">SLA</span>
                    <span className={cn("font-semibold text-sm", gate.urgent ? "text-red-600" : "text-slate-900")}>{slaLabel(gate)}</span>
                  </div>
                )}
                {!open && gate.notes && (
                  <div className="bg-slate-50 p-3 rounded border border-slate-200 text-sm text-slate-800">
                    <span className="block text-xs text-slate-500 mb-1">Recorded note</span>
                    {gate.notes}
                  </div>
                )}
              </div>

              {open && (
                <>
                  <label htmlFor="note" className="block text-sm font-semibold text-slate-900 mb-2">
                    Reviewer notes {gate.status === "pending" && <span className="text-slate-500 font-normal">(required to reject or escalate)</span>}
                  </label>
                  <textarea
                    id="note"
                    maxLength={2000}
                    className="w-full min-h-[110px] border-2 border-slate-300 rounded-md p-3 text-sm text-slate-950 font-medium bg-white placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                    placeholder="Record what you checked and why you are deciding this way…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  {gate.tier === "L3" && (
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
                </>
              )}
            </CardContent>

            {open && (
              <div className="p-4 border-t bg-slate-50 grid grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  className="text-purple-700 hover:bg-purple-100 border-purple-300 font-semibold"
                  disabled={gate.status !== "pending"}
                  onClick={() => setAction("escalate")}
                >
                  <ShieldAlert className="w-4 h-4 mr-1.5" /> Escalate
                </Button>
                <Button className="bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => setAction("reject")}>
                  <XCircle className="w-4 h-4 mr-1.5" /> Reject
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" onClick={() => setAction("approve")}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal isOpen={action !== null} onClose={() => !submitting && setAction(null)} title="Confirm Gate Decision">
        <div className="space-y-4">
          <p className="text-slate-900 text-sm">
            You are about to <strong>{action?.toUpperCase()}</strong> gate <strong>{gate.gate_id}</strong> for <strong>{gate.client}</strong>. This
            is recorded permanently in the firm&apos;s audit chain under your name.
          </p>
          {note && <p className="p-3 bg-slate-100 rounded border text-xs text-slate-900">&ldquo;{note}&rdquo;</p>}
          {(reasonTooShort || attestationMissing) && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-xs font-medium flex gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              {reasonTooShort ? "Enter a reason before continuing." : "Tick the attestation before approving a Partner-tier gate."}
            </div>
          )}
          {actionError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {actionError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setAction(null)} disabled={submitting} className="text-slate-900">
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting || reasonTooShort || attestationMissing} className="bg-slate-900 text-white">
              {submitting ? "Recording…" : `Confirm ${action}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
