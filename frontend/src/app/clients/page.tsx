"use client";

import { useState } from "react";
import { demoClients, Client } from "@/lib/demo-data";
import { formatGSTIN, formatIndianCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, FileText, Briefcase, AlertTriangle, CheckCircle2, XCircle, Plus } from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>(demoClients);
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    name: "",
    pan: "",
    gstin: "",
    type: "Private Limited",
    assignedPartner: "Amit Sharma"
  });

  const toggleKillSwitch = (clientId: string) => {
    setClients((prev) =>
      prev.map((c) =>
        c.id === clientId ? { ...c, killSwitchActive: !c.killSwitchActive } : c
      )
    );
  };

  const handleCreateClient = () => {
    if (!newClient.name.trim()) return;
    const created: Client = {
      id: `c${clients.length + 1}`,
      name: newClient.name,
      pan: newClient.pan || "AAACN9999K",
      gstin: newClient.gstin || "27AAACN9999K1Z5",
      type: newClient.type,
      riskTier: "Low",
      assignedPartner: newClient.assignedPartner,
      turnover: 50000000,
      killSwitchActive: false
    };
    setClients((prev) => [created, ...prev]);
    setNewClient({ name: "", pan: "", gstin: "", type: "Private Limited", assignedPartner: "Amit Sharma" });
    setAddModalOpen(false);
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.gstin.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.pan.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Portfolio & Tenant Isolation (RLS)</h1>
          <p className="text-slate-600 text-sm mt-1">
            Manage corporate/SME clients, multi-state GSTINs, and per-client manual bypass kill switches
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search name, GSTIN, PAN..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-md border border-slate-300 bg-white pl-9 pr-4 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <Button
            onClick={() => setAddModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Onboard Client (G13)
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((client) => (
          <Card
            key={client.id}
            className={`transition-all bg-white ${
              client.killSwitchActive
                ? "border-2 border-red-500 bg-red-50/20"
                : "hover:shadow-md"
            }`}
          >
            <CardContent className="p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    {client.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 truncate max-w-[180px]" title={client.name}>
                      {client.name}
                    </h3>
                    <p className="text-xs text-slate-500">{client.type}</p>
                  </div>
                </div>
                {client.killSwitchActive ? (
                  <Badge className="bg-red-600 text-white flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> MANUAL MODE
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> AI ACTIVE
                  </Badge>
                )}
              </div>

              <div className="space-y-2 text-sm text-slate-600 mb-5 bg-slate-50 p-3 rounded border">
                <div className="flex justify-between">
                  <span>Primary GSTIN:</span>
                  <span className="font-mono font-semibold text-slate-900">{formatGSTIN(client.gstin)}</span>
                </div>
                <div className="flex justify-between">
                  <span>PAN:</span>
                  <span className="font-mono font-semibold text-slate-900">{client.pan}</span>
                </div>
                <div className="flex justify-between">
                  <span>Annual Turnover:</span>
                  <span className="font-semibold text-slate-900">{formatIndianCurrency(client.turnover)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Signing Partner:</span>
                  <span className="font-semibold text-slate-900">{client.assignedPartner}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Link href="/documents" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full text-slate-800 font-medium">
                    <FileText className="w-4 h-4 mr-1.5" /> Docs
                  </Button>
                </Link>
                <Link href="/returns" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full text-slate-800 font-medium">
                    <Briefcase className="w-4 h-4 mr-1.5" /> Returns
                  </Button>
                </Link>
                <button
                  type="button"
                  onClick={() => toggleKillSwitch(client.id)}
                  title={client.killSwitchActive ? "Resume AI Pipeline" : "Emergency Manual Bypass Kill Switch"}
                  className={`px-2.5 py-1.5 rounded-md border text-xs font-bold flex items-center gap-1 transition-all ${
                    client.killSwitchActive
                      ? "bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700"
                      : "bg-red-50 text-red-700 border-red-300 hover:bg-red-600 hover:text-white"
                  }`}
                >
                  {client.killSwitchActive ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resume
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" /> Bypass
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Gate G13: Partner Client Onboarding & KYC">
        <div className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Legal Entity Name</label>
            <input
              type="text"
              placeholder="e.g. Bharat Heavy Electricals Pvt Ltd"
              value={newClient.name}
              onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
              className="w-full border border-slate-300 rounded px-3 py-2 text-slate-900 bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">PAN (10 Chars)</label>
              <input
                type="text"
                maxLength={10}
                placeholder="AAACB1234F"
                value={newClient.pan}
                onChange={(e) => setNewClient({ ...newClient, pan: e.target.value.toUpperCase() })}
                className="w-full border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Primary GSTIN (15 Chars)</label>
              <input
                type="text"
                maxLength={15}
                placeholder="27AAACB1234F1Z5"
                value={newClient.gstin}
                onChange={(e) => setNewClient({ ...newClient, gstin: e.target.value.toUpperCase() })}
                className="w-full border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono bg-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setAddModalOpen(false)} className="text-slate-900">
              Cancel
            </Button>
            <Button onClick={handleCreateClient} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve KYC & Onboard
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
