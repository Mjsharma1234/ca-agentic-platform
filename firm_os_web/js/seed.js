/* Bahi — seed data. Every entity is synthetic (based on the Nallamala & Co. synthetic test pack). */

const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const D = (n, h = 10, m = 0) => { const d = new Date(TODAY.getTime() + n * 864e5); d.setHours(h, m, 0, 0); return d.toISOString(); };

const FIRM = {
  name: 'Nallamala & Co.', sub: 'Chartered Accountants', frn: 'FRN 012345S', city: 'Hyderabad', gstin: '36AAQFN2210K1Z3',
  partnersCeiling: 60, peerReview: 'Valid till 31 Mar 2028'
};

/* ---------- roles: who may do what ---------- */
const ROLES = {
  MP: { name: 'Managing Partner', short: 'Managing partner', tier: 5 },
  PT: { name: 'Partner', short: 'Partner', tier: 4 },
  MG: { name: 'Manager', short: 'Manager', tier: 3 },
  SA: { name: 'Semi-qualified assistant', short: 'Senior assistant', tier: 2 },
  PX: { name: 'Payroll executive', short: 'Payroll', tier: 2 },
  CC: { name: 'Compliance coordinator', short: 'Coordinator', tier: 2 },
  AR: { name: 'Article assistant', short: 'Article', tier: 1 },
  FO: { name: 'Front office & admin', short: 'Front office', tier: 1 }
};

/* capability → roles that hold it. Edited live on the Access page (partner only). */
const CAPS = [
  { k: 'all_clients', n: 'See every client', grp: 'Visibility', roles: ['MP', 'PT', 'CC'] },
  { k: 'assigned_clients', n: 'See assigned clients only', grp: 'Visibility', roles: ['MG', 'SA', 'PX', 'AR', 'FO'], note: 'Ethical wall — enforced per client' },
  { k: 'billing', n: 'See fees, invoices & receivables', grp: 'Visibility', roles: ['MP', 'PT', 'FO'] },
  { k: 'team_cost', n: 'See salaries, utilisation & cost', grp: 'Visibility', roles: ['MP', 'PT'] },
  { k: 'ledger', n: 'Query the permanent record', grp: 'Visibility', roles: ['MP', 'PT', 'MG', 'CC'] },
  { k: 'prepare', n: 'Prepare returns & working papers', grp: 'Production', roles: ['MP', 'PT', 'MG', 'SA', 'AR', 'PX'] },
  { k: 'review', n: 'Four-eyes review (G6) — never own work', grp: 'Production', roles: ['MP', 'PT', 'MG', 'SA'] },
  { k: 'g2', n: 'Confirm low-confidence values (G2)', grp: 'Production', roles: ['MP', 'PT', 'MG', 'SA', 'AR', 'PX', 'CC'] },
  { k: 'g3', n: 'Commit invoice decisions (G3) up to ₹50,000', grp: 'Production', roles: ['MP', 'PT', 'MG', 'SA'] },
  { k: 'g3_high', n: 'Commit invoice / credit decisions above ₹50,000', grp: 'Production', roles: ['MP', 'PT'] },
  { k: 'g5', n: 'Second-approve hand-typed journals (G5)', grp: 'Production', roles: ['MP', 'PT', 'MG', 'SA'] },
  { k: 'g17', n: 'Release payroll & PF (G17)', grp: 'Production', roles: ['MP', 'PT', 'MG', 'PX'] },
  { k: 'sign', n: 'Sign with DSC (G7)', grp: 'Personal professional acts', roles: ['MP', 'PT'], locked: true },
  { k: 'udin', n: 'Generate UDIN (G8)', grp: 'Personal professional acts', roles: ['MP', 'PT'], locked: true },
  { k: 'certify', n: 'Certify reconciliations & reports (G15)', grp: 'Personal professional acts', roles: ['MP', 'PT'], locked: true },
  { k: 'position', n: 'Take tax positions & approve rules (G14)', grp: 'Personal professional acts', roles: ['MP', 'PT'], locked: true },
  { k: 'notice', n: 'Reply to tax authorities (G11)', grp: 'Personal professional acts', roles: ['MP', 'PT'], locked: true },
  { k: 'onboard', n: 'Accept / continue / resign clients (G13, G18)', grp: 'Firm decisions', roles: ['MP', 'PT'], locked: true },
  { k: 'bill', n: 'Approve client invoices (G9)', grp: 'Firm decisions', roles: ['MP', 'PT'] },
  { k: 'thirdparty', n: 'Release client data to third parties (G16)', grp: 'Firm decisions', roles: ['MP', 'PT'], locked: true },
  { k: 'chase', n: 'Override chasing of a client (G1)', grp: 'Firm decisions', roles: ['MP', 'PT'] },
  { k: 'send', n: 'Click send on client documents (G12)', grp: 'Client contact', roles: ['MP', 'PT', 'MG', 'SA', 'CC', 'FO'] },
  { k: 'g10', n: 'Answer routed client messages (G10)', grp: 'Client contact', roles: ['MP', 'PT', 'MG', 'SA', 'CC', 'FO'] },
  { k: 'automations', n: 'Edit client automations & templates', grp: 'Client contact', roles: ['MP', 'PT', 'CC'] },
  { k: 'creds', n: 'Reveal client portal credentials', grp: 'Security', roles: ['MP', 'PT', 'MG'], note: 'Every reveal is logged with a reason' },
  { k: 'dsc_custody', n: 'Issue / receive DSC tokens', grp: 'Security', roles: ['MP', 'PT', 'FO'] },
  { k: 'connectors', n: 'Manage connectors & secrets', grp: 'Security', roles: ['MP'] },
  { k: 'agents', n: 'Switch any routine to shadow (on-call)', grp: 'Security', roles: ['MP', 'PT', 'MG'] },
  { k: 'promote', n: 'Promote a routine out of shadow', grp: 'Security', roles: ['MP'], locked: true },
  { k: 'access', n: 'Edit roles & ethical walls', grp: 'Security', roles: ['MP'], locked: true },
  { k: 'export', n: 'Export data (watermarked)', grp: 'Security', roles: ['MP', 'PT', 'MG'] },
  { k: 'agent_file', n: 'File · sign · submit — by any automation', grp: 'Assigned to nobody', roles: [], never: true }
];

const TEAM = [
  { id: 'srinivas', name: 'CA Srinivas Nallamala', short: 'Srinivas', role: 'MP', mno: '212345', color: '#3F4654', focus: 'Managing partner · tax & advisory', since: 2004, cost: 0, signed: 41, ceilingOther: 4, cpe: 32, status: 'In office' },
  { id: 'meera', name: 'CA Meera Iyer', short: 'Meera', role: 'PT', mno: '219876', color: '#4A4E63', focus: 'Partner · audit & assurance', since: 2011, cost: 0, signed: 49, ceilingOther: 6, cpe: 41, status: 'Client site · Deccan Pharma' },
  { id: 'farhan', name: 'CA Farhan Qureshi', short: 'Farhan', role: 'MG', mno: '245511', color: '#3E5156', focus: 'Manager · GST', since: 2018, cost: 145000, cpe: 22, status: 'In office' },
  { id: 'divya', name: 'CA Divya Reddy', short: 'Divya', role: 'MG', mno: '251203', color: '#465166', focus: 'Manager · direct tax & TDS', since: 2019, cost: 138000, cpe: 18, status: 'Work from home' },
  { id: 'karthik', name: 'Karthik Rao', short: 'Karthik', role: 'SA', color: '#5A5A52', focus: 'Company law · FEMA', since: 2016, cost: 62000, status: 'In office' },
  { id: 'lavanya', name: 'Lavanya Kota', short: 'Lavanya', role: 'SA', color: '#4B564C', focus: 'GST returns & reconciliation', since: 2017, cost: 58000, status: 'In office' },
  { id: 'anil', name: 'Anil Varma', short: 'Anil', role: 'PX', color: '#55565B', focus: 'Payroll · PF · ESI · PT', since: 2020, cost: 42000, status: 'In office' },
  { id: 'sushma', name: 'Sushma Goud', short: 'Sushma', role: 'CC', color: '#5A5363', focus: 'Compliance coordinator', since: 2021, cost: 38000, status: 'In office' },
  { id: 'vamsi', name: 'Vamsi Krishna', short: 'Vamsi', role: 'AR', color: '#4E5361', focus: 'Article · year 2 · GST & books', since: 2025, cost: 9000, article: { start: '2025-02-10', reg: 'Form 103 · registered', stipend: 9000, study: 12 }, status: 'In office' },
  { id: 'pooja', name: 'Pooja Nair', short: 'Pooja', role: 'AR', color: '#475457', focus: 'Article · year 1 · audit', since: 2026, cost: 7500, article: { start: '2026-01-05', reg: 'Form 103 · registered', stipend: 7500, study: 6 }, status: 'Client site · Deccan Pharma' },
  { id: 'rohit', name: 'Rohit Jain', short: 'Rohit', role: 'AR', color: '#4D5566', focus: 'Article · year 3 · direct tax', since: 2024, cost: 10000, article: { start: '2024-03-18', reg: 'Form 103 · registered', stipend: 10000, study: 22 }, status: 'Study leave' },
  { id: 'imran', name: 'Imran Shaikh', short: 'Imran', role: 'FO', color: '#585A5F', focus: 'Front office · inward / outward · DSC custody', since: 2019, cost: 28000, status: 'In office' }
];
/* Untouched copy of the demo team: TEAM itself is replaced by the firm's staff once signed in. */
const TEAM_SEED = TEAM.map(t => ({ ...t }));

