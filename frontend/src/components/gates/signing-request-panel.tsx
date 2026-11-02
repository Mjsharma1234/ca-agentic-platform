"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, MonitorSmartphone, Clock, XCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/async-state";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useAuth, hasRole } from "@/lib/auth-context";
import type { Gate, SigningRequestView } from "@/lib/types";

const TERMINAL = new Set(["SIGNED", "REJECTED", "EXPIRED", "FAILED"]);

function useCountdown(iso: string | undefined, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return iso ? Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000)) : 0;
}

/**
 * Gate G7 — Class-3 DSC signing happens on the partner's desktop signer, never in the browser.
 * This panel opens a signing request bound to the server-held document hash and follows its
 * status live. There is deliberately no PIN field: the PIN is typed into the native signer and
 * never reaches this page or the platform.
 */
export function SigningRequestPanel({ gate, onSigned }: { gate: Gate; onSigned?: () => void }) {
  const { user } = useAuth();
  const canRequest = hasRole(user, "MANAGER");
  const [signerId, setSignerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const prep = useApi(() => api.prepareSigning(gate.entity_type, gate.entity_id), [gate.entity_id], {});
  const requests = useApi<SigningRequestView[]>(() => api.listSigningRequests(gate.entity_id), [gate.entity_id], {
    refreshMs: 3000,
  });

  const latest = requests.data?.[0];
  const live = !!latest && !TERMINAL.has(latest.status);
  const remaining = useCountdown(latest?.expires_at, live);

  useEffect(() => {
    if (latest?.status === "SIGNED") onSigned?.();
  }, [latest?.status, onSigned]);

  const signers = prep.data?.eligible_signers ?? [];
  const defaultSigner = useMemo(
    () => signers.find((s) => s.id === user?.id)?.id ?? signers[0]?.id ?? "",
    [signers, user?.id]
  );

  const open = async () => {
    if (!prep.data) return;
    setBusy(true);
    setActionError(null);
    const res = await api.createSigningRequest({
      entity_type: prep.data.entity_type,
      entity_id: prep.data.entity_id,
      document_hash: prep.data.document_hash,
      document_label: prep.data.document_label,
      signer_id: signerId || defaultSigner,
      gate_id: gate.gate_id,
    });
    setBusy(false);
    if (res.error) setActionError(res.error);
    else requests.reload();
  };

  return (
    <div className="bg-white border rounded-lg p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-3 text-blue-800 border-b pb-4">
        <ShieldCheck className="w-6 h-6" />
        <h3 className="font-semibold text-lg">Partner DSC Signing (Desktop Signer)</h3>
      </div>

      <div className="flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
        <p>
          The signature is produced on the signing partner&apos;s computer with their USB token. The PIN is entered only in the
          desktop signer — it never passes through this website or our servers.
        </p>
      </div>

      {prep.loading || requests.loading ? (
        <LoadingState label="Checking signing status…" />
      ) : prep.error && !latest ? (
        <ErrorState message={prep.error} onRetry={prep.reload} />
      ) : (
        <>
          {prep.data && (
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <dt className="font-semibold text-slate-600">Document</dt>
              <dd className="col-span-2 text-slate-900">{prep.data.document_label}</dd>
              <dt className="font-semibold text-slate-600">SHA-256</dt>
              <dd className="col-span-2 break-all font-mono text-xs text-slate-700">{prep.data.document_hash}</dd>
            </dl>
          )}

          {latest && (
            <div
              role="status"
              className={
                "rounded-md border p-4 text-sm " +
                (latest.status === "SIGNED"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : live
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-red-300 bg-red-50 text-red-900")
              }
            >
              {latest.status === "PENDING" && (
                <div className="flex items-center gap-2 font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the partner to sign on their desktop signer…
                  <span className="ml-auto flex items-center gap-1 font-mono text-xs">
                    <Clock className="h-3.5 w-3.5" /> {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
                  </span>
                </div>
              )}
              {latest.status === "SIGNED" && (
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> Signed and verified
                  <span className="ml-auto font-mono text-xs">cert {latest.cert_fingerprint?.slice(0, 16)}…</span>
                </div>
              )}
              {(latest.status === "REJECTED" || latest.status === "EXPIRED" || latest.status === "FAILED") && (
                <div className="flex items-center gap-2 font-semibold">
                  <XCircle className="h-4 w-4" /> Request {latest.status.toLowerCase()}
                  {latest.failure_reason ? ` — ${latest.failure_reason}` : ""}
                </div>
              )}
            </div>
          )}

          {requests.error && <p className="text-xs text-red-700">Live status refresh failed: {requests.error}</p>}

          {canRequest && prep.data && !live && latest?.status !== "SIGNED" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700" htmlFor="signer">
                Signing partner
              </label>
              <select
                id="signer"
                value={signerId || defaultSigner}
                onChange={(e) => setSignerId(e.target.value)}
                className="h-9 w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                {signers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
              {signers.length === 0 && <p className="text-xs text-red-700">No eligible partner is available to sign this return.</p>}
              {actionError && (
                <p role="alert" className="text-sm font-medium text-red-700">
                  {actionError}
                </p>
              )}
              <Button onClick={open} disabled={busy || signers.length === 0} className="bg-blue-700 text-white hover:bg-blue-800">
                {busy ? "Sending…" : latest ? "Send a new signing request" : "Send to desktop signer"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
