/* Bahi — core: state, rules engine, permissions, ledger, live agents, shell & primitives. */

/* The viewer (e.g. an artifact host) may set data-theme itself; keep it unless the person picks one in Bahi. */
const HOST_THEME = document.documentElement.dataset.theme || null;

/* ---------------- icons ---------------- */
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  columns: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  stamp: '<path d="M10 3.5a2 2 0 1 1 4 0c0 1.5-1 2.5-1 4.5v2h-2V8c0-2-1-3-1-4.5z"/><path d="M5 13h14a1 1 0 0 1 1 1v3H4v-3a1 1 0 0 1 1-1z"/><path d="M6 21h12"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  ledger: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  rupee: '<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3c6.7 0 6.7-10 0-10"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  hex: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><circle cx="12" cy="12" r="3"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
  scroll: '<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/>',
  chain: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 3v4M17 5h4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  trend: '<path d="m23 6-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2A5.5 5.5 0 0 0 22 11c0-5-4.5-9-10-9z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'
};
const ICON_ALIAS = { 'user-check': 'user', 'check-circle': 'check', 'shield-check': 'shield', 'alert-triangle': 'alert', 'refresh-cw': 'refresh' };
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS[ICON_ALIAS[n]] || ''}</svg>`;
const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="3.5" width="27" height="33" rx="4.5" fill="#E9E5DB"/><rect x="6" y="3.5" width="7" height="33" rx="3.5" fill="#BFA472"/><path d="M13 10.5h20M13 29.5h20" stroke="#14171D" stroke-opacity=".25" stroke-width="1.3"/><circle cx="23" cy="20" r="5" fill="none" stroke="#14171D" stroke-width="1.7"/><path d="M23 17.4v5.2M20.4 20h5.2" stroke="#14171D" stroke-width="1.1"/></svg>`;

/* ---------------- utilities ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n, dec = 0) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: dec, minimumFractionDigits: dec });
const inrShort = n => { n = Number(n || 0); if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(n >= 1e8 ? 0 : 1) + ' cr'; if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + ' L'; return inr(n); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const asDate = x => x instanceof Date ? x : new Date(x);
const fmtD = x => { const d = asDate(x); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const fmtDY = x => { const d = asDate(x); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const fmtT = x => { const d = asDate(x); return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); };
const fmtDT = x => fmtD(x) + ', ' + fmtT(x);
const dayKey = x => { const d = asDate(x); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const daysTo = x => { const d = new Date(asDate(x)); d.setHours(0, 0, 0, 0); return Math.round((d - TODAY) / 864e5); };
const ago = x => { const s = (Date.now() - asDate(x)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago'; };
const relDue = x => { const n = daysTo(x); if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n === -1) return 'Yesterday'; return n < 0 ? `${-n}d late` : `in ${n}d`; };
const dueCls = x => { const n = daysTo(x); return n < 0 ? 'bad' : n <= 2 ? 'warn' : 'ok'; };
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
const seeded = s => { let a = parseInt(fnv(s), 16); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
const fyOf = d => { d = asDate(d); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `FY ${y}-${String(y + 1).slice(2)}`; };
const isPeak = d => { d = asDate(d); const dd = d.getDate(), m = d.getMonth(); return [7, 11, 15, 20].includes(dd) || (m === 8 && dd === 30) || (m === 9 && dd === 31) || (m === 11 && dd === 31) || (m === 6 && dd === 31); };
const inFreeze = d => { for (let k = -1; k <= 2; k++) { if (isPeak(new Date(asDate(d).getTime() + k * 864e5))) return true; } return false; };

/* ---------------- obligation state machine ---------------- */
const STATES = [
  { k: 'scheduled', n: 'Scheduled', h: 'code', who: 'Rulebook' },
  { k: 'awaiting', n: 'Awaiting papers', h: 'client', who: 'Client' },
  { k: 'received', n: 'Papers in', h: 'agent', who: 'Autopilot' },
  { k: 'preparing', n: 'Preparing', h: 'agent', who: 'Autopilot + preparer' },
  { k: 'reconciled', n: 'Reconciled', h: 'agent', who: 'Autopilot' },
  { k: 'review', n: 'Four-eyes review', h: 'gate', who: 'Reviewer · G6', gate: 'G6' },
  { k: 'sign', n: 'Partner sign', h: 'gate', who: 'Partner · G7', gate: 'G7' },
  { k: 'filed', n: 'Filed · awaiting ack', h: 'code', who: 'Portal · FL-1' },
  { k: 'closed', n: 'Closed', h: 'ok', who: 'Done' }
];
const SIDX = Object.fromEntries(STATES.map((s, i) => [s.k, i]));
const stateOf = k => STATES[SIDX[k]];

const SELF = { id: 'self', name: FIRM.name + ' (own compliance)', short: 'Our firm', type: 'The firm itself', pan: 'AAQFN2210K', gstin: FIRM.gstin, state: 'TS', city: 'Hyderabad', tags: ['firm-self'], partner: 'srinivas', manager: 'sushma', team: ['sushma'], turnover: 0, fee: 0, lang: 'English', channel: '—', risk: 'Low', health: 90, since: 2004, contact: 'Internal', books: 'Zoho Books', internal: true };
const ALL_CLIENTS = [...CLIENTS, SELF];
const clientById = id => ALL_CLIENTS.find(c => c.id === id) || (STATE && STATE.newClients || []).find(c => c.id === id);
const person = id => TEAM.find(t => t.id === id);
const agentByCode = c => AGENTS.find(a => a.code === c);
const catById = id => CATALOGUE.find(f => f.id === id);
/* texture = which law. Eight families, each its own pattern; never a colour. */
const DOM_FAM = { GST: 'gst', ITX: 'dt', TDS: 'dt', ROC: 'corp', LLP: 'corp', SEBI: 'corp', PAY: 'lab', STATE: 'lab', BOOK: 'books', AUD: 'assure', CERT: 'assure', FEMA: 'cross', EXIM: 'cross', TRUST: 'misc', REG: 'misc', BANK: 'misc', ADV: 'misc', FIRM: 'misc' };
const FAM_NAME = { gst: 'GST', dt: 'Income tax & TDS', corp: 'Companies, LLP & SEBI', lab: 'Payroll & state levies', books: 'Books', assure: 'Audit & certificates', cross: 'FEMA & EXIM', misc: 'Registrations, trusts, banking, advisory, the firm' };
const DOM_SHORT = { GST: 'GST', ITX: 'IT', TDS: 'TDS', ROC: 'ROC', LLP: 'LLP', SEBI: 'SEBI', PAY: 'PAY', STATE: 'PT', BOOK: 'BKS', AUD: 'AUD', CERT: 'CERT', FEMA: 'FEMA', EXIM: 'EXIM', TRUST: 'NGO', REG: 'REG', BANK: 'BANK', ADV: 'ADV', FIRM: 'FIRM' };
const txOf = d => 'tx-' + (DOM_FAM[d] || 'misc');
const domChip = d => `<span class="dom ${txOf(d)}" title="${esc(DOMAINS[d]?.long || d)}"><i></i><b>${DOM_SHORT[d] || d}</b></span>`;

