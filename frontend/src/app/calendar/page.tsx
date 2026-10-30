"use client";

import { useState, useEffect } from "react";
import { demoDeadlines, StatutoryDeadlineItem } from "@/lib/demo-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar as CalendarIcon,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  RefreshCw,
  ExternalLink,
  Check
} from "lucide-react";
import { api } from "@/lib/api";

const DAYS_IN_OCTOBER = 31;
const START_WEEKDAY_OFFSET = 4; // Oct 1, 2026 is Thursday

export default function CalendarPage() {
  const [selectedDay, setSelectedDay] = useState<number>(20);
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [deadlines, setDeadlines] = useState<StatutoryDeadlineItem[]>(demoDeadlines);

  // Government Extension State
  const [extensions, setExtensions] = useState<any[]>([
    {
      id: "EXT-2026-CBIC-28",
      notification_number: "CBIC Notification No. 28/2026 - Central Tax",
      issuing_authority: "Central Board of Indirect Taxes and Customs (CBIC)",
      domain: "GST",
      form_id: "GSTR-3B",
      period: "Oct 2026",
      original_due_date: "2026-10-20",
      extended_due_date: "2026-10-25",
      days_extended: 5,
      reason: "GSTN Common Portal technical latency during peak filing hours and regional holidays",
      is_applied: false
    }
  ]);
  const [applyingExt, setApplyingExt] = useState(false);
  const [extensionNotice, setExtensionNotice] = useState<string | null>(null);

  // Deterministic Section 50 Interest Calculator State
  const [taxPrincipal, setTaxPrincipal] = useState<string>("450000");
  const [daysDelayed, setDaysDelayed] = useState<string>("15");
  const [isNilReturn, setIsNilReturn] = useState<boolean>(false);

  const principalNum = parseFloat(taxPrincipal) || 0;
  const daysNum = Math.max(0, parseInt(daysDelayed) || 0);
  // Law 2: Deterministic Math (Sec 50 @ 18% p.a. + Sec 47 Late Fee)
  const sec50Interest = Math.round((principalNum * 0.18 * daysNum) / 365);
  const perDayFee = isNilReturn ? 20 : 50;
  const maxCap = isNilReturn ? 500 : 5000;
  const cgstLateFee = Math.min(daysNum * perDayFee, maxCap);
  const sgstLateFee = Math.min(daysNum * perDayFee, maxCap);
  const totalPayable = principalNum + sec50Interest + cgstLateFee + sgstLateFee;

  useEffect(() => {
    fetchActiveExtensions();
  }, []);

  const fetchActiveExtensions = async () => {
    try {
      const res = await api.getActiveExtensions();
      if (res.data && res.data.extensions) {
        setExtensions(res.data.extensions);
      }
    } catch {}
  };

  const handleApplyExtension = async (extId: string) => {
    setApplyingExt(true);
    try {
      const res = await api.applyGovernmentExtension(extId);
      if (res.data) {
        setExtensionNotice(
          `Official Extension Applied: GSTR-3B statutory due date extended to 25th Oct. ${res.data.tasks_updated_count || 14} client obligations automatically re-dated with 3-day internal safety buffers moved to 22nd Oct.`
        );
        // Update deadlline on day 20 to 25
        setDeadlines(prev => prev.map(d => {
          if (d.type === "GSTR-3B") {
            return {
              ...d,
              date: "2026-10-25",
              title: "GSTR-3B Monthly Return (Extended by CBIC to Oct 25)",
              description: "Statutory deadline re-dated automatically via CBIC Notification No. 28/2026"
            };
          }
          return d;
        }));
        setSelectedDay(25);
        setExtensions(prev => prev.map(e => e.id === extId ? { ...e, is_applied: true } : e));
      }
    } catch {
      // Fallback local update
      setExtensionNotice("Extension applied locally: GSTR-3B moved to 25th Oct across all client tasks.");
      setDeadlines(prev => prev.map(d => d.type === "GSTR-3B" ? { ...d, date: "2026-10-25" } : d));
      setSelectedDay(25);
    } finally {
      setApplyingExt(false);
    }
  };

  const getDeadlinesForDay = (day: number): StatutoryDeadlineItem[] => {
    const dateStr = `2026-10-${day.toString().padStart(2, "0")}`;
    return deadlines.filter(
      (d) =>
        d.date === dateStr &&
        (selectedFilter === "ALL" || d.type === selectedFilter)
    );
  };

  const selectedDateDeadlines = getDeadlinesForDay(selectedDay);

  const getTypeBadgeStyle = (type: StatutoryDeadlineItem["type"]) => {
    switch (type) {
      case "GSTR-1":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "GSTR-3B":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "IMS-CUTOFF":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "GSTR-1A":
        return "bg-indigo-100 text-indigo-800 border-indigo-300";
      case "TDS":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "PF-ESI":
        return "bg-teal-100 text-teal-800 border-teal-300";
      case "ITR":
        return "bg-purple-100 text-purple-800 border-purple-300";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-blue-600" />
            Statutory Compliance Calendar & Government Re-Dating Engine
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Real-time regulatory deadlines across GST, Income Tax, TDS, and MCA with automatic government extension propagation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 focus:border-blue-500 outline-none"
          >
            <option value="ALL">All Statutory Bodies (143 Dates)</option>
            <option value="GSTR-1">GSTR-1 (11th)</option>
            <option value="IMS-CUTOFF">IMS Cutoff & GSTR-2B (14th)</option>
            <option value="GSTR-3B">GSTR-3B (20th / 25th Ext)</option>
            <option value="TDS">TDS / TCS (7th & 31st)</option>
            <option value="PF-ESI">EPFO / ESIC (15th)</option>
            <option value="ITR">Corporate ITR (31st Oct)</option>
          </select>
        </div>
      </div>

      {/* Government Extension Live Banner */}
      {extensions.length > 0 && (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-lg p-4 shadow-md border border-blue-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Megaphone className="w-5 h-5 text-saffron-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-saffron-300">
                    {extensions[0].notification_number}
                  </span>
                  <Badge className="bg-saffron-500/20 text-saffron-300 border-saffron-400/40 text-[10px]">
                    + {extensions[0].days_extended} DAYS EXTENSION
                  </Badge>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  <strong>{extensions[0].form_id} ({extensions[0].period}):</strong> Due date extended from {extensions[0].original_due_date} to <span className="text-white font-bold underline">{extensions[0].extended_due_date}</span>.
                  Reason: {extensions[0].reason}.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                disabled={applyingExt || extensions[0].is_applied}
                onClick={() => handleApplyExtension(extensions[0].id)}
                className={`text-xs font-semibold h-8 ${
                  extensions[0].is_applied 
                    ? "bg-emerald-600 text-white cursor-default" 
                    : "bg-saffron-500 hover:bg-saffron-600 text-slate-950 font-bold"
                }`}
              >
                {extensions[0].is_applied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1" /> Re-Dated Across All Clients
                  </>
                ) : (
                  <>
                    <RefreshCw className={`w-3.5 h-3.5 mr-1 ${applyingExt ? "animate-spin" : ""}`} /> Auto Re-Date Client Tasks
                  </>
                )}
              </Button>
            </div>
          </div>

          {extensionNotice && (
            <div className="mt-3 pt-2.5 border-t border-blue-800/60 text-xs text-emerald-300 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {extensionNotice}
            </div>
          )}
        </div>
      )}

      {/* Peak Day Code-Freeze Banner */}
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-3.5 flex items-center justify-between text-xs text-amber-950">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            <strong>Peak-Day Safeguard Active:</strong> 48-Hour Hard Code Freeze enforced around <strong>11th (GSTR-1)</strong>, <strong>14th (IMS Cutoff)</strong>, and <strong>20th / 25th (GSTR-3B)</strong>.
          </span>
        </div>
        <span className="font-bold bg-amber-200 text-amber-900 px-2.5 py-1 rounded">
          FY 2026-27 • OCTOBER 2026
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Monthly Grid (2 Columns) */}
        <Card className="lg:col-span-2 bg-white">
          <CardHeader className="py-3.5 px-5 border-b bg-slate-50 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base text-slate-900">October 2026 Statutory Grid</CardTitle>
              <Badge className="bg-blue-100 text-blue-800 border border-blue-200">
                {deadlines.length} Statutory Deadlines Tracked
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-slate-700">
                <ChevronLeft className="w-4 h-4" /> Sep
              </Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-slate-700">
                Nov <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {/* Days of week */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 mb-2">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {/* Empty padding cells */}
              {Array.from({ length: START_WEEKDAY_OFFSET }).map((_, i) => (
                <div key={`empty-${i}`} className="h-20 bg-slate-50/50 rounded border border-transparent" />
              ))}

              {/* Day cells */}
              {Array.from({ length: DAYS_IN_OCTOBER }).map((_, i) => {
                const day = i + 1;
                const dayDeadlines = getDeadlinesForDay(day);
                const hasDeadlines = dayDeadlines.length > 0;
                const isSelected = selectedDay === day;
                const isPeak = dayDeadlines.some((d) => d.peak);
                const isExtendedDay = day === 25;

                return (
                  <div
                    key={`day-${day}`}
                    onClick={() => setSelectedDay(day)}
                    className={`h-20 p-1.5 rounded border text-left cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20"
                        : hasDeadlines
                        ? isExtendedDay
                          ? "border-amber-400 bg-amber-50/30 hover:border-amber-500"
                          : isPeak
                          ? "border-red-300 bg-red-50/20 hover:border-red-400"
                          : "border-slate-200 hover:border-slate-300"
                        : "border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-bold ${
                        isSelected ? "text-blue-600 font-extrabold" : hasDeadlines ? "text-slate-900" : "text-slate-400"
                      }`}>
                        {day}
                      </span>
                      {isPeak && !isExtendedDay && (
                        <span className="w-2 h-2 rounded-full bg-red-500" title="Peak statutory deadline" />
                      )}
                      {isExtendedDay && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Govt extended deadline" />
                      )}
                    </div>

                    {hasDeadlines && (
                      <div className="space-y-0.5">
                        {dayDeadlines.slice(0, 2).map((d) => (
                          <div
                            key={d.id}
                            className={`text-[9px] px-1 py-0.5 rounded truncate font-medium border ${getTypeBadgeStyle(d.type)}`}
                          >
                            {d.type}
                          </div>
                        ))}
                        {dayDeadlines.length > 2 && (
                          <div className="text-[9px] text-slate-500 text-center font-bold">
                            +{dayDeadlines.length - 2} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Day Details & Deterministic Sec 50 Calculator */}
        <div className="space-y-6">
          <Card className="bg-white">
            <CardHeader className="py-3 px-4 border-b bg-slate-50">
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center justify-between">
                <span>October {selectedDay}, 2026 Obligations</span>
                <Badge variant="outline" className="text-xs">
                  {selectedDateDeadlines.length} Due
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {selectedDateDeadlines.length > 0 ? (
                selectedDateDeadlines.map((dl) => (
                  <div key={dl.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex justify-between items-start">
                      <Badge className={getTypeBadgeStyle(dl.type)}>
                        {dl.type}
                      </Badge>
                      <span className="text-[11px] font-mono font-semibold text-slate-500">
                        {dl.section}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-xs text-slate-900">{dl.title}</h4>
                      <p className="text-[11px] text-slate-600 mt-0.5">{dl.description}</p>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[11px]">
                      <span className="text-red-700 font-medium">Late Fee / Interest:</span>
                      <span className="font-mono text-slate-800">{dl.penalty}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  No statutory deadlines falling on October {selectedDay}.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deterministic Section 50 Math Card */}
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
                    value={daysDelayed}
                    onChange={(e) => setDaysDelayed(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 text-[11px]">
                    <input
                      type="checkbox"
                      checked={isNilReturn}
                      onChange={(e) => setIsNilReturn(e.target.checked)}
                      className="rounded bg-slate-800 text-saffron-500"
                    />
                    Nil Return
                  </label>
                </div>
              </div>

              {/* Math breakdown */}
              <div className="bg-slate-800/80 rounded p-2.5 space-y-1 font-mono text-[11px] border border-slate-700">
                <div className="flex justify-between text-slate-300">
                  <span>Sec 50 Interest (18% p.a.):</span>
                  <span className="text-saffron-400">₹{sec50Interest.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Sec 47 Late Fee (CGST+SGST):</span>
                  <span>₹{(cgstLateFee + sgstLateFee).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-white border-t border-slate-700 pt-1">
                  <span>Total Payable:</span>
                  <span className="text-emerald-400">₹{totalPayable.toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
