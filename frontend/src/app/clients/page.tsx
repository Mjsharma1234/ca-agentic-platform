import { demoClients } from "@/lib/demo-data";
import { formatGSTIN } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Search, FileText, Briefcase, AlertTriangle } from "lucide-react";

export default function ClientsPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Management</h1>
          <p className="text-slate-500 text-sm mt-1">Manage firm clients and their compliance status</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search clients..." 
            className="h-9 w-64 rounded-md border border-slate-200 bg-white pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {demoClients.map(client => (
          <Card key={client.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    {client.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 truncate max-w-[180px]">{client.name}</h3>
                    <p className="text-xs text-slate-500">{client.type}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-600 mb-5 bg-slate-50 p-3 rounded border">
                <div className="flex justify-between">
                  <span>GSTIN:</span>
                  <span className="font-mono font-medium text-slate-900">{formatGSTIN(client.gstin)}</span>
                </div>
                <div className="flex justify-between">
                  <span>PAN:</span>
                  <span className="font-mono font-medium text-slate-900">{client.pan}</span>
                </div>
                <div className="flex justify-between">
                  <span>Partner:</span>
                  <span className="font-medium text-slate-900">{client.assignedPartner}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <FileText className="w-4 h-4 mr-2" /> Docs
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <Briefcase className="w-4 h-4 mr-2" /> Returns
                </Button>
                <Button variant="outline" size="sm" className="w-10 px-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" title="Client Kill Switch">
                  <AlertTriangle className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