function applies(f, c) {
  /* tax audit report: 3CA where accounts are already audited under another law (companies), 3CB otherwise */
  if (f.id === 'ITX:3CA-3CD' && !c.tags.includes('saudit')) return false;
  if (f.id === 'ITX:3CB-3CD' && c.tags.includes('saudit')) return false;
  return f.t.some(t => c.tags.includes(t));
}
function dueDatesInWindow(rule, start, end) {
  const out = [];
  const [type, spec] = rule.split(':');
  const push = (d, period) => { if (d >= start && d <= end) out.push({ due: d, period }); };
  const m0 = start.getFullYear() * 12 + start.getMonth() - 1, m1 = end.getFullYear() * 12 + end.getMonth() + 1;
  if (type === 'M') {
    const day = +spec;
    for (let mm = m0; mm <= m1; mm++) {
      const d = new Date(Math.floor(mm / 12), mm % 12, day, 17);
      const p = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      push(d, `${MON[p.getMonth()]} ${p.getFullYear()}`);
    }
  } else if (type === 'Q') {
    const day = +spec;
    for (let mm = m0; mm <= m1; mm++) {
      const d = new Date(Math.floor(mm / 12), mm % 12, day, 17);
      if (![0, 3, 6, 9].includes(d.getMonth())) continue;
      const qEnd = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const qi = { 5: 1, 8: 2, 11: 3, 2: 4 }[qEnd.getMonth()];
      push(d, `Q${qi} ${fyOf(qEnd)}`);
    }
  } else if (type === 'D') {
    const ds = spec.split(',');
    for (let y = start.getFullYear() - 1; y <= end.getFullYear() + 1; y++) ds.forEach((md, i) => {
      const [mm, dd] = md.split('-').map(Number);
      const d = new Date(y, mm - 1, dd, 17);
      let period;
      if (ds.length === 4) period = `Q${i + 1} ${fyOf(new Date(d.getTime() - 92 * 864e5))}`;
      else if (ds.length === 2) period = `H${i + 1} ${fyOf(new Date(d.getTime() - 200 * 864e5))}`;
      else period = fyOf(new Date(d.getTime() - 270 * 864e5));
      push(d, period);
    });
  }
  return out;
}
function seedState(dd, r) {
  const x = r();
  if (dd < -3) return x < 0.95 ? 'closed' : 'filed';
  if (dd < 0) return x < 0.68 ? 'closed' : x < 0.88 ? 'filed' : x < 0.95 ? 'sign' : 'review';
  if (dd <= 2) return x < 0.22 ? 'closed' : x < 0.42 ? 'filed' : x < 0.62 ? 'sign' : x < 0.84 ? 'review' : 'reconciled';
  if (dd <= 7) return x < 0.1 ? 'review' : x < 0.4 ? 'reconciled' : x < 0.7 ? 'preparing' : x < 0.88 ? 'received' : 'awaiting';
  if (dd <= 15) return x < 0.2 ? 'preparing' : x < 0.55 ? 'received' : 'awaiting';
  return x < 0.55 ? 'scheduled' : 'awaiting';
}
function genObligations(clients = ALL_CLIENTS) {
  const start = new Date(TODAY.getTime() - 26 * 864e5), end = new Date(TODAY.getTime() + 45 * 864e5);
  const out = [];
  clients.forEach(c => CATALOGUE.filter(f => f.rule && applies(f, c)).forEach(f => {
    dueDatesInWindow(f.rule, start, end).forEach(({ due, period }) => {
      const id = 'ob-' + fnv(c.id + f.id + period + due.toISOString()).slice(0, 7);
      const r = seeded(id);
      let st = seedState(daysTo(due), r);
      if (f.m === 'int' && (st === 'sign' || st === 'filed')) st = st === 'sign' ? 'review' : 'closed';
      const team = (c.team && c.team.length) ? c.team : [c.manager].filter(Boolean);
      let prep = pick(team, r);
      if ((st === 'scheduled' || st === 'awaiting') && !c.internal && r() < 0.16) prep = null;
      const arn = (f.d === 'GST' ? 'AA' + (c.gstin || '36').slice(0, 2) : 'ACK') + String(Math.floor(r() * 1e12)).padStart(12, '0');
      out.push({
        id, client: c.id, fid: f.id, form: f.f, name: f.n, d: f.d, mode: f.m, due: due.toISOString(), period, state: st,
        prep, rev: c.manager === prep ? c.partner : c.manager, partner: c.partner,
        docs: [Math.floor(r() * 4) + 3, 0], touchless: r() < 0.78, ack: (st === 'closed' || st === 'filed') && f.m !== 'int' ? arn : null,
        amount: f.d === 'GST' || f.d === 'TDS' ? Math.round((c.turnover || 2e7) * (0.002 + r() * 0.006) / 100) * 100 : 0
      });
      const o = out[out.length - 1];
      const idx = SIDX[st];
      o.docs[1] = idx >= 2 ? o.docs[0] : Math.floor(r() * o.docs[0]);
      if (st === 'filed') o.ack = null, o.filedAt = new Date(due.getTime() - Math.floor(r() * 2) * 864e5).toISOString();
    });
  }));
  return out.sort((a, b) => new Date(a.due) - new Date(b.due));
}

/* A due-date change from a (synthetic) notification: Rule watch detects it, a partner approves (G14), obligations re-date automatically. */
function makeExtension(obs) {
  const y = TODAY.getFullYear();
  let forms, from, to, label;
  const itr = new Date(y, 9, 31, 17);
  if (daysTo(itr) >= 0 && daysTo(itr) <= 30) { forms = ['ITR-5', 'ITR-6', 'ITR-7', '3CEB']; from = itr; to = new Date(y, 10, 30, 17); label = 'ITR & Form 3CEB for audit cases'; }
  else { from = new Date(y, TODAY.getMonth() + (TODAY.getDate() > 17 ? 1 : 0), 20, 17); to = new Date(from.getFullYear(), from.getMonth(), 25, 17); forms = ['GSTR-3B']; label = 'GSTR-3B (monthly)'; }
  const ext = { forms, from: dayKey(from), to: dayKey(to) };
  const hit = obs.filter(o => forms.includes(o.form) && dayKey(o.due) === ext.from && o.state !== 'closed');
  if (!hit.length) return null;
  return { id: 'q-ext', gate: 'G14', title: `Due-date extension · ${label}: ${fmtD(from)} → ${fmtD(to)}`, client: null, amount: 0, prep: 'FO-4', created: D(0, 6, 0), due: D(1, 17), status: 'pending', ext, checks: 'Source notice attached · rb 2026.10.3',
    ev: ['Synthetic notification for the demo, detected by Rule watch at 06:00 today', `${hit.length} obligations across ${new Set(hit.map(o => o.client)).size} clients re-date automatically once a partner approves`, 'Internal cut-offs, client reminders and the runway move with them', 'Rulebook version 2026.10.3 — the old date stays queryable for its own period'] };
}

/* ---------------- state & persistence ---------------- */
const KEY = 'cafirmos.state.v6'; // v6: state persists across days (no daily wipe)
let STATE;
function freshState() {
  const s = {
    seededFor: dayKey(TODAY), persona: 'srinivas', theme: 'light', session: null, autopilot: true,
    obligations: genObligations(),
    gates: GATE_ITEMS.map(g => ({ ...g, status: 'pending' })),
    docs: DOCS.map(d => ({ ...d })),
    threads: THREADS.map(t => ({ ...t, msgs: t.msgs.map(m => ({ ...m })) })),
    automations: Object.fromEntries(AUTOMATIONS.map(a => [a.id, a.on])),
    caps: Object.fromEntries(CAPS.map(c => [c.k, [...c.roles]])),
    walls: Object.fromEntries(ALL_CLIENTS.map(c => [c.id, [...new Set([c.partner, c.manager, ...c.team, 'imran', 'sushma', ...(c.tags.includes('payroll') ? ['anil'] : [])])]])),
    agentModes: Object.fromEntries(AGENTS.map(a => [a.code, a.mode])),
    connectors: Object.fromEntries(CONNECTORS.map(c => [c.id, c.on])),
    ims: Object.fromEntries(IMS.map(i => [i.inv, { prop: i.prop, sel: true }])),
    patterns: {}, bank: {}, recon: {},
    invoices: INVOICES.map(i => ({ ...i })),
    dscs: DSCS.map(d => ({ ...d })),
    reveals: [], leaves: LEAVES.map(l => ({ ...l })), notices: NOTICES.map(n => ({ ...n })),
    tasks: TASKS.map(x => ({ ...x })), expenses: EXPENSES.map(x => ({ ...x })), notes: NOTES.map(x => ({ ...x })),
    portal: null, portalDone: {}, payments: {},
    newClients: [], ledger: [], feed: [], seenGates: 0, lastSeen: Date.now(), daySignedOff: null
  };
  STATE = s;
  const prepNotes = [['Attach the signed board resolution before resubmitting.', 'partner'], ['Rule 37 reversal for Bharat Steel is missing — please add it.', 'rev'], ['Two payee PANs are inoperative; confirm the 206AA rate before the FVU.', 'rev']];
  s.obligations.filter(o => o.state === 'preparing' && o.prep).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 3).forEach((o, i) => { o.returned = { by: o[prepNotes[i][1]], note: prepNotes[i][0], at: new Date(TODAY.getTime() - (i + 1) * 3600e3 * 5).toISOString() }; });
  const ext = makeExtension(s.obligations); if (ext) s.gates.push(ext);
  s.firmDeadlines = []; s.ruleLog = [];
  seedLedger();
  return s;
}
function load() {
  _load();
  hydrateExtras();
  if (!STATE.theme) STATE.theme = 'light';
}
function _load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      STATE = s;
      // A new day no longer wipes the workspace: keep every change and only add
      // obligations whose due dates have rolled into the window since the last visit.
      if (s.seededFor !== dayKey(TODAY)) { topUpObligations(); s.seededFor = dayKey(TODAY); }
      return;
    }
  } catch (e) { /* storage unavailable — run in memory */ }
  freshState();
}
/* Add obligations that are new to the rolling window (ids are deterministic, so
   existing items — and everything people did to them — are left untouched). */