/* ---------- clients ---------- */
const CLIENTS = [
  { id: 'c01', name: 'Kesarla Moulded Products Pvt Ltd', short: 'Kesarla', type: 'Private company', pan: 'AAJCK4417M', gstin: '36AAJCK4417M1Z6', state: 'TS', city: 'Hyderabad', tags: ['co', 'gstm', 'einv', 'ewb', 'tds', 'payroll', 'esi', 'pt-TS', 'taudit', 'saudit', 'books', 'msmedue', 'adv', 'loan', 'mfg', 'lwf'], partner: 'srinivas', manager: 'farhan', team: ['lavanya', 'vamsi'], turnover: 142000000, fee: 840000, lang: 'Telugu-English', channel: 'WhatsApp', risk: 'Medium', health: 71, since: 2019, contact: 'K. Raghava (Director)', books: 'Tally Prime (desktop)' },
  { id: 'c02', name: 'Arjun Talluri', short: 'Arjun T.', type: 'Individual · salaried', pan: 'AXQPT6623R', state: 'TS', city: 'Hyderabad', tags: ['ind', 'adv'], partner: 'srinivas', manager: 'divya', team: ['rohit'], turnover: 0, fee: 18000, lang: 'English', channel: 'Email', risk: 'Low', health: 94, since: 2021, contact: 'Arjun Talluri', books: '—' },
  { id: 'c03', name: 'Dr Harini Vemulapati (SmileArc Dental)', short: 'Dr Harini', type: 'Individual · professional', pan: 'BHVPV2281K', state: 'TS', city: 'Hyderabad', tags: ['prof', 'tds', 'adv', 'taudit', 'pt-TS'], partner: 'srinivas', manager: 'divya', team: ['rohit'], turnover: 21500000, fee: 96000, lang: 'Hinglish', channel: 'WhatsApp', risk: 'Medium', health: 66, since: 2022, contact: 'Dr Harini V.', books: 'Zoho Books' },
  { id: 'c04', name: 'Godavari Agro Foods LLP', short: 'Godavari Agro', type: 'LLP', pan: 'AAUFG7731P', gstin: '37AAUFG7731P1ZK', state: 'AP', city: 'Rajahmundry', tags: ['llp', 'gstm', 'einv', 'ewb', 'tds', 'payroll', 'esi', 'pt-AP', 'books', 'food', 'exp', 'taudit', 'lwf'], partner: 'srinivas', manager: 'farhan', team: ['lavanya', 'vamsi'], turnover: 96000000, fee: 540000, lang: 'Telugu', channel: 'WhatsApp', risk: 'Low', health: 88, since: 2018, contact: 'P. Satyanarayana (Designated partner)', books: 'Tally Prime (desktop)' },
  { id: 'c05', name: 'TechNova Solutions Pvt Ltd', short: 'TechNova', type: 'Private company · start-up', pan: 'AAHCT5520Q', gstin: '29AAHCT5520Q1ZA', state: 'KA', city: 'Bengaluru', tags: ['co', 'gstm', 'exp', 'fdi', 'tds', 'nri', 'payroll', 'pt-KA', 'startup', 'saudit', 'tp', 'stpi', 'remit'], partner: 'meera', manager: 'divya', team: ['karthik'], turnover: 64000000, fee: 720000, lang: 'English', channel: 'Email', risk: 'Medium', health: 79, since: 2023, contact: 'Neha Kulkarni (CFO)', books: 'Zoho Books' },
  { id: 'c06', name: 'Charminar Textiles', short: 'Charminar Tex', type: 'Partnership firm', pan: 'AAKFC3309L', gstin: '36AAKFC3309L1ZS', state: 'TS', city: 'Hyderabad', tags: ['firm', 'gstm', 'tds', 'ewb', 'taudit', 'books'], partner: 'srinivas', manager: 'farhan', team: ['vamsi'], turnover: 38000000, fee: 210000, lang: 'Hindi', channel: 'WhatsApp', risk: 'Medium', health: 62, since: 2015, contact: 'Mohd. Saleem (Partner)', books: 'Busy' },
  { id: 'c07', name: 'Srinidhi Educational Trust', short: 'Srinidhi Trust', type: 'Charitable trust', pan: 'AAATS8812G', state: 'TS', city: 'Warangal', tags: ['trust', 'trust80g', 'fcra', 'tds', 'payroll', 'pt-TS'], partner: 'meera', manager: 'divya', team: ['pooja'], turnover: 41000000, fee: 260000, lang: 'Telugu-English', channel: 'Email', risk: 'High', health: 74, since: 2017, contact: 'Prof. V. Rangarao (Secretary)', books: 'Tally Prime (desktop)' },
  { id: 'c08', name: 'Vizag Marine Exports Pvt Ltd', short: 'Vizag Marine', type: 'Private company · exporter', pan: 'AADCV6619B', gstin: '37AADCV6619B1Z2', state: 'AP', city: 'Visakhapatnam', tags: ['co', 'gstm', 'exp', 'imp', 'einv', 'ewb', 'epcg', 'tds', 'payroll', 'esi', 'pt-AP', 'saudit', 'taudit', 'loan', 'food'], partner: 'meera', manager: 'farhan', team: ['lavanya', 'karthik'], turnover: 318000000, fee: 1260000, lang: 'English', channel: 'Email', risk: 'Medium', health: 83, since: 2016, contact: 'S. Appala Raju (MD)', books: 'SAP Business One' },
  { id: 'c09', name: 'Hitech City Cafe', short: 'Hitech Cafe', type: 'Proprietorship · composition', pan: 'BRTPT4471D', gstin: '36BRTPT4471D1Z9', state: 'TS', city: 'Hyderabad', tags: ['presum', 'comp', 'food', 'shop'], partner: 'srinivas', manager: 'farhan', team: ['vamsi'], turnover: 9200000, fee: 42000, lang: 'Telugu-English', channel: 'WhatsApp', risk: 'Low', health: 90, since: 2023, contact: 'Ravi Teja (Proprietor)', books: 'Vyapar' },
  { id: 'c10', name: 'Ramesh Kumar HUF', short: 'Ramesh HUF', type: 'HUF', pan: 'AAEHR1192M', state: 'TS', city: 'Secunderabad', tags: ['huf', 'adv'], partner: 'srinivas', manager: 'divya', team: ['rohit'], turnover: 0, fee: 22000, lang: 'Hindi', channel: 'WhatsApp', risk: 'Low', health: 97, since: 2012, contact: 'Ramesh Kumar (Karta)', books: '—' },
  { id: 'c11', name: 'Deccan Pharma Labs Pvt Ltd', short: 'Deccan Pharma', type: 'Private company · manufacturer', pan: 'AABCD9902F', gstin: '36AABCD9902F1ZQ', state: 'TS', city: 'Hyderabad', tags: ['co', 'gstm', 'einv', 'ewb', 'tds', 'tcs', 'payroll', 'esi', 'pt-TS', 'saudit', 'taudit', 'costaudit', 'loan', 'mfg', 'msmedue', 'jobwork', 'lwf'], partner: 'meera', manager: 'farhan', team: ['lavanya', 'pooja'], turnover: 486000000, fee: 1680000, lang: 'English', channel: 'Email', risk: 'Medium', health: 77, since: 2014, contact: 'Dr. P. Venkatesh (CFO)', books: 'Tally Prime (server)' },
  { id: 'c12', name: 'Sahasra Infra Projects Ltd', short: 'Sahasra Infra', type: 'Unlisted public company', pan: 'AAGCS4410H', gstin: '36AAGCS4410H1ZE', state: 'TS', city: 'Hyderabad', tags: ['co', 'pubco', 'gstm', 'einv', 'tds', 'payroll', 'esi', 'rera', 'saudit', 'taudit', 'loan', 'csr', 'contract', 'pt-TS'], partner: 'meera', manager: 'divya', team: ['karthik', 'pooja'], turnover: 1240000000, fee: 2400000, lang: 'English', channel: 'Email', risk: 'High', health: 58, since: 2013, contact: 'M. Sudhakar (CFO)', books: 'SAP S/4HANA' },
  { id: 'c13', name: 'Orbit Software LLP', short: 'Orbit LLP', type: 'LLP · services exporter', pan: 'AAXFO2290N', gstin: '36AAXFO2290N1ZT', state: 'TS', city: 'Hyderabad', tags: ['llp', 'gstq', 'exp', 'tds'], partner: 'srinivas', manager: 'divya', team: ['karthik'], turnover: 31000000, fee: 156000, lang: 'English', channel: 'Email', risk: 'Low', health: 91, since: 2022, contact: 'Ankit Bose (Partner)', books: 'QuickBooks' },
  { id: 'c14', name: 'Zenith Global India Pvt Ltd', short: 'Zenith India', type: 'Private company · foreign subsidiary', pan: 'AABCZ3381E', gstin: '36AABCZ3381E1ZW', state: 'TS', city: 'Hyderabad', tags: ['co', 'gstm', 'fdi', 'tp', 'tds', 'nri', 'payroll', 'pt-TS', 'saudit', 'taudit', 'ecb', 'remit'], partner: 'meera', manager: 'divya', team: ['karthik'], turnover: 228000000, fee: 1450000, lang: 'English', channel: 'Email', risk: 'Medium', health: 69, since: 2020, contact: 'Laura Chen (Group controller)', books: 'Oracle NetSuite' },
  { id: 'c15', name: 'Krishna Jewellers', short: 'Krishna Jewellers', type: 'Partnership firm', pan: 'AAJFK7720R', gstin: '36AAJFK7720R1ZB', state: 'TS', city: 'Hyderabad', tags: ['firm', 'gstm', 'tcs', 'taudit', 'sft', 'books', 'tds'], partner: 'srinivas', manager: 'farhan', team: ['vamsi'], turnover: 154000000, fee: 360000, lang: 'Hindi', channel: 'WhatsApp', risk: 'High', health: 64, since: 2010, contact: 'Gopal Agarwal (Partner)', books: 'Tally Prime (desktop)' },
  { id: 'c16', name: 'Lumen Health Clinics Pvt Ltd', short: 'Lumen Health', type: 'Private company', pan: 'AAFCL1187C', state: 'TS', city: 'Hyderabad', tags: ['co', 'tds', 'payroll', 'esi', 'pt-TS', 'saudit', 'lwf'], partner: 'meera', manager: 'divya', team: ['pooja'], turnover: 73000000, fee: 380000, lang: 'English', channel: 'Email', risk: 'Low', health: 86, since: 2021, contact: 'Dr. Anitha Rao (Director)', books: 'Zoho Books' },
  { id: 'c17', name: 'Annapurna Caterers', short: 'Annapurna', type: 'Proprietorship · composition', pan: 'CKLPA5521J', gstin: '36CKLPA5521J1Z0', state: 'TS', city: 'Hyderabad', tags: ['presum', 'comp', 'food'], partner: 'srinivas', manager: 'farhan', team: ['vamsi'], turnover: 6800000, fee: 36000, lang: 'Telugu', channel: 'WhatsApp', risk: 'Low', health: 82, since: 2024, contact: 'Annapurna Devi', books: 'Vyapar' },
  { id: 'c18', name: 'Kakatiya Constructions Pvt Ltd', short: 'Kakatiya', type: 'Private company · contractor', pan: 'AAECK6650A', gstin: '36AAECK6650A1ZM', state: 'TS', city: 'Warangal', tags: ['co', 'gstm', 'tds', 'payroll', 'contract', 'saudit', 'taudit', 'loan', 'pt-TS'], partner: 'srinivas', manager: 'divya', team: ['rohit', 'lavanya'], turnover: 211000000, fee: 690000, lang: 'Telugu', channel: 'WhatsApp', risk: 'High', health: 55, since: 2018, contact: 'B. Narsimha Reddy (MD)', books: 'Tally Prime (desktop)' },
  { id: 'c19', name: 'Meghana Rao', short: 'Meghana R.', type: 'Individual · non-resident', pan: 'AMYPR7712Q', state: 'TS', city: 'Dubai / Hyderabad', tags: ['ind', 'nri', 'foreign'], partner: 'srinivas', manager: 'divya', team: ['rohit'], turnover: 0, fee: 45000, lang: 'English', channel: 'Email', risk: 'Low', health: 89, since: 2020, contact: 'Meghana Rao', books: '—' },
  { id: 'c20', name: 'Banjara Hills Residents Welfare Society', short: 'Banjara RWA', type: 'Society', pan: 'AAAAB2271K', state: 'TS', city: 'Hyderabad', tags: ['society', 'tds'], partner: 'meera', manager: 'divya', team: ['pooja'], turnover: 8400000, fee: 48000, lang: 'English', channel: 'Email', risk: 'Low', health: 93, since: 2016, contact: 'Col. R. Menon (Treasurer)', books: 'Tally Prime (desktop)' },
  { id: 'c21', name: 'Nizam Logistics Pvt Ltd', short: 'Nizam Logistics', type: 'Private company', pan: 'AADCN4420P', gstin: '36AADCN4420P1ZV', state: 'TS', city: 'Hyderabad', tags: ['co', 'gstm', 'ewb', 'tds', 'payroll', 'esi', 'saudit', 'taudit', 'msmedue', 'pt-TS'], partner: 'srinivas', manager: 'farhan', team: ['lavanya'], turnover: 132000000, fee: 480000, lang: 'Hindi', channel: 'WhatsApp', risk: 'Medium', health: 72, since: 2017, contact: 'Syed Ahmed (Director)', books: 'Tally Prime (desktop)' },
  { id: 'c22', name: 'Prakash Polymers', short: 'Prakash Polymers', type: 'Proprietorship · MSME', pan: 'AGWPC3378H', gstin: '36AGWPC3378H1ZD', state: 'TS', city: 'Medchal', tags: ['prof', 'gstq', 'msme', 'taudit', 'jobwork'], partner: 'srinivas', manager: 'farhan', team: ['vamsi'], turnover: 47000000, fee: 120000, lang: 'Telugu', channel: 'WhatsApp', risk: 'Medium', health: 68, since: 2019, contact: 'Prakash Chandra', books: 'Busy' },
  { id: 'c23', name: 'Aarav Fintech Pvt Ltd', short: 'Aarav Fintech', type: 'Private company · NBFC', pan: 'AAPCA8873L', gstin: '36AAPCA8873L1ZH', state: 'TS', city: 'Hyderabad', tags: ['co', 'nbfc', 'gstm', 'tds', 'saudit', 'taudit', 'payroll', 'pt-TS'], partner: 'meera', manager: 'divya', team: ['karthik'], turnover: 88000000, fee: 640000, lang: 'English', channel: 'Email', risk: 'High', health: 75, since: 2022, contact: 'Aarav Mehta (CEO)', books: 'Zoho Books' },
  { id: 'c24', name: 'Sindhu Venkat', short: 'Sindhu V.', type: 'Individual · salaried + capital gains', pan: 'CNHPV4417B', state: 'TS', city: 'Hyderabad', tags: ['ind', 'adv'], partner: 'srinivas', manager: 'divya', team: ['rohit'], turnover: 0, fee: 24000, lang: 'English', channel: 'WhatsApp', risk: 'Low', health: 92, since: 2023, contact: 'Sindhu Venkat', books: '—' },
  { id: 'c25', name: 'K. Raghava', short: 'K. Raghava', type: 'Individual · director', pan: 'AKRPR5521L', state: 'TS', city: 'Hyderabad', tags: ['ind', 'adv'], partner: 'srinivas', manager: 'divya', team: ['rohit'], turnover: 0, fee: 30000, lang: 'Telugu-English', channel: 'WhatsApp', risk: 'Low', health: 90, since: 2019, contact: 'K. Raghava', books: '—' }
];

