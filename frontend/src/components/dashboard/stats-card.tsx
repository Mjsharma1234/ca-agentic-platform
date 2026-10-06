import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  urgent?: boolean;
}

export function StatsCard({ title, value, icon: Icon, trend, trendLabel, urgent }: StatsCardProps) {
  return (
    <Card className={cn(urgent && "border-red-200 ring-1 ring-red-200 bg-red-50/10")}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className={cn("text-3xl font-bold", urgent ? "text-red-600" : "text-slate-900")}>
              {value}
            </p>
          </div>
          <div className={cn("rounded-full p-3", urgent ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600")}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
        {trend !== undefined && (
          <div className="mt-4 flex items-center text-sm">
            <span className={cn("font-medium", trend > 0 ? "text-emerald-600" : "text-red-600")}>
              {trend > 0 ? "+" : ""}{trend}%
            </span>
            <span className="ml-2 text-slate-500">{trendLabel || "from last month"}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
