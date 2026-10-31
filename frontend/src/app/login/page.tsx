"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  ShieldCheck, 
  Smartphone, 
  Mail, 
  ArrowRight, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  UserCheck,
  Building2,
  FileCheck2
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, AuthUser } from "@/lib/auth-context";
import { sendFirebasePhoneOtp, confirmFirebasePhoneOtp } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [channel, setChannel] = useState<"SMS" | "EMAIL">("SMS");
  const [identifier, setIdentifier] = useState<string>("9876543210");
  const [step, setStep] = useState<"REQUEST" | "VERIFY">("REQUEST");
  
  // 6 individual OTP digits
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(60);
  const [demoPersonas, setDemoPersonas] = useState<any[]>([]);

  useEffect(() => {
    // Load demo personas
    api.getDemoPersonas().then(({ data }) => {
      if (data && data.length > 0) {
        setDemoPersonas(data);
      }
    });
  }, []);

  // Timer countdown for resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === "VERIFY" && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  const handleSendOtp = async (targetId?: string, targetChannel?: "SMS" | "EMAIL") => {
    const idToSend = targetId || identifier;
    const activeCh = targetChannel || channel;
    
    if (!idToSend.trim()) {
      setErrorMsg("Please enter a valid phone number or email.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const formattedId = activeCh === "SMS" && !idToSend.startsWith("+") 
      ? `+91${idToSend.replace(/\D/g, "")}` 
      : idToSend.trim();

    // Check if Firebase Auth is requested for Indian SMS
    if (activeCh === "SMS" && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
      try {
        await sendFirebasePhoneOtp(formattedId);
        setLoading(false);
        setStep("VERIFY");
        setCountdown(60);
        setOtpDigits(["", "", "", "", "", ""]);
        setSuccessMsg(`Firebase SMS verification code dispatched to ${formattedId}.`);
        setTimeout(() => inputRefs.current[0]?.focus(), 150);
        return;
      } catch (fbErr: any) {
        console.warn("Firebase Phone Auth fallback to server OTP:", fbErr.message);
        // Seamless fallback to server multi-provider OTP engine
      }
    }

    const { data, error } = await api.sendOtp(formattedId, activeCh);
    setLoading(false);

    if (error || !data) {
      setErrorMsg(error || "Failed to send OTP. Please try again.");
      return;
    }

    setStep("VERIFY");
    setCountdown(60);
    setOtpDigits(["", "", "", "", "", ""]);

    if (data.dev_otp) {
      setDevOtp(data.dev_otp);
      setSuccessMsg(`OTP sent successfully! (Sandbox Dev OTP: ${data.dev_otp})`);
    } else {
      setSuccessMsg(`OTP sent to ${formattedId} via ${activeCh}.`);
    }

    // Focus first input box
    setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 150);
  };

  const handleDigitChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const pasted = value.replace(/\D/g, "").slice(0, 6);
      if (pasted) {
        const nextDigits = [...otpDigits];
        for (let i = 0; i < 6; i++) {
          nextDigits[i] = pasted[i] || "";
        }
        setOtpDigits(nextDigits);
        const lastIndex = Math.min(pasted.length - 1, 5);
        inputRefs.current[lastIndex]?.focus();
        return;
      }
    }

    const digit = value.replace(/\D/g, "");
    const nextDigits = [...otpDigits];
    nextDigits[index] = digit;
    setOtpDigits(nextDigits);

    // Auto-advance
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const fullOtp = otpDigits.join("");
    if (fullOtp.length !== 6) {
      setErrorMsg("Please enter all 6 digits of the OTP.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const formattedId = channel === "SMS" && !identifier.startsWith("+") 
      ? `+91${identifier.replace(/\D/g, "")}` 
      : identifier.trim();

    // Check if confirming via Firebase Phone Auth
    if (typeof window !== "undefined" && window.confirmationResult) {
      try {
        const { idToken } = await confirmFirebasePhoneOtp(fullOtp);
        const { data, error } = await api.verifyFirebaseToken(idToken);
        setLoading(false);

        if (error || !data) {
          setErrorMsg(error || "Firebase session verification failed.");
          return;
        }

        setSuccessMsg("Firebase phone verification successful! Launching workspace...");
        login(data.access_token, data.user as AuthUser);
        return;
      } catch (fbErr: any) {
        console.warn("Firebase confirm error, trying direct verification fallback:", fbErr.message);
      }
    }

    const { data, error } = await api.verifyOtp(formattedId, fullOtp);
    setLoading(false);

    if (error || !data) {
      setErrorMsg(error || "Invalid OTP verification. Please try again.");
      return;
    }

    setSuccessMsg("Verification successful! Initializing secure session...");
    login(data.access_token, data.user as AuthUser);
  };

  const autoFillDevOtp = () => {
    if (devOtp && devOtp.length === 6) {
      setOtpDigits(devOtp.split(""));
    }
  };

  const selectPersona = (p: any) => {
    setChannel("SMS");
    const cleanPhone = p.phone.replace("+91", "");
    setIdentifier(cleanPhone);
    setStep("REQUEST");
    handleSendOtp(p.phone, "SMS");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-blue-600/10 via-emerald-600/5 to-transparent blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Header Branding */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xl shadow-blue-500/20 text-white mb-4">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            CA Agentic Platform
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Autonomous Practice OS &bull; ICAI SQC-1 MFA Login
          </p>
        </div>

        {/* Card Box */}
        <div className="mt-8 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
          {errorMsg && (
            <div className="mb-5 flex items-start gap-3 rounded-lg bg-red-950/60 border border-red-800/80 p-3.5 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 flex items-start gap-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 p-3.5 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{successMsg}</span>
                {devOtp && step === "VERIFY" && (
                  <button
                    type="button"
                    onClick={autoFillDevOtp}
                    className="mt-1 block text-emerald-400 underline font-semibold hover:text-emerald-300"
                  >
                    Click to auto-fill ({devOtp})
                  </button>
                )}
              </div>
            </div>
          )}

          {step === "REQUEST" ? (
            <div>
              {/* Channel Switch Tabs */}
              <div className="flex rounded-lg bg-slate-800 p-1 mb-6 border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => {
                    setChannel("SMS");
                    setIdentifier("9876543210");
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all ${
                    channel === "SMS"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile Number (+91)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChannel("EMAIL");
                    setIdentifier("partner@cafirm.in");
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all ${
                    channel === "EMAIL"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email Address
                </button>
              </div>

              {/* Input Field */}
              <div className="space-y-4">
                {channel === "SMS" ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Indian Mobile Number
                    </label>
                    <div className="relative flex rounded-lg shadow-sm">
                      <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-700 bg-slate-800 text-slate-300 text-sm font-semibold">
                        🇮🇳 +91
                      </span>
                      <input
                        type="tel"
                        maxLength={10}
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value.replace(/\D/g, ""))}
                        placeholder="98765 43210"
                        className="flex-1 block w-full rounded-none rounded-r-lg border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Registered Email Address
                    </label>
                    <input
                      type="email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="partner@cafirm.in"
                      className="block w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                )}

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleSendOtp()}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Sending Security OTP...
                    </>
                  ) : (
                    <>
                      Send 6-Digit OTP
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Step 2: 6-Digit Verification */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-blue-900/50 text-blue-400 mb-2 border border-blue-800">
                  <Lock className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white">Enter 6-Digit OTP</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sent to <span className="font-semibold text-slate-200">{identifier}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setStep("REQUEST")}
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1 font-medium"
                >
                  Change {channel === "SMS" ? "phone number" : "email"}
                </button>
              </div>

              {/* 6 Digit Input Boxes */}
              <div className="flex justify-between gap-2 mb-6">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className="w-12 h-14 text-center text-xl font-bold text-white bg-slate-800/90 border border-slate-700 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all shadow-inner"
                  />
                ))}
              </div>

              {/* Verify Button */}
              <button
                type="button"
                disabled={loading || otpDigits.join("").length !== 6}
                onClick={handleVerifyOtp}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Verifying Credentials...
                  </>
                ) : (
                  <>
                    Verify & Access Firm OS
                    <CheckCircle2 className="h-4 w-4" />
                  </>
                )}
              </button>

              {/* Resend Link */}
              <div className="mt-4 text-center">
                {countdown > 0 ? (
                  <p className="text-xs text-slate-400">
                    Resend passcode in <span className="text-white font-mono">{countdown}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendOtp()}
                    className="text-xs text-blue-400 hover:text-blue-300 font-semibold inline-flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Resend OTP Now
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick Demo Personas */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                1-Click Demo Personas
              </span>
              <span className="text-[10px] text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded-full border border-blue-900">
                Instant Access
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {demoPersonas.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectPersona(p)}
                  className="flex flex-col text-left p-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-blue-500/60 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white group-hover:text-blue-300 truncate">
                      {p.full_name}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
                      {p.role === "PARTNER" ? "Partner" : p.role === "SENIOR_MANAGER" ? "Manager" : p.role === "ARTICLE_TRAINEE" ? "Article" : "Client"}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {p.phone}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
        <div id="recaptcha-container"></div>

        {/* Compliance Footer */}
        <div className="mt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <FileCheck2 className="h-3.5 w-3.5 text-slate-400" />
          <span>ICAI SQC-1 Cryptographic Audit Trail Active &bull; Session IP Logged</span>
        </div>
      </div>
    </div>
  );
}
