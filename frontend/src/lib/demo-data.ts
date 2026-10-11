export interface Client {
  id: string;
  name: string;
  pan: string;
  gstin: string;
  type: string;
  riskTier: 'Low' | 'Medium' | 'High' | 'Critical';
  assignedPartner: string;
  turnover: number;
  killSwitchActive?: boolean;
}

export interface GateDecisionItem {
  id: string;
  type: string;
  name: string;
  client: string;
  clientId: string;
  tier: 'L2' | 'L3';
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  assignedTo: string;
  slaRemaining: number;
  urgent: boolean;
  description: string;
  decidedNote?: string;
}

export interface ExtractedDocument {
  id: string;
  fileName: string;
  client: string;
  uploadedAt: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierGstin: string;
  supplierName: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  totalValue: number;
  confidence: number;
  status: 'EXTRACTED' | 'NEEDS_REVIEW' | 'VERIFIED' | 'MATCHED_2B';
  source: 'PORTAL_UPLOAD' | 'WABA_PHOTO' | 'EMAIL_PDF' | 'ERP_SYNC';
  gateId?: string;
}

export interface StatutoryDeadlineItem {
  id: string;
  date: string;
  type: 'GSTR-1' | 'GSTR-1A' | 'GSTR-3B' | 'IMS-CUTOFF' | 'TDS' | 'PF-ESI' | 'ADV-TAX' | 'ITR';
  title: string;
  section: string;
  penalty: string;
  count: number;
  completedCount: number;
  peak: boolean;
  description: string;
}

export const demoClients: Client[] = [
  { id: 'c1', name: 'Rajesh Textiles Pvt Ltd', pan: 'AAACR1234F', gstin: '27AAACR1234F1Z5', type: 'Private Limited', riskTier: 'Medium', assignedPartner: 'Amit Sharma', turnover: 145000000, killSwitchActive: false },
  { id: 'c2', name: 'Mumbai Steel Corporation', pan: 'BBBCM5678G', gstin: '27BBBCM5678G1Z2', type: 'Public Limited', riskTier: 'High', assignedPartner: 'Priya Patel', turnover: 520000000, killSwitchActive: false },
  { id: 'c3', name: 'Global Tech Solutions LLP', pan: 'CCCGT9012H', gstin: '29CCCGT9012H1Z8', type: 'LLP', riskTier: 'Low', assignedPartner: 'Amit Sharma', turnover: 89000000, killSwitchActive: false },
  { id: 'c4', name: 'Sharma & Sons Logistics', pan: 'DDDSA3456J', gstin: '07DDDSA3456J1Z1', type: 'Partnership', riskTier: 'Low', assignedPartner: 'Vikram Singh', turnover: 42000000, killSwitchActive: false },
  { id: 'c5', name: 'Kerala Spices Export Pvt Ltd', pan: 'EEEKS7890K', gstin: '32EEEKS7890K1Z4', type: 'Private Limited', riskTier: 'Medium', assignedPartner: 'Priya Patel', turnover: 210000000, killSwitchActive: false },
  { id: 'c6', name: 'Deccan Precision Auto Ltd', pan: 'FFFDP4321L', gstin: '36FFFDP4321L1Z9', type: 'Private Limited', riskTier: 'Critical', assignedPartner: 'Vikram Singh', turnover: 680000000, killSwitchActive: false },
];