function topUpObligations(clients) {
  if (!STATE || !Array.isArray(STATE.obligations)) return 0;
  const have = new Set(STATE.obligations.map(o => o.id));
  const pool = clients || ALL_CLIENTS.concat(STATE.newClients || []);
  const fresh = genObligations(pool).filter(o => !have.has(o.id)).map(o => {
    // Anything not yet due starts at the beginning of the line, not at a random seeded state.
    if (new Date(o.due) >= TODAY) { o.state = 'scheduled'; o.ack = null; o.docs[1] = 0; delete o.filedAt; }
    return o;
  });
  if (!fresh.length) return 0;
  STATE.obligations = STATE.obligations.concat(fresh).sort((a, b) => new Date(a.due) - new Date(b.due));
  return fresh.length;
}
/* Add a client to the workspace and enrol its recurring filings straight away.
   Missing profile fields get safe defaults so every screen can render the client. */
function enrolClient(input, opts = {}) {
  const lead = opts.partner || (typeof me === 'function' && me() ? me().id : 'srinivas');
  const c = Object.assign({
    type: 'Private company', pan: '', state: 'TS', city: '—', tags: [], partner: lead, manager: lead, team: [],
    turnover: 0, fee: 0, lang: 'English', channel: 'Email', risk: 'Medium', health: 80,
    since: TODAY.getFullYear(), contact: '—', books: '—'
  }, input);
  c.short = c.short || String(c.name || c.id).split(' ').slice(0, 2).join(' ');
  if (!Array.isArray(c.team)) c.team = [];
  STATE.newClients = STATE.newClients || [];
  if (clientById(c.id)) return { client: clientById(c.id), added: 0, duplicate: true };
  STATE.newClients.push(c);
  STATE.walls[c.id] = [...new Set([c.partner, c.manager, ...c.team, ...(opts.wall || [])].filter(Boolean))];
  const added = topUpObligations([c]);
  ledgerAdd({ actor: lead, kind: 'human', action: `enrolled ${c.short} · ${added} filings scheduled`, client: c.id, obj: 'Clients' });
  return { client: c, added, duplicate: false };
}
function addTeamMember(t) {
  STATE.extraTeam = STATE.extraTeam || [];
  if (!STATE.extraTeam.find(x => x.id === t.id)) STATE.extraTeam.push(t);
  if (!TEAM.find(x => x.id === t.id)) TEAM.push(t);
  save();
  return t;
}
/* People added from Team & capacity live in STATE.extraTeam; merge them into TEAM on every load. */
function hydrateExtras() {
  (STATE.extraTeam || []).forEach(t => { if (!TEAM.find(x => x.id === t.id)) TEAM.push(t); });
}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(STATE)); } catch (e) { } }, 120); }
function resetDemo() { if (typeof API_CLIENT !== 'undefined' && API_CLIENT.connected) return toast('Reset is only for the offline demo. Your firm records are stored on the server and are not reset.', 'warn', 'lock'); try { localStorage.removeItem(KEY); } catch (e) { } const keep = { theme: STATE.theme, session: STATE.session }; freshState(); Object.assign(STATE, keep); save(); applyTheme(); renderShell(); route(); toast('Demo reset — a fresh day at the firm', 'agent', 'refresh'); }

/* ---------------- people & permissions ---------------- */
const me = () => person(STATE.persona);
const can = cap => (STATE.caps[cap] || []).includes(me().role);
const isPartner = () => ['MP', 'PT'].includes(me().role);
const visibleClientIds = () => can('all_clients') ? ALL_CLIENTS.map(c => c.id).concat(STATE.newClients.map(c => c.id)) : Object.entries(STATE.walls).filter(([, v]) => v.includes(me().id)).map(([k]) => k);
const canSeeClient = id => !id || visibleClientIds().includes(id);
const visibleClients = () => ALL_CLIENTS.concat(STATE.newClients).filter(c => canSeeClient(c.id));
const avatar = (id, cls = '') => { const p = person(id); if (!p) { const a = agentByCode(id); return a ? `<span class="glyph agent ${cls.includes('sm') ? 'sm' : ''}" title="${esc(a.name)}">${a.code}</span>` : `<span class="av ${cls}" style="background:var(--code)">?</span>`; } const ini = p.short.slice(0, 2).toUpperCase(); return `<span class="av ${cls}" style="background:${p.color}" title="${esc(p.name)}">${ini}</span>`; };
const actorName = id => !id ? '' : person(id)?.short || (agentByCode(id) ? agentByCode(id).short : id);

