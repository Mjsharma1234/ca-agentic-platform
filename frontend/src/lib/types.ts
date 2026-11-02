/** Wire types for the CA platform API (snake_case, exactly as the backend returns them). */

export type Role = "PARTNER" | "SENIOR_MANAGER" | "MANAGER" | "REVIEWER" | "ARTICLE_TRAINEE" | "CLIENT_USER";

export interface AuthUser {
  id: string;
  firm_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role: Role | string;
  membership_no?: string | null;
}

export interface Client {
  id: string;
  name: string;
  pan: string;
  gstin: string;
  type: string;
  risk_tier: "Low" | "Medium" | "High" | "Critical";
  turnover: number;
  is_composition: boolean;
  assigned_partner: string | null;
  assigned_partner_id: string | null;
  email: string | null;
  emergency_bypass_active: boolean;
  status: string;
  tasks_count?: number;
}

export interface ClientInput {
  name: string;
  pan: string;
  gstin?: string | null;
  type: string;
  turnover: number;
  is_composition: boolean;
  email?: string | null;
}

export type GateStatus = "pending" | "approved" | "rejected" | "escalated" | "timed_out";

export interface RuleCheck {
  id: string;
  name: string;
  status: "passed" | "failed" | "warning";
  detail?: string;
}

export interface Gate {
  id: string;
  gate_id: string;
  name: string;
  client_id: string;
  client: string;
  tier: "L2" | "L3";
  required_role: string;
  status: GateStatus;
  entity_type: string;
  entity_id: string;
  description: string;
  evidence_pack: Record<string, unknown> & { rule_check_results?: RuleCheck[] };
  sla_deadline: string | null;
  sla_remaining_hours: number | null;
  urgent: boolean;
  decided_by: string | null;
  decided_at: string | null;
  notes: string | null;
}

export interface GateStats {
  pending_count: number;
  escalated_count: number;
  approved_count: number;
  rejected_count: number;
  avg_approval_time_mins: number | null;
}

export interface DashboardOverview {
  clients_count: number;
  pending_gates: number;
  upcoming_deadlines: number;
  itc_safeguarded_inr: number;
  returns_status: { filed: number; pending: number };
}

export interface DashboardException {
  id: string;
  client: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  details: string;
  gate_id: string | null;
}

export interface FilingTracker {
  completed: number;
  in_progress: number;
  not_started: number;
}

export interface Deadline {
  deadline_date: string;
  return_type: string;
  description: string;
  penalty_per_day: number;
  is_critical: boolean;
  days_remaining: number;
}

export interface DocumentItem {
  id: string;
  file_name: string;
  client_id: string;
  client: string;
  uploaded_at: string | null;
  invoice_number: string;
  invoice_date: string;
  supplier_gstin: string | null;
  supplier_name: string | null;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  total_value: number;
  extraction_confidence: number | null;
  status: "EXTRACTED" | "NEEDS_REVIEW" | "VERIFIED" | "MATCHED_2B" | string;
  source: string;
  engine?: string | null;
}

export type SigningStatus = "PENDING" | "SIGNED" | "REJECTED" | "EXPIRED" | "FAILED";

export interface SigningRequestView {
  id: string;
  entity_type: string;
  entity_id: string;
  gate_id: string;
  document_hash: string;
  document_label: string;
  signer_id: string;
  requested_by: string;
  status: SigningStatus;
  expires_at: string;
  signed_at: string | null;
  cert_fingerprint: string | null;
  failure_reason: string | null;
}

export interface SignerDevice {
  id: string;
  device_name: string;
  last_seen_at: string | null;
  revoked: boolean;
}