/* ---------- the 27 autopilot routines ---------- */
const ROUTINE_NAMES = {'IN-1': 'Intake', 'IN-2': 'Chaser', 'IN-3': 'Classifier', 'IN-4': 'Bank match', 'GS-1': 'Sales match', 'GS-2': 'IMS triage', 'GS-3': 'Credit match', 'GS-4': 'Supplier chase', 'DT-2': 'AIS match', 'GS-5': 'Return builder', 'DT-1': 'TDS check', 'DT-4': 'ITR builder', 'CO-1': 'Secretarial', 'PY-1': 'Payroll', 'AU-1': 'Audit file', 'AU-2': '3CD clauses', 'GS-6': 'Annual GST', 'DT-3': 'Advance tax', 'FL-1': 'Filing tracker', 'FO-1': 'Capacity', 'FO-3': 'Billing', 'CL-1': 'Front desk', 'CL-2': 'Notice reader', 'FO-2': 'Exceptions', 'FO-4': 'Rule watch', 'FO-5': 'Quality check', 'KN-1': 'Reference desk'};
const AGENTS = [
  ['IN-1', 'Document intake & extraction', 'Getting the papers in', 'advises', 'G2', 'L1', 'Reads everything that arrives on any channel, classifies, de-duplicates and lifts figures with a confidence score on every value.', ['vault.store_original', 'doc.classify', 'doc.extract', 'obligation.attach', 'queue.g2']],
  ['IN-2', 'Document chase', 'Getting the papers in', 'advises', 'G1', 'L1', 'Writes the exact request for this client, this month, in their language, and follows the 3-day / 1-day / overdue ladder.', ['client.message_template', 'checklist.read', 'queue.g1']],
  ['IN-3', 'Transaction classification', 'Getting the papers in', 'prepares', 'G5', 'L2', 'Proposes ledger, tax treatment, GST rate and capital vs revenue, learning this client\'s own conventions.', ['books.read', 'books.propose_mapping', 'queue.g5']],
  ['IN-4', 'Bank reconciliation', 'Getting the papers in', 'advises', '—', 'L1', 'Matches every bank line to the books; the output that matters is the explained list of what does not match.', ['bank.read', 'books.read', 'client.question_draft']],
  ['GS-1', 'Sales reconciliation', 'Getting the numbers right', 'prepares', 'G4', 'L2', 'Books vs GSTR-1 vs 3B vs e-invoice vs e-way bill — every difference explained into the year-long log.', ['gst.read_returns', 'irp.read', 'ewb.read', 'difflog.append']],
  ['GS-2', 'Invoice triage (IMS)', 'Getting the numbers right', 'prepares', 'G3', 'L2', 'Proposes accept / reject / hold on every supplier invoice with a stated reason and a revisit date.', ['ims.read', 'ims.propose', 'queue.g3']],
  ['GS-3', 'Input credit', 'Getting the numbers right', 'prepares', 'G4', 'L2', 'Matches purchase register to 2A and 2B, sizes credit at risk, applies blocked credit and 180-day rules.', ['gst.read_2b', 'books.read', 'rulebook.read', 'queue.g4']],
  ['GS-4', 'Supplier recovery', 'Getting the numbers right', 'prepares', 'G12', 'L2', 'Puts a rupee value on credit stuck with non-filing suppliers and drafts the chase letter for client approval.', ['gst.read_2b', 'letter.draft', 'queue.g12']],
  ['DT-2', 'Government data reconciliation', 'Getting the numbers right', 'advises', 'Blocks', 'L1', 'Reconciles books and the draft return against 26AS / AIS in both directions; blocks filing until resolved.', ['it.read_ais', 'it.read_26as', 'books.read', 'obligation.block']],
  ['GS-5', 'Return assembly & variance', 'Drafting the filing', 'prepares', 'G6', 'L2', 'Assembles returns from reconciled figures, runs the 38 rules, and explains month-on-month variance in words.', ['compute.gst', 'rules.run38', 'narrative.draft', 'queue.g6']],
  ['DT-1', 'Withholding determination', 'Drafting the filing', 'prepares', 'G6', 'L2', 'Section, rate, cumulative thresholds and PAN status for every payment; code builds the FVU file.', ['books.read', 'pan.verify', 'compute.tds', 'fvu.validate']],
  ['DT-4', 'Income tax return preparation', 'Drafting the filing', 'prepares', 'G6', 'L2', 'Every figure traceable to its document; regime comparison; missed deductions flagged.', ['it.read_prefill', 'compute.itr', 'queue.g6']],
  ['CO-1', 'Company secretarial', 'Drafting the filing', 'prepares', 'G7', 'L2', 'Maintains statutory registers as events occur and assembles MCA filing packs validated against schema.', ['registers.write', 'mca.schema_validate', 'pack.build']],
  ['PY-1', 'Payroll statutory', 'Drafting the filing', 'prepares', 'G17', 'L2', 'PF, ESI and state PT — and the three-way check of salary in books, PF return and TDS.', ['payroll.read', 'compute.payroll', 'ecr.build', 'queue.g17']],
  ['AU-1', 'Audit evidence & working papers', 'Seasonal work', 'prepares', 'G6', 'L2', 'Requests and tracks evidence, drafts working papers from what arrived. Never concludes, never judges materiality.', ['evidence.request', 'workpaper.draft', 'file.index']],
  ['AU-2', 'Tax audit clause data', 'Seasonal work', 'prepares', 'G6', 'L2', 'Evidences 40+ clauses of Form 3CD; factual clauses need written client confirmation.', ['books.read', 'clause.evidence', 'client.confirm_request']],
  ['GS-6', 'Annual GST reconciliation', 'Seasonal work', 'prepares', 'G15', 'L2', 'Explains audited accounts vs twelve months of filings from the difference log, not memory.', ['difflog.read', 'gst.read_returns', 'pack.build']],
  ['DT-3', 'Advance tax forecast', 'Seasonal work', 'prepares', 'G4', 'L2', 'Forecasts full-year tax and tells the client the number and the assumptions ten days before each instalment.', ['books.read', 'compute.tax', 'client.intimation_draft']],
  ['FL-1', 'Filing tracker', 'Keeping time', 'advises', '—', 'L1', 'Watches every portal until the acknowledgement lands; translates rejections; closes nothing without a reference.', ['portal.poll_status', 'ack.capture', 'alert.partner']],
  ['FO-1', 'Capacity & signing ceiling', 'Watching the firm', 'advises', '—', 'L1', 'Forecasts workload and counts tax audits signed against the 60-report ceiling across every firm.', ['timesheet.read', 'ceiling.count']],
  ['FO-3', 'Billing & recovery', 'Watching the firm', 'prepares', 'G9', 'L2', 'Turns finished work into an itemised draft invoice and chases what is owed.', ['ledger.read_work', 'invoice.draft', 'queue.g9']],
  ['CL-1', 'Client front desk', 'Facing outward', 'advises', 'G10', 'L1', 'Answers only seven enumerated questions from stored data; routes everything else to a named person.', ['status.lookup', 'client.reply_closed_list', 'queue.g10']],
  ['CL-2', 'Notice intake', 'Facing outward', 'advises', 'G11', 'L1', 'Extracts type, section, demand and reply date from notices; opens a job with five working days of buffer.', ['doc.extract', 'job.open', 'alert.partner']],
  ['FO-2', 'Exception triage', 'Watching the firm', 'advises', '—', 'L1', 'One ranked, de-duplicated queue of every escalation; same-day statutory items bypass to the partner.', ['queue.read_all', 'queue.rank', 'alert.partner']],
  ['FO-4', 'Regulatory watch', 'Watching the firm', 'prepares', 'G14', 'L2', 'Reads every notification and circular, maps affected clients and drafts a versioned rule change. No write access.', ['feeds.read', 'rule.propose', 'clients.match']],
  ['FO-5', 'Quality review', 'Watching the firm', 'advises', '—', 'L1', 'Re-performs a sample of finished work and injects known-defective proposals to test that reviewers still read.', ['ledger.read_work', 'sample.reperform', 'canary.inject']],
  ['KN-1', 'Legal reference desk', 'Facing outward', 'advises', 'Staff only', 'L1', 'Answers what the law says with a citation or declines. Has no read access to any client data, by construction.', ['library.search', 'cite']]
].map(([code, name, group, kind, gate, tier, does, tools], i) => {
  const modes = ['live', 'live', 'live', 'live', 'live', 'suggest', 'live', 'suggest', 'live', 'live', 'live', 'suggest', 'live', 'suggest', 'suggest', 'shadow', 'shadow', 'suggest', 'live', 'live', 'live', 'live', 'live', 'live', 'suggest', 'live', 'live'];
  const s = (i * 37) % 11;
  return {
    code, short: ROUTINE_NAMES[code] || code, name, group, kind, gate, tier, does, tools, mode: modes[i],
    version: `v1.${(i % 5) + 1}.${(i * 3) % 7}`, pinned: '2026-09-02',
    falseAccept: (0.4 + s * 0.17).toFixed(1), falseReject: (1.2 + s * 0.31).toFixed(1), abstain: (2 + (i * 7) % 9).toFixed(0),
    today: 40 + ((i * 97) % 610), cost: (0.6 + ((i * 13) % 17) / 10).toFixed(2), iaa: (86 + (i * 5) % 11)
  };
});

/* ---------- the 18 gates ---------- */
const GATES = {
  G1: { n: 'Chasing a client harder, or stopping', who: 'Partner (optional)', cap: 'chase', why: 'How hard to push a client is a relationship judgment, not a schedule.' },
  G2: { n: 'A value read off a document', who: 'Any staff member', cap: 'g2', why: 'A misread figure propagates silently into a return; below the confidence bar it is queued, not guessed.' },
  G3: { n: 'Accept / reject a supplier invoice', who: 'Reviewer · partner above ₹50,000', cap: 'g3', capHigh: 'g3_high', why: 'A rejection permanently forfeits that credit for the period.' },
  G4: { n: 'Credit position from the mismatch report', who: 'Manager · partner above ₹50,000', cap: 'review', capHigh: 'g3_high', why: 'No credit call is taken before the mismatch report is read.' },
  G5: { n: 'Hand-typed journal above the set value', who: 'A second staff member', cap: 'g5', fourEyes: true, why: 'Manual entries are where errors and frauds hide.' },
  G6: { n: 'Four-eyes review', who: 'Reviewer who did not prepare it', cap: 'review', fourEyes: true, why: 'Whoever prepared it cannot be the only reviewer.' },
  G7: { n: 'The signature', who: 'Partner — enters the DSC PIN', cap: 'sign', partner: true, why: 'Held in memory for seconds, never stored. Nothing automated can reach it.' },
  G8: { n: 'UDIN generation', who: 'Partner — human-started', cap: 'udin', partner: true, why: 'ICAI requires the member to generate it personally.' },
  G9: { n: 'The bill is read first', who: 'Partner', cap: 'bill', partner: true, why: 'Nothing reaches a client until a partner has read it.' },
  G10: { n: 'A client question off the closed list', who: 'Named staff member', cap: 'g10', why: 'Questions that look factual are often interpretive. Refusal to improvise is the default.' },
  G11: { n: 'Reply to a tax authority', who: 'Partner, always', cap: 'notice', partner: true, why: 'Every word to an officer is written by the professional whose name is on it.' },
  G12: { n: 'Sending a document out', who: 'A person clicks send', cap: 'send', why: 'Nothing automated posts a document to anyone. Sensitive files go as expiring links.' },
  G13: { n: 'Taking on a client', who: 'Partner', cap: 'onboard', partner: true, why: 'KYC, AML, conflict check and risk rating — and the annual decision to continue.' },
  G14: { n: 'Tax positions & rule changes', who: 'Partner', cap: 'position', partner: true, why: 'Interpretation is personal; the reasoning is written down the same day.' },
  G15: { n: 'Certification', who: 'Named partner', cap: 'certify', partner: true, why: 'A certified reconciliation is a written statement an officer will read.' },
  G16: { n: 'Client data to a third party', who: 'Partner', cap: 'thirdparty', partner: true, why: 'Banks, buyers in diligence, other professionals — distinct from delivery to the client.' },
  G17: { n: 'Payroll & PF release', who: 'A person releases', cap: 'g17', why: 'Provident fund dues are employee money.' },
  G18: { n: 'Resigning from an engagement', who: 'Partner', cap: 'onboard', partner: true, why: 'Done badly it becomes the firm\'s problem, not the client\'s.' }
};

