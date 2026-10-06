import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle } from "lucide-react";
import { getGateColor, getStatusColor } from "@/lib/utils";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface GateCardProps {
  gate: {
    id: string;
    type: string;
    name: string;
    client: string;
    tier: string;
    status: string;
    assignedTo: string;
    slaRemaining: number;
    urgent: boolean;
    description: string;
  };
}

export function GateCard({ gate }: GateCardProps) {
  return (
    <Link href={`/gates/${gate.id}`}>
      <Card className="hover:border-slate-300 transition-colors cursor-pointer group">
        <CardContent className="p-5">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center space-x-2">
              <span className={cn("px-2 py-1 text-xs font-bold rounded-md", getGateColor(gate.type))}>
                {gate.type}
              </span>
              <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                {gate.name}
              </h3>
            </div>
            <Badge variant="outline" className={cn("capitalize", getStatusColor(gate.status))}>
              {gate.status}
            </Badge>
          </div>
          
          <p className="text-sm text-slate-600 mb-4 line-clamp-2">
            {gate.description}
          </p>
          
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center space-x-3">
              <span className="font-medium text-slate-700">{gate.client}</span>
              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">Tier {gate.tier}</span>
            </div>
            
            <div className={cn(
              "flex items-center space-x-1",
              gate.urgent ? "text-red-600 font-medium" : "text-slate-500"
            )}>
              {gate.urgent ? <AlertCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              <span>{gate.slaRemaining}h SLA</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
