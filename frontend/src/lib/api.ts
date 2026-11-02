import type {
  AuthUser, Client, ClientInput, Gate, GateStats, DashboardOverview, DashboardException, FilingTracker, Deadline,
  DocumentItem, SigningRequestView, SignerDevice,
} from "./types";

/** Same-origin BFF: the session cookie is httpOnly, so no token ever passes through this file. */
const BASE = "/bff";

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
  status: number;
}

export const UNAUTHORIZED_EVENT = "ca:unauthorized";

function errorText(body: any, fallback: string): string {
  const d = body?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg ?? "Invalid input").join("; ");
  return fallback;
}

async function request<T>(method: string, endpoint: string, body?: unknown): Promise<ApiResult<T>> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers["X-Requested-With"] = "ca-web";
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(`${BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`, {
      method,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
    if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const text = res.status === 204 ? "" : await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body (e.g. XML export) */
    }
    if (!res.ok) return { data: null, error: errorText(json, `Request failed (HTTP ${res.status})`), status: res.status };
    return { data: (json ?? (text as unknown)) as T, error: null, status: res.status };
  } catch {
    return { data: null, error: "Network error — the platform could not be reached.", status: 0 };
  }
}

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && p.append(k, v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export interface ReconciliationResult {
  summary: {
    total_books_records: number;
    total_gstr2b_records: number;
    books_total_tax: number;
    gstr2b_total_tax: number;
    eligible_itc: number;
    blocked_itc_17_5: number;
    unclaimed_in_books: number;
    missing_in_2b: number;
  };
  exact_matches: any[];
  fuzzy_matches: any[];
  value_mismatches: any[];
  missing_in_2b: any[];
  unclaimed_in_books: any[];
  blocked_credits_17_5: any[];
  gstr_3b_table4: Record<string, { igst: number; cgst: number; sgst: number; total: number }>;
}

export const api = {
  get: <T = any>(endpoint: string) => request<T>("GET", endpoint),
  post: <T = any>(endpoint: string, body?: unknown) => request<T>("POST", endpoint, body ?? {}),
  put: <T = any>(endpoint: string, body?: unknown) => request<T>("PUT", endpoint, body ?? {}),
  del: <T = any>(endpoint: string) => request<T>("DELETE", endpoint),

  // ── Auth ────────────────────────────────────────────────────────────────
  sendOtp: (identifier: string, channel?: string) =>
    request<{ status: string; channel: string; expires_in_seconds: number; dev_otp?: string }>("POST", "/auth/otp/send", { identifier, channel }),
  verifyOtp: (identifier: string, otp: string) =>
    request<{ token_type: string; user: AuthUser }>("POST", "/auth/otp/verify", { identifier, otp }),
  verifyFirebaseToken: (idToken: string) =>
    request<{ token_type: string; user: AuthUser }>("POST", "/auth/firebase/verify", { id_token: idToken }),
  getMe: () => request<AuthUser>("GET", "/auth/me"),
  logout: () => request<null>("POST", "/auth/logout", {}),
  getDemoPersonas: () =>
    request<Array<{ phone: string; email: string; full_name: string; role: string; membership_no: string | null; badge: string }>>(
      "GET", "/auth/demo-personas"
    ),

  // ── Dashboard ───────────────────────────────────────────────────────────
  getOverview: () => request<DashboardOverview>("GET", "/dashboard/overview"),
  getExceptions: () => request<DashboardException[]>("GET", "/dashboard/exceptions"),
  getFilingTracker: () => request<FilingTracker>("GET", "/dashboard/filing-tracker"),
  getDeadlines: () => request<Deadline[]>("GET", "/dashboard/deadlines"),

  // ── Gates ───────────────────────────────────────────────────────────────
  listGates: (status?: string) => request<Gate[]>("GET", `/gates${qs({ status })}`),
  getGate: (id: string) => request<Gate>("GET", `/gates/${id}`),
  getGateStats: () => request<GateStats>("GET", "/gates/stats"),
  approveGate: (id: string, notes = "") => request<Gate>("POST", `/gates/${id}/approve`, { notes }),
  rejectGate: (id: string, notes: string) => request<Gate>("POST", `/gates/${id}/reject`, { notes }),
  escalateGate: (id: string, notes: string) => request<Gate>("POST", `/gates/${id}/escalate`, { notes }),

  // ── Clients ─────────────────────────────────────────────────────────────
  listClients: () => request<Client[]>("GET", "/clients/"),
  createClient: (c: ClientInput) => request<Client>("POST", "/clients/", c),
  updateClient: (id: string, c: ClientInput) => request<Client>("PUT", `/clients/${id}`, c),
  deleteClient: (id: string) => request<null>("DELETE", `/clients/${id}`),
  getClientTasks: (id: string) => request<{ client_id: string; tasks_count: number; tasks: any[] }>("GET", `/clients/${id}/tasks`),
  generateClientTasks: (id: string) => request<{ tasks_count: number; tasks: any[] }>("POST", `/clients/${id}/generate-tasks`, {}),
  generateTasksAll: () => request<any>("POST", "/clients/generate-tasks-all", {}),
  importClientsExcel: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<any>("POST", "/clients/import-excel", fd);
  },

  // ── Documents ───────────────────────────────────────────────────────────
  listDocuments: (clientId?: string) => request<DocumentItem[]>("GET", `/documents/${qs({ client_id: clientId })}`),
  uploadDocument: (clientId: string, file: File) => {
    const fd = new FormData();
    fd.append("client_id", clientId);
    fd.append("file", file);
    return request<DocumentItem>("POST", "/documents/upload", fd);
  },
  verifyDocument: (id: string) => request<{ status: string; document: DocumentItem }>("POST", `/documents/${id}/verify`, {}),

  // ── Gate G7: desktop-signer requests (the web app never sees a PIN) ─────
  listSigningRequests: (entityId?: string) => request<SigningRequestView[]>("GET", `/signing/requests${qs({ entity_id: entityId })}`),
  getSigningRequest: (id: string) => request<SigningRequestView>("GET", `/signing/requests/${id}`),
  approveSignerDevice: (userCode: string, approve: boolean) =>
    request<{ status: string; device_name: string }>("POST", "/signing/device/approve", { user_code: userCode, approve }),
  listSignerDevices: () => request<SignerDevice[]>("GET", "/signing/devices"),
  revokeSignerDevice: (id: string) => request<null>("DELETE", `/signing/devices/${id}`),
  prepareSigning: (entityType: string, entityId: string) =>
    request<{
      entity_type: string; entity_id: string; document_hash: string; document_label: string; return_status: string;
      eligible_signers: Array<{ id: string; full_name: string }>;
    }>("GET", `/signing/prepare${qs({ entity_type: entityType, entity_id: entityId })}`),
  createSigningRequest: (body: {
    entity_type: string; entity_id: string; document_hash: string; document_label: string; signer_id: string; gate_id?: string;
  }) => request<SigningRequestView>("POST", "/signing/requests", body),

  // ── Returns / reconciliation ────────────────────────────────────────────
  getReconciliation: () => request<ReconciliationResult>("GET", "/returns/reconciliation"),
  exportTallyXml: async (): Promise<string | null> => {
    const res = await request<string>("GET", "/returns/export-tally-xml");
    return res.error ? null : (res.data as string);
  },

  // ── Billing ─────────────────────────────────────────────────────────────
  getBillingInvoices: (status?: string, clientId?: string) => request<any>("GET", `/billing/invoices${qs({ status, client_id: clientId })}`),
  getBillingInvoice: (id: string) => request<any>("GET", `/billing/invoices/${id}`),
  getBillingSummary: () => request<any>("GET", "/billing/summary"),
  createInvoice: (data: any) => request<any>("POST", "/billing/invoices", data),
  sendInvoice: (id: string) => request<any>("POST", `/billing/invoices/${id}/send`, {}),
  recordPayment: (id: string, data: { amount: number; payment_date: string; reference: string; tds_deducted: boolean }) =>
    request<any>("POST", `/billing/invoices/${id}/record-payment`, data),
  getRateCard: () => request<any>("GET", "/billing/rate-card"),
  generateInvoiceFromWork: (data: any) => request<any>("POST", "/billing/invoices/generate-from-work", data),

  // ── Government extensions ───────────────────────────────────────────────
  getActiveExtensions: () => request<any>("GET", "/firm-os/statutory-calendar/extensions"),
  applyGovernmentExtension: (extensionId: string) =>
    request<any>("POST", "/firm-os/statutory-calendar/extensions/apply", { extension_id: extensionId }),
};