/* Approval queue — items waiting at gates */
const GATE_ITEMS = [
  { id: 'q01', checks: '38/38 rules · 2 notes', gate: 'G7', title: 'Sign GSTR-3B · Sep 2026', client: 'c11', amount: 3842600, prep: 'lavanya', rev: 'farhan', created: D(-1, 18, 20), due: D(0, 17), ev: ['Liability ₹38,42,600 · cash ₹11,06,200 · ITC ₹27,36,400', 'All 38 rules passed · 0 blocking, 2 warnings explained', 'Variance vs Aug +6.2% — new Cipla contract (narrative attached)', 'Four-eyes review by Farhan Qureshi at 18:02 yesterday'] },
  { id: 'q02', checks: 'FVU passed · 3/3 challans', gate: 'G7', title: 'Sign TDS return 26Q · Q2 FY 2026-27', client: 'c01', amount: 412300, prep: 'rohit', rev: 'divya', created: D(-1, 16), due: D(4, 17), ev: ['148 deductee rows · FVU 9.1 validation passed', '3 PAN-inoperative payees at 20% (206AA) — flagged and confirmed', 'Challans matched: 3 of 3 (CIN captured)', 'Reviewed by Divya Reddy'] },
  { id: 'q03', checks: '37 proposals · 2 above ₹50k', gate: 'G3', title: 'Commit IMS decisions · 37 invoices', client: 'c01', amount: 684210, prep: 'GS-2', created: D(0, 8, 5), due: D(1, 18), ev: ['31 accept · 4 hold · 2 reject proposed', 'Rejections: SLP-26-27-0488 (duplicate of 0471), Sai Tooling (goods not received)', 'Two items above ₹50,000 → partner required', 'Client proposed 6 accepts on the portal (recorded as client action)'] },
  { id: 'q04', checks: '4 differences sized', gate: 'G4', title: 'Credit position · Kesarla Sep 2026 — ₹1,84,300 at risk', client: 'c01', amount: 184300, prep: 'GS-3', created: D(0, 7, 40), due: D(1, 12), ev: ['Books ITC ₹21,46,900 vs 2B ₹19,62,600', 'Sai Tooling Works has not filed GSTR-1 (₹96,400)', 'Swiggy staff meals — blocked u/s 17(5) (₹4,180)', 'Rule 37: two suppliers unpaid > 180 days (₹83,720 reversal)'] },
  { id: 'q05', checks: '1 value below 0.85', gate: 'G2', title: 'Confirm values · WhatsApp photo IMG-20260912-WA0014', client: 'c01', amount: 47200, prep: 'IN-1', created: D(0, 9, 12), due: D(0, 18), ev: ['Confidence 0.71 on invoice total (thumb over the figure)', 'Read: ₹47,200 · alternative reading ₹41,200', 'Supplier GSTIN read with confidence 0.96'] },
  { id: 'q06', checks: 'Date ambiguous', gate: 'G2', title: 'Confirm values · thermal scan Scan 20-Sep-2026 11-47', client: 'c01', amount: 8610, prep: 'IN-1', created: D(0, 9, 14), due: D(0, 18), ev: ['Faded thermal print — confidence 0.64 on date', 'Period ambiguity: 20-Sep or 28-Sep', 'Amount ₹8,610 confidence 0.91'] },
  { id: 'q07', checks: 'AIS 4/4 explained', gate: 'G6', title: 'Review ITR-3 · Dr Harini Vemulapati', client: 'c03', amount: 0, prep: 'divya', created: D(-2, 15), due: D(3, 17), ev: ['DT-2 cleared: AIS differences 4 of 4 explained', 'Regime comparison: old regime saves ₹38,400', 'Tax audit u/s 44AB attached (UDIN pending)'] },
  { id: 'q08', gate: 'G8', title: 'Generate UDIN · Tax audit 3CB-3CD — Charminar Textiles', client: 'c06', amount: 0, prep: 'meera', created: D(-1, 11), due: D(5, 17), ev: ['Report signed 29-Sep (ceiling count recorded on that date)', 'UDIN must be generated within 60 days of signing'] },
  { id: 'q09', checks: '142 work lines', gate: 'G9', title: 'Approve invoice · Vizag Marine — Q2 retainer + LUT + RoDTEP', client: 'c08', amount: 371700, prep: 'FO-3', created: D(0, 7), due: D(2, 17), ev: ['Retainer Q2 ₹2,70,000 · LUT renewal ₹15,000 · RoDTEP claims ₹30,000 · GST 18%', 'Narrative drafted from 142 ledger lines of work', 'Effort 168 h vs fee — margin 34%'] },
  { id: 'q10', checks: '₹5.91 L of ₹6.82 L explained', gate: 'G11', title: 'Reply to ASMT-10 · Kesarla FY 2024-25 — ₹6,82,450', client: 'c01', amount: 682450, prep: 'CL-2', created: D(-3, 10), due: D(6, 17), ev: ['Scrutiny: ITC in 3B exceeds 2A by ₹6,82,450', 'Reply due in 9 days · internal buffer date in 4 working days', 'GS-6 difference log explains ₹5,91,300 — residual ₹91,150'] },
  { id: 'q11', checks: 'KYC 4/4 · AML clear', gate: 'G13', title: 'Accept new client · Rayalaseema Solar Pvt Ltd', client: null, newClient: 'Rayalaseema Solar Pvt Ltd', amount: 480000, prep: 'sushma', created: D(-1, 12), due: D(3, 17), ev: ['KYC: PAN, CIN, directors verified · DigiLocker pull complete', 'AML screen: 0 hits · PEP: none', 'Conflict check: competitor of no existing client', 'Previous auditor NOC requested (Sec 140 communication)'] },
  { id: 'q12', gate: 'G14', title: 'Rule change from FO-4 · GSTR-3B Table 3.2 locking', client: null, amount: 0, prep: 'FO-4', created: D(-1, 8), due: D(2, 17), ev: ['Synthetic advisory: inter-state supplies to unregistered persons auto-populated and locked', 'Affects 11 clients from next return period', 'Proposed rulebook version 2026.10.3'] },
  { id: 'q13', checks: 'Residual ₹0', gate: 'G15', title: 'Certify GSTR-9C · Deccan Pharma FY 2025-26', client: 'c11', amount: 0, prep: 'GS-6', created: D(-2, 14), due: D(20, 17), ev: ['Turnover per books ₹48.6 cr vs declared ₹48.42 cr — ₹18.1 L explained (credit notes post-Sep)', 'Unexplained residual ₹0', 'Difference log entries: 64 across 12 months'] },
  { id: 'q14', checks: '3-way check ✓', gate: 'G17', title: 'Release PF ECR & ESI · Kesarla — Oct payroll', client: 'c01', amount: 286540, prep: 'anil', created: D(0, 10), due: D(4, 15), ev: ['142 employees · 3 joiners · 1 leaver', 'Three-way check: books = ECR = TDS salary ✔', 'Arrears for 4 employees itemised'] },
  { id: 'q15', checks: 'No support attached', gate: 'G5', title: 'Second approval · Journal JV/0912 — ₹6,20,000 provision', client: 'c18', amount: 620000, prep: 'rohit', created: D(0, 11), due: D(1, 17), ev: ['Hand-typed: provision for liquidated damages', 'No supporting document attached yet', 'Above the ₹2,00,000 manual-entry threshold'] },
  { id: 'q16', gate: 'G12', title: 'Send GSTR-3B acknowledgement · Godavari Agro', client: 'c04', amount: 0, prep: 'FL-1', created: D(0, 8), due: D(0, 18), ev: ['ARN AA3709260887312 captured', 'Document: ack PDF (not sensitive) · channel WhatsApp'] },
  { id: 'q17', gate: 'G16', title: 'Share audited financials with HDFC Bank · Kakatiya', client: 'c18', amount: 0, prep: 'karthik', created: D(-1, 16), due: D(2, 17), ev: ['Request: annual renewal of CC limit ₹12 cr', 'Client consent on file (email 21-Oct)', 'Will go as expiring watermarked link (7 days)'] },
  { id: 'q18', gate: 'G10', title: 'Routed question · "Ye invoice ka ITC milega kya?" — Dr Harini', client: 'c03', amount: 0, prep: 'CL-1', created: D(0, 9, 40), due: D(0, 18), ev: ['Off the closed list: eligibility is interpretive', 'Routed to Divya Reddy with client file attached'] },
  { id: 'q19', gate: 'G1', title: 'Silent client · Kakatiya — 3 chases, no papers for Oct', client: 'c18', amount: 0, prep: 'IN-2', created: D(0, 7, 30), due: D(1, 12), ev: ['Ladder: day −3, day −1, overdue — no response', 'Internal cut-off in 2 days for GSTR-1', 'Partner decides: call personally, keep chasing, or pause'] },
  { id: 'q20', checks: '612/612 IRN · 8 notes', gate: 'G6', title: 'Review GSTR-1 · Nizam Logistics Oct 2026', client: 'c21', amount: 0, prep: 'vamsi', created: D(0, 12), due: D(2, 17), ev: ['612 invoices · e-invoice match 100% · e-way bill match 98.7%', '8 transport docs without invoices — explained (stock transfer)'] },
  { id: 'q21', gate: 'G18', title: 'Resign as auditor · Kakatiya Constructions?', client: 'c18', amount: 0, prep: 'meera', created: D(-4, 10), due: D(10, 17), ev: ['Fees outstanding 214 days (₹4,85,000)', 'Repeated non-cooperation on audit evidence', 'If accepted: ADT-3 within 30 days, letter to incoming auditor'] }
];

/* ---------- connectors ---------- */
/* Status reflects what is actually built today (Phase 0 audit, Nov 2026):
   'Live' = working end to end · 'Partial' = some of the scope works · 'File import' = upload/download works, no live link
   'Simulated' = sandbox responses only · 'Not built' · 'By design: …' = a person files, by policy. */
