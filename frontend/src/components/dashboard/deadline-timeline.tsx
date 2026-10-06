import { demoDeadlines } from "@/lib/demo-data";
import { daysRemaining, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";

export function DeadlineTimeline() {
  const getTimelineColor = (type: string) => {
    switch (type) {
      case 'GSTR-1': return 'bg-blue-500';
      case 'GSTR-3B': return 'bg-emerald-500';
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
      <div className="flex items-center space-x-2 text-sm font-medium text-slate-900 mb-4">
        <Calendar className="h-4 w-4" />
        <span>Next 30 Days</span>
      </div>
      
      <div className="relative border-l-2 border-slate-200 ml-3 space-y-6">
        {sortedDeadlines.map((deadline) => {
          const days = daysRemaining(deadline.date);
          const isUrgent = days <= 3;
          
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
                    {deadline.type} Deadline
                    {deadline.peak && (
                      <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">PEAK</span>
                    )}
                  </h4>
                  <p className="text-xs text-slate-500">{formatDate(deadline.date)}</p>
                </div>
                
                <div className="mt-2 sm:mt-0 flex items-center space-x-3">
                  <div className="text-sm text-slate-600">
                    <span className="font-semibold text-slate-900">{deadline.count}</span> returns
                  </div>
                  <div className={cn(
                    "text-xs font-medium px-2 py-1 rounded-md",
                    isUrgent ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                  )}>
                    {days > 0 ? `${days} days left` : days === 0 ? "Today" : "Overdue"}
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