export const demoGates: GateDecisionItem[] = [
  { id: 'G2-9842', type: 'G2', name: 'Low-Confidence OCR Review', client: 'Rajesh Textiles Pvt Ltd', clientId: 'c1', tier: 'L2', status: 'pending', assignedTo: 'Rohan (Staff)', slaRemaining: 4, urgent: true, description: 'Verify cropped bounding box on handwritten LR & GSTIN digits (Confidence: 0.86 < 0.95 threshold).' },
  { id: 'G3-9843', type: 'G3', name: 'IMS Inward Invoice Commit', client: 'Mumbai Steel Corporation', clientId: 'c2', tier: 'L2', status: 'pending', assignedTo: 'Sneha (Reviewer)', slaRemaining: 12, urgent: true, description: 'Commit Accept / Reject / Pend actions on 14 supplier invoices before 14th IMS cutoff.' },
  { id: 'G4-9844', type: 'G4', name: 'ITC Mismatch & Sec 17(5) Claim', client: 'Global Tech Solutions LLP', clientId: 'c3', tier: 'L2', status: 'pending', assignedTo: 'Karan (Manager)', slaRemaining: 18, urgent: false, description: 'Approve GSTR-2B vs Books delta (₹70,000 variance) and Rule 37 180-day reversal schedule.' },
  { id: 'G6-9845', type: 'G6', name: 'Four-Eyes Return Approval', client: 'Kerala Spices Export Pvt Ltd', clientId: 'c5', tier: 'L2', status: 'pending', assignedTo: 'Sneha (Reviewer != Prep)', slaRemaining: 2, urgent: true, description: 'Mandatory independent four-eyes verification of GSTR-3B return and 38 deterministic rule checks.' },
  { id: 'G7-9846', type: 'G7', name: 'Partner Class-3 DSC Signing', client: 'Sharma & Sons Logistics', clientId: 'c4', tier: 'L3', status: 'pending', assignedTo: 'CA Amit Sharma (Partner)', slaRemaining: 24, urgent: false, description: 'Statutory return signing via Zero-Trust Ephemeral RAM HSM (<30s TTL).' },
  { id: 'G11-9847', type: 'G11', name: 'DRC-01B / 01C Tax Notice Reply', client: 'Deccan Precision Auto Ltd', clientId: 'c6', tier: 'L3', status: 'pending', assignedTo: 'CA Vikram Singh (Partner)', slaRemaining: 6, urgent: true, description: 'Rule 88D ITC excess claim intimation — review DRC-03 Section 50 interest pack before 7-day portal lock.' },
];

export const demoDocuments: ExtractedDocument[] = [
  {
    id: 'DOC-1001',
    fileName: 'Reliance_Polymers_INV_8821.pdf',
    client: 'Rajesh Textiles Pvt Ltd',
    uploadedAt: '10 mins ago',
    invoiceNumber: 'RPL/26-27/08821',
    invoiceDate: '2026-10-04',
    supplierGstin: '27AAACR5055K1Z8',
    supplierName: 'Reliance Polymers Ltd',
    taxableValue: 450000,
    igst: 0,
    cgst: 40500,
    sgst: 40500,
    totalValue: 531000,
    confidence: 0.99,
    status: 'MATCHED_2B',
    source: 'EMAIL_PDF'
  },
  {
    id: 'DOC-1002',
    fileName: 'WhatsApp_Image_2026-10-08_Bill.jpg',
    client: 'Rajesh Textiles Pvt Ltd',
    uploadedAt: '28 mins ago',
    invoiceNumber: 'SHV-2026-412',
    invoiceDate: '2026-10-05',
    supplierGstin: '24AABCS9821E1Z1',
    supplierName: 'Shree Ganesh Dyeing Works',
    taxableValue: 150000,
    igst: 27000,
    cgst: 0,
    sgst: 0,
    totalValue: 177000,
    confidence: 0.86,
    status: 'NEEDS_REVIEW',
    source: 'WABA_PHOTO',
    gateId: 'G2-9842'
  },
  {
    id: 'DOC-1003',
    fileName: 'JSW_Steel_Coils_Oct26.pdf',
    client: 'Mumbai Steel Corporation',
    uploadedAt: '1 hour ago',
    invoiceNumber: 'JSW/MH/99201',
    invoiceDate: '2026-10-02',
    supplierGstin: '27AAACJ4321M1Z2',
    supplierName: 'JSW Steel Coated Products Ltd',
    taxableValue: 1850000,
    igst: 0,
    cgst: 166500,
    sgst: 166500,
    totalValue: 2183000,
    confidence: 0.98,
    status: 'VERIFIED',
    source: 'ERP_SYNC'
  },
  {
    id: 'DOC-1004',
    fileName: 'AWS_Cloud_Services_Oct26.pdf',
    client: 'Global Tech Solutions LLP',
    uploadedAt: '3 hours ago',
    invoiceNumber: 'AIN26-9910234',
    invoiceDate: '2026-10-01',
    supplierGstin: '29AABCA8812D1Z5',
    supplierName: 'Amazon Internet Services Pvt Ltd',
    taxableValue: 320000,
    igst: 57600,
    cgst: 0,
    sgst: 0,
    totalValue: 377600,
    confidence: 0.99,
    status: 'MATCHED_2B',
    source: 'PORTAL_UPLOAD'
  }
];

