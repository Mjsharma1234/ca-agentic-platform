import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle } from "lucide-react";
import { getGateColor, getStatusColor, cn } from "@/lib/utils";
import type { Gate } from "@/lib/types";
import Link from "next/link";

export function slaLabel(gate: Gate): string {
  if (gate.sla_remaining_hours === null) return "No SLA";
  if (gate.sla_remaining_hours <= 0) return `SLA breached ${Math.abs(Math.round(gate.sla_remaining_hours))}h ago`;
  return `${Math.round(gate.sla_remaining_hours)}h SLA`;
}

export function GateCard({ gate }: { gate: Gate }) {
  const open = gate.status === "pending" || gate.status === "escalated";
  return (
    <Link href={`/gates/${gate.id}`}>
      <Card className="hover:border-slate-300 transition-colors cursor-pointer group">
        <CardContent className="p-5">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center space-x-2">
              <span className={cn("px-2 py-1 text-xs font-bold rounded-md", getGateColor(gate.gate_id))}>{gate.gate_id}</span>
              <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{gate.name}</h3>
            </div>
            <Badge variant="outline" className={cn("capitalize", getStatusColor(gate.status))}>
              {gate.status}
            </Badge>
          </div>

          <p className="text-sm text-slate-600 mb-4 line-clamp-2">{gate.description}</p>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center space-x-3">
              <span className="font-medium text-slate-700">{gate.client}</span>
              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">Tier {gate.tier}</span>
            </div>
            {open && (
              <div className={cn("flex items-center space-x-1", gate.urgent ? "text-red-600 font-medium" : "text-slate-500")}>
                {gate.urgent ? <AlertCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                <span>{slaLabel(gate)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