/* ---------------- ledger (append-only, hash-chained) ---------------- */
function ledgerAdd(e, at) {
  const prev = STATE.ledger.length ? STATE.ledger[STATE.ledger.length - 1].hash : '00000000';
  const rec = { n: STATE.ledger.length + 1, at: at || new Date().toISOString(), actor: e.actor, kind: e.kind || 'human', action: e.action, client: e.client || null, obj: e.obj || '', rule: e.rule || 'rb 2026.10.2', ver: e.ver || null, ref: e.ref || null, prev };
  rec.hash = fnv(prev + JSON.stringify([rec.n, rec.at, rec.actor, rec.action, rec.client, rec.obj, rec.rule]));
  STATE.ledger.push(rec);
  if (STATE.ledger.length > 900) { /* keep chain tail, mark trimmed */ STATE.ledger.splice(0, STATE.ledger.length - 900); STATE.ledgerTrimmed = true; }
  return rec;
}
function verifyChain() {
  let ok = 0, bad = null;
  for (let i = 0; i < STATE.ledger.length; i++) {
    const r = STATE.ledger[i];
    const h = fnv(r.prev + JSON.stringify([r.n, r.at, r.actor, r.action, r.client, r.obj, r.rule]));
    if (h !== r.hash || (i > 0 && r.prev !== STATE.ledger[i - 1].hash)) { bad = r.n; break; }
    ok++;
  }
  return { ok, bad };
}
function seedLedger() {
  const r = seeded('ledger' + dayKey(TODAY));
  const evs = [];
  const obs = STATE.obligations;
  for (let day = -3; day <= 0; day++) {
    const n = day === 0 ? 46 : 70;
    for (let i = 0; i < n; i++) {
      const h = 7 + Math.floor(r() * (day === 0 ? Math.max(1, new Date().getHours() - 7) : 12));
      const at = new Date(TODAY.getTime() + day * 864e5); at.setHours(h, Math.floor(r() * 60), Math.floor(r() * 60));
      if (day === 0 && at > new Date()) continue;
      const o = pick(obs, r); const c = clientById(o.client);
      const t = pick(LEDGER_TEMPLATES, r)(o, c, r);
      evs.push({ at: at.toISOString(), ...t });
    }
  }
  evs.sort((a, b) => a.at.localeCompare(b.at)).forEach(e => ledgerAdd(e, e.at));
}
const LEDGER_TEMPLATES = [
  (o, c, r) => ({ actor: 'IN-1', kind: 'agent', action: `read ${2 + Math.floor(r() * 9)} documents from ${c.channel || 'email'}`, client: c.id, obj: o.form + ' · ' + o.period, ver: 'IN-1 v1.1.0', ref: 'vault' }),
  (o, c, r) => ({ actor: 'IN-3', kind: 'agent', action: `proposed ledger mapping for ${20 + Math.floor(r() * 180)} transactions`, client: c.id, obj: 'Books · ' + o.period, ver: 'IN-3 v1.3.6' }),
  (o, c, r) => ({ actor: 'GS-3', kind: 'agent', action: 'matched purchase register to GSTR-2B', client: c.id, obj: 'GSTR-3B · ' + o.period, ver: 'GS-3 v1.2.0', ref: '2B json' }),
  (o, c) => ({ actor: 'IN-2', kind: 'agent', action: 'sent document request (day −3 rung)', client: c.id, obj: o.form + ' · ' + o.period, ver: 'IN-2 v1.2.3' }),
  (o, c) => ({ actor: 'FL-1', kind: 'agent', action: 'captured acknowledgement from portal', client: c.id, obj: o.form + ' · ' + o.period, ver: 'FL-1 v1.4.1', ref: 'ARN' }),
  (o, c) => ({ actor: o.prep, kind: 'human', action: 'prepared and submitted for review', client: c.id, obj: o.form + ' · ' + o.period }),
  (o, c) => ({ actor: o.rev, kind: 'human', action: 'reviewed — four eyes (G6)', client: c.id, obj: o.form + ' · ' + o.period }),
  (o, c) => ({ actor: c.partner, kind: 'human', action: 'signed with DSC (G7)', client: c.id, obj: o.form + ' · ' + o.period }),
  (o, c) => ({ actor: 'CL-1', kind: 'agent', action: 'answered "Is it filed?" from stored data', client: c.id, obj: 'WhatsApp', ver: 'CL-1 v1.1.5' }),
  (o, c) => ({ actor: 'DT-2', kind: 'agent', action: 'reconciled AIS / 26AS lines', client: c.id, obj: 'Direct tax', ver: 'DT-2 v1.4.5' }),
  (o, c) => ({ actor: 'GS-5', kind: 'agent', action: 'ran 38 rules — 0 blocking', client: c.id, obj: o.form + ' · ' + o.period, ver: 'GS-5 v1.5.2', rule: 'rb 2026.10.2' }),
  (o, c) => ({ actor: 'FO-2', kind: 'agent', action: 'ranked 3 exceptions into the queue', client: c.id, obj: 'Exceptions', ver: 'FO-2 v1.4.0' }),
  (o, c, r) => ({ actor: pick(['vamsi', 'lavanya', 'rohit', 'pooja'], r), kind: 'human', action: 'confirmed low-confidence value (G2)', client: c.id, obj: 'Vault' }),
  (o, c) => ({ actor: 'system', kind: 'code', action: 'computed liability from deterministic library', client: c.id, obj: o.form + ' · ' + o.period, rule: 'rb 2026.10.2' })
];

/* ---------------- live agents (simulation of the runtime) ---------------- */
const LIVE = { timer: null, pending: 0 };
function liveTick() {
  if (!STATE.autopilot || document.hidden) return;
  const vis = STATE.obligations.filter(o => canSeeClient(o.client));
  const r = Math.random;
  const roll = r();
  let ev, changed = false;
  if (roll < 0.22) {
    const o = pick(vis.filter(o => o.state === 'filed')) ;
    if (o) { o.state = 'closed'; o.ack = (o.d === 'GST' ? 'AA36' : 'ACK') + String(Math.floor(r() * 1e12)).padStart(12, '0'); ev = { actor: 'FL-1', kind: 'agent', action: `captured acknowledgement ${o.ack}`, client: o.client, obj: o.form + ' · ' + o.period }; changed = true; }
  } else if (roll < 0.48) {
    const o = pick(vis.filter(o => ['received', 'preparing'].includes(o.state)));
    if (o) { const nx = o.state === 'received' ? 'preparing' : 'reconciled'; o.state = nx; ev = { actor: nx === 'preparing' ? 'IN-3' : (o.d === 'GST' ? 'GS-3' : o.d === 'TDS' ? 'DT-1' : 'IN-4'), kind: 'agent', action: nx === 'preparing' ? 'classified transactions and opened the working file' : 'finished reconciliation — differences explained', client: o.client, obj: o.form + ' · ' + o.period }; changed = true; }
  } else if (roll < 0.6) {
    const o = pick(vis.filter(o => o.state === 'awaiting'));
    if (o) { o.docs[1] = o.docs[0]; o.state = 'received'; ev = { actor: 'IN-1', kind: 'agent', action: `received ${o.docs[0]} documents — all read above 0.85`, client: o.client, obj: o.form + ' · ' + o.period }; changed = true; }
  }
  if (!ev) {
    const c = pick(visibleClients().filter(c => !c.internal));
    const t = pick([
      () => ({ actor: 'IN-2', kind: 'agent', action: `sent ${pick(['day −7', 'day −3', 'day −1'])} document request in ${c.lang}`, client: c.id, obj: 'Automation · Document request ladder' }),
      () => ({ actor: 'CL-1', kind: 'agent', action: `answered "${pick(CLOSED_LIST)}" on ${c.channel}`, client: c.id, obj: 'Client desk' }),
      () => ({ actor: 'IN-1', kind: 'agent', action: `acknowledged ${2 + Math.floor(r() * 5)} files received on ${c.channel}`, client: c.id, obj: 'Automation · Receipt acknowledgement' }),
      () => ({ actor: 'IN-3', kind: 'agent', action: `proposed mappings for ${10 + Math.floor(r() * 90)} bank lines`, client: c.id, obj: 'Books' }),
      () => ({ actor: 'DT-1', kind: 'agent', action: 'verified 12 payee PANs — 1 inoperative flagged', client: c.id, obj: 'TDS' }),
      () => ({ actor: 'GS-2', kind: 'agent', action: `proposed IMS actions on ${3 + Math.floor(r() * 12)} new supplier invoices`, client: c.id, obj: 'IMS' }),
      () => ({ actor: 'FO-4', kind: 'agent', action: 'swept CBIC, CBDT, MCA & ICAI feeds — nothing new', client: null, obj: 'Regulatory watch' }),
      () => ({ actor: 'FO-5', kind: 'agent', action: 'injected a known-defective proposal into a review queue', client: null, obj: 'Quality canary' })
    ])();
    ev = t;
  }
  const rec = ledgerAdd(ev);
  STATE.feed.unshift(rec); STATE.feed = STATE.feed.slice(0, 60);
  save();
  onLive(rec, changed);
}
function onLive(rec, changed) {
  const feed = $('#live-feed');
  if (feed) { feed.insertAdjacentHTML('afterbegin', feedItem(rec, true)); while (feed.children.length > 14) feed.lastElementChild.remove(); }
  $$('[data-live-count]').forEach(el => el.textContent = Number(el.textContent || 0) + 1);
  if (changed && CURRENT.page !== 'today') {
    LIVE.pending++;
    const pill = $('#refresh-pill');
    if (pill) { pill.classList.remove('hidden'); pill.querySelector('b').textContent = LIVE.pending; }
  }
  updateCounts();
}
function feedItem(r, isNew) {
  const c = r.client ? clientById(r.client) : null;
  const who = r.kind === 'agent' ? `<span class="glyph agent sm">${esc(r.actor)}</span>` : r.kind === 'code' ? `<span class="glyph code sm">fx</span>` : r.kind === 'client' ? '<span class="glyph client sm"></span>' : avatar(r.actor, 'sm');
  return `<div class="feed-item k-${r.kind} ${isNew ? 'new' : ''}">${who}<div class="body"><b>${esc(actorName(r.actor) === 'system' ? 'Computation core' : actorName(r.actor))}</b> ${esc(r.action)}${c ? ` · <a href="#/client/${c.id}" class="dim">${esc(c.short)}</a>` : ''}<div class="tiny muted">${esc(r.obj || '')}</div></div><span class="time">${fmtT(r.at)}</span></div>`;
}
/* The simulated runtime used to move filings and invent acknowledgements every 6.5s.
   It is switched off so that nothing on screen claims to have happened unless a person
   (or, later, a real backend job) did it. Set window.FIRM_OS_SIMULATE = true to demo it. */