const CONNECTORS = [
  ['GSTN via GSP', 'Government', 'api', 'Simulated', 'Sandbox responses only — no GSP credentials or live calls yet'],
  ['Income-tax e-filing (ERI)', 'Government', 'api', 'Not built', 'ITR upload, AIS/TIS/26AS, pre-fill, e-verify'],
  ['e-Invoice IRP', 'Government', 'api', 'Not built', 'IRN generation & 30-day watch'],
  ['e-Way bill', 'Government', 'api', 'Not built', 'EWB generation & reconciliation'],
  ['TRACES / TIN-NSDL', 'Government', 'file', 'Not built', 'FVU validation, Form 16/16A download, defaults'],
  ['MCA V3', 'Government', 'pack', 'By design: human files', 'Schema-validated packs only — no automation'],
  ['EPFO · ESIC', 'Government', 'pack', 'By design: human files', 'ECR & challan files for upload'],
  ['ICAI UDIN portal', 'Professional', 'pack', 'By design: human-started', 'UDIN recorded back against the report'],
  ['Tally Prime (desktop)', 'Accounting', 'file', 'File import', 'Trial balance XML import and purchase-voucher XML export work · live desktop bridge not built'],
  ['Winman', 'Accounting', 'file', 'Not built', 'Client master / return status exchange — integration route still to be decided'],
  ['Zoho Books', 'Accounting', 'api', 'Not built', 'OAuth · journals, bills, invoices'],
  ['Busy', 'Accounting', 'file', 'Not built', 'Export import'],
  ['QuickBooks', 'Accounting', 'api', 'Not built', 'OAuth · GL, AR/AP'],
  ['SAP / NetSuite / Oracle', 'Accounting', 'file', 'Not built', 'Scheduled GL & sub-ledger extracts'],
  ['Bank statements', 'Banking', 'file', 'File import', 'Bank CSV upload + reconciler work · Account Aggregator consent feed not built'],
  ['WhatsApp Business', 'Client channels', 'api', 'Not built', 'Document requests, reminders, inbound documents and replies'],
  ['Email', 'Client channels', 'api', 'Partial', 'Sign-in codes are sent (Resend / SMTP) · client outreach and inbound mail not built'],
  ['Client portal & app', 'Client channels', 'api', 'Not built', 'Portal screens are a demo; no backend behind them yet'],
  ['SMS (DLT registered)', 'Client channels', 'api', 'Partial', 'Sign-in OTP via Fast2SMS / Twilio · reminders not built'],
  ['DigiLocker', 'Identity', 'api', 'Not built', 'KYC pulls with consent'],
  ['DSC / desktop signer', 'Identity', 'api', 'Partial', 'Backend certificate + revocation checks built · desktop signer app and this screen not wired'],
  ['Razorpay / UPI', 'Payments', 'api', 'Not built', 'Fee collection links & reconciliation'],
  ['Google Drive / SharePoint', 'Storage', 'api', 'Not built', 'Legacy archive import (read-only)'],
  ['DGFT · ICEGATE', 'Government', 'pack', 'By design: human files', 'IEC, RoDTEP, shipping-bill data'],
  ['RBI FIRMS', 'Government', 'pack', 'By design: human files', 'FC-GPR / FC-TRS packs']
].map(([name, cat, mode, status, scope], i) => ({ id: 'cx' + i, name, cat, mode, status, scope, sync: '—', quota: '—', on: ['Live', 'Partial', 'File import'].includes(status) }));

/* ---------- rulebook ---------- */
const RULES = [
  { k: 'GSTR-1 due (monthly)', v: '11th of next month', from: '2017-07-01', ver: '2017.1', src: 'CGST Rules, r.59' },
  { k: 'GSTR-3B due (monthly)', v: '20th of next month', from: '2017-07-01', ver: '2017.1', src: 'CGST Rules, r.61' },
  { k: 'GSTR-3B Table 3 lock to GSTR-1', v: 'Hard-locked', from: '2025-07-01', ver: '2025.3', src: 'GSTN advisory (sales side)' },
  { k: 'GST late fee — 3B (non-nil)', v: '₹50 / day (₹25 + ₹25)', from: '2021-06-01', ver: '2021.2', src: 'Notification' },
  { k: 'GST return filing bar', v: '3 years from due date', from: '2025-07-01', ver: '2025.3', src: 'Finance Act 2023 · s.39(11)' },
  { k: 'e-Invoice 30-day reporting', v: 'AATO ≥ ₹10 crore', from: '2025-04-01', ver: '2025.1', src: 'GSTN advisory' },
  { k: 'IMS deemed acceptance', v: 'Pending invoices deemed accepted at 2B generation', from: '2024-10-01', ver: '2024.4', src: 'IMS framework' },
  { k: 'TDS deposit due', v: '7th of next month · 30 April for March', from: '2017-04-01', ver: '2017.1', src: 'IT Rules' },
  { k: 'Tax audit signing ceiling', v: '60 specified audits per member per year', from: '2014-04-01', ver: '2014.1', src: 'ICAI Council guidelines' },
  { k: 'Tax audit threshold (business)', v: '₹1 cr · ₹10 cr if cash ≤ 5%', from: '2020-04-01', ver: '2020.2', src: 'Income-tax Act' },
  { k: 'Income-tax Act 2025 in force', v: 'Forms renumbered · "tax year" replaces PY/AY', from: '2026-04-01', ver: '2026.1', src: 'Income-tax Act, 2025' },
  { k: 'Partner threshold for credit calls', v: '₹50,000', from: '2026-09-01', ver: 'firm.4', src: 'Firm policy · partner sign-off' },
  { k: 'Manual journal second approval', v: 'Above ₹2,00,000', from: '2026-09-01', ver: 'firm.4', src: 'Firm policy' },
  { k: 'IN-1 confidence bar', v: '0.85 per value', from: '2026-09-15', ver: 'firm.5', src: 'Partner threshold memo' },
  { k: 'Peak-day change freeze', v: '2 days before → day after the 7th, 11th, 15th, 20th', from: '2026-09-01', ver: 'firm.4', src: 'Ops runbook' }
];

/* ---------- notices ---------- */
const NOTICES = [
  { id: 'n1', client: 'c01', type: 'ASMT-10', law: 'CGST s.61', period: 'FY 2024-25', demand: 682450, received: D(-3), replyBy: D(9), buffer: D(4), owner: 'srinivas', stage: 'Draft reply with partner', src: 'ASMT-10_ZD3610260044172.pdf' },
  { id: 'n2', client: 'c03', type: 'Intimation u/s 143(1)(a)', law: 'IT Act', period: 'AY 2026-27', demand: 48720, received: D(-6), replyBy: D(24), buffer: D(17), owner: 'srinivas', stage: 'Evidence gathered', src: 'Communication_u-s_143(1)(a)_AY2026-27.pdf' },
  { id: 'n3', client: 'c12', type: 'DRC-01B', law: 'CGST r.88C', period: 'Aug 2026', demand: 214600, received: D(-1), replyBy: D(6), buffer: D(1), owner: 'meera', stage: 'Partner to review', src: 'DRC01B_Sahasra_082026.pdf' },
  { id: 'n4', client: 'c15', type: '148A show cause', law: 'IT Act (legacy)', period: 'AY 2022-23', demand: 0, received: D(-11), replyBy: D(3), buffer: D(-2), owner: 'srinivas', stage: 'Overdue internal buffer', src: 'Notice148A_Krishna.pdf' },
  { id: 'n5', client: 'c18', type: 'TRACES default', law: 'TDS', period: 'Q1 FY 2026-27', demand: 18420, received: D(-2), replyBy: D(28), buffer: D(21), owner: 'divya', stage: 'Correction statement prepared', src: 'JustificationReport_Q1.zip' },
  { id: 'n6', client: 'c05', type: 'DRC-01C', law: 'CGST r.88D', period: 'Sep 2026', demand: 96300, received: D(0, 8), replyBy: D(7), buffer: D(2), owner: 'meera', stage: 'Just extracted by CL-2', src: 'DRC01C_TechNova_092026.pdf' }
];

/* ---------- client conversations (CL-1) ---------- */
const CLOSED_LIST = ['Is it filed?', 'What is outstanding?', 'When is the next due date?', 'Send my acknowledgement', 'Did you receive it?', 'How many invoices await my action?', 'Who handles my account?'];
const THREADS = [
  { id: 't1', client: 'c01', channel: 'WhatsApp', lang: 'Telugu-English', unread: 1, msgs: [
    { at: D(0, 8, 41), from: 'in', text: 'Sir, September GST file chesara? Ack pampandi please.' },
    { at: D(0, 8, 41), from: 'agent', intent: 'Is it filed? + Send my acknowledgement', text: 'Avunu andi ✅ GSTR-3B Sep 2026 filed on 20-Oct · ARN AA360926112874K. Acknowledgement PDF is ready — our team will send it in a moment.' },
    { at: D(0, 8, 43), from: 'route', text: 'Document send needs a person (G12) → queued for Lavanya' },
    { at: D(0, 9, 2), from: 'in', text: 'Inka Sai Tooling bill ki credit vastunda?' },
    { at: D(0, 9, 2), from: 'route', text: 'Off the closed list (eligibility) → routed to Farhan Qureshi with file' }
  ] },
  { id: 't2', client: 'c03', channel: 'WhatsApp', lang: 'Hinglish', unread: 1, msgs: [
    { at: D(0, 9, 38), from: 'in', text: 'Hi, maine naya dental chair liya hai 6.2 lakh ka. Ye invoice ka ITC milega kya?' },
    { at: D(0, 9, 38), from: 'route', text: 'Off the closed list (eligibility is interpretive) → routed to Divya Reddy · G10' },
    { at: D(0, 9, 39), from: 'agent', intent: 'Who handles my account?', text: 'Thank you Doctor. Divya Reddy (Manager, Direct Tax) will reply to you personally today. Your file has been shared with her.' }
  ] },
  { id: 't3', client: 'c04', channel: 'WhatsApp', lang: 'Telugu', unread: 0, msgs: [
    { at: D(-1, 17, 5), from: 'in', text: 'నెక్స్ట్ డ్యూ డేట్ ఎప్పుడు?' },
    { at: D(-1, 17, 5), from: 'agent', intent: 'When is the next due date?', text: 'తదుపరి గడువు: GSTR-1 (అక్టోబర్) — 11 నవంబర్. మేము 6 నవంబర్ లోపు సేల్స్ రిజిస్టర్ కోసం ఎదురుచూస్తున్నాం.' }
  ] },
  { id: 't4', client: 'c05', channel: 'Email', lang: 'English', unread: 0, msgs: [
    { at: D(-1, 11, 20), from: 'in', text: 'Hi team — did you receive the Q2 invoices for our US parent? Also, what is still pending from our side?' },
    { at: D(-1, 11, 20), from: 'agent', intent: 'Did you receive it? + What is outstanding?', text: 'Yes — 14 invoices from Zenith Inc received on 23-Oct (IN-1 filed them). Still outstanding: (1) Softex forms for Sep, (2) Board resolution for ESOP grant, (3) Form 10F from two US contractors.' }
  ] },
  { id: 't5', client: 'c15', channel: 'WhatsApp', lang: 'Hindi', unread: 2, msgs: [
    { at: D(0, 10, 2), from: 'in', text: 'Notice aaya hai income tax ka, kya karna hai? Penalty lagegi kya?' },
    { at: D(0, 10, 2), from: 'route', text: 'Names a notice and penalty → routed to partner Srinivas Nallamala · G10 (never answered automatically)' },
    { at: D(0, 10, 3), from: 'agent', intent: 'Who handles my account?', text: 'नमस्ते गोपाल जी, आपका संदेश CA श्रीनिवास नल्लमला जी को भेज दिया गया है। वे आज आपसे बात करेंगे।' }
  ] },
  { id: 't6', client: 'c22', channel: 'WhatsApp', lang: 'Telugu', unread: 0, msgs: [
    { at: D(-2, 19, 12), from: 'in', text: 'Naa action kosam enni invoices pending lo unnayi?' },
    { at: D(-2, 19, 12), from: 'agent', intent: 'How many invoices await my action?', text: '12 supplier invoices are waiting on IMS for Oct. 9 are proposed "accept" by our team; 3 need your confirmation of receipt of goods.' }
  ] },
  { id: 't7', client: 'c24', channel: 'WhatsApp', lang: 'English', unread: 0, msgs: [
    { at: D(-3, 13, 2), from: 'in', text: 'Should I invest in 54EC bonds to save tax on my flat sale?' },
    { at: D(-3, 13, 2), from: 'route', text: 'Planning advice → routed to Divya Reddy · G10' },
    { at: D(-3, 15, 40), from: 'staff', by: 'divya', text: 'Hi Sindhu — yes, worth considering. The 6-month window from your sale date ends 14 Dec. Let\'s do a 15-minute call tomorrow; I\'ll bring the computation.' }
  ] }
];

