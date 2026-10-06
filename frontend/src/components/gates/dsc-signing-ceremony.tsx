"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Key, Lock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DscSigningCeremony() {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "signing" | "success">("idle");
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === "idle" && pin.length > 0) {
      timer = setInterval(() => {
        setCountdown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status, pin]);

  const handleSign = () => {
    setStatus("verifying");
    setTimeout(() => {
      setStatus("signing");
      setTimeout(() => {
        setStatus("success");
      }, 2000);
    }, 1500);
  };

  return (
    <div className="bg-white border rounded-lg p-6 shadow-sm">
      <div className="flex items-center gap-3 text-blue-800 mb-6 border-b pb-4">
        <ShieldCheck className="w-6 h-6" />
        <h3 className="font-semibold text-lg">DSC Token Authentication</h3>
      </div>

      {status === "success" ? (
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h4 className="text-xl font-bold text-slate-900">Successfully Signed</h4>
          <p className="text-sm text-slate-500">The payload has been signed and queued for transmission.</p>
          <div className="bg-slate-100 px-4 py-2 rounded text-xs text-slate-600 font-mono mt-4">
            Memory wipe initiated. Token session closed.
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-red-50 p-4 rounded-md border border-red-100 flex gap-3">
            <Lock className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-bold mb-1">Personal Legal Liability Acknowledgment</p>
              <p>By entering your PIN, you are digitally signing this return under the provisions of the IT Act, 2000. You assume personal responsibility for the accuracy of these filings as the authorized signatory.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Enter 6-digit DSC PIN
            </label>
            <div className="relative max-w-xs">
              <Key className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                className="pl-10 block w-full rounded-md border-slate-300 border py-2 px-3 text-lg tracking-[0.5em] focus:border-blue-500 focus:ring-blue-500 outline-none"
                placeholder="******"
                disabled={status !== "idle"}
              />
            </div>
            {pin.length > 0 && status === "idle" && (
              <p className="text-xs text-amber-600 mt-2 font-mono">
                Session TTL: {countdown}s remaining before memory wipe
              </p>
            )}
          </div>

          <div className="pt-4 flex justify-end">
            <Button 
              onClick={handleSign} 
              disabled={pin.length !== 6 || status !== "idle" || countdown === 0}
              className="w-full sm:w-auto bg-blue-700 hover:bg-blue-800 text-white"
            >
              {status === "idle" && "Authenticate & Sign"}
              {status === "verifying" && "Verifying Token..."}
              {status === "signing" && "Applying Signature..."}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