function startLive() { clearInterval(LIVE.timer); if (window.FIRM_OS_SIMULATE === true) LIVE.timer = setInterval(liveTick, 6500); }

/* ---------------- gate queue (seeded items + obligations at G6/G7) ---------------- */
function gateQueue() {
  const items = STATE.gates.filter(g => g.status === 'pending' && canSeeClient(g.client)).map(g => ({ ...g, src: 'item' }));
  STATE.obligations.filter(o => (o.state === 'review' || o.state === 'sign') && canSeeClient(o.client)).forEach(o => {
    items.push({ id: 'ob:' + o.id, ob: o.id, gate: o.state === 'review' ? 'G6' : 'G7', title: `${o.state === 'review' ? 'Review' : 'Sign'} ${o.form} · ${o.period}`, client: o.client, amount: o.amount, prep: o.state === 'review' ? o.prep : o.prep, rev: o.rev, created: new Date(new Date(o.due).getTime() - 3 * 864e5).toISOString(), due: o.due, src: 'ob', ev: evidenceFor(o) });
  });
  return items.sort((a, b) => new Date(a.due) - new Date(b.due));
}
function evidenceFor(o) {
  const c = clientById(o.client);
  const base = [`Prepared by ${actorName(o.prep)} · autopilot: ${(catById(o.fid)?.a || []).map(c => agentByCode(c)?.short || c).join(', ') || '—'}`];
  if (o.amount) base.push(`Computed by the deterministic core: ${inr(o.amount)} — no model produced this figure`);
  if (o.d === 'GST') base.push('All 38 rules passed · variance vs last period explained in words');
  if (o.d === 'TDS') base.push('FVU validation passed · challans matched');
  if (o.d === 'PAY') base.push('Three-way check: books = PF return = TDS salary');
  base.push(`Documents: ${o.docs[1]}/${o.docs[0]} received · every figure cites its source`);
  if (o.state === 'sign') base.push(`Four-eyes review completed by ${actorName(o.rev)}`);
  return base;
}
const myGateCount = () => gateQueue().filter(g => gateAllowed(g).ok).length;

function gateAllowed(item) {
  const G = GATES[item.gate];
  if (!G) return { ok: false, why: 'Unknown gate' };
  const high = item.amount > 50000 && G.capHigh;
  const cap = high ? G.capHigh : G.cap;
  if (!can(cap)) return { ok: false, why: `${G.who}. Your role (${ROLES[me().role].name}) does not hold “${CAPS.find(c => c.k === cap)?.n}”.` };
  if ((G.fourEyes || item.gate === 'G6') && item.prep === me().id) return { ok: false, why: 'You prepared this. Four eyes means someone other than the preparer must review it.' };
  return { ok: true };
}

/* ---------------- shell ---------------- */
const PAGES = [
  { k: 'today', n: 'Today', i: 'sun', g: 'Today' },
  { k: 'daybook', n: 'Daybook', i: 'book', g: 'Today' },
  { k: 'line', n: 'The line', i: 'columns', g: 'Work' },
  { k: 'calendar', n: 'Statutory clock', i: 'calendar', g: 'Work' },
  { k: 'gates', n: 'Gates & approvals', i: 'stamp', g: 'Work', count: () => myGateCount(), cc: 'gate' },
  { k: 'intake', n: 'Intake & vault', i: 'inbox', g: 'Work' },
  { k: 'recon', n: 'Reconciliation', i: 'scale', g: 'Work' },
  { k: 'books', n: 'Books', i: 'ledger', g: 'Work' },
  { k: 'notices', n: 'Notices', i: 'alert', g: 'Work', count: () => STATE.notices.filter(n => canSeeClient(n.client) && n.stage !== 'Replied').length, cc: 'bad' },
  { k: 'desk', n: 'Client desk', i: 'chat', g: 'Clients', count: () => STATE.threads.filter(t => canSeeClient(t.client)).reduce((s, t) => s + (t.unread || 0), 0) },
  { k: 'automations', n: 'Client automations', i: 'zap', g: 'Clients' },
  { k: 'clients', n: 'Clients', i: 'building', g: 'Clients' },
  { k: 'portal', n: 'Client portal', i: 'globe', g: 'Clients' },
  { k: 'catalogue', n: 'Filing catalogue', i: 'grid', g: 'Firm' },
  { k: 'team', n: 'Team & capacity', i: 'users', g: 'Firm' },
  { k: 'billing', n: 'Billing & recovery', i: 'rupee', g: 'Firm', cap: 'billing' },
  { k: 'vault', n: 'DSC & credentials', i: 'key', g: 'Firm' },
  { k: 'quality', n: 'Quality review', i: 'checkCircle', g: 'Firm' },
  { k: 'agents', n: 'Autopilot', i: 'hex', g: 'Machine' },
  { k: 'connectors', n: 'Connectors', i: 'plug', g: 'Machine' },
  { k: 'rulebook', n: 'Rulebook', i: 'scroll', g: 'Machine' },
  { k: 'record', n: 'The record', i: 'chain', g: 'Machine', cap: 'ledger' },
  { k: 'access', n: 'Access & roles', i: 'shield', g: 'Machine' },
  { k: 'coverage', n: 'Owner\'s coverage audit', i: 'clipboard', g: 'Machine' }
];
const VIEWS = {};
let CURRENT = { page: 'today', arg: null };