/* ---------- automated client interactions ---------- */
const AUTOMATIONS = [
  { id: 'a1', name: 'Document request ladder', agent: 'IN-2', trigger: 'Checklist incomplete · T−7 before internal cut-off', ladder: ['Day −7 request', 'Day −3 reminder', 'Day −1 final', 'Overdue → partner (G1)'], channel: 'WhatsApp · Email', gate: null, on: true, sent: 1284, resp: 78, cat: 'Collect' },
  { id: 'a2', name: 'Receipt acknowledgement', agent: 'IN-1', trigger: 'Any document received on any channel', ladder: ['Instant: "Received 4 files — 3 read, 1 unclear"'], channel: 'Same channel', gate: null, on: true, sent: 3920, resp: 0, cat: 'Collect' },
  { id: 'a3', name: 'Unclear document — re-send request', agent: 'IN-1', trigger: 'Confidence below 0.85 after G2 rejects the image', ladder: ['Ask for a clearer photo with a sample', 'Remind after 1 day'], channel: 'WhatsApp', gate: null, on: true, sent: 212, resp: 84, cat: 'Collect' },
  { id: 'a4', name: 'IMS action nudge', agent: 'GS-2', trigger: '12th of month · invoices awaiting client confirmation', ladder: ['"9 invoices proposed accept, 3 need your confirmation"'], channel: 'WhatsApp · App', gate: null, on: true, sent: 302, resp: 71, cat: 'Collect' },
  { id: 'a5', name: 'Tax payable intimation — GST · TDS · PF/ESI', agent: 'GS-5', trigger: 'After the liability is computed and reviewed (G6) — GST by the 18th, TDS by the 5th, PF/ESI by the 12th', ladder: ['Amount + challan / UPI link + due date', 'Reminder 1 day before', 'Payment detected → thank-you'], channel: 'WhatsApp · Email', gate: 'G6', on: true, sent: 486, resp: 93, cat: 'Pay' },
  { id: 'a6', name: 'Advance tax intimation', agent: 'DT-3', trigger: '10 days before 15 Jun / Sep / Dec / Mar', ladder: ['Estimate + assumptions', 'Client may challenge assumptions', 'Final amount after G4'], channel: 'Email · App', gate: 'G4', on: true, sent: 188, resp: 66, cat: 'Pay' },
  { id: 'a7', name: 'Filing confirmation', agent: 'FL-1', trigger: 'Acknowledgement captured from the portal', ladder: ['Text confirmation with ARN — automatic', 'Ack PDF — one click to send (G12)'], channel: 'Same channel', gate: 'G12', on: true, sent: 2210, resp: 0, cat: 'Inform' },
  { id: 'a8', name: 'Due-date digest', agent: 'CL-1', trigger: 'Every Monday 08:00', ladder: ['This week\'s due dates + what we still need'], channel: 'WhatsApp · Email', gate: null, on: true, sent: 1040, resp: 22, cat: 'Inform' },
  { id: 'a9', name: 'Fee invoice & payment reminders', agent: 'FO-3', trigger: 'Invoice approved at G9', ladder: ['Invoice + UPI link', 'Day 15 reminder', 'Day 30 reminder', 'Day 90 → partner personally'], channel: 'Email · WhatsApp', gate: 'G9', on: true, sent: 612, resp: 58, cat: 'Pay' },
  { id: 'a10', name: 'DSC & registration expiry alerts', agent: 'FO-2', trigger: '30 / 7 days before DSC, LUT, FSSAI, IEC expiry', ladder: ['Alert with renewal checklist', 'Book a slot'], channel: 'WhatsApp · Email', gate: null, on: true, sent: 96, resp: 81, cat: 'Inform' },
  { id: 'a11', name: 'Supplier chase letters', agent: 'GS-4', trigger: 'Credit stuck with a non-filing supplier > ₹10,000', ladder: ['Draft letter to client for approval', 'Client approves → sent in client\'s name'], channel: 'Email', gate: 'G12', on: true, sent: 74, resp: 61, cat: 'Collect' },
  { id: 'a12', name: 'Notice received — client alert', agent: 'CL-2', trigger: 'Notice extracted and partner alerted', ladder: ['Partner-approved holding message only'], channel: 'Phone call + WhatsApp', gate: 'G11', on: true, sent: 31, resp: 100, cat: 'Inform' },
  { id: 'a13', name: 'ITR season organiser', agent: 'IN-2', trigger: '1 June · individual clients', ladder: ['Personalised checklist from last year\'s return', 'AIS preview', 'Book review call'], channel: 'WhatsApp · Email · App', gate: null, on: true, sent: 412, resp: 88, cat: 'Collect' },
  { id: 'a14', name: 'Monthly MIS delivery', agent: 'IN-3', trigger: 'Month close signed off (G6)', ladder: ['MIS pack as expiring link (G12)'], channel: 'Email · App', gate: 'G12', on: true, sent: 64, resp: 0, cat: 'Inform' },
  { id: 'a15', name: 'Meeting scheduler', agent: 'CL-1', trigger: 'Routed question needs a call', ladder: ['Offers 3 slots from the owner\'s calendar', 'Reminder 1 hour before'], channel: 'WhatsApp · Email', gate: null, on: true, sent: 143, resp: 76, cat: 'Inform' },
  { id: 'a16', name: 'Festival & birthday greetings', agent: 'CL-1', trigger: 'Diwali, Ugadi, Eid, Christmas, Pongal · client birthdays', ladder: ['Partner-approved template, in the client\'s language'], channel: 'WhatsApp', gate: null, on: false, sent: 0, resp: 0, cat: 'Relate' },
  { id: 'a17', name: 'Post-season feedback pulse', agent: 'CL-1', trigger: 'After 31 July and 31 October', ladder: ['One-tap 1–5 rating + comment', 'Low score → partner'], channel: 'WhatsApp', gate: null, on: true, sent: 188, resp: 47, cat: 'Relate' }
];

const TEMPLATES = {
  a1: {
    English: 'Namaste {name}, for your {period} GST return we still need: {items}. Please share by {date} — after that the return may be filed late at ₹50 a day. Reply here or upload at {link}.',
    'हिन्दी': 'नमस्ते {name}, आपके {period} GST रिटर्न के लिए हमें अभी भी चाहिए: {items}. कृपया {date} तक भेजें — इसके बाद रिटर्न ₹50 प्रतिदिन लेट फीस के साथ फाइल होगा। यहाँ रिप्लाई करें या {link} पर अपलोड करें।',
    'తెలుగు': 'నమస్తే {name}, మీ {period} GST రిటర్న్ కోసం ఇంకా ఇవి కావాలి: {items}. దయచేసి {date} లోపు పంపండి — ఆ తర్వాత రోజుకు ₹50 ఆలస్య రుసుముతో ఫైల్ చేయాల్సి వస్తుంది. ఇక్కడ రిప్లై చేయండి లేదా {link} లో అప్‌లోడ్ చేయండి.',
    'தமிழ்': 'வணக்கம் {name}, உங்கள் {period} GST ரிட்டர்னுக்கு இன்னும் தேவை: {items}. {date}க்குள் அனுப்பவும் — அதன் பிறகு நாளொன்றுக்கு ₹50 தாமதக் கட்டணத்துடன் தாக்கல் செய்ய வேண்டியிருக்கும். இங்கே பதில் அனுப்பவும் அல்லது {link} இல் பதிவேற்றவும்.'
  },
  a5: {
    English: 'Hello {name}, your GST payable for {period} is {amount} (cash). Pay before {date} using this challan: {link}. Credit used: {itc}. Questions? Reply and {owner} will call you.',
    'हिन्दी': 'नमस्ते {name}, {period} का आपका GST देय {amount} (नकद) है। कृपया {date} से पहले इस चालान से भुगतान करें: {link}। उपयोग किया गया क्रेडिट: {itc}। सवाल हो तो रिप्लाई करें — {owner} आपको कॉल करेंगे।',
    'తెలుగు': 'నమస్తే {name}, {period} కి మీరు చెల్లించాల్సిన GST {amount} (నగదు). దయచేసి {date} లోపు ఈ చలాన్ ద్వారా చెల్లించండి: {link}. వాడిన క్రెడిట్: {itc}. ప్రశ్నలుంటే రిప్లై చేయండి — {owner} మీకు కాల్ చేస్తారు.',
    'தமிழ்': 'வணக்கம் {name}, {period}க்கான உங்கள் GST செலுத்த வேண்டியது {amount} (பணம்). {date}க்கு முன் இந்த சலான் மூலம் செலுத்தவும்: {link}. பயன்படுத்திய கிரெடிட்: {itc}. கேள்விகள் இருந்தால் பதில் அனுப்பவும் — {owner} உங்களை அழைப்பார்.'
  },
  a7: {
    English: '✅ Filed: {form} for {period}. Acknowledgement {arn}, filed {date}. Your ack PDF will follow from {owner}.',
    'हिन्दी': '✅ फाइल हो गया: {period} का {form}। पावती संख्या {arn}, दिनांक {date}। पावती PDF {owner} भेजेंगे।',
    'తెలుగు': '✅ ఫైల్ అయింది: {period} {form}. అక్నాలెడ్జ్‌మెంట్ {arn}, తేదీ {date}. Ack PDF ను {owner} పంపుతారు.',
    'தமிழ்': '✅ தாக்கல் செய்யப்பட்டது: {period} {form}. ஒப்புகை எண் {arn}, தேதி {date}. ஒப்புகை PDF ஐ {owner} அனுப்புவார்.'
  }
};

