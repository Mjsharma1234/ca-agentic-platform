"use client";

import { useState } from "react";
import { MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/async-state";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { hasRole, useAuth } from "@/lib/auth-context";

export default function DevicesPage() {
  const { user } = useAuth();
  const isPartner = hasRole(user, "PARTNER");
  const devices = useApi(() => api.listSignerDevices(), [isPartner]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!isPartner) {
    return <ErrorState message="Only Partners can authorise a desktop signer." />;
  }

  const decide = async (approve: boolean) => {
    setBusy(true);
    setMessage(null);
    const res = await api.approveSignerDevice(code.trim(), approve);
    setBusy(false);
    if (res.error || !res.data) {
      setMessage({ ok: false, text: res.error ?? "The code could not be processed." });
      return;
    }
    setMessage({
      ok: approve,
      text: approve ? `Authorised “${res.data.device_name}”. The signer will connect within a few seconds.` : "Request denied.",
    });
    setCode("");
    devices.reload();
  };

  const revoke = async (id: string) => {
    const res = await api.revokeSignerDevice(id);
    if (res.error) setMessage({ ok: false, text: res.error });
    devices.reload();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="h-5 w-5 text-blue-700" /> Authorise a desktop signer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Open the CA Firm OS Signer on your computer, then type the code it shows. Only approve a code you generated yourself, on a
            computer you control — an approved signer can answer signing requests with your DSC.
          </p>
          <label htmlFor="user-code" className="block text-sm font-medium text-slate-700">
            Code shown in the signer
          </label>
          <input
            id="user-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={9}
            autoComplete="off"
            spellCheck={false}
            placeholder="ABCD-2345"
            className="h-11 w-56 rounded-md border border-slate-300 px-3 font-mono text-lg tracking-widest text-slate-900"
          />
          <div className="flex gap-3">
            <Button disabled={busy || code.replace("-", "").length !== 8} onClick={() => decide(true)} className="bg-emerald-600 text-white hover:bg-emerald-700">
              Approve
            </Button>
            <Button variant="outline" disabled={busy || code.replace("-", "").length !== 8} onClick={() => decide(false)}>
              Deny
            </Button>
          </div>
          {message && (
            <p role="status" className={`text-sm font-medium ${message.ok ? "text-emerald-700" : "text-red-700"}`}>
              {message.text}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <MonitorSmartphone className="h-5 w-5 text-slate-600" /> Your authorised signers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {devices.loading ? (
            <LoadingState />
          ) : devices.error ? (
            <ErrorState message={devices.error} onRetry={devices.reload} />
          ) : !devices.data || devices.data.length === 0 ? (
            <EmptyState title="No signer is authorised yet" />
          ) : (
            <ul className="divide-y">
              {devices.data.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{d.device_name}</p>
                    <p className="text-xs text-slate-500">
                      {d.revoked ? "Revoked" : d.last_seen_at ? `Last seen ${new Date(d.last_seen_at).toLocaleString("en-IN")}` : "Never connected"}
                    </p>
                  </div>
                  {!d.revoked && (
                    <Button variant="outline" size="sm" onClick={() => revoke(d.id)} aria-label={`Revoke ${d.device_name}`}>
                      <Trash2 className="mr-1 h-4 w-4" /> Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
