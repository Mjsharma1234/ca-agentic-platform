import { demoDeadlines } from "@/lib/demo-data";
import { daysRemaining, formatDate, cn } from "@/lib/utils";
import { Calendar, ArrowRight } from "lucide-react";
import Link from "next/link";

export function DeadlineTimeline() {
  const getTimelineColor = (type: string) => {
    switch (type) {
      case 'GSTR-1': return 'bg-blue-500';
      case 'GSTR-3B': return 'bg-emerald-500';
      case 'IMS-CUTOFF': return 'bg-amber-500';
      case 'TDS': return 'bg-orange-500';
      case 'ITR': return 'bg-purple-500';
      default: return 'bg-slate-500';
    }
  };

  const sortedDeadlines = [...demoDeadlines].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-medium text-slate-900 mb-4">
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-blue-600" />
          <span>October 2026 Cutoffs</span>
        </div>
        <Link href="/calendar" className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold">
          Full Calendar <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      
      <div className="relative border-l-2 border-slate-200 ml-3 space-y-5">
        {sortedDeadlines.slice(0, 6).map((deadline) => {
          const days = daysRemaining(deadline.date);
          const isUrgent = days <= 5;
          
          return (
            <div key={deadline.id} className="relative pl-6">
              <div className={cn(
                "absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white",
                getTimelineColor(deadline.type),
                deadline.peak && "ring-2 ring-red-200 ring-offset-1"
              )} />
              
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    {deadline.type}
                    {deadline.peak && (
                      <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">PEAK</span>
                    )}
                  </h4>
                  <p className="text-xs text-slate-500">{formatDate(deadline.date)} • {deadline.section}</p>
                </div>
                
                <div className="mt-1 sm:mt-0 flex items-center space-x-2">
                  <div className="text-xs text-slate-600">
                    <span className="font-bold text-emerald-700">{deadline.completedCount}</span>/{deadline.count}
                  </div>
                  <div className={cn(
                    "text-xs font-semibold px-2 py-0.5 rounded-md",
                    isUrgent ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                  )}>
                    {days > 0 ? `${days}d left` : days === 0 ? "Today" : "Due"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
