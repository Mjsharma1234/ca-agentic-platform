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

export const api = {
  get: async <T = any>(endpoint: string): Promise<{ data: T | null; error: string | null }> => {
    try {
      const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
      const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
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
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return { data, error: null };
    } catch (err: any) {
      console.warn(`API POST ${endpoint} error:`, err.message);
      return { data: null, error: err.message };
    }
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
  }
};