/* ---------- documents (vault & intake) ---------- */
const DOCS = [
  { id: 'd01', name: 'IMG-20260912-WA0014.jpg', client: 'c01', ch: 'WhatsApp', at: D(0, 7, 58), cls: 'Supplier invoice', period: 'Sep 2026', conf: 0.71, status: 'G2', fields: { Supplier: 'Vasavi Hardware', GSTIN: '36ABVPV1102E1ZK', Total: '₹47,200 (?)' } },
  { id: 'd02', name: 'Scan 20-Sep-2026 11-47.jpg', client: 'c01', ch: 'Email', at: D(0, 8, 2), cls: 'Supplier invoice (thermal)', period: 'Sep 2026 (?)', conf: 0.64, status: 'G2', fields: { Supplier: 'Ganesh Transport', Total: '₹8,610', Date: '20-Sep or 28-Sep' } },
  { id: 'd03', name: 'Invoice-OES-219-26-27.pdf', client: 'c01', ch: 'Email', at: D(0, 8, 3), cls: 'Supplier invoice', period: 'Sep 2026', conf: 0.98, status: 'Filed', fields: { Supplier: 'Orient Engineering Supplies', Taxable: '₹2,14,000', IGST: '₹38,520' } },
  { id: 'd04', name: 'Invoice_MMB-2627-1173.pdf', client: 'c01', ch: 'Email', at: D(0, 8, 3), cls: 'Supplier invoice', period: 'Sep 2026', conf: 0.97, status: 'Filed', fields: { Supplier: 'Mahalakshmi Moulds & Brass', Taxable: '₹1,62,500', 'CGST+SGST': '₹29,250' } },
  { id: 'd05', name: 'QIS_INV_2026_3381.pdf', client: 'c01', ch: 'Portal', at: D(0, 8, 9), cls: 'Supplier invoice', period: 'Sep 2026', conf: 0.95, status: 'Filed', fields: { Supplier: 'Quality Industrial Solutions', Taxable: '₹88,400' } },
  { id: 'd06', name: 'SLP-26-27-0488.pdf', client: 'c01', ch: 'Email', at: D(0, 8, 11), cls: 'Supplier invoice — duplicate?', period: 'Sep 2026', conf: 0.93, status: 'Duplicate flagged', fields: { Supplier: 'Sri Lakshmi Polymers', Note: 'Same value & date as SLP-0471' } },
  { id: 'd07', name: 'MCB_Statement_041720010003865_Sep2026.pdf', client: 'c01', ch: 'Account Aggregator', at: D(-1, 6, 0), cls: 'Bank statement', period: 'Sep 2026', conf: 0.99, status: 'Filed', fields: { Lines: '412', Closing: '₹38,12,904.18' } },
  { id: 'd08', name: 'Sales_Register_Sep2026.xlsx', client: 'c01', ch: 'Tally bridge', at: D(-1, 22, 0), cls: 'Sales register', period: 'Sep 2026', conf: 1, status: 'Filed', fields: { Invoices: '688', Taxable: '₹1,21,40,220' } },
  { id: 'd09', name: '36AAJCK4417M1Z6_GSTR2B_092026.json', client: 'c01', ch: 'GSTN pull', at: D(-1, 6, 30), cls: 'GSTR-2B', period: 'Sep 2026', conf: 1, status: 'Filed', fields: { Suppliers: '57', ITC: '₹19,62,600' } },
  { id: 'd10', name: 'IMS_Inward_36AAJCK4417M1Z6_Sep2026.csv', client: 'c01', ch: 'GSTN pull', at: D(0, 6, 30), cls: 'IMS inward', period: 'Sep 2026', conf: 1, status: 'Filed', fields: { Invoices: '37' } },
  { id: 'd11', name: 'ASMT-10_ZD3610260044172.pdf', client: 'c01', ch: 'GSTN pull', at: D(-3, 9, 0), cls: 'Notice — scrutiny', period: 'FY 2024-25', conf: 0.97, status: 'CL-2 → partner', fields: { Demand: '₹6,82,450', Reply: '30 days' } },
  { id: 'd12', name: 'Form16_AXQPT6623R_FY2025-26.pdf', client: 'c02', ch: 'Email', at: D(-2, 19, 0), cls: 'Form 16', period: 'FY 2025-26', conf: 0.99, status: 'Filed', fields: { Salary: '₹24,60,000', TDS: '₹3,84,200' } },
  { id: 'd13', name: 'Communication_u-s_143(1)(a)_AY2026-27.pdf', client: 'c03', ch: 'IT e-filing pull', at: D(-6, 9, 0), cls: 'Notice — 143(1)(a)', period: 'AY 2026-27', conf: 0.96, status: 'CL-2 → partner', fields: { Adjustment: '₹1,62,400', Demand: '₹48,720' } },
  { id: 'd14', name: 'SmileArc_Receipts_FY2026-27_H1.xlsx', client: 'c03', ch: 'WhatsApp', at: D(-1, 21, 14), cls: 'Receipts register', period: 'H1 FY 2026-27', conf: 0.94, status: 'Filed', fields: { Receipts: '₹1,04,30,000' } },
  { id: 'd15', name: 'Salary_Register_Sep2026.xlsx', client: 'c01', ch: 'Email', at: D(-2, 10, 0), cls: 'Salary register', period: 'Sep 2026', conf: 1, status: 'Filed', fields: { Employees: '142', Gross: '₹42,18,600' } },
  { id: 'd16', name: 'Scan_Tanvika_balance_confirmation.pdf', client: 'c01', ch: 'Email', at: D(-4, 15, 0), cls: 'Balance confirmation', period: 'FY 2025-26', conf: 0.88, status: 'Filed', fields: { Party: 'Tanvika Polymers', Balance: '₹4,12,000 Cr' } },
  { id: 'd17', name: 'Draft_Minutes_BM_02-09-2026.docx', client: 'c01', ch: 'Email', at: D(-5, 12, 0), cls: 'Board minutes (draft)', period: 'Sep 2026', conf: 0.92, status: 'Filed', fields: { Resolutions: '5', 'MGT-14 needed': 'Yes (borrowing)' } },
  { id: 'd18', name: 'Trial_Balance_and_Cash_Book_FY2025-26.xlsx', client: 'c01', ch: 'Tally bridge', at: D(-8, 9, 0), cls: 'Trial balance', period: 'FY 2025-26', conf: 1, status: 'Filed', fields: { Ledgers: '612' } },
  { id: 'd19', name: 'WhatsApp voice note 0:42', client: 'c06', ch: 'WhatsApp', at: D(0, 10, 20), cls: 'Voice note — transcribed', period: '—', conf: 0.82, status: 'Routed to Vamsi', fields: { Transcript: '"Bhai, October ke bills kal bhejunga"' } }
];

/* ---------- reconciliation: Kesarla Sep 2026 ---------- */
const RECON_2B = [
  { sup: 'Orient Engineering Supplies', gstin: '36AAAFO2213L1ZP', inv: 'OES/219/26-27', books: 38520, b2b: 38520, st: 'Matched' },
  { sup: 'Mahalakshmi Moulds & Brass', gstin: '36ABQFM8812K1Z4', inv: 'MMB/2627/1173', books: 29250, b2b: 29250, st: 'Matched' },
  { sup: 'Quality Industrial Solutions', gstin: '29AAECQ4421N1ZB', inv: 'QIS/INV/2026/3381', books: 15912, b2b: 15192, st: 'Value mismatch', note: 'Transposed digits in books (15,912 vs 15,192)' },
  { sup: 'Sri Lakshmi Polymers', gstin: '36AEPFS7710D1Z1', inv: 'SLP/26-27/0488', books: 21600, b2b: 0, st: 'Duplicate in books', note: 'Same as SLP/0471 — remove from purchase register' },
  { sup: 'Sai Tooling Works', gstin: '36BCHPS4490R1ZE', inv: 'STW/112', books: 96400, b2b: 0, st: 'Supplier not filed', note: 'GSTR-1 not filed — GS-4 chase drafted' },
  { sup: 'Deccan Packaging Co', gstin: '36AAGFD1182M1Z0', inv: 'DPC/882', books: 12240, b2b: 12240, st: 'Matched' },
  { sup: 'Telangana Power Tools', gstin: '36AALFT6621C1ZR', inv: 'TPT/2026/417', books: 0, b2b: 18900, st: 'Missing in books', note: 'Invoice not received by client — ask (IN-4)' },
  { sup: 'Amaravati Chemicals', gstin: '37AABCA3390J1ZW', inv: 'AC/09/551', books: 64800, b2b: 64800, st: 'Matched', note: 'Paid 192 days late — Rule 37 reversal ₹64,800' },
  { sup: 'Swiggy (staff meals)', gstin: '36AAFCB7707D1ZT', inv: 'SWG-HYD-88214', books: 4180, b2b: 4180, st: 'Blocked 17(5)', note: 'Food & beverages — blocked credit' },
  { sup: 'Hyderabad Freight Carriers', gstin: '36AAHFH2210P1Z8', inv: 'HFC/301', books: 6300, b2b: 0, st: 'RCM — self-invoice', note: 'GTA under reverse charge — not in 2B by design' },
  { sup: 'Vasavi Hardware', gstin: '36ABVPV1102E1ZK', inv: 'VH/2209', books: 7200, b2b: 7200, st: 'Matched', note: 'Value pending G2 confirmation' },
  { sup: 'Ganesh Transport', gstin: '36AJKPG8890Q1Z5', inv: 'GT/4471', books: 0, b2b: 0, st: 'Unregistered', note: 'No GSTIN — no credit' },
  { sup: 'Bharat Steel Rolling', gstin: '36AADCB4410F1Z9', inv: 'BSR/26/9912', books: 18920, b2b: 18920, st: 'Matched', note: 'Supplier unpaid 184 days — Rule 37 ₹18,920' },
  { sup: 'Krishna Lubricants', gstin: '36AAKFK2290H1ZM', inv: 'KL/0991', books: 9860, b2b: 9680, st: 'Value mismatch', note: 'Rounding / freight line — ₹180' }
];
const IMS = [
  { inv: 'OES/219/26-27', sup: 'Orient Engineering Supplies', val: 252520, prop: 'Accept', why: 'Goods received (GRN 2214) · PO matched', client: null },
  { inv: 'MMB/2627/1173', sup: 'Mahalakshmi Moulds & Brass', val: 191750, prop: 'Accept', why: 'GRN 2219 · rate as per PO', client: 'Accept' },
  { inv: 'QIS/INV/2026/3381', sup: 'Quality Industrial Solutions', val: 104312, prop: 'Accept', why: 'Books value mistyped — correct books, not IMS', client: null },
  { inv: 'SLP/26-27/0488', sup: 'Sri Lakshmi Polymers', val: 141600, prop: 'Reject', why: 'Duplicate of SLP/0471 already accepted in August', client: null },
  { inv: 'STW/112', sup: 'Sai Tooling Works', val: 632000, prop: 'Hold', why: 'Goods not yet received — revisit 05-Nov', client: null },
  { inv: 'TPT/2026/417', sup: 'Telangana Power Tools', val: 123900, prop: 'Hold', why: 'Client says not ordered — confirm with purchase team', client: null },
  { inv: 'DPC/882', sup: 'Deccan Packaging Co', val: 80240, prop: 'Accept', why: 'Recurring monthly supply · GRN 2230', client: 'Accept' },
  { inv: 'AC/09/551', sup: 'Amaravati Chemicals', val: 424800, prop: 'Accept', why: 'Received — note Rule 37 reversal separately', client: null },
  { inv: 'KL/0991', sup: 'Krishna Lubricants', val: 64460, prop: 'Accept', why: '₹180 freight difference immaterial to acceptance', client: null },
  { inv: 'MR/2026/77', sup: 'Metro Rubber Works', val: 58410, prop: 'Reject', why: 'Credit note already issued for the full value', client: null }
];
const BANK_UNMATCHED = [
  { date: '04-Sep', narr: 'NEFT-HDFC-RAGHAVA K-SELF', amt: 500000, dir: 'Cr', q: 'Director\'s funds of ₹5,00,000 on 4-Sep — loan to company or share application?' },
  { date: '11-Sep', narr: 'UPI/9849XXXX12/SRI SAI ENTERP', amt: 38500, dir: 'Dr', q: 'Payment of ₹38,500 to Sri Sai Enterprises — please share the bill.' },
  { date: '15-Sep', narr: 'CASH WDL CHQ 004418', amt: 180000, dir: 'Dr', q: 'Cash withdrawal ₹1,80,000 — purpose? (Clause 21 / 40A(3) watch)' },
  { date: '19-Sep', narr: 'RTGS-TANVIKA POLYMERS', amt: 412000, dir: 'Dr', q: 'Matches Tanvika confirmation — post against invoice TP/221?' },
  { date: '26-Sep', narr: 'IMPS-REFUND-AMZN', amt: 6420, dir: 'Cr', q: 'Refund of ₹6,420 from Amazon — which purchase?' },
  { date: '30-Sep', narr: 'INT.CR.SB', amt: 2214.6, dir: 'Cr', q: 'Interest credit — auto-posted (rule)' }
];
const PATTERNS = [
  { pat: 'SWIGGY / ZOMATO / EATSURE', n: 23, ledger: 'Staff welfare', gst: 'Blocked 17(5)', cap: 'Revenue', conf: 0.97, client: 'c01' },
  { pat: 'IOCL / HPCL / BPCL fuel', n: 41, ledger: 'Vehicle running', gst: 'No credit (petroleum)', cap: 'Revenue', conf: 0.98, client: 'c01' },
  { pat: 'AMAZON BUSINESS — laptops', n: 3, ledger: 'Computers (asset)', gst: '18% eligible', cap: 'Capital', conf: 0.86, client: 'c01' },
  { pat: 'ACT FIBERNET / JIO', n: 6, ledger: 'Internet & telephone', gst: '18% eligible', cap: 'Revenue', conf: 0.99, client: 'c01' },
  { pat: 'Hyderabad Freight Carriers', n: 14, ledger: 'Freight inward', gst: 'RCM 5% — self-invoice', cap: 'Revenue', conf: 0.93, client: 'c01' },
  { pat: 'URBAN COMPANY — AC service', n: 2, ledger: 'Repairs — building', gst: '18% eligible', cap: 'Revenue', conf: 0.78, client: 'c01', conflict: 'Last year a person mapped this to "Repairs — plant". Surfaced, not overwritten.' }
];

