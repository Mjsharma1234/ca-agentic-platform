"use client";

import { useState, useEffect } from "react";
import { 
  Receipt, Plus, Send, CheckCircle2, Clock, AlertTriangle, 
  Search, Eye, CreditCard, ChevronRight, Download, Filter, 
  ArrowUpRight, Building2, Calendar, FileText, Check, X
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatIndianCurrency } from "@/lib/utils";
import { api } from "@/lib/api";
import { demoClients } from "@/lib/demo-data";
import { 
  FirmInvoice, ServiceLine, RATE_CARD, mapInvoice, FirmInvoiceStatus 
} from "@/lib/billing-types";

// Fallback seed invoices if API is connecting
const INITIAL_INVOICES: FirmInvoice[] = [
  {
    id: "inv-001",
    invoiceNumber: "NC/26-27/00142",
    clientId: "c1",
    clientName: "Rajesh Textiles Pvt Ltd",
    clientGstin: "27AAACR1234F1Z5",
    clientPan: "AAACR1234F",
    services: [
      { description: "GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)", sacCode: "998215", quantity: 1, rate: 12000, amount: 12000 },
      { description: "TallyPrime Reconciled Purchase Journal Export", sacCode: "998215", quantity: 1, rate: 3000, amount: 3000 }
    ],
    subtotal: 15000,
    gstRate: 18,
    gstAmount: 2700,
    totalAmount: 17700,
    tds194jRate: 10,
    tds194jAmount: 1500,
    netReceivable: 16200,
    status: "SENT",
    issueDate: "2026-10-15",
    dueDate: "2026-10-30",
    periodOfService: "October 2026",
    paymentReceived: 0,
    notes: "Professional fees for GSTR-1, GSTR-3B preparation and IMS reconciliation.",
    createdBy: "Amit Sharma",
    template: "standard",
    sentAt: "2026-10-15T11:30:00Z"
  },
  {
    id: "inv-002",
    invoiceNumber: "NC/26-27/00143",
    clientId: "c2",
    clientName: "Mumbai Steel Corporation",
    clientGstin: "27BBBCM5678G1Z2",
    clientPan: "BBBCM5678G",
    services: [
      { description: "Tax Audit Report (Form 3CD & 3CA)", sacCode: "998215", quantity: 1, rate: 85000, amount: 85000 },
      { description: "GST Annual Return & 9C Reconciliation", sacCode: "998215", quantity: 1, rate: 45000, amount: 45000 }
    ],
    subtotal: 130000,
    gstRate: 18,
    gstAmount: 23400,
    totalAmount: 153400,
    tds194jRate: 10,
    tds194jAmount: 13000,
    netReceivable: 140400,
    status: "PAID",
    issueDate: "2026-09-28",
    dueDate: "2026-10-15",
    periodOfService: "Q2 FY 2026-27",
    paymentReceived: 140400,
    paymentDate: "2026-10-12",
    paymentReference: "NEFT-HDFC00289104",
    notes: "Tax Audit sign-off completed by CA Amit Sharma (UDIN generated).",
    createdBy: "Amit Sharma",
    template: "detailed"
  },
  {
    id: "inv-003",
    invoiceNumber: "NC/26-27/00144",
    clientId: "c3",
    clientName: "Global Tech Solutions LLP",
    clientGstin: "29CCCGT9012H1Z8",
    clientPan: "CCCGT9012H",
    services: [
      { description: "GST Monthly Compliance & Rule 88D Representation", sacCode: "998215", quantity: 1, rate: 18000, amount: 18000 }
    ],
    subtotal: 18000,
    gstRate: 18,
    gstAmount: 3240,
    totalAmount: 21240,
    tds194jRate: 10,
    tds194jAmount: 1800,
    netReceivable: 19440,
    status: "OVERDUE",
    issueDate: "2026-09-10",
    dueDate: "2026-09-25",
    periodOfService: "September 2026",
    paymentReceived: 0,
    notes: "Includes DRC-01C response filing support.",
    createdBy: "Amit Sharma",
    template: "standard",
    sentAt: "2026-09-10T09:00:00Z"
  },
  {
    id: "inv-004",
    invoiceNumber: "NC/26-27/00145",
    clientId: "c4",
    clientName: "Sharma & Sons Logistics",
    clientGstin: "07DDDSA3456J1Z1",
    clientPan: "DDDSA3456J",
    services: [
      { description: "TDS Quarterly Return (Form 26Q) Q2", sacCode: "998215", quantity: 1, rate: 7500, amount: 7500 }
    ],
    subtotal: 7500,
    gstRate: 18,
    gstAmount: 1350,
    totalAmount: 8850,
    tds194jRate: 10,
    tds194jAmount: 750,
    netReceivable: 8100,
    status: "DRAFT",
    issueDate: "2026-10-28",
    dueDate: "2026-11-12",
    periodOfService: "Q2 FY 2026-27",
    paymentReceived: 0,
    notes: "Draft invoice for partner approval before transmission.",
    createdBy: "Amit Sharma",
    template: "standard"
  }
];