function renderShell() {
  const p = me();
  const groups = [...new Set(PAGES.map(x => x.g))];
  $('#sidebar').innerHTML = `
    <div class="brand">${BRAND_MARK}<div><div class="brand-name">CA Firm OS</div><div class="brand-sub">Practice operating system</div></div></div>
    <div class="firm-chip"><b>${esc(FIRM.name)}</b>${esc(FIRM.sub)} · ${esc(FIRM.city)}<br><span style="opacity:.7">${esc(FIRM.frn)} · ${ALL_CLIENTS.length - 1 + STATE.newClients.length} clients</span></div>
    <nav class="nav" aria-label="Main">
      ${groups.map(g => `<div class="nav-group">${g}</div>` + PAGES.filter(x => x.g === g).map(x => {
        const locked = x.cap && !can(x.cap);
        return `<a href="#/${x.k}" data-k="${x.k}" class="${locked ? 'locked' : ''}">${icon(locked ? 'lock' : x.i)}<span>${x.n}</span>${x.count ? `<span class="count ${x.cc || ''}" data-count="${x.k}"></span>` : ''}</a>`;
      }).join('')).join('')}
    </nav>
    <div class="sidebar-foot">Synthetic demo firm & data.<br>Autopilot never files, signs or submits — only people can.<br><a href="#" id="reset-demo" style="color:var(--gold)">Reset demo</a></div>`;
  $('#topbar').innerHTML = `
    <button class="icon-btn menu-btn" id="menu-btn" aria-label="Open menu">${icon('menu')}</button>
    <div class="search" id="open-palette" role="button" tabindex="0">${icon('search')}<span class="ph">Search clients, filings, people, actions…</span><kbd>⌘K</kbd></div>
    <div class="spacer"></div>
    <span class="pulse-pill hide-sm" id="peak-pill"></span>
    <button class="pulse-pill hide-sm" id="autopilot" style="cursor:pointer" title="${window.FIRM_OS_SIMULATE === true ? 'Demo simulation running' : 'Agents are not connected yet — nothing runs automatically'}">${window.FIRM_OS_SIMULATE === true ? (STATE.autopilot ? '<span class="dot live"></span> Simulation on' : '<span class="dot" style="background:var(--ink-3)"></span> Simulation paused') : '<span class="dot" style="background:var(--ink-3)"></span> Autopilot not connected'}</button>
    <button class="icon-btn" id="bell" aria-label="Alerts" title="Alerts">${icon('bell')}<span class="bcount" data-bell></span></button>
    <button class="icon-btn" id="legend-btn" aria-label="Colour key" title="Colour key">${icon('palette')}</button>
    <button class="icon-btn" id="theme-btn" aria-label="Toggle theme">${icon(document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches) ? 'sun' : 'moon')}</button>
    <button class="btn primary sm hide-sm" id="assign-btn">${icon('plus')} Assign task</button>
    <button class="persona" id="persona-btn" aria-label="Switch person">${avatar(p.id)}<span class="who">${esc(p.short)}<small>${ROLES[p.role].short}</small></span>${icon('chevDown')}</button>`;
  const d = TODAY; const pk = isPeak(d), fz = inFreeze(d);
  $('#peak-pill').innerHTML = pk ? `<span class="dot" style="background:var(--bad)"></span> Peak day · change freeze` : fz ? `<span class="dot" style="background:var(--warn)"></span> Change freeze window` : `<span class="dot" style="background:var(--ok)"></span> Capacity day`;
  $('#reset-demo').onclick = e => { e.preventDefault(); confirmModal('Reset the demo?', 'All approvals, uploads and changes you made will be cleared and a fresh day generated.', 'Reset', resetDemo); };
  $('#menu-btn').onclick = () => $('.app').classList.toggle('nav-open');
  $('#open-palette').onclick = openPalette;
  $('#open-palette').onkeydown = e => { if (e.key === 'Enter') openPalette(); };
  $('#theme-btn').onclick = cycleTheme;
  $('#persona-btn').onclick = openPersona;
  $('#legend-btn').onclick = openLegend;
  $('#assign-btn').onclick = () => openTaskModal();
  $('#bell').onclick = () => openSheet({ title: 'Alerts', sub: 'Things that need attention across your clients, newest rules first', body: `<div style="display:grid;gap:10px">${alertCards(buildAlerts())}</div><div class="card mt16"><div class="card-h"><h3>Waiting on you</h3></div><div class="list">${gateQueue().filter(g => gateAllowed(g).ok).slice(0, 5).map(g => gateRow(g)).join('') || '<div class="empty small">Nothing.</div>'}</div></div>`, onMount: s => { bindAlerts(s); bindGateRows(s); } });
  $('#autopilot').onclick = () => { if (window.FIRM_OS_SIMULATE !== true) return toast('Agents are not connected yet. Every change you see was made by a person in this workspace.', 'warn', 'info'); STATE.autopilot = !STATE.autopilot; save(); renderShell(); highlightNav(); toast(STATE.autopilot ? 'Autopilot resumed' : 'Autopilot paused — nothing new will be prepared', STATE.autopilot ? 'agent' : 'warn', STATE.autopilot ? 'play' : 'pause'); };
  updateCounts(); highlightNav();
}
function updateCounts() {
  const bc = $('[data-bell]'); if (bc && typeof buildAlerts === 'function') { const n = buildAlerts().length; bc.textContent = n; bc.style.display = n ? '' : 'none'; }
  PAGES.filter(x => x.count).forEach(x => { const el = $(`[data-count="${x.k}"]`); if (el) { const n = x.count(); el.textContent = n; el.style.display = n ? '' : 'none'; } });
}
function highlightNav() { $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.k === CURRENT.page || (CURRENT.page === 'client' && a.dataset.k === 'clients'))); }

let NAV = null;
let LOGIN_NEXT = null;
function navTo(h) { NAV = h; try { if (location.hash !== h) location.hash = h; } catch (e) { /* hash may be locked by the host */ } route(); }
function route() {
  const h = (NAV ?? location.hash).replace(/^#\/?/, '') || 'today';
  let [page, arg] = h.split('/');
  if (page !== 'portal' && page !== 'login' && !STATE.session) { LOGIN_NEXT = h; page = 'login'; arg = null; }
  CURRENT = { page, arg };
  LIVE.pending = 0;
  const view = $('#view');
  const meta = PAGES.find(p => p.k === page);
  $('.app').classList.remove('nav-open');
  document.body.classList.toggle('portal-mode', page === 'portal' || page === 'login');
  if (meta && meta.cap && !can(meta.cap)) { view.innerHTML = lockedView(meta); }
  else if (VIEWS[page]) {
    try { view.innerHTML = VIEWS[page].render(arg); VIEWS[page].mount && VIEWS[page].mount(view, arg); }
    catch (err) { console.error(err); view.innerHTML = `<div class="empty">${icon('alert')}<p>Something went wrong rendering this page.</p><pre class="small">${esc(err.message)}</pre></div>`; }
  } else { navTo('#/today'); return; }
  view.classList.remove('view'); void view.offsetWidth; view.classList.add('view');
  view.insertAdjacentHTML('beforeend', `<button class="pulse-pill hidden" id="refresh-pill" style="position:fixed;bottom:22px;right:22px;z-index:40;cursor:pointer;box-shadow:var(--shadow)">${icon('refresh').replace('<svg', '<svg width="15" height="15"')} <b>0</b> new updates</button>`);
  $('#refresh-pill').onclick = () => route();
  highlightNav(); updateCounts();
  document.title = page === 'login' ? 'Sign in · CA Firm OS' : (meta ? meta.n : page === 'client' ? (clientById(arg)?.short || 'Client') : 'Home') + ' · CA Firm OS';
  window.scrollTo({ top: 0 });
}
const rerender = () => { const y = window.scrollY; route(); window.scrollTo({ top: y }); };
function lockedView(meta) {
  const holders = (STATE.caps[meta.cap] || []).map(r => ROLES[r].name).join(', ');
  return `<div class="page-head"><div><div class="eyebrow">Restricted</div><h1>${esc(meta.n)}</h1></div></div>
  <div class="card pad" style="max-width:620px">${icon('lock', '')}<h3 class="serif" style="font-size:22px;margin:8px 0">This page is behind an access wall</h3>
  <p class="dim">Your role — <b>${ROLES[me().role].name}</b> — does not hold “${esc(CAPS.find(c => c.k === meta.cap).n)}”. Held by: ${esc(holders)}.</p>
  <p class="small muted">Access attempts are written to the permanent record. Partners can change role permissions on Access & roles.</p></div>`;
}

/* ---------------- theme ---------------- */
function applyTheme() { const th = STATE.theme || HOST_THEME; if (th) document.documentElement.dataset.theme = th; else delete document.documentElement.dataset.theme; }
function cycleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  STATE.theme = dark ? 'light' : 'dark'; save(); applyTheme(); renderShell(); highlightNav();
}

