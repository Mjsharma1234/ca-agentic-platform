const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
  gstr_3b_table4: {
    table_4_A_5_all_other_itc: { igst: number; cgst: number; sgst: number; total: number };
    table_4_B_1_as_per_rule_38_42_43_and_17_5: { igst: number; cgst: number; sgst: number; total: number };
    table_4_C_net_itc_available: { igst: number; cgst: number; sgst: number; total: number };
    table_4_D_2_ineligible_under_16_4_or_pos: { igst: number; cgst: number; sgst: number; total: number };
  };
}

const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("ca_token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
};

export const api = {
  get: async <T = any>(endpoint: string): Promise<{ data: T | null; error: string | null }> => {
    try {
      const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return { data, error: null };
    } catch (err: any) {
      console.warn(`API GET ${endpoint} error:`, err.message);
      return { data: null, error: err.message };
    }
  },

  post: async <T = any>(endpoint: string, body?: any): Promise<{ data: T | null; error: string | null }> => {
    try {
      const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
      const res = await fetch(url, {
        method: "POST",
        headers: getAuthHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return { data, error: null };
    } catch (err: any) {
      console.warn(`API POST ${endpoint} error:`, err.message);
      return { data: null, error: err.message };
    }
  },

  // Auth & OTP Endpoints
  sendOtp: async (identifier: string, channel?: string) => {
    return api.post<{ status: string; channel: string; expires_in_seconds: number; dev_otp?: string }>(
      "/auth/otp/send",
      { identifier, channel }
    );
  },

  verifyOtp: async (identifier: string, otp: string) => {
    return api.post<{
      access_token: string;
      token_type: string;
      user: {
        id: string;
        firm_id: string;
        full_name: string;
        email: string;
        phone: string;
        role: string;
        membership_no?: string;
      };
    }>("/auth/otp/verify", { identifier, otp });
  },

  verifyFirebaseToken: async (idToken: string) => {
    return api.post<{
      access_token: string;
      token_type: string;
      user: {
        id: string;
        firm_id: string;
        full_name: string;
        email: string;
        phone: string;
        role: string;
        membership_no?: string;
      };
    }>("/auth/firebase/verify", { id_token: idToken });
  },

  getMe: async () => {
    return api.get<{
      id: string;
      firm_id: string;
      full_name: string;
      email: string;
      phone: string;
      role: string;
      membership_no?: string;
    }>("/auth/me");
  },

  getDemoPersonas: async () => {
    return api.get<Array<{
      phone: string;
      email: string;
      full_name: string;
      role: string;
      membership_no: string | null;
      badge: string;
    }>>("/auth/demo-personas");
  },

  seedDatabase: async () => {
    return api.post("/seed");
  },

  getReconciliation: async () => {
    return api.get<ReconciliationResult>("/returns/reconciliation");
  },

  exportTallyXml: async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/returns/export-tally-xml`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      console.error("Export Tally XML error:", err);
      return null;
    }
  },

  signReturn: async (returnId: string) => {
    return api.post(`/returns/${returnId}/sign`);
  },

  // ── Billing & Invoicing ──────────────────────────────────────────────────

  getBillingInvoices: async (status?: string, clientId?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (clientId) params.append('client_id', clientId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return api.get(`/billing/invoices${qs}`);
  },

  getBillingInvoice: async (id: string) => {
    return api.get(`/billing/invoices/${id}`);
  },

  getBillingSummary: async () => {
    return api.get('/billing/summary');
  },

  createInvoice: async (data: any) => {
    return api.post('/billing/invoices', data);
  },

  sendInvoice: async (id: string) => {
    return api.post(`/billing/invoices/${id}/send`);
  },

  recordPayment: async (
    id: string,
    data: { amount: number; payment_date: string; reference: string; tds_deducted: boolean }
  ) => {
    return api.post(`/billing/invoices/${id}/record-payment`, data);
  },

  getRateCard: async () => {
    return api.get('/billing/rate-card');
  },

  generateInvoiceFromWork: async (data: any) => {
    return api.post('/billing/invoices/generate-from-work', data);
  },

  // ── Client Bulk Import & Auto-Tasks ──
  importClientsExcel: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const url = `${API_BASE}/clients/import-excel`;
    const res = await fetch(url, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  },

  generateTasksAll: async () => {
    return api.post('/clients/generate-tasks-all');
  },

  generateClientTasks: async (clientId: string) => {
    return api.post(`/clients/${clientId}/generate-tasks`);
  },

  getClientTasks: async (clientId: string) => {
    return api.get(`/clients/${clientId}/tasks`);
  },

  // ── Government Extension & Auto-Redating ──
  getActiveExtensions: async () => {
    return api.get('/statutory-calendar/extensions');
  },

  applyGovernmentExtension: async (extensionId: string) => {
    return api.post('/statutory-calendar/extensions/apply', { extension_id: extensionId });
  },
};