export default function BillingPage() {
  const [invoices, setInvoices] = useState<FirmInvoice[]>(INITIAL_INVOICES);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<FirmInvoice | null>(null);

  // New Invoice Form state
  const [newClientId, setNewClientId] = useState(demoClients[0].id);
  const [newPeriod, setNewPeriod] = useState("October 2026");
  const [newTemplate, setNewTemplate] = useState("standard");
  const [newNotes, setNewNotes] = useState("Professional services rendered for statutory compliance.");
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([
    { description: "GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)", sacCode: "998215", quantity: 1, rate: 12000, amount: 12000 }
  ]);

  // Payment Form state
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [payRef, setPayRef] = useState<string>("");
  const [payTdsDeducted, setPayTdsDeducted] = useState<boolean>(true);

  // Fetch from API on mount
  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await api.getBillingInvoices();
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setInvoices(res.data.map(mapInvoice));
      }
    } catch {
      // Keep initial invoices as fallback
    }
  };

  // Calculations for New Invoice
  const subtotal = serviceLines.reduce((acc, l) => acc + (l.amount || 0), 0);
  const gstAmount = Math.round(subtotal * 0.18);
  const totalAmount = subtotal + gstAmount;
  const tds194jAmount = Math.round(subtotal * 0.10);
  const netReceivable = totalAmount - tds194jAmount;

  const handleAddServiceLine = (desc?: string, rate?: number) => {
    setServiceLines(prev => [
      ...prev,
      {
        description: desc || "Additional Professional Services",
        sacCode: "998215",
        quantity: 1,
        rate: rate || 5000,
        amount: rate || 5000
      }
    ]);
  };

  const handleRemoveServiceLine = (idx: number) => {
    setServiceLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateLine = (idx: number, field: keyof ServiceLine, val: any) => {
    setServiceLines(prev => {
      const updated = [...prev];
      const cur = { ...updated[idx], [field]: val };
      if (field === "quantity" || field === "rate") {
        cur.amount = (cur.quantity || 1) * (cur.rate || 0);
      }
      updated[idx] = cur;
      return updated;
    });
  };

  const handleCreateInvoice = async () => {
    const client = demoClients.find(c => c.id === newClientId) || demoClients[0];
    const newInv: Partial<FirmInvoice> = {
      clientId: client.id,
      clientName: client.name,
      clientGstin: client.gstin,
      clientPan: client.pan,
      services: serviceLines,
      subtotal,
      gstRate: 18,
      gstAmount,
      totalAmount,
      tds194jRate: 10,
      tds194jAmount,
      netReceivable,
      periodOfService: newPeriod,
      notes: newNotes,
      template: newTemplate
    };

    try {
      await api.createInvoice(newInv);
    } catch {
      // offline handling
    }

    const localInv: FirmInvoice = {
      id: `inv-${Date.now().toString().slice(-4)}`,
      invoiceNumber: `NC/26-27/00${140 + invoices.length + 1}`,
      clientId: client.id,
      clientName: client.name,
      clientGstin: client.gstin,
      clientPan: client.pan,
      services: serviceLines,
      subtotal,
      gstRate: 18,
      gstAmount,
      totalAmount,
      tds194jRate: 10,
      tds194jAmount,
      netReceivable,
      status: "DRAFT",
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
      periodOfService: newPeriod,
      paymentReceived: 0,
      notes: newNotes,
      createdBy: "Amit Sharma",
      template: newTemplate
    };

    setInvoices(prev => [localInv, ...prev]);
    setCreateModalOpen(false);
  };

  const handleSendInvoice = async (inv: FirmInvoice) => {
    try {
      await api.sendInvoice(inv.id);
    } catch {}
    setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: "SENT", sentAt: new Date().toISOString() } : i));
    if (selectedInvoice?.id === inv.id) {
      setSelectedInvoice(prev => prev ? { ...prev, status: "SENT" } : null);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    try {
      await api.recordPayment(selectedInvoice.id, {
        amount: payAmount,
        payment_date: payDate,
        reference: payRef,
        tds_deducted: payTdsDeducted
      });
    } catch {}

    setInvoices(prev => prev.map(i => {
      if (i.id === selectedInvoice.id) {
        const totalPaid = (i.paymentReceived || 0) + payAmount;
        const isFull = totalPaid >= i.netReceivable;
        return {
          ...i,
          status: isFull ? "PAID" : "PARTIALLY_PAID",
          paymentReceived: totalPaid,
          paymentDate: payDate,
          paymentReference: payRef
        };
      }
      return i;
    }));

    setPaymentModalOpen(false);
    setDetailModalOpen(false);
  };

  // Metrics computation
  const totalBilledMTD = invoices.reduce((acc, i) => acc + i.totalAmount, 0);
  const totalCollectedMTD = invoices.reduce((acc, i) => acc + (i.paymentReceived || 0), 0);
  const overdueAmount = invoices
    .filter(i => i.status === "OVERDUE")
    .reduce((acc, i) => acc + (i.netReceivable - (i.paymentReceived || 0)), 0);
  const totalTDSReceivable = invoices.reduce((acc, i) => acc + i.tds194jAmount, 0);

  // Filtered invoices
  const filtered = invoices.filter(inv => {
    const matchesFilter = filterStatus === "ALL" || inv.status === filterStatus;
    const matchesSearch = 
      inv.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.clientGstin.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusBadge = (status: FirmInvoiceStatus) => {
    switch (status) {
      case "PAID":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">PAID</Badge>;
      case "SENT":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">SENT</Badge>;
      case "OVERDUE":
        return <Badge className="bg-red-100 text-red-800 border-red-300">OVERDUE</Badge>;
      case "DRAFT":
        return <Badge className="bg-slate-100 text-slate-700 border-slate-300">DRAFT</Badge>;
      case "PARTIALLY_PAID":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">PARTIAL</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-saffron-600" />
            Billing & Invoicing Engine
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Automated billing from completed filings, custom invoice templates, and Section 194J TDS tracking.
          </p>
        </div>
        <Button 
          onClick={() => setCreateModalOpen(true)}
          className="bg-saffron-600 hover:bg-saffron-700 text-white font-medium flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Tax Invoice
        </Button>
      </div>

      {/* Section 1: Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
              <span>Total Billed (MTD)</span>
              <Receipt className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">
              {formatIndianCurrency(totalBilledMTD)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Across {invoices.length} corporate retainers</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
              <span>Total Collected</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-2">
              {formatIndianCurrency(totalCollectedMTD)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Direct Bank Transfers (NEFT/RTGS)</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
              <span>Overdue Receivables</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-600 mt-2">
              {formatIndianCurrency(overdueAmount)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Payment reminders queued</div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
              <span>TDS Receivable (194J)</span>
              <CreditCard className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-purple-700 mt-2">
              {formatIndianCurrency(totalTDSReceivable)}
            </div>
            <div className="text-xs text-slate-500 mt-1">10% Form 26AS matching credit</div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Invoice Management Table */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader className="p-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Filter Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1">
            {["ALL", "DRAFT", "SENT", "OVERDUE", "PAID"].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  filterStatus === st 
                    ? "bg-slate-900 text-white" 
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client, invoice #, GSTIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-saffron-500"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Client Name</th>
                <th className="py-3 px-4">Service Period</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">GST (18%)</th>
                <th className="py-3 px-4 text-right">TDS (194J)</th>
                <th className="py-3 px-4 text-right">Net Receivable</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-slate-900">
                    {inv.invoiceNumber}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{inv.clientName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{inv.clientGstin}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{inv.periodOfService}</td>
                  <td className="py-3 px-4 text-right font-medium text-slate-700">
                    {formatIndianCurrency(inv.subtotal)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600">
                    {formatIndianCurrency(inv.gstAmount)}
                  </td>
                  <td className="py-3 px-4 text-right text-purple-700 font-medium">
                    -{formatIndianCurrency(inv.tds194jAmount)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900">
                    {formatIndianCurrency(inv.netReceivable)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {getStatusBadge(inv.status)}
                  </td>
                  <td className="py-3 px-4 text-slate-600 font-mono">
                    {inv.dueDate}
                  </td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => { setSelectedInvoice(inv); setDetailModalOpen(true); }}
                      className="h-7 px-2 text-xs"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" /> View
                    </Button>
                    {inv.status === "DRAFT" && (
                      <Button
                        size="sm"
                        onClick={() => handleSendInvoice(inv)}
                        className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Send className="w-3.5 h-3.5 mr-1" /> Send
                      </Button>
                    )}
                    {(inv.status === "SENT" || inv.status === "OVERDUE" || inv.status === "PARTIALLY_PAID") && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedInvoice(inv);
                          setPayAmount(inv.netReceivable - (inv.paymentReceived || 0));
                          setPaymentModalOpen(true);
                        }}
                        className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CreditCard className="w-3.5 h-3.5 mr-1" /> Pay
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    No invoices found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Section 5: Benchmark Rate Card Panel */}
      <Card className="bg-slate-50 border-slate-200">
        <CardHeader className="py-3 px-4 border-b border-slate-200">
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-saffron-600" />
            Statutory Practice Rate Card (SAC: 998215 - Accounting, Auditing & Bookkeeping Services)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(RATE_CARD).map(([key, item]) => (
              <div key={key} className="p-2.5 bg-white rounded border border-slate-200 flex justify-between items-center text-xs">
                <div>
                  <div className="font-medium text-slate-800">{item.description}</div>
                  <div className="text-[10px] text-slate-500 font-mono">SAC: {item.sac}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900">{formatIndianCurrency(item.rate)}</div>
                  <button 
                    onClick={() => {
                      handleAddServiceLine(item.description, item.rate);
                      setCreateModalOpen(true);
                    }}
                    className="text-[10px] text-saffron-600 hover:text-saffron-800 font-semibold"
                  >
                    + Add to Invoice
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* MODAL 1: Create New Tax Invoice */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create CA Firm Tax Invoice"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Client</label>
              <select
                value={newClientId}
                onChange={(e) => setNewClientId(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-900"
              >
                {demoClients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.gstin})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Service Period</label>
              <input
                type="text"
                value={newPeriod}
                onChange={(e) => setNewPeriod(e.target.value)}
                placeholder="e.g. October 2026"
                className="w-full border border-slate-300 rounded px-2.5 py-1.5"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Invoice Template</label>
              <select
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
                className="w-full border border-slate-300 rounded px-2.5 py-1.5 bg-white"
              >
                <option value="standard">Standard Practice (Navy / Saffron)</option>
                <option value="detailed">Detailed Audit & Assurance</option>
                <option value="retainer">Monthly Retainer Slip</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Internal Ref / Signatory</label>
              <input
                type="text"
                readOnly
                value="CA Amit Sharma (M.No: 512891)"
                className="w-full border border-slate-200 bg-slate-50 text-slate-600 rounded px-2.5 py-1.5"
              />
            </div>
          </div>

          {/* Service Line Items */}
          <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-slate-800">Particulars / Service Items</span>
              <button 
                type="button"
                onClick={() => handleAddServiceLine()}
                className="text-saffron-600 font-semibold hover:text-saffron-800"
              >
                + Add Line
              </button>
            </div>
            <div className="space-y-2">
              {serviceLines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-white p-2 border rounded">
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => handleUpdateLine(idx, "description", e.target.value)}
                    placeholder="Description"
                    className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs"
                  />
                  <input
                    type="text"
                    value={line.sacCode}
                    readOnly
                    className="w-16 border bg-slate-50 text-slate-500 rounded px-1.5 py-1 text-xs font-mono"
                  />
                  <input
                    type="number"
                    value={line.rate}
                    onChange={(e) => handleUpdateLine(idx, "rate", parseFloat(e.target.value) || 0)}
                    placeholder="Rate"
                    className="w-24 border border-slate-200 rounded px-2 py-1 text-xs text-right font-mono"
                  />
                  <span className="w-24 text-right font-bold text-slate-800">
                    {formatIndianCurrency(line.amount)}
                  </span>
                  {serviceLines.length > 1 && (
                    <button 
                      type="button" 
                      onClick={() => handleRemoveServiceLine(idx)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Financial Calculation Summary */}
          <div className="bg-slate-100 rounded p-3 space-y-1.5 font-medium text-slate-700">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-mono">{formatIndianCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST @ 18% (CGST 9% + SGST 9%):</span>
              <span className="font-mono">{formatIndianCurrency(gstAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-900 font-bold border-t border-slate-300 pt-1">
              <span>Total Invoice Value:</span>
              <span className="font-mono">{formatIndianCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-purple-700">
              <span>Less: Client TDS under Section 194J (10%):</span>
              <span className="font-mono">-{formatIndianCurrency(tds194jAmount)}</span>
            </div>
            <div className="flex justify-between text-emerald-800 font-bold text-sm border-t border-emerald-300 pt-1">
              <span>Net Amount Receivable:</span>
              <span className="font-mono">{formatIndianCurrency(netReceivable)}</span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Notes / Terms</label>
            <textarea
              rows={2}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="w-full border border-slate-300 rounded px-2.5 py-1.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleCreateInvoice}
              className="bg-saffron-600 hover:bg-saffron-700 text-white font-medium"
            >
              Generate Tax Invoice
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: View Tax Invoice Preview */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Tax Invoice: ${selectedInvoice?.invoiceNumber || ""}`}
      >
        {selectedInvoice && (
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1 text-xs">
            {/* Header branding */}
            <div className="border-b pb-3 flex justify-between items-start">
              <div>
                <div className="font-bold text-base text-slate-900">NALLAMALA & CO.</div>
                <div className="text-slate-600">Chartered Accountants • FRN: 014829S</div>
                <div className="text-slate-500 text-[11px]">8-2-293, Road No 14, Banjara Hills, Hyderabad - 500034</div>
                <div className="text-slate-500 text-[11px] font-mono">GSTIN: 36AAAFN9821R1Z5</div>
              </div>
              <div className="text-right">
                {getStatusBadge(selectedInvoice.status)}
                <div className="text-[11px] text-slate-500 mt-1 font-mono">Date: {selectedInvoice.issueDate}</div>
                <div className="text-[11px] text-slate-500 font-mono">Due: {selectedInvoice.dueDate}</div>
              </div>
            </div>

            {/* Billed to */}
            <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
              <span className="font-bold text-slate-800">BILLED TO:</span>
              <div className="font-semibold text-slate-900">{selectedInvoice.clientName}</div>
              <div className="text-slate-600 font-mono">GSTIN: {selectedInvoice.clientGstin}</div>
              <div className="text-slate-600 font-mono">PAN: {selectedInvoice.clientPan}</div>
            </div>

            {/* Service lines */}
            <table className="w-full text-left border">
              <thead>
                <tr className="bg-slate-100 border-b">
                  <th className="p-2">Particulars</th>
                  <th className="p-2">SAC</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedInvoice.services.map((s, idx) => (
                  <tr key={idx}>
                    <td className="p-2">{s.description}</td>
                    <td className="p-2 font-mono">{s.sacCode}</td>
                    <td className="p-2 text-right font-mono">{formatIndianCurrency(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Calculations breakdown */}
            <div className="bg-slate-50 p-3 rounded space-y-1 font-medium">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-mono">{formatIndianCurrency(selectedInvoice.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST (18%):</span>
                <span className="font-mono">{formatIndianCurrency(selectedInvoice.gstAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 border-t pt-1">
                <span>Total Invoice Value:</span>
                <span className="font-mono">{formatIndianCurrency(selectedInvoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-purple-700">
                <span>TDS under Section 194J (10%):</span>
                <span className="font-mono">-{formatIndianCurrency(selectedInvoice.tds194jAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-700 text-sm border-t pt-1">
                <span>Net Receivable:</span>
                <span className="font-mono">{formatIndianCurrency(selectedInvoice.netReceivable)}</span>
              </div>
              {selectedInvoice.paymentReceived > 0 && (
                <div className="flex justify-between font-bold text-blue-700 border-t pt-1">
                  <span>Payment Received:</span>
                  <span className="font-mono">{formatIndianCurrency(selectedInvoice.paymentReceived)}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2 border-t">
              <div className="text-[11px] text-slate-500">
                Bank: HDFC Bank • A/c: 502000881920 • IFSC: HDFC0000021
              </div>
              <div className="space-x-2">
                {selectedInvoice.status === "DRAFT" && (
                  <Button 
                    onClick={() => handleSendInvoice(selectedInvoice)}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Send className="w-3.5 h-3.5 mr-1" /> Send to Client
                  </Button>
                )}
                {selectedInvoice.status !== "PAID" && (
                  <Button 
                    onClick={() => {
                      setPayAmount(selectedInvoice.netReceivable - (selectedInvoice.paymentReceived || 0));
                      setPaymentModalOpen(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CreditCard className="w-3.5 h-3.5 mr-1" /> Record Payment
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 3: Record Client Payment */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="Record Payment & Client TDS"
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Invoice</label>
            <input
              type="text"
              readOnly
              value={`${selectedInvoice?.invoiceNumber} - ${selectedInvoice?.clientName}`}
              className="w-full border bg-slate-50 rounded px-2.5 py-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Amount Received (Net of TDS)</label>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                className="w-full border rounded px-2.5 py-1.5 font-mono text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Payment Date</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full border rounded px-2.5 py-1.5 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Transaction Ref (UTR / Cheque #)</label>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="e.g. UTR-AXIS00982189"
              className="w-full border rounded px-2.5 py-1.5 font-mono"
            />
          </div>
          <div className="flex items-center gap-2 bg-purple-50 p-2.5 rounded border border-purple-200">
            <input
              type="checkbox"
              id="tds_check"
              checked={payTdsDeducted}
              onChange={(e) => setPayTdsDeducted(e.target.checked)}
              className="rounded text-purple-600"
            />
            <label htmlFor="tds_check" className="text-purple-900 font-medium">
              Client deducted 10% TDS under Section 194J ({formatIndianCurrency(selectedInvoice?.tds194jAmount || 0)})
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setPaymentModalOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment} className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
              Save Payment Record
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
