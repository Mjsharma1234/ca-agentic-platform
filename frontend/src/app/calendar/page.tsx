"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar as CalendarIcon,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  RefreshCw,
  Check,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Deadline } from "@/lib/types";
import { formatIndianCurrency } from "@/lib/utils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const getTypeBadgeStyle = (type: string) => {
  const t = type.toUpperCase();
  if (t.includes("GSTR-1A")) return "bg-indigo-100 text-indigo-800 border-indigo-300";
  if (t.includes("GSTR-1")) return "bg-blue-100 text-blue-800 border-blue-300";
  if (t.includes("GSTR-3B")) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (t.includes("IMS")) return "bg-amber-100 text-amber-800 border-amber-300";
  if (t.includes("TDS") || t.includes("24Q") || t.includes("26Q")) return "bg-orange-100 text-orange-800 border-orange-300";
  if (t.includes("PF") || t.includes("ESI")) return "bg-teal-100 text-teal-800 border-teal-300";
  if (t.includes("ITR")) return "bg-purple-100 text-purple-800 border-purple-300";
  return "bg-slate-100 text-slate-800 border-slate-300";
};

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");

  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [extensions, setExtensions] = useState<any[]>([]);
  const [extError, setExtError] = useState<string | null>(null);
  const [applyingExt, setApplyingExt] = useState(false);
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);

  // Deterministic Section 50 interest calculator (Law 2: deterministic math)
  const [taxPrincipal, setTaxPrincipal] = useState<string>("");
  const [daysDelayed, setDaysDelayed] = useState<string>("");
  const [isNilReturn, setIsNilReturn] = useState<boolean>(false);

  const principalNum = parseFloat(taxPrincipal) || 0;
  const daysNum = Math.max(0, parseInt(daysDelayed) || 0);
  const sec50Interest = Math.round((principalNum * 0.18 * daysNum) / 365);
  const perDayFee = isNilReturn ? 20 : 50;
  const maxCap = isNilReturn ? 500 : 5000;
  const cgstLateFee = Math.min(daysNum * perDayFee, maxCap);
  const sgstLateFee = Math.min(daysNum * perDayFee, maxCap);
  const totalPayable = principalNum + sec50Interest + cgstLateFee + sgstLateFee;

  const fetchDeadlines = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await api.getDeadlines();
    if (res.error || !res.data) setLoadError(res.error || "Could not load deadlines.");
    else setDeadlines(res.data);
    setLoading(false);
  }, []);

  const fetchActiveExtensions = useCallback(async () => {
    setExtError(null);
    const res = await api.getActiveExtensions();
    if (res.error) setExtError(res.error);
    else setExtensions(res.data?.extensions ?? []);
  }, []);

  useEffect(() => {
    fetchDeadlines();
    fetchActiveExtensions();
  }, [fetchDeadlines, fetchActiveExtensions]);

  const handleApplyExtension = async (extId: string) => {
    setApplyingExt(true);
    setExtensionNotice(null);
    setExtError(null);
    const res = await api.applyGovernmentExtension(extId);
    setApplyingExt(false);
    if (res.error || !res.data) {
      setExtError(res.error || "Could not apply extension.");
      return;
    }
    setExtensionNotice(
      `Extension applied: ${res.data.tasks_updated_count ?? 0} client obligations re-dated with internal safety buffers recalculated.`
    );
    await Promise.all([fetchDeadlines(), fetchActiveExtensions()]);
  };

  const dateKey = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const filterTypes = useMemo(() => Array.from(new Set(deadlines.map((d) => d.return_type))).sort(), [deadlines]);

  const getDeadlinesForDay = (day: number): Deadline[] =>
    deadlines.filter(
      (d) => d.deadline_date === dateKey(day) && (selectedFilter === "ALL" || d.return_type === selectedFilter)
    );

  const selectedDateDeadlines = getDeadlinesForDay(selectedDay);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startOffset = new Date(viewYear, viewMonth, 1).getDay();

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDay(1);
  };

  const monthDeadlineCount = deadlines.filter((d) => d.deadline_date.startsWith(dateKey(1).slice(0, 7))).length;
  const ext = extensions[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-blue-600" />
            Statutory Compliance Calendar & Government Re-Dating Engine
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Regulatory deadlines across GST, Income Tax, TDS, and MCA with government extension propagation.
          </p>
        </div>

        <select
          value={selectedFilter}
          onChange={(e) => setSelectedFilter(e.target.value)}
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-blue-500 outline-none"
        >
          <option value="ALL">All Statutory Bodies ({deadlines.length} Dates)</option>
          {filterTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {extError && (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-red-900 text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-red-600" /> {extError}</span>
          <Button size="sm" variant="outline" onClick={fetchActiveExtensions}>Retry</Button>
        </div>
      )}

      {ext && (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-lg p-4 shadow-md border border-blue-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Megaphone className="w-5 h-5 text-saffron-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-saffron-300">{ext.notification_number}</span>
                  <Badge className="bg-saffron-500/20 text-saffron-300 border-saffron-400/40 text-[10px]">
                    + {ext.days_extended} DAYS EXTENSION
                  </Badge>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  <strong>{ext.form_id} ({ext.period}):</strong> Due date extended from {ext.original_due_date} to{" "}
                  <span className="text-white font-bold underline">{ext.extended_due_date}</span>. Reason: {ext.reason}.
                </p>
              </div>
            </div>

            <Button
              disabled={applyingExt || ext.is_applied}
              onClick={() => handleApplyExtension(ext.id)}
              className={`text-xs font-semibold h-8 shrink-0 ${
                ext.is_applied ? "bg-emerald-600 text-white cursor-default" : "bg-saffron-500 hover:bg-saffron-600 text-slate-950 font-bold"
              }`}
            >
              {ext.is_applied ? (
                <><Check className="w-3.5 h-3.5 mr-1" /> Re-Dated Across All Clients</>
              ) : (
                <><RefreshCw className={`w-3.5 h-3.5 mr-1 ${applyingExt ? "animate-spin" : ""}`} /> Auto Re-Date Client Tasks</>
              )}
            </Button>
          </div>

          {extensionNotice && (
            <div className="mt-3 pt-2.5 border-t border-blue-800/60 text-xs text-emerald-300 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {extensionNotice}
            </div>
          )}
        </div>
      )}

      <div className="bg-amber-50 border border-amber-300 rounded-lg p-3.5 flex items-center justify-between text-xs text-amber-950">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            <strong>Peak-Day Safeguard:</strong> 48-hour code freeze applies around critical statutory dates (highlighted in red on the grid).
          </span>
        </div>
        <span className="font-bold bg-amber-200 text-amber-900 px-2.5 py-1 rounded">
          {MONTHS[viewMonth].toUpperCase()} {viewYear}
        </span>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center text-slate-500 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading statutory deadlines...
        </div>
      ) : loadError ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-red-700">{loadError}</p>
          <Button variant="outline" onClick={fetchDeadlines}>Retry</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 bg-white">
            <CardHeader className="py-3.5 px-5 border-b bg-slate-50 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base text-slate-900">{MONTHS[viewMonth]} {viewYear} Statutory Grid</CardTitle>
                <Badge className="bg-blue-100 text-blue-800 border border-blue-200">
                  {monthDeadlineCount} Deadlines This Month
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2 text-slate-700" onClick={() => shiftMonth(-1)}>
                  <ChevronLeft className="w-4 h-4" /> {MONTHS[(viewMonth + 11) % 12].slice(0, 3)}
                </Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-slate-700" onClick={() => shiftMonth(1)}>
                  {MONTHS[(viewMonth + 1) % 12].slice(0, 3)} <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-20 bg-slate-50/50 rounded border border-transparent" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayDeadlines = getDeadlinesForDay(day);
                  const hasDeadlines = dayDeadlines.length > 0;
                  const isSelected = selectedDay === day;
                  const isCritical = dayDeadlines.some((d) => d.is_critical);

                  return (
                    <div
                      key={`day-${day}`}
                      onClick={() => setSelectedDay(day)}
                      className={`h-20 p-1.5 rounded border text-left cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20"
                          : hasDeadlines
                          ? isCritical
                            ? "border-red-300 bg-red-50/20 hover:border-red-400"
                            : "border-slate-200 hover:border-slate-300"
                          : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-bold ${isSelected ? "text-blue-600 font-extrabold" : hasDeadlines ? "text-slate-900" : "text-slate-400"}`}>
                          {day}
                        </span>
                        {isCritical && <span className="w-2 h-2 rounded-full bg-red-500" title="Critical statutory deadline" />}
                      </div>

                      {hasDeadlines && (
                        <div className="space-y-0.5">
                          {dayDeadlines.slice(0, 2).map((d, idx) => (
                            <div key={idx} className={`text-[9px] px-1 py-0.5 rounded truncate font-medium border ${getTypeBadgeStyle(d.return_type)}`}>
                              {d.return_type}
                            </div>
                          ))}
                          {dayDeadlines.length > 2 && (
                            <div className="text-[9px] text-slate-500 text-center font-bold">+{dayDeadlines.length - 2} more</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {deadlines.length === 0 && (
                <p className="text-center text-xs text-slate-500 mt-4">No upcoming statutory deadlines were returned by the engine.</p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-white">
              <CardHeader className="py-3 px-4 border-b bg-slate-50">
                <CardTitle className="text-sm font-semibold text-slate-900 flex items-center justify-between">
                  <span>{MONTHS[viewMonth]} {selectedDay}, {viewYear} Obligations</span>
                  <Badge variant="outline" className="text-xs">{selectedDateDeadlines.length} Due</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {selectedDateDeadlines.length > 0 ? (
                  selectedDateDeadlines.map((dl, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                      <div className="flex justify-between items-start">
                        <Badge className={getTypeBadgeStyle(dl.return_type)}>{dl.return_type}</Badge>
                        <span className="text-[11px] font-mono font-semibold text-slate-500">
                          {dl.days_remaining >= 0 ? `${dl.days_remaining}d left` : `${Math.abs(dl.days_remaining)}d overdue`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">{dl.description}</p>
                      <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[11px]">
                        <span className="text-red-700 font-medium">Late fee per day:</span>
                        <span className="font-mono text-slate-800">{formatIndianCurrency(dl.penalty_per_day)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No statutory deadlines falling on {MONTHS[viewMonth]} {selectedDay}.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-900 text-white">
              <CardHeader className="py-3 px-4 border-b border-slate-800">
                <CardTitle className="text-xs font-semibold text-saffron-400 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-saffron-500" />
                  Statutory Sec 50 Interest & Late Fee Engine
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Delayed Net Tax Payable (INR)</label>
                  <input
                    type="number"
                    min={0}
                    value={taxPrincipal}
                    onChange={(e) => setTaxPrincipal(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Days Delayed</label>
                    <input
                      type="number"
                      min={0}
                      value={daysDelayed}
                      onChange={(e) => setDaysDelayed(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div className="flex items-end pb-1.5">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 text-[11px]">
                      <input type="checkbox" checked={isNilReturn} onChange={(e) => setIsNilReturn(e.target.checked)} className="rounded bg-slate-800 text-saffron-500" />
                      Nil Return
                    </label>
                  </div>
                </div>

                <div className="bg-slate-800/80 rounded p-2.5 space-y-1 font-mono text-[11px] border border-slate-700">
                  <div className="flex justify-between text-slate-300">
                    <span>Sec 50 Interest (18% p.a.):</span>
                    <span className="text-saffron-400">₹{sec50Interest.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Sec 47 Late Fee (CGST+SGST):</span>
                    <span>₹{(cgstLateFee + sgstLateFee).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white border-t border-slate-700 pt-1">
                    <span>Total Payable:</span>
                    <span className="text-emerald-400">₹{totalPayable.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
