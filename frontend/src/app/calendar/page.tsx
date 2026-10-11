"use client";

import { useState } from "react";
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
  ChevronRight
} from "lucide-react";

const DAYS_IN_OCTOBER = 31;
const START_WEEKDAY_OFFSET = 4; // Oct 1, 2026 is Thursday

export default function CalendarPage() {
  const [selectedDay, setSelectedDay] = useState<number>(11);
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");

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

  const getDeadlinesForDay = (day: number): StatutoryDeadlineItem[] => {
    const dateStr = `2026-10-${day.toString().padStart(2, "0")}`;
    return demoDeadlines.filter(
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-blue-600" />
            Stratum 1: Statutory Compliance Calendar Engine (MOD-1)
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            143 Annual Statutory Deadlines across GST, Income Tax, TDS, PF/ESI & MCA — 100% Deterministic Code (Zero LLM)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-blue-500 outline-none"
          >
            <option value="ALL">All Statutory Bodies (143 Dates)</option>
            <option value="GSTR-1">GSTR-1 (11th)</option>
            <option value="IMS-CUTOFF">IMS Cutoff & GSTR-2B (14th)</option>
            <option value="GSTR-3B">GSTR-3B (20th)</option>
            <option value="TDS">TDS / TCS (7th & 31st)</option>
            <option value="PF-ESI">EPFO / ESIC (15th)</option>
            <option value="ITR">Corporate ITR (31st Oct)</option>
          </select>
        </div>
      </div>

      {/* Peak Day Code-Freeze Banner */}
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-3.5 flex items-center justify-between text-xs text-amber-950">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <span>
            <strong>Peak-Day Safeguard Active:</strong> 48-Hour Hard Code Freeze enforced around <strong>11th (GSTR-1)</strong>, <strong>14th (IMS Cutoff)</strong>, and <strong>20th (GSTR-3B)</strong>.
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
              <Badge className="bg-blue-100 text-blue-800 border border-blue-200">8 Statutory Deadlines</Badge>
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
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-500 uppercase pb-2 border-b mb-2">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: START_WEEKDAY_OFFSET }).map((_, i) => (
                <div key={`empty-${i}`} className="h-24 rounded-md bg-slate-50/50 border border-dashed border-slate-200" />
              ))}

              {Array.from({ length: DAYS_IN_OCTOBER }, (_, i) => i + 1).map((day) => {
                const dayEvents = getDeadlinesForDay(day);
                const isPeak = dayEvents.some((e) => e.peak);
                const isSelected = selectedDay === day;

                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={`h-24 p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "border-2 border-blue-600 bg-blue-50/40 shadow-sm"
                        : dayEvents.length > 0
                        ? "border-slate-300 bg-white hover:border-blue-400"
                        : "border-slate-200 bg-slate-50/30 hover:bg-slate-100/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                          isSelected
                            ? "bg-blue-600 text-white"
                            : day === 11 || day === 20
                            ? "bg-red-100 text-red-700"
                            : "text-slate-700"
                        }`}
                      >
                        {day}
                      </span>
                      {isPeak && (
                        <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.2 rounded font-bold">
                          PEAK
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 overflow-hidden">
                      {dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border truncate ${getTypeBadgeStyle(
                            ev.type
                          )}`}
                          title={ev.title}
                        >
                          {ev.type} ({ev.completedCount}/{ev.count})
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Right Panel: Selected Date Details + Deterministic Sec 50 Calculator */}
        <div className="space-y-6">
          <Card className="bg-white">
            <CardHeader className="py-3.5 px-5 border-b bg-slate-50">
              <CardTitle className="text-sm text-slate-900">
                Deadlines on {selectedDay} October 2026
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {selectedDateDeadlines.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-sm">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  No statutory filing cutoff on October {selectedDay}.<br />
                  <span className="text-xs text-blue-600 font-medium">
                    Click highlighted dates (7, 11, 14, 15, 17, 20, 31) to inspect obligations.
                  </span>
                </div>
              ) : (
                selectedDateDeadlines.map((item) => (
                  <div key={item.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getTypeBadgeStyle(item.type)}`}>
                        {item.type}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">{item.section}</span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
                    <p className="text-xs text-slate-600">{item.description}</p>
                    <div className="pt-2 border-t flex items-center justify-between text-xs">
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {item.completedCount} / {item.count} Filed
                      </span>
                      <span className="text-red-600 font-medium text-[11px]">{item.penalty}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Stratum 1 Deterministic Section 50 Interest & Late Fee Calculator */}
          <Card className="bg-white border-blue-200">
            <CardHeader className="py-3.5 px-5 border-b bg-blue-50/60">
              <CardTitle className="text-sm text-slate-900 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                Stratum 1: Sec 50 Interest & Late Fee Engine
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              <p className="text-slate-600">
                Law 2: Arithmetic is Code, Not Language. Calculates exact Section 50 interest (18% p.a.) & Section 47 late fees.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Net Tax Payable (₹)</label>
                  <input
                    type="number"
                    value={taxPrincipal}
                    onChange={(e) => setTaxPrincipal(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Days Delayed</label>
                  <input
                    type="number"
                    value={daysDelayed}
                    onChange={(e) => setDaysDelayed(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-bold bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="nilReturn"
                  checked={isNilReturn}
                  onChange={(e) => setIsNilReturn(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                <label htmlFor="nilReturn" className="text-slate-800 font-medium cursor-pointer">
                  Nil Return (Reduced Late Fee ₹20/day, Capped at ₹500+₹500)
                </label>
              </div>

              <div className="bg-slate-50 p-3 rounded border space-y-1.5 mt-2">
                <div className="flex justify-between text-slate-700">
                  <span>Sec 50 Interest (18% p.a. × {daysNum}d):</span>
                  <span className="font-bold text-amber-700">₹{sec50Interest.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Sec 47 Late Fee (CGST + SGST):</span>
                  <span className="font-bold text-red-600">
                    ₹{(cgstLateFee + sgstLateFee).toLocaleString("en-IN")} (₹{cgstLateFee} + ₹{sgstLateFee})
                  </span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold text-sm pt-1.5 border-t">
                  <span>Total DRC-03 / 3B Payable:</span>
                  <span className="text-emerald-700">₹{totalPayable.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