/* ---------------- sheets, modals, toasts ---------------- */
function scrim(show, onClick) {
  let s = $('#scrim');
  if (!s) { s = document.createElement('div'); s.id = 'scrim'; s.className = 'scrim'; document.body.appendChild(s); }
  if (show) { s.style.display = 'block'; requestAnimationFrame(() => s.classList.add('show')); s.onclick = onClick; }
  else { s.classList.remove('show'); setTimeout(() => { if (!$('.sheet.show') && !$('.modal.show')) s.style.display = 'none'; }, 300); }
}
function openSheet({ title, sub = '', body = '', foot = '', wide = false, onMount }) {
  closeSheet(true);
  const el = document.createElement('aside');
  el.className = 'sheet' + (wide ? ' wide' : ''); el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="grabber"></div><div class="sheet-h"><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div><button class="icon-btn x" aria-label="Close">${icon('x')}</button></div><div class="sheet-b">${body}</div>${foot ? `<div class="sheet-f">${foot}</div>` : ''}`;
  document.body.appendChild(el);
  scrim(true, () => closeSheet());
  requestAnimationFrame(() => el.classList.add('show'));
  el.querySelector('.x').onclick = () => closeSheet();
  onMount && onMount(el);
  return el;
}
function closeSheet(instant) {
  const el = $('.sheet'); if (!el) return;
  el.classList.remove('show');
  if (instant) el.remove(); else setTimeout(() => el.remove(), 450);
  if (!$('.modal.show')) scrim(false);
}
function openModal({ html, wide = false, cls = '', onMount }) {
  closeModal(true);
  const el = document.createElement('div');
  el.className = `modal ${wide ? 'wide' : ''} ${cls}`; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = html; document.body.appendChild(el);
  scrim(true, () => closeModal());
  requestAnimationFrame(() => el.classList.add('show'));
  onMount && onMount(el);
  return el;
}
function closeModal(instant) {
  const el = $('.modal'); if (!el) return;
  el.classList.remove('show');
  if (instant) el.remove(); else setTimeout(() => el.remove(), 300);
  if (!$('.sheet.show')) scrim(false); else { const s = $('#scrim'); if (s) s.onclick = () => closeSheet(); }
}
function confirmModal(title, text, okLabel, onOk, kind = 'primary') {
  openModal({ html: `<div class="modal-b"><h2>${title}</h2><p class="dim">${text}</p><div class="flex" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" data-x>Cancel</button><button class="btn ${kind}" data-ok>${okLabel}</button></div></div>`, onMount: el => { el.querySelector('[data-x]').onclick = () => closeModal(); el.querySelector('[data-ok]').onclick = () => { closeModal(); onOk(); }; } });
}
const TOAST_COL = { ok: 'var(--ok)', agent: 'var(--agent)', gate: 'var(--gate)', bad: 'var(--bad)', warn: 'var(--warn)', client: 'var(--client)', code: 'var(--code)' };
function toast(msg, kind = 'ok', ic = 'check') {
  let wrap = $('.toasts'); if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toasts'; wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span class="ti" style="background:${TOAST_COL[kind] || TOAST_COL.ok}">${icon(ic)}</span><span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 3600);
}

/* ---------------- persona switcher ---------------- */
function openPersona() {
  openSheet({
    title: 'Who is using CA Firm OS?', sub: 'Switch person to see how roles, ethical walls and gates change what each member of the firm can see and do.',
    foot: `<button class="btn danger" id="sign-out">${icon('lock')} Sign out</button>`,
    body: `<a class="card pad flex mb16" href="#/portal" id="to-portal" style="text-decoration:none;border-color:var(--client)"><span class="glyph client"></span><div style="flex:1"><b>Sign in as a client</b><div class="small muted">Open the client portal — uploads, approvals, payments, messages</div></div>${icon('chev', 'chev')}</a><div class="list card">${TEAM.map(t => {
      const vis = Object.values(STATE.walls).filter(v => v.includes(t.id)).length;
      const all = (STATE.caps.all_clients || []).includes(t.role);
      return `<div class="row click" data-p="${t.id}">${avatar(t.id, 'lg')}<div class="grow"><div class="t1">${esc(t.name)} ${t.id === STATE.persona ? '<span class="chip ok" style="margin-left:6px">Current</span>' : ''}</div><div class="t2">${ROLES[t.role].name} · ${esc(t.focus)}</div></div><span class="chip outline">${all ? 'All clients' : vis + ' clients'}</span>${icon('chev', 'chev')}</div>`;
    }).join('')}</div>`,
    onMount: el => { $('#to-portal', el).addEventListener('click', () => closeSheet()); $('#sign-out', el).onclick = () => { ledgerAdd({ actor: me().id, kind: 'human', action: 'signed out of the workspace', obj: 'Sign-in' }); STATE.session = null; save(); closeSheet(); if (typeof API_CLIENT !== 'undefined' && API_CLIENT.connected) { API_CLIENT.flush().finally(() => API_CLIENT.signOut()); } navTo('#/login'); toast('Signed out', 'code', 'lock'); }; $$('[data-p]', el).forEach(r => r.onclick = () => {
      if (typeof API_CLIENT !== 'undefined' && API_CLIENT.connected && r.dataset.p !== STATE.persona) { closeSheet(); return toast('You are signed in as ' + me().short + '. Sign out and sign in as the other person to switch.', 'warn', 'lock'); }
      STATE.persona = r.dataset.p; save(); closeSheet(); renderShell(); route();
      const p = me(); toast(`Now using CA Firm OS as ${p.short} · ${ROLES[p.role].name} — ${visibleClients().length} clients visible`, 'code', 'user');
    }); }
  });
}

/* ---------------- colour key ---------------- */
function openLegend() {
  openModal({
    wide: true, html: `<div class="modal-b"><div class="upper muted">The colour key</div><h2>Hue says who holds the ball. Red, amber and green say how it is going.</h2>
    <p class="dim small">Every colour in CA Firm OS means exactly one thing, and every colour is paired with a shape so it still reads in greyscale or for colour-blind colleagues.</p>
    <div class="grid g2 mt16">
      <div class="card pad"><div class="upper muted mb8">Who holds it</div>
        <div class="list">
          <div class="flex mb8"><span class="glyph agent">AUTO</span><div><b>Autopilot</b> · peacock teal, hexagon<div class="small muted">The system reading, matching, drafting. Never signs or files.</div></div></div>
          <div class="flex mb8"><span class="glyph client"></span><div><b>Client</b> · sky blue, circle<div class="small muted">Waiting on the client — papers, approvals, payments.</div></div></div>
          <div class="flex mb8"><span class="glyph gate">G7</span><div><b>Human gate</b> · stamp violet, seal<div class="small muted">Work stops until a named person acts. Violet, like office stamp ink.</div></div></div>
          <div class="flex"><span class="glyph code">fx</span><div><b>Portal & code</b> · graphite, square<div class="small muted">Rulebook, computation core and government portals.</div></div></div>
        </div></div>
      <div class="card pad"><div class="upper muted mb8">How it is going</div>
        <div class="flex mb8"><span class="chip ok"><span class="dot" style="background:var(--ok)"></span>Done / healthy</span><span class="small muted">closed, acknowledged, on track</span></div>
        <div class="flex mb8"><span class="chip warn"><span class="dot" style="background:var(--warn)"></span>Due within 2 days</span><span class="small muted">act today</span></div>
        <div class="flex mb8"><span class="chip bad"><span class="dot" style="background:var(--bad)"></span>Late / breached</span><span class="small muted">only ever used for lateness & risk</span></div>
        <div class="hr"></div>
        <div class="upper muted mb8">Marks</div>
        <div class="flex wrap"><span class="stamp ok">Filed</span><span class="stamp gate">Signed</span><span class="small muted">Rubber stamps = an irreversible act happened.</span></div>
        <div class="flex mt8"><span style="display:inline-block;width:40px;height:4px;background:repeating-linear-gradient(90deg,var(--bad) 0 6px,transparent 6px 10px)"></span><span class="small muted">Dashed red rule on a date = statutory peak day (7th · 11th · 15th · 20th).</span></div>
      </div>
    </div>
    <div class="card pad mt16"><div class="upper muted mb8">Which law it falls under · texture, never colour</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">${Object.entries(FAM_NAME).map(([k, n]) => `<div class="flex"><span class="swatch lg tx-${k}"></span><span class="small">${n}</span></div>`).join('')}</div>
      <p class="tiny muted mt8">Look for it on file tabs atop each card on The line, the left edge of calendar entries, the strip on catalogue cards and the small chips beside every obligation.</p></div>
    <div class="card pad mt12"><div class="upper muted mb8">Every activity line carries a stripe for who acted</div>
      <div class="legend"><span><i class="sw" style="background:var(--agent)"></i>Autopilot</span><span><i class="sw" style="background:var(--client)"></i>Client, in the portal</span><span><i class="sw" style="background:var(--line-2)"></i>A person at the firm</span><span><i class="sw" style="background:var(--code)"></i>Computation core</span></div></div>
    <div class="flex" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" data-x>Got it</button></div></div>`,
    onMount: el => el.querySelector('[data-x]').onclick = () => closeModal()
  });
}

