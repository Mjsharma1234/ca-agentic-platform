// Billing & Invoicing types — Nallamala & Co., Chartered Accountants

export interface ServiceLine {
  description: string;
  sacCode: string;
  quantity: number;
  rate: number;
  amount: number;
}

export type FirmInvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'PAID'
  | 'OVERDUE'
  | 'PARTIALLY_PAID';

export interface FirmInvoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  clientGstin: string;
  clientPan: string;
  services: ServiceLine[];
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  tds194jRate: number;
  tds194jAmount: number;
  netReceivable: number;
  status: FirmInvoiceStatus;
  issueDate: string;
  dueDate: string;
  periodOfService: string;
  paymentReceived: number;
  paymentDate?: string;
  paymentReference?: string;
  notes: string;
  createdBy: string;
  template: string;
  sentAt?: string;
}

/** API response uses snake_case — this maps it to camelCase */
export function mapInvoice(raw: any): FirmInvoice {
  return {
    id: raw.id,
    invoiceNumber: raw.invoice_number,
    clientId: raw.client_id,
    clientName: raw.client_name,
    clientGstin: raw.client_gstin,
    clientPan: raw.client_pan,
    services: (raw.services ?? []).map((s: any) => ({
      description: s.description,
      sacCode: s.sac_code,
      quantity: s.quantity,
      rate: s.rate,
      amount: s.amount,
    })),
    subtotal: raw.subtotal,
    gstRate: raw.gst_rate,
    gstAmount: raw.gst_amount,
    totalAmount: raw.total_amount,
    tds194jRate: raw.tds_194j_rate,
    tds194jAmount: raw.tds_194j_amount,
    netReceivable: raw.net_receivable,
    status: raw.status,
    issueDate: raw.issue_date,
    dueDate: raw.due_date,
    periodOfService: raw.period_of_service,
    paymentReceived: raw.payment_received ?? 0,
    paymentDate: raw.payment_date ?? undefined,
    paymentReference: raw.payment_reference ?? undefined,
    notes: raw.notes ?? '',
    createdBy: raw.created_by,
    template: raw.template,
    sentAt: raw.sent_at ?? undefined,
  };
}

export interface BillingSummary {
  totalBilledMtd: number;
  totalCollectedMtd: number;
  totalOverdue: number;
  tdsReceivable: number;
  pendingInvoicesCount: number;
  overdueInvoicesCount: number;
  topClientsByBilling: { clientId: string; clientName: string; total: number }[];
}

export function mapSummary(raw: any): BillingSummary {
  return {
    totalBilledMtd: raw.total_billed_mtd,
    totalCollectedMtd: raw.total_collected_mtd,
    totalOverdue: raw.total_overdue,
    tdsReceivable: raw.tds_receivable,
    pendingInvoicesCount: raw.pending_invoices_count,
    overdueInvoicesCount: raw.overdue_invoices_count,
    topClientsByBilling: raw.top_clients_by_billing ?? [],
  };
}

export interface RateCardItem {
  description: string;
  sac: string;
  rate: number;
}

export const RATE_CARD: Record<string, RateCardItem> = {
  GST_MONTHLY_COMPLIANCE: {
    description: 'GST Monthly Compliance (GSTR-1, GSTR-3B, IMS)',
    sac: '998215',
    rate: 8000,
  },
  GST_ANNUAL_RETURN: {
    description: 'GST Annual Return (GSTR-9)',
    sac: '998215',
    rate: 25000,
  },
  INCOME_TAX_RETURN_INDIVIDUAL: {
    description: 'Income Tax Return - Individual',
    sac: '998215',
    rate: 5000,
  },
  INCOME_TAX_RETURN_COMPANY: {
    description: 'Income Tax Return - Company (ITR-6)',
    sac: '998215',
    rate: 35000,
  },
  TAX_AUDIT_3CD: {
    description: 'Tax Audit Report (Form 3CD)',
    sac: '998215',
    rate: 75000,
  },
  TDS_QUARTERLY_RETURN: {
    description: 'TDS Quarterly Return (26Q/27Q)',
    sac: '998215',
    rate: 6000,
  },
  ROC_ANNUAL_FILING: {
    description: 'ROC Annual Filing (MGT-7, AOC-4)',
    sac: '998215',
    rate: 15000,
  },
  NOTICE_HANDLING: {
    description: 'Notice Handling & Reply',
    sac: '998215',
    rate: 20000,
  },
  GSTR_9C_AUDIT: {
    description: 'GSTR-9C Reconciliation Statement',
    sac: '998215',
    rate: 50000,
  },
};

export const STATUS_CONFIG: Record<
  FirmInvoiceStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-300' },
  SENT: { label: 'Sent', className: 'bg-blue-100 text-blue-700 border-blue-300' },
  VIEWED: { label: 'Viewed', className: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  PAID: { label: 'Paid', className: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  OVERDUE: { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-300' },
  PARTIALLY_PAID: { label: 'Part Paid', className: 'bg-orange-100 text-orange-700 border-orange-300' },
};