export const demoStats = {
  activeClients: 142,
  clientsTrend: 8,
  pendingGates: 6,
  urgentGates: 4,
  returnsDue: 45,
  itcSafeguarded: 12850000 
};

export const demoDeadlines: StatutoryDeadlineItem[] = [
  { id: 'd1', date: '2026-10-07', type: 'TDS', title: 'TDS / TCS Deposit (Challan 281)', section: 'Sec 200(1) IT Act', penalty: '1.5% per month interest u/s 201(1A)', count: 38, completedCount: 38, peak: false, description: 'Monthly deposit of tax deducted/collected at source for September.' },
  { id: 'd2', date: '2026-10-11', type: 'GSTR-1', title: 'GSTR-1 Outward Supplies Filing', section: 'Sec 37 CGST Act', penalty: '₹50/day late fee + blocks buyer GSTR-2B ITC', count: 112, completedCount: 94, peak: true, description: 'Monthly statement of outward supplies for taxpayers with turnover > ₹5 Cr or opted-in.' },
  { id: 'd3', date: '2026-10-14', type: 'IMS-CUTOFF', title: 'GSTR-2B Generation & IMS Action Cutoff', section: 'Rule 60(7) CGST', penalty: 'Unaccepted pending bills excluded from 2B', count: 142, completedCount: 88, peak: true, description: 'Recipient must commit Accept / Reject / Pend on Invoice Management System (IMS) before static 2B lock.' },
  { id: 'd4', date: '2026-10-15', type: 'PF-ESI', title: 'EPFO ECR & ESIC Monthly Contribution', section: 'Sec 38 EPF / Sec 40 ESI', penalty: '12% p.a. interest + up to 25% damages u/s 14B', count: 64, completedCount: 51, peak: false, description: 'Provident Fund and Employee State Insurance remittance for prior month.' },
  { id: 'd5', date: '2026-10-17', type: 'GSTR-1A', title: 'GSTR-1A Amendment Window Closes', section: 'Rule 59(1A) CGST', penalty: 'Amendments deferred to next month', count: 19, completedCount: 12, peak: false, description: 'Window to amend or add missed outward invoices before GSTR-3B auto-population locks.' },
  { id: 'd6', date: '2026-10-20', type: 'GSTR-3B', title: 'GSTR-3B Monthly Return & Tax Payment', section: 'Sec 39(1) CGST Act', penalty: '18% p.a. Sec 50 interest + ₹50/day late fee', count: 142, completedCount: 62, peak: true, description: 'Consolidated monthly summary return of outward supplies, ITC claimed, and net tax payment.' },
  { id: 'd7', date: '2026-10-31', type: 'TDS', title: 'Form 24Q / 26Q Q2 Quarterly TDS Return', section: 'Sec 200(3) IT Act', penalty: '₹200/day u/s 234E + penalty u/s 271H', count: 96, completedCount: 30, peak: true, description: 'Quarterly statement of TDS deducted for July–September quarter validated via NSDL FVU.' },
  { id: 'd8', date: '2026-10-31', type: 'ITR', title: 'Corporate ITR-5 / ITR-6 Filing (Audit Cases)', section: 'Sec 139(1) IT Act', penalty: '₹5,000 fee u/s 234F + Sec 234A interest + loss carry-forward bar', count: 54, completedCount: 18, peak: true, description: 'Annual Income Tax Return filing deadline for corporate & tax-audit assessees.' },
];

export const demoExceptions = [
  { id: 'e1', client: 'Mumbai Steel Corporation', description: 'Mismatch in GSTR-2B vs Purchase Register > ₹5,00,000 (14 IMS invoices pending)', severity: 'CRITICAL', gateId: 'G3-9843' },
  { id: 'e2', client: 'Rajesh Textiles Pvt Ltd', description: 'Low OCR confidence (0.86) on WhatsApp bill GSTIN & handwritten LR amount', severity: 'HIGH', gateId: 'G2-9842' },
  { id: 'e3', client: 'Deccan Precision Auto Ltd', description: 'DRC-01C Rule 88D Intimation received — 5-day partner SLA buffer active', severity: 'CRITICAL', gateId: 'G11-9847' },
  { id: 'e4', client: 'Global Tech Solutions LLP', description: 'Section 17(5) blocked credit flagged on catering & club membership bills (₹42,500)', severity: 'MEDIUM', gateId: 'G4-9844' }
];