/* ---------------- command palette ---------------- */
function openPalette() {
  const actions = [
    { t: 'Upload documents', k: 'Action', go: () => { navTo('#/intake'); setTimeout(() => $('#file-pick')?.click(), 300); } },
    { t: 'Onboard a new client', k: 'Action', go: () => { navTo('#/clients'); setTimeout(() => openOnboarding(), 250); } },
    { t: 'Switch person / role', k: 'Action', go: openPersona },
    { t: 'Claim an expense', k: 'Action', go: () => openExpenseClaim() },
    { t: 'Your morning brief', k: 'Action', go: () => openBrief() },
    { t: 'Toggle light / dark', k: 'Action', go: cycleTheme },
    { t: 'Show the colour key', k: 'Action', go: openLegend },
    { t: STATE.autopilot ? 'Pause autopilot' : 'Resume autopilot', k: 'Action', go: () => $('#autopilot').click() },
    { t: 'Verify the record\'s hash chain', k: 'Action', go: () => { navTo('#/record'); } },
    { t: 'Reset demo', k: 'Action', go: () => $('#reset-demo').click() }
  ];
  const m = openModal({
    cls: 'palette', html: `<input id="pal-in" placeholder="Type a client, form (GSTR-3B, AOC-4, 26Q…), person or action" autocomplete="off"><div class="results" id="pal-res"></div><div class="tiny muted" style="padding:8px 14px;border-top:1px solid var(--line)">↑ ↓ to move · Enter to open · Esc to close</div>`,
    onMount: el => {
      const inp = el.querySelector('#pal-in'), res = el.querySelector('#pal-res');
      let items = [], on = 0;
      const draw = () => {
        const q = inp.value.trim().toLowerCase();
        const m = s => !q || s.toLowerCase().includes(q);
        items = [];
        PAGES.filter(p => m(p.n)).slice(0, q ? 6 : 8).forEach(p => items.push({ g: 'Pages', t: p.n, i: p.i, go: () => navTo('#/' + p.k) }));
        visibleClients().filter(c => m(c.name + ' ' + (c.pan || '') + ' ' + (c.gstin || ''))).slice(0, 6).forEach(c => items.push({ g: 'Clients', t: c.name, s: c.type, i: 'building', go: () => navTo('#/client/' + c.id) }));
        if (q) CATALOGUE.filter(f => m(f.f + ' ' + f.n)).slice(0, 6).forEach(f => items.push({ g: 'Filing catalogue', t: `${f.f} — ${f.n}`, s: f.due, i: 'grid', go: () => { navTo('#/catalogue'); setTimeout(() => openFiling(f.id), 250); } }));
        if (q) STATE.obligations.filter(o => canSeeClient(o.client) && m(o.form + ' ' + clientById(o.client).short + ' ' + o.period)).slice(0, 6).forEach(o => items.push({ g: 'Obligations', t: `${o.form} · ${clientById(o.client).short} · ${o.period}`, s: stateOf(o.state).n + ' · due ' + fmtD(o.due), i: 'columns', go: () => openObligation(o.id) }));
        if (q) TEAM.filter(t => m(t.name)).slice(0, 4).forEach(t => items.push({ g: 'People', t: t.name, s: ROLES[t.role].name, i: 'user', go: () => navTo('#/team') }));
        actions.filter(a => m(a.t)).slice(0, q ? 4 : 5).forEach(a => items.push({ g: 'Actions', t: a.t, i: 'sparkle', go: a.go }));
        on = Math.min(on, Math.max(0, items.length - 1));
        let lastG = '';
        res.innerHTML = items.length ? items.map((it, i) => { const head = it.g !== lastG ? `<div class="grp">${it.g}</div>` : ''; lastG = it.g; return head + `<div class="res ${i === on ? 'on' : ''}" data-i="${i}">${icon(it.i).replace('<svg', '<svg width="18" height="18"')}<div><div style="font-weight:600;font-size:14px">${esc(it.t)}</div>${it.s ? `<div class="tiny muted">${esc(it.s)}</div>` : ''}</div><span class="k">${icon('arrow').replace('<svg', '<svg width="14" height="14"')}</span></div>`; }).join('') : `<div class="empty">Nothing matches “${esc(inp.value)}”.</div>`;
        $$('.res', res).forEach(r => r.onclick = () => { const it = items[+r.dataset.i]; closeModal(); it.go(); });
      };
      inp.oninput = () => { on = 0; draw(); };
      inp.onkeydown = e => {
        if (e.key === 'ArrowDown') { on = Math.min(items.length - 1, on + 1); draw(); e.preventDefault(); }
        if (e.key === 'ArrowUp') { on = Math.max(0, on - 1); draw(); e.preventDefault(); }
        if (e.key === 'Enter' && items[on]) { closeModal(); items[on].go(); }
      };
      draw(); setTimeout(() => inp.focus(), 50);
    }
  });
}

/* ---------------- shared pieces used across pages ---------------- */
const pageHead = (eyebrow, title, lede, actions = '') => `<div class="page-head"><div style="flex:1;min-width:260px"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
const stateChip = k => { const s = stateOf(k); return `<span class="chip ${s.h}"><span class="dot" style="background:var(--${s.h === 'ok' ? 'ok' : s.h})"></span>${s.n}</span>`; };
const dueChip = (x, closed) => { if (closed) return `<span class="chip ok">${icon('check')}${fmtD(x)}</span>`; const n = daysTo(x); return `<span class="chip ${dueCls(x)}">${icon('clock')}${n < 0 ? `Overdue · ${-n} day${n === -1 ? '' : 's'}` : n === 0 ? 'Due today' : `Due ${fmtD(x)} · in ${n} day${n === 1 ? '' : 's'}`}</span>`; };
const gateSeal = g => `<span class="glyph gate" title="${esc(GATES[g]?.n || g)}">${g}</span>`;
const agentHex = c => `<span class="glyph agent" title="${esc(agentByCode(c)?.name || c)}">${c}</span>`;
const stepper = k => { const i = SIDX[k]; const h = stateOf(k).h; return `<div class="stepper">${STATES.map((s, j) => `<i class="${j < i ? 'done' : j === i ? (h === 'ok' ? 'done' : 'cur-' + h) : ''}" title="${s.n}"></i>`).join('')}</div>`; };
const meter = (pct, cls = '', mark) => `<div class="meter ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i>${mark != null ? `<span class="mark" style="left:${mark}%"></span>` : ''}</div>`;
const spark = (vals, color = 'var(--agent)', w = 90, h = 30) => { const mx = Math.max(...vals), mn = Math.min(...vals); const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - mn) / ((mx - mn) || 1)) * (h - 4) - 2}`).join(' '); return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`; };
const clientLink = id => { const c = clientById(id); return c ? `<a href="#/client/${c.id}" style="text-decoration:none;font-weight:600">${esc(c.short)}</a>` : '<span class="muted">Firm-wide</span>'; };

/* ---------------- boot ---------------- */
function boot() {
  load(); applyTheme(); renderShell(); route(); startLive();
  window.addEventListener('hashchange', () => { if (location.hash && location.hash !== NAV) { NAV = location.hash; route(); } });
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="#/"]'); if (a) { e.preventDefault(); navTo(a.getAttribute('href')); } });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openPalette(); }
    else if (e.key === 'Escape') { if ($('.modal.show')) closeModal(); else if ($('.sheet.show')) closeSheet(); }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!STATE.theme) renderShell(); });
  save();
}
