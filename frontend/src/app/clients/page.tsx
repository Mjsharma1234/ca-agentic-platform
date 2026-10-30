"use client";

import { useState, useEffect } from "react";
import { demoClients, Client } from "@/lib/demo-data";
import { formatGSTIN, formatIndianCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Search, FileText, Briefcase, AlertTriangle, CheckCircle2, XCircle, 
  Plus, Upload, Download, Calendar, ShieldCheck, ListChecks, Check, RefreshCw, X
} from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";

interface ClientTask {
  id: string;
  client_id: string;
  client_name: string;
  domain: string;
  form_id: string;
  title: string;
  period: string;
  statutory_due_date: string;
  internal_buffer_date: string;
  assigned_partner: string;
  frequency: string;
  act_reference: string;
  extension_applied?: any;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>(demoClients);
  const [searchQuery, setSearchQuery] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [clientTasks, setClientTasks] = useState<ClientTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Bulk Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);

  const [newClient, setNewClient] = useState({
    name: "",
    pan: "",
    gstin: "",
    type: "Private Limited",
    turnover: 50000000,
    assignedPartner: "Amit Sharma"
  });

  // Fetch live clients from backend on mount
  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await api.get("/clients");
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setClients(res.data);
      }
    } catch {
      // Keep demo clients as fallback
    }
  };

  const toggleKillSwitch = (clientId: string) => {
    setClients((prev) =>
      prev.map((c) =>
        c.id === clientId ? { ...c, killSwitchActive: !c.killSwitchActive } : c
      )
    );
  };

  const handleCreateClient = async () => {
    if (!newClient.name.trim()) return;
    const payload = {
      name: newClient.name,
      pan: newClient.pan || "AAACN9999K",
      gstin: newClient.gstin || `27${newClient.pan || "AAACN9999K"}1Z5`,
      type: newClient.type,
      turnover: newClient.turnover,
      assigned_partner: newClient.assignedPartner
    };

    try {
      const res = await api.post("/clients", payload);
      if (res.data) {
        setClients(prev => [res.data, ...prev]);
      }
    } catch {
      const created = {
        id: `c${clients.length + 1}`,
        ...payload,
        assignedPartner: newClient.assignedPartner,
        tasks_count: 6,
        killSwitchActive: false
      };
      setClients(prev => [created, ...prev]);
    }

    setNewClient({ name: "", pan: "", gstin: "", type: "Private Limited", turnover: 50000000, assignedPartner: "Amit Sharma" });
    setAddModalOpen(false);
  };

  const handleViewTasks = async (client: any) => {
    setSelectedClient(client);
    setTasksModalOpen(true);
    setLoadingTasks(true);
    try {
      const res = await api.getClientTasks(client.id);
      if (res.data && res.data.tasks) {
        setClientTasks(res.data.tasks);
      } else {
        setClientTasks([]);
      }
    } catch {
      setClientTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleRegenerateTasks = async (clientId: string) => {
    setLoadingTasks(true);
    try {
      const res = await api.generateClientTasks(clientId);
      if (res.data && res.data.tasks) {
        setClientTasks(res.data.tasks);
        setClients(prev => prev.map(c => c.id === clientId ? { ...c, tasks_count: res.data.tasks_count } : c));
      }
    } catch {}
    setLoadingTasks(false);
  };

  const handleFileUpload = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);

    try {
      const res = await api.importClientsExcel(importFile);
      setImportResult(res);
      if (res.clients && Array.isArray(res.clients)) {
        setClients(prev => [...res.clients, ...prev]);
      }
    } catch (err: any) {
      setImportResult({ status: "ERROR", error: err.message || "Failed to process spreadsheet." });
    } finally {
      setImporting(false);
    }
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.gstin.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.pan.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Portfolio & Profile Automation</h1>
          <p className="text-slate-600 text-sm mt-1">
            Bulk client onboarding from Excel, automatic compliance obligation synthesis, and isolation controls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search name, GSTIN, PAN..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-60 rounded-md border border-slate-300 bg-white pl-9 pr-4 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setImportModalOpen(true)}
            className="border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" /> Bulk Import Excel
          </Button>
          <Button
            onClick={() => setAddModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Onboard Client
          </Button>
        </div>
      </div>

      {/* Grid of Clients */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((client) => (
          <Card
            key={client.id}
            className={`transition-all bg-white border border-slate-200 ${
              client.killSwitchActive
                ? "border-2 border-red-500 bg-red-50/20"
                : "hover:shadow-md"
            }`}
          >
            <CardContent className="p-5">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                    {client.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 truncate max-w-[170px]" title={client.name}>
                      {client.name}
                    </h3>
                    <p className="text-xs text-slate-500">{client.type || client.client_type}</p>
                  </div>
                </div>
                {client.killSwitchActive ? (
                  <Badge className="bg-red-600 text-white flex items-center gap-1 text-[10px]">
                    <XCircle className="w-3 h-3" /> MANUAL
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 text-[10px]">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> ACTIVE
                  </Badge>
                )}
              </div>

              {/* Automatic Tasks Badge Bar */}
              <div className="mb-3 flex items-center justify-between bg-blue-50/70 border border-blue-200/60 rounded px-2.5 py-1 text-xs">
                <span className="text-blue-900 font-medium flex items-center gap-1">
                  <ListChecks className="w-3.5 h-3.5 text-blue-600" />
                  {client.tasks_count || 6} Statutory Tasks Scheduled
                </span>
                <button
                  onClick={() => handleViewTasks(client)}
                  className="text-blue-700 font-bold hover:underline text-[11px]"
                >
                  View Tasks &rarr;
                </button>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 mb-4 bg-slate-50 p-2.5 rounded border border-slate-200">
                <div className="flex justify-between">
                  <span>Primary GSTIN:</span>
                  <span className="font-mono font-semibold text-slate-900">{formatGSTIN(client.gstin)}</span>
                </div>
                <div className="flex justify-between">
                  <span>PAN:</span>
                  <span className="font-mono font-semibold text-slate-900">{client.pan}</span>
                </div>
                <div className="flex justify-between">
                  <span>Turnover:</span>
                  <span className="font-semibold text-slate-900">{formatIndianCurrency(client.turnover || client.annual_turnover || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Signing Partner:</span>
                  <span className="font-semibold text-slate-900">{client.assignedPartner || client.assigned_partner}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleViewTasks(client)}
                  className="flex-1 text-slate-800 text-xs font-medium"
                >
                  <Calendar className="w-3.5 h-3.5 mr-1 text-blue-600" /> Tasks
                </Button>
                <Link href="/returns" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full text-slate-800 text-xs font-medium">
                    <Briefcase className="w-3.5 h-3.5 mr-1" /> Returns
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
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* MODAL 1: Bulk Client Import from Excel */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Bulk Client Master Onboarding (.xlsx / .csv)"
      >
        <div className="space-y-4 text-xs">
          <div className="bg-slate-50 p-3 rounded border border-slate-200">
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold text-slate-800">Spreadsheet Specifications</span>
              <a
                href="http://localhost:8000/api/v1/clients/import/template"
                download="CA_Firm_OS_Client_Import_Template.xlsx"
                className="text-blue-600 font-bold hover:underline flex items-center gap-1 text-[11px]"
              >
                <Download className="w-3 h-3" /> Download Official Template (.xlsx)
              </a>
            </div>
            <p className="text-slate-500 text-[11px]">
              Columns supported: Client Name*, Entity PAN*, GSTIN, Constitution Type, Turnover (INR), Composition (Y/N), Assigned Partner, Email, Phone.
            </p>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors bg-white">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <input
              type="file"
              id="excel-file-input"
              accept=".xlsx,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <label
              htmlFor="excel-file-input"
              className="cursor-pointer font-semibold text-blue-600 hover:underline"
            >
              {importFile ? importFile.name : "Click to select .xlsx or .csv client roster"}
            </label>
            <p className="text-slate-500 text-[11px] mt-1">Automatic syntax validation for PAN & GSTIN formats</p>
          </div>

          {importResult && (
            <div className={`p-3 rounded border ${importResult.status === "SUCCESS" ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-red-50 border-red-300 text-red-900"}`}>
              {importResult.status === "SUCCESS" ? (
                <div>
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Successfully imported {importResult.imported_count} clients!
                  </div>
                  <div className="text-[11px] text-emerald-800 space-y-0.5">
                    <div>⚡ {importResult.tasks_instantiated} compliance tasks generated automatically from profiles.</div>
                    {importResult.failed_count > 0 && (
                      <div className="text-amber-800 font-medium">⚠️ {importResult.failed_count} rows had validation errors.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="font-bold flex items-center gap-1 text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  {importResult.error || "Failed to process file."}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setImportModalOpen(false)}>Close</Button>
            <Button
              disabled={!importFile || importing}
              onClick={handleFileUpload}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {importing ? "Validating & Importing..." : "Start Bulk Import"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: Client Tasks Viewer (Profile Generated) */}
      <Modal
        isOpen={tasksModalOpen}
        onClose={() => setTasksModalOpen(false)}
        title={`Compliance Tasks: ${selectedClient?.name || ""}`}
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 text-xs">
          <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded border">
            <div>
              <div className="font-bold text-slate-900">{selectedClient?.name}</div>
              <div className="text-slate-500 text-[11px]">
                {selectedClient?.type} • Turnover: {formatIndianCurrency(selectedClient?.turnover || selectedClient?.annual_turnover || 0)}
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline"
              disabled={loadingTasks}
              onClick={() => handleRegenerateTasks(selectedClient.id)}
              className="h-7 text-xs flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${loadingTasks ? "animate-spin" : ""}`} /> Regenerate
            </Button>
          </div>

          <div className="space-y-2">
            {clientTasks.map((task) => (
              <div key={task.id} className="p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        task.domain === 'GST' ? 'bg-orange-100 text-orange-800' :
                        task.domain === 'TDS' ? 'bg-purple-100 text-purple-800' :
                        task.domain === 'ROC' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {task.domain} • {task.form_id}
                      </span>
                      <span className="font-semibold text-slate-900 text-xs">{task.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 font-mono">{task.act_reference}</div>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px]">{task.frequency}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px]">
                  <div>
                    <span className="text-slate-500">Statutory Due:</span>{" "}
                    <span className={`font-mono font-bold ${task.extension_applied ? 'text-amber-700' : 'text-slate-800'}`}>
                      {task.statutory_due_date}
                    </span>
                    {task.extension_applied && (
                      <span className="ml-1 text-[10px] text-amber-700 bg-amber-50 px-1 rounded">
                        Extended by Govt (+{task.extension_applied.extended_by_days}d)
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500">Internal Safe:</span>{" "}
                    <span className="font-mono text-blue-700 font-semibold">{task.internal_buffer_date}</span>
                  </div>
                </div>
              </div>
            ))}

            {clientTasks.length === 0 && !loadingTasks && (
              <div className="py-8 text-center text-slate-500">
                No tasks generated. Click "Regenerate" to scan client profile.
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL 3: Manual Onboarding */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Partner Client Onboarding & KYC">
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-800 mb-1">Legal Entity Name</label>
            <input
              type="text"
              placeholder="e.g. Bharat Heavy Machinery Pvt Ltd"
              value={newClient.name}
              onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
              className="w-full border border-slate-300 rounded px-3 py-2 text-slate-900 bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Entity PAN (10 Chars)</label>
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
              <label className="block font-semibold text-slate-800 mb-1">GSTIN</label>
              <input
                type="text"
                maxLength={15}
                placeholder="36AAACB1234F1Z8"
                value={newClient.gstin}
                onChange={(e) => setNewClient({ ...newClient, gstin: e.target.value.toUpperCase() })}
                className="w-full border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Constitution Type</label>
              <select
                value={newClient.type}
                onChange={(e) => setNewClient({ ...newClient, type: e.target.value })}
                className="w-full border border-slate-300 rounded px-3 py-2 text-slate-900 bg-white"
              >
                <option value="Private Limited">Private Limited</option>
                <option value="Public Limited">Public Limited</option>
                <option value="LLP">LLP</option>
                <option value="Partnership">Partnership</option>
                <option value="Individual">Individual / Proprietorship</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-800 mb-1">Annual Turnover (INR)</label>
              <input
                type="number"
                value={newClient.turnover}
                onChange={(e) => setNewClient({ ...newClient, turnover: parseFloat(e.target.value) || 0 })}
                className="w-full border border-slate-300 rounded px-3 py-2 text-slate-900 bg-white"
              />
            </div>
          </div>

          <div className="bg-blue-50 p-2.5 rounded border border-blue-200 text-blue-900 text-[11px]">
            ⚡ On saving, our deterministic engine will automatically schedule statutory returns (GSTR-1, GSTR-3B, TDS 26Q, MCA AOC-4/MGT-7, Tax Audit) tailored to this entity.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateClient} className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
              Create & Generate Tasks
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