/* ---------- billing ---------- */
const INVOICES = [
  { no: 'NC/26-27/0412', client: 'c08', amt: 371700, status: 'Draft — G9', date: D(0), age: 0 },
  { no: 'NC/26-27/0411', client: 'c11', amt: 495600, status: 'Sent', date: D(-12), age: 12 },
  { no: 'NC/26-27/0398', client: 'c12', amt: 708000, status: 'Sent', date: D(-41), age: 41 },
  { no: 'NC/26-27/0377', client: 'c18', amt: 485000, status: 'Overdue', date: D(-214), age: 214 },
  { no: 'NC/26-27/0402', client: 'c14', amt: 427800, status: 'Paid', date: D(-28), age: 0 },
  { no: 'NC/26-27/0405', client: 'c06', amt: 61950, status: 'Sent', date: D(-22), age: 22 },
  { no: 'NC/26-27/0390', client: 'c15', amt: 106200, status: 'Overdue', date: D(-96), age: 96 },
  { no: 'NC/26-27/0409', client: 'c03', amt: 28320, status: 'Paid', date: D(-15), age: 0 },
  { no: 'NC/26-27/0413', client: 'c01', amt: 247800, status: 'Draft — G9', date: D(0), age: 0 },
  { no: 'NC/26-27/0386', client: 'c21', amt: 141600, status: 'Sent', date: D(-63), age: 63 },
  { no: 'NC/26-27/0408', client: 'c05', amt: 212400, status: 'Sent', date: D(-18), age: 18 }
];

/* ---------- DSC & credentials ---------- */
const DSCS = [
  { holder: 'K. Raghava', client: 'c01', cls: 'Class 3 · sign', expiry: D(19), custody: 'Office safe · drawer 3', token: 'ePass 2003', out: null },
  { holder: 'Dr P. Venkatesh', client: 'c11', cls: 'Class 3 · sign + encrypt', expiry: D(142), custody: 'Client holds', token: 'ProxKey', out: null },
  { holder: 'S. Appala Raju', client: 'c08', cls: 'Class 3 · DGFT', expiry: D(6), custody: 'Out with Karthik (DGFT filing)', token: 'Watchdata', out: 'karthik' },
  { holder: 'M. Sudhakar', client: 'c12', cls: 'Class 3 · sign', expiry: D(301), custody: 'Office safe · drawer 1', token: 'ePass 2003', out: null },
  { holder: 'B. Narsimha Reddy', client: 'c18', cls: 'Class 3 · sign', expiry: D(-4), custody: 'Office safe · drawer 3', token: 'ePass 2003', out: null },
  { holder: 'P. Satyanarayana', client: 'c04', cls: 'Class 3 · sign', expiry: D(77), custody: 'Office safe · drawer 2', token: 'Hypersecu', out: null },
  { holder: 'Neha Kulkarni', client: 'c05', cls: 'Class 3 · sign', expiry: D(212), custody: 'Client holds', token: 'ProxKey', out: null },
  { holder: 'CA Srinivas Nallamala', client: null, cls: 'Class 3 · sign (firm)', expiry: D(388), custody: 'Partner personal', token: 'ePass 2003', out: null },
  { holder: 'CA Meera Iyer', client: null, cls: 'Class 3 · sign (firm)', expiry: D(27), custody: 'Partner personal', token: 'ePass 2003', out: null }
];
const CREDS = [
  { client: 'c01', portal: 'GST portal', user: 'kesarla_gst', rotated: D(-41), mfa: 'OTP to director', reveals: 3 },
  { client: 'c01', portal: 'Income-tax e-filing', user: 'AAJCK4417M', rotated: D(-88), mfa: 'OTP to director', reveals: 1 },
  { client: 'c01', portal: 'TRACES', user: 'HYDK04417E', rotated: D(-120), mfa: '—', reveals: 2 },
  { client: 'c01', portal: 'EPFO establishment', user: 'APHYD0041172', rotated: D(-200), mfa: 'OTP to HR', reveals: 4 },
  { client: 'c04', portal: 'GST portal', user: 'godavari_agro', rotated: D(-12), mfa: 'OTP to partner', reveals: 0 },
  { client: 'c08', portal: 'DGFT', user: 'vizagmarine', rotated: D(-63), mfa: 'DSC', reveals: 1 },
  { client: 'c11', portal: 'MCA V3', user: 'deccanpharma.cs', rotated: D(-31), mfa: 'OTP to CS', reveals: 2 },
  { client: 'c12', portal: 'Telangana RERA', user: 'sahasra_rera', rotated: D(-190), mfa: '—', reveals: 0 },
  { client: 'c14', portal: 'RBI FIRMS', user: 'zenith.india', rotated: D(-45), mfa: 'OTP to CFO', reveals: 1 },
  { client: 'c18', portal: 'GST portal', user: 'kakatiya_cons', rotated: D(-366), mfa: '—', reveals: 6 }
];

/* ---------- quality (FO-5) ---------- */
const QUALITY = [
  { who: 'farhan', reviewed: 212, canaries: 6, caught: 6 },
  { who: 'divya', reviewed: 168, canaries: 5, caught: 5 },
  { who: 'lavanya', reviewed: 241, canaries: 7, caught: 5 },
  { who: 'karthik', reviewed: 96, canaries: 3, caught: 3 },
  { who: 'meera', reviewed: 88, canaries: 3, caught: 3 },
  { who: 'srinivas', reviewed: 131, canaries: 4, caught: 3 }
];
const QFINDINGS = [
  { sev: 'High', what: 'GSTR-3B Aug — Rule 37 reversal not carried for Bharat Steel Rolling (₹18,920)', client: 'c01', owner: 'lavanya', state: 'Correction tracked' },
  { sev: 'Medium', what: '26Q Q1 — 194J vs 194C chosen without note for a hybrid contract', client: 'c18', owner: 'rohit', state: 'Open' },
  { sev: 'Low', what: 'Working paper for bank confirmation missing preparer initials', client: 'c11', owner: 'pooja', state: 'Closed' },
  { sev: 'Low', what: 'Engagement letter for FY 2026-27 not countersigned by client', client: 'c22', owner: 'sushma', state: 'Open' }
];

/* ---------- people ops ---------- */
const LEAVES = [
  { who: 'rohit', kind: 'Study leave (CA Final, Nov)', from: D(-5), to: D(25), status: 'Approved' },
  { who: 'pooja', kind: 'Casual leave', from: D(3), to: D(3), status: 'Pending' },
  { who: 'lavanya', kind: 'Earned leave', from: D(12), to: D(16), status: 'Pending', clash: 'Clashes with 11th & 20th peaks' }
];
const INWARD = [
  { at: D(0, 9, 30), dir: 'In', what: 'Original lease deed + 3 rent receipts', client: 'c24', by: 'imran', where: 'Rack B · file 24/2026' },
  { at: D(0, 11, 0), dir: 'Out', what: 'DSC token — S. Appala Raju', client: 'c08', by: 'imran', where: 'Handed to Karthik' },
  { at: D(-1, 15, 10), dir: 'In', what: 'Courier — ASMT-10 hard copy', client: 'c01', by: 'imran', where: 'Scanned → vault, original to partner' },
  { at: D(-1, 17, 40), dir: 'Out', what: 'Signed audit report (2 copies)', client: 'c20', by: 'imran', where: 'Courier DTDC · AWB 7741902215' }
];

/* ---------- added in the owner's review ---------- */
const TASKS = [
  { id: 'tk1', title: 'Call Kakatiya\'s MD personally about October papers', client: 'c18', who: 'srinivas', by: 'sushma', due: D(0), done: false },
  { id: 'tk2', title: 'Prepare loan renewal file for SBI (CC limit)', client: 'c08', who: 'karthik', by: 'meera', due: D(3), done: false },
  { id: 'tk3', title: 'Collect original sale deed from Sindhu', client: 'c24', who: 'imran', by: 'divya', due: D(1), done: false },
  { id: 'tk4', title: 'Quote for net worth certificate (visa)', client: 'c19', who: 'divya', by: 'srinivas', due: D(2), done: false },
  { id: 'tk5', title: 'Sit with Vamsi on Charminar 26Q working', client: 'c06', who: 'farhan', by: 'srinivas', due: D(1), done: false },
  { id: 'tk6', title: 'Book Ugadi-season client meet venue', client: null, who: 'sushma', by: 'srinivas', due: D(9), done: false }
];
const EXPENSES = [
  { id: 'ex1', who: 'karthik', what: 'Cab to Vizag Marine — DGFT visit', client: 'c08', amt: 1840, rebill: true, status: 'Pending', at: D(-1) },
  { id: 'ex2', who: 'pooja', what: 'Train — Deccan Pharma stock count', client: 'c11', amt: 620, rebill: true, status: 'Approved', at: D(-3) },
  { id: 'ex3', who: 'imran', what: 'Courier — DTDC, 12 envelopes', client: null, amt: 1440, rebill: false, status: 'Pending', at: D(0) },
  { id: 'ex4', who: 'farhan', what: 'GST Council webinar (CPE)', client: null, amt: 2360, rebill: false, status: 'Pending', at: D(-2) },
  { id: 'ex5', who: 'lavanya', what: 'Stamp paper — Godavari LLP agreement', client: 'c04', amt: 500, rebill: true, status: 'Approved', at: D(-5) }
];
const NOTES = [
  { client: 'c01', at: D(-2, 16, 10), by: 'farhan', kind: 'Call', text: 'Raghava confirmed Sai Tooling goods not yet received — keep on hold in IMS. Will chase supplier himself.' },
  { client: 'c01', at: D(-6, 11, 0), by: 'srinivas', kind: 'Meeting', text: 'Board-level discussion on CC limit enhancement; needs CMA data by 15 Nov.' },
  { client: 'c03', at: D(-1, 18, 30), by: 'divya', kind: 'Voice note', text: 'Dr Harini: bought dental chair ₹6.2 L in Oct — wants to know credit / depreciation. (Transcribed by IN-1.)' }
];
const CHECKINS = { srinivas: '09:05', meera: '08:40 · geo check-in at client', farhan: '09:18', divya: '09:30 · VPN', karthik: '09:02', lavanya: '09:11', anil: '09:25', sushma: '08:55', vamsi: '09:14', pooja: '08:50 · geo check-in at client', imran: '08:45' };

/* ---------- client portal (added in review 2) ---------- */
const PORTAL_USERS = [
  { id: 'raghava', name: 'K. Raghava', first: 'Raghava', title: 'Director · Kesarla Moulded Products', phone: '9849012312', email: 'raghava@kesarla.example', entities: ['c01', 'c25'], lang: 'తెలుగు' },
  { id: 'harini', name: 'Dr Harini Vemulapati', first: 'Harini', title: 'Proprietor · SmileArc Dental', phone: '9989022444', email: 'harini@smilearc.example', entities: ['c03'], lang: 'English' },
  { id: 'gopal', name: 'Gopal Agarwal', first: 'Gopal', title: 'Partner · Krishna Jewellers', phone: '9848055120', email: 'gopal@krishnajewellers.example', entities: ['c15'], lang: 'हिन्दी' },
  { id: 'neha', name: 'Neha Kulkarni', first: 'Neha', title: 'CFO · TechNova Solutions', phone: '9900041877', email: 'neha@technova.example', entities: ['c05'], lang: 'English' }
];
const CLIENT_ORG = {
  c01: [['K. Raghava', 'Director', 'Full access', 'Approve · pay · upload · message'], ['Srilatha M.', 'Accounts executive', 'Upload & view', 'Cannot approve or pay'], ['Tanuja R.', 'HR', 'Payroll only', 'Salary registers & PF/ESI'], ['M/s Rao & Co. (statutory auditor)', 'External', 'View audited files', 'Expires 31 Dec']],
  c25: [['K. Raghava', 'Self', 'Full access', 'Approve · pay · upload · message']],
  c03: [['Dr Harini Vemulapati', 'Proprietor', 'Full access', 'Approve · pay · upload · message'], ['Front desk (SmileArc)', 'Staff', 'Upload only', 'Daily receipts']],
  c15: [['Gopal Agarwal', 'Partner', 'Full access', 'Approve · pay · upload · message'], ['Suresh Agarwal', 'Partner', 'Full access', 'Approve · pay · upload · message'], ['Billing desk', 'Staff', 'Upload only', 'Sales registers']],
  c05: [['Neha Kulkarni', 'CFO', 'Full access', 'Approve · pay · upload · message'], ['Arvind S.', 'Finance', 'Upload & view', 'Cannot approve or pay'], ['Zenith Inc. (parent)', 'External', 'View filings', 'FEMA & TP reports only']]
};
