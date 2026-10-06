export const demoClients = [
  { id: 'c1', name: 'Rajesh Textiles Pvt Ltd', pan: 'AAACR1234F', gstin: '27AAACR1234F1Z5', type: 'Private Limited', riskTier: 'Medium', assignedPartner: 'Amit Sharma' },
  { id: 'c2', name: 'Mumbai Steel Corporation', pan: 'BBBCM5678G', gstin: '27BBBCM5678G1Z2', type: 'Public Limited', riskTier: 'High', assignedPartner: 'Priya Patel' },
  { id: 'c3', name: 'Global Tech Solutions', pan: 'CCCGT9012H', gstin: '29CCCGT9012H1Z8', type: 'LLP', riskTier: 'Low', assignedPartner: 'Amit Sharma' },
  { id: 'c4', name: 'Sharma & Associates', pan: 'DDDSA3456J', gstin: '07DDDSA3456J1Z1', type: 'Partnership', riskTier: 'Low', assignedPartner: 'Vikram Singh' },
  { id: 'c5', name: 'Kerala Spices Export', pan: 'EEEKS7890K', gstin: '32EEEKS7890K1Z4', type: 'Private Limited', riskTier: 'Medium', assignedPartner: 'Priya Patel' },
];

export const demoGates = [
  { id: 'G2-9842', type: 'G2', name: 'OCR Review', client: 'Rajesh Textiles Pvt Ltd', tier: 'L2', status: 'pending', assignedTo: 'Staff', slaRemaining: 4, urgent: true, description: 'Review low confidence OCR extractions on 15 invoices' },
  { id: 'G3-9843', type: 'G3', name: 'IMS Commit', client: 'Mumbai Steel Corporation', tier: 'L2', status: 'pending', assignedTo: 'Staff', slaRemaining: 12, urgent: false, description: 'Verify vendor risk scores and IMS commit actions' },
  { id: 'G4-9844', type: 'G4', name: 'ITC Position', client: 'Global Tech Solutions', tier: 'L2', status: 'escalated', assignedTo: 'Manager', slaRemaining: 24, urgent: false, description: 'Approve Section 17(5) blocked credit determination' },
  { id: 'G6-9845', type: 'G6', name: 'Four-Eyes Review', client: 'Kerala Spices Export', tier: 'L3', status: 'pending', assignedTo: 'Reviewer', slaRemaining: 2, urgent: true, description: 'Final technical review of GSTR-3B before partner signing' },
  { id: 'G7-9846', type: 'G7', name: 'Partner Signing', client: 'Sharma & Associates', tier: 'L3', status: 'pending', assignedTo: 'Partner', slaRemaining: 48, urgent: false, description: 'Apply DSC and authorize filing of GSTR-1' }
];

export const demoStats = {
  activeClients: 142,
  clientsTrend: 5,
  pendingGates: 28,
  urgentGates: 7,
  returnsDue: 45,
  itcSafeguarded: 12500000 
};

export const demoDeadlines = [
  { id: 'd1', date: '2023-11-11', type: 'GSTR-1', count: 18, peak: true },
  { id: 'd2', date: '2023-11-20', type: 'GSTR-3B', count: 42, peak: true },
  { id: 'd3', date: '2023-11-07', type: 'TDS', count: 12, peak: false }
];

export const demoExceptions = [
  { id: 'e1', client: 'Mumbai Steel Corporation', description: 'Mismatch in 2B vs Purchase Register > ₹5L', severity: 'CRITICAL', gateId: 'G4-9844' },
  { id: 'e2', client: 'Rajesh Textiles Pvt Ltd', description: 'Rule 37 aging > 170 days for 5 invoices', severity: 'HIGH', gateId: 'G3-8812' },
  { id: 'e3', client: 'Global Tech Solutions', description: 'Vendor GSTIN suspended retroactively', severity: 'CRITICAL', gateId: 'G3-8813' },
  { id: 'e4', client: 'Kerala Spices Export', description: 'Missing e-way bills for inter-state supply', severity: 'MEDIUM', gateId: 'G1-7721' }
];

export const demoRuleChecks = Array.from({ length: 38 }, (_, i) => ({
  id: `rule-${i + 1}`,
  name: `Rule ${i + 1}: ${['Reverse Charge match', 'Section 16(4) time limit', 'Section 17(5) blocked credit', 'Rule 37 180-days reversal', 'Place of supply validation', 'HSN summary match', 'B2B vs B2C threshold'][i % 7]}`,
  status: i % 10 === 0 ? 'failed' : i % 5 === 0 ? 'warning' : 'passed',
  detail: i % 10 === 0 ? 'Variance exceeds 5% tolerance' : ''
}));