export const demoRuleChecks = [
  { id: 'R01', name: 'Rule 01: GSTIN Format & Checksum Modulo-36 Verification', status: 'passed', detail: 'All 148 counterparty GSTINs passed modulo-36 check digit verification.' },
  { id: 'R02', name: 'Rule 02: Return Period Temporal Validity Check', status: 'passed', detail: 'Return period 10-2026 is open and valid.' },
  { id: 'R03', name: 'Rule 03: Non-Negative Outward Tax Liability Invariant', status: 'passed', detail: 'Table 3.1(a) CGST ₹8,45,000 | SGST ₹8,45,000 | IGST ₹12,10,000.' },
  { id: 'R04', name: 'Rule 04: Rule 36(4) / GSTR-2B Hard Ceiling Check (DRC-01C Guard)', status: 'passed', detail: 'ITC claimed (₹16,85,000) <= GSTR-2B Available Credit (₹16,85,000). Zero inflation.' },
  { id: 'R05', name: 'Rule 05: CGST == SGST Intra-State Symmetry Invariant', status: 'passed', detail: 'Exact rupee parity verified across all 84 intra-state invoices.' },
  { id: 'R06', name: 'Rule 06: Place of Supply vs IGST/CGST+SGST Tax Head Check', status: 'passed', detail: 'Zero cross-state tax head misclassifications.' },
  { id: 'R07', name: 'Rule 07: Section 17(5) Blocked Credit Exclusion Check', status: 'warning', detail: '3 invoices (₹42,500) flagged under Sec 17(5)(b) Food/Beverages & moved to Table 4(B)(2) Ineligible.' },
  { id: 'R08', name: 'Rule 08: Rule 37 180-Day Supplier Payment Aging Check', status: 'warning', detail: '2 supplier bills (₹38,200 ITC) at Day 164 — approaching 180-day reversal + 18% Sec 50 interest.' },
  { id: 'R09', name: 'Rule 09: Duplicate Invoice Number Detection (FY Scope)', status: 'passed', detail: 'Zero duplicate invoice numbers across current financial year.' },
  { id: 'R10', name: 'Rule 10: 6-Digit Mandatory HSN / SAC Summary Validation', status: 'passed', detail: 'All outward lines carry valid 6-digit HSN codes (Turnover > ₹5 Cr).' },
  { id: 'R11', name: 'Rule 11: NIC e-Invoice IRN 30-Day Reporting Window Check', status: 'passed', detail: '100% of B2B invoices have valid signed 64-character IRN hashes.' },
  { id: 'R12', name: 'Rule 12: Section 16(4) Time-Bar Cutoff Verification', status: 'passed', detail: 'No prior-FY invoices claimed past November 30 statutory bar.' },
  { id: 'R13', name: 'Rule 13: Reverse Charge Mechanism (RCM) Table 3.1(d) Liability Match', status: 'passed', detail: 'RCM liability of ₹18,900 on GTA & Legal Services matched with cash payment.' },
  { id: 'R14', name: 'Rule 14: Active Counterparty GSTIN Status Verification', status: 'failed', detail: '1 supplier (27AABCS9821E1Z1) shows retrospective suspension alert — ₹27,000 ITC held in pending.' },
  { id: 'R15', name: 'Rule 15: Line-Item to Header Rupee Checksum Verification', status: 'passed', detail: 'Sum of line items equals invoice header totals within ₹0.00 tolerance.' },
  ...Array.from({ length: 23 }, (_, i) => ({
    id: `R${16 + i}`,
    name: `Rule ${16 + i}: ${[
      'GSTR-1 vs GSTR-3B Table 3.1 Outward Liability Reconciliation (Rule 88C)',
      'e-Way Bill Part-A/Part-B vs Outward Invoice Value Match',
      'Zero-Rated Export LUT / Bond Validity & Shipping Bill Match',
      'Credit Note vs Original Tax Invoice Linkage Verification',
      'Section 50 Interest Rupee-Accurate Calculation Verification',
      'Section 47 Late Fee Cap & Nil Return Slab Verification',
      'Electronic Cash & Credit Ledger Offset Order (Sec 49 / Rule 88A)',
      'Input Service Distributor (ISD) Turnover Apportionment Check'
    ][i % 8]}`,
    status: 'passed',
    detail: 'Verified deterministically by Stratum 1 Python Rule Engine.'
  }))
];
