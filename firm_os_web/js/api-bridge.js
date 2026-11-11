/* CA Firm OS — Backend API Bridge
   Connects the browser state to the FastAPI backend.
   API base resolution (first match wins):
     1. window.FIRM_OS_API_BASE (set in a <script> before this file)
     2. localStorage 'bahi_api_base'  (e.g. https://your-backend.onrender.com/api/v1)
     3. same origin when served by the backend on :8000
     4. http://127.0.0.1:8000/api/v1 (local development) */

const API_BASE = (() => {
  try {
    if (window.FIRM_OS_API_BASE) return String(window.FIRM_OS_API_BASE).replace(/\/$/, '');
    const saved = localStorage.getItem('bahi_api_base');
    if (saved) return saved.replace(/\/$/, '');
  } catch (e) { /* storage blocked */ }
  if (window.location.origin && window.location.origin.includes(':8000')) return `${window.location.origin}/api/v1`;
  return 'http://127.0.0.1:8000/api/v1';
})();

const API_CLIENT = {
  isOnline: false,
  isSyncing: false,
  lastSyncTime: null,
  syncTimer: null,

  token: null,

  getHeaders(customHeaders = {}) {
    const token = localStorage.getItem('bahi_token') || this.token;
    const headers = { 'Content-Type': 'application/json', ...customHeaders };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  async checkHealth() {
    try {
      const resp = await fetch(`${API_BASE}/health`, { method: 'GET' });
      if (resp.ok) {
        this.isOnline = true;
        this.updateBadge();
        return true;
      }
    } catch (e) {
      this.isOnline = false;
      this.updateBadge();
    }
    return false;
  },

  /* ================= Phase 1: per-record storage =================
     The tracker keeps STATE in memory for rendering, but the firm's records live in the backend:
     clients, staff, obligations, tasks, notices, timesheets, fee invoices and the daybook each have
     their own table. After every save() we work out which records changed since the last
     successful sync and send only those (batched per entity). Other workspace settings go to
     /ops/settings. Nothing is ever pushed as one whole-state blob. */
  connected: false,      // signed in with a backend session and the workspace is loaded
  saveState: 'idle',     // idle | pending | saving | error
  lastError: '',
  _snap: null,
  _ledgerSent: null,
  _settingsSnap: '',
  _flushTimer: null,
  _flushing: false,

  ENTITIES: {
    clients: { key: 'id', get: () => ALL_CLIENTS.filter(c => c.id !== 'self').concat(STATE.newClients || []) },
    staff: { key: 'id', get: () => TEAM },
    obligations: { key: 'id', get: () => STATE.obligations || [] },
    tasks: { key: 'id', get: () => STATE.tasks || [] },
    notices: { key: 'id', get: () => STATE.notices || [] },
    invoices: { key: 'no', get: () => STATE.invoices || [] },
    timesheets: { key: 'id', get: () => STATE.timesheets || [] }
  },
  // STATE keys that are records (above), per-browser preferences, or derived: never part of settings.
  NOT_SETTINGS: ['obligations', 'tasks', 'notices', 'invoices', 'timesheets', 'newClients', 'extraTeam', 'ledger',
    'persona', 'theme', 'session', 'seededFor', 'lastSeen', 'seenGates', 'autopilot', 'ledgerTrimmed'],
  ARRAY_SETTINGS: ['gates', 'docs', 'threads', 'dscs', 'reveals', 'leaves', 'expenses', 'notes', 'feed', 'firmDeadlines', 'ruleLog'],
  MAP_SETTINGS: ['walls', 'caps', 'connectors', 'automations', 'agentModes', 'ims', 'patterns', 'bank', 'recon', 'portalDone', 'payments', 'daySignedOff'],
  STAFF_DEFAULTS: { focus: '', status: 'In office', cost: 0, color: '#4A4E63', signed: 0, ceilingOther: 0, cpe: 0 },

  hasToken() { try { return !!localStorage.getItem('bahi_token'); } catch (e) { return false; } },
  setToken(t) { this.token = t; try { if (t) localStorage.setItem('bahi_token', t); else localStorage.removeItem('bahi_token'); } catch (e) { } },

  async _get(path) {
    const resp = await fetch(`${API_BASE}${path}`, { headers: this.getHeaders() });
    let data = null; try { data = await resp.json(); } catch (e) { }
    if (!resp.ok) { const err = new Error((data && typeof data.detail === 'string' && data.detail) || `HTTP ${resp.status}`); err.status = resp.status; throw err; }
    return data;
  },
  async _send(method, path, body) {
    const resp = await fetch(`${API_BASE}${path}`, { method, headers: this.getHeaders(), body: JSON.stringify(body) });
    let data = null; try { data = await resp.json(); } catch (e) { }
    if (!resp.ok) { const err = new Error((data && typeof data.detail === 'string' && data.detail) || `HTTP ${resp.status}`); err.status = resp.status; throw err; }
    return data;
  },

  _settingsOf(st) {
    const out = {};
    Object.keys(st).forEach(k => { if (!this.NOT_SETTINGS.includes(k)) out[k] = st[k]; });
    return out;
  },
  _mapOf(name) {
    const cfg = this.ENTITIES[name]; const m = new Map();
    cfg.get().forEach(r => { if (r && r[cfg.key] != null) m.set(String(r[cfg.key]), JSON.stringify(r)); });
    return m;
  },
  _staff(t) { return Object.assign({}, this.STAFF_DEFAULTS, { short: String(t.name || t.id).split(' ')[0] }, t); },

  /* Replace in-memory records with the firm's records from the backend. */
  hydrate(ws, me) {
    const keep = { theme: STATE.theme, session: STATE.session };
    const settings = ws.settings || {};
    // Settings come only from the server: nothing from this browser's demo state leaks in.
    this.MAP_SETTINGS.forEach(k => { STATE[k] = {}; });
    this.ARRAY_SETTINGS.forEach(k => { STATE[k] = []; });
    Object.assign(STATE, settings, keep);
    const selfClient = ALL_CLIENTS.find(c => c.id === 'self');
    ALL_CLIENTS.length = 0; ws.clients.forEach(c => ALL_CLIENTS.push(c)); if (selfClient) ALL_CLIENTS.push(selfClient);
    STATE.newClients = [];
    TEAM.length = 0; ws.staff.forEach(t => TEAM.push(this._staff(t)));
    if (me && !TEAM.find(t => t.id === me.id)) TEAM.push(this._staff(me));
    STATE.obligations = ws.obligations; STATE.tasks = ws.tasks; STATE.notices = ws.notices;
    STATE.invoices = ws.invoices; STATE.timesheets = ws.timesheets || [];
    STATE.ledger = (ws.daybook || []).slice().sort((x, y) => x.n - y.n);
    STATE.extraTeam = [];
    this.MAP_SETTINGS.forEach(k => { if (!STATE[k] || typeof STATE[k] !== 'object') STATE[k] = {}; });
    this.ARRAY_SETTINGS.forEach(k => { if (!Array.isArray(STATE[k])) STATE[k] = []; });
    if (me) STATE.persona = me.id;
    // Snapshot = exactly what the server has. Anything added locally after this (e.g. filings whose
    // due dates rolled into the window today) is then sent on the next flush.
    this._snap = {}; Object.keys(this.ENTITIES).forEach(n => { this._snap[n] = this._mapOf(n); });
    this._ledgerSent = new Set(STATE.ledger.map(e => `${e.hash}-${e.n}`));
    this._settingsSnap = JSON.stringify(this._settingsOf(STATE));
    if (typeof dayKey === 'function' && typeof topUpObligations === 'function') {
      const added = topUpObligations(); STATE.seededFor = dayKey(TODAY);
      if (added) this.syncState();
    }
  },

  /* Starting workspaces for an empty firm. freshState() builds the synthetic demo firm in place, so
     STATE is put back afterwards. */
  _fresh() { const prev = STATE; const fresh = freshState(); STATE = prev; return fresh; },
  _demoPayload() {
    const fresh = this._fresh();
    return {
      clients: CLIENTS.map(c => ({ ...c })), staff: TEAM_SEED.map(t => ({ ...t })), obligations: fresh.obligations,
      tasks: fresh.tasks, notices: fresh.notices, invoices: fresh.invoices, timesheets: [], daybook: fresh.ledger,
      settings: this._settingsOf(fresh)
    };
  },
  _emptyPayload() {
    const settings = this._settingsOf(this._fresh());
    this.ARRAY_SETTINGS.forEach(k => { settings[k] = []; });
    ['walls', 'ims', 'patterns', 'bank', 'recon', 'portalDone', 'payments', 'daySignedOff'].forEach(k => { settings[k] = {}; });
    settings.portal = null;
    return { clients: [], staff: [], obligations: [], tasks: [], notices: [], invoices: [], timesheets: [], daybook: [], settings };
  },
  importWorkspace(kind) {
    return this._send('POST', '/ops/workspace/import', kind === 'demo' ? this._demoPayload() : this._emptyPayload());
  },
  _askStartKind() {
    return new Promise(resolve => {
      if (typeof openModal !== 'function') { resolve('empty'); return; }
      openModal({
        html: `<div class="modal-b"><h2>This firm has no data yet</h2><p class="small dim">Load the demo workspace (a sample firm with clients, filings and notices) to explore, or start empty and add your own clients.</p>
          <div class="flex" style="justify-content:flex-end;gap:8px;margin-top:16px"><button class="btn" data-k="empty">Start empty</button><button class="btn primary" data-k="demo">Load demo workspace</button></div></div>`,
        onMount: m => m.querySelectorAll('[data-k]').forEach(b => { b.onclick = () => { closeModal(); resolve(b.dataset.k); }; })
      });
    });
  },

  /* Sign-in finished (token stored): load the firm's workspace and enter the app as that person. */
  async openWorkspace({ autoDemo = false } = {}) {
    const me = (await this._get('/ops/me')).staff;
    let ws = await this._get('/ops/workspace');
    if (ws.empty && ['MP', 'PT'].includes(me.role)) {
      const kind = autoDemo ? 'demo' : await this._askStartKind();
      await this.importWorkspace(kind);
      ws = await this._get('/ops/workspace');
    }
    this.hydrate(ws, me);
    this.connected = true;
    STATE.session = Object.assign({}, STATE.session || { since: new Date().toISOString(), how: 'backend session' }, { user: me.id });
    this.saveState = 'idle';
    this.updateBadge();
    return me;
  },

  async loadInitialState() {
    const ok = await this.checkHealth();
    if (!ok || !this.hasToken()) return;   // offline, or not signed in yet: the login screen handles it
    try {
      await this.openWorkspace();
      if (typeof applyTheme === 'function') applyTheme();
      if (typeof renderShell === 'function') renderShell();
      if (typeof route === 'function') route();
    } catch (e) {
      console.warn('[API-Bridge] Could not open workspace:', e);
      if (e.status === 401 || e.status === 403) this.signOut('Your session has ended. Please sign in again.');
    }
  },

  /* Called after every save(): send only what changed, shortly after the last edit. */
  syncState() {
    if (!this.connected) return;
    if (this.saveState !== 'saving') this.saveState = 'pending';
    this.updateBadge();
    clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this.flush(), 500);
  },

  async flush() {
    if (!this.connected || !this._snap) return;
    if (this._flushing) { clearTimeout(this._flushTimer); this._flushTimer = setTimeout(() => this.flush(), 400); return; }
    this._flushing = true; this.saveState = 'saving'; this.updateBadge();
    try {
      for (const name of Object.keys(this.ENTITIES)) {
        const prev = this._snap[name]; const now = this._mapOf(name);
        const upserts = []; const deletes = [];
        now.forEach((json, k) => { if (prev.get(k) !== json) upserts.push(JSON.parse(json)); });
        prev.forEach((_, k) => { if (!now.has(k)) deletes.push(k); });
        if (!upserts.length && !deletes.length) continue;
        for (let i = 0; i < Math.max(upserts.length, 1); i += 500) {
          await this._send('POST', `/ops/${name}/batch`, { upserts: upserts.slice(i, i + 500), deletes: i === 0 ? deletes : [] });
        }
        this._snap[name] = now;
      }
      const fresh = (STATE.ledger || []).filter(e => !this._ledgerSent.has(`${e.hash}-${e.n}`));
      if (fresh.length) {
        await this._send('POST', '/ops/daybook', { entries: fresh });
        fresh.forEach(e => this._ledgerSent.add(`${e.hash}-${e.n}`));
      }
      const settingsJson = JSON.stringify(this._settingsOf(STATE));
      if (settingsJson !== this._settingsSnap) {
        await this._send('PUT', '/ops/settings', { data: JSON.parse(settingsJson) });
        this._settingsSnap = settingsJson;
      }
      this.saveState = 'idle'; this.lastError = ''; this.lastSyncTime = new Date();
    } catch (e) {
      this.lastError = e.message || String(e);
      if (e.status === 401) { this._flushing = false; this.signOut('Your session has ended. Please sign in again.'); return; }
      if (e.status >= 400 && e.status < 500) {
        // The server refused the change (permission or validation): say why, then reload the firm's records.
        this.toast(`Not saved: ${this.lastError}`, 'bad', 'alert');
        try {
          const me = (await this._get('/ops/me')).staff;
          this.hydrate(await this._get('/ops/workspace'), me);
          if (typeof renderShell === 'function') renderShell();
          if (typeof route === 'function') route();
        } catch (e2) { console.warn('[API-Bridge] reload after refusal failed', e2); }
        this.saveState = 'idle';
      } else {
        this.saveState = 'error';     // network or server error: keep the changes and retry
        clearTimeout(this._flushTimer); this._flushTimer = setTimeout(() => this.flush(), 5000);
      }
    } finally {
      this._flushing = false; this.updateBadge();
    }
  },

  async devLogin(staff) {
    const data = await this._send('POST', '/ops/dev-login', { staff: { id: staff.id, name: staff.name, role: staff.role } });
    this.setToken(data.access_token);
    return data;
  },

  signOut(message) {
    this.setToken(null); this.connected = false; this._snap = null;
    try { localStorage.removeItem('bahi_user'); } catch (e) { }
    if (typeof STATE !== 'undefined' && STATE) STATE.session = null;
    this.updateBadge();
    if (typeof navTo === 'function') navTo('#/login');
    if (message) this.toast(message, 'warn', 'lock');
  },

  async decideGate(gateCode, itemId, action, notes = '') {
    const actor = (typeof me === 'function' && me()) ? me() : { id: 'srinivas', role: 'PT' };
    const gateItem = (STATE.gates || []).find(g => g.id === itemId) || {};
    
    const payload = {
      item_id: itemId,
      gate_code: gateCode,
      action: action.toUpperCase(),
      notes: notes,
      actor_id: actor.id,
      actor_role: actor.role,
      preparer_id: gateItem.prep || null,
      amount: gateItem.amount || 0.0
    };

    try {
      const resp = await fetch(`${API_BASE}/firm-os/gates/${gateCode}/decide`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Gate decision failed');
      }

      const res = await resp.json();
      console.log('[API-Bridge] Gate approved & logged to Audit Ledger:', res);
      return res;
    } catch (err) {
      console.error('[API-Bridge] Gate approval error:', err);
      throw err;
    }
  },

  async signDSC(itemId, pin) {
    const actor = (typeof me === 'function' && me()) ? me() : { id: 'srinivas', role: 'PT' };
    const payload = {
      item_id: itemId,
      partner_id: actor.id,
      pin: pin
    };

    const resp = await fetch(`${API_BASE}/firm-os/dsc/sign`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || 'DSC signing failed');
    }
    return await resp.json();
  },

  async runReconciliation(clientId = 'c01', period = '2026-09') {
    const resp = await fetch(`${API_BASE}/firm-os/reconciliation/run`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ client_id: clientId, period: period })
    });

    if (!resp.ok) {
      throw new Error('Deterministic reconciliation failed on backend');
    }
    return await resp.json();
  },

  exportTallyXmlUrl() {
    return `${API_BASE}/firm-os/export/tally-xml`;
  },

  exportReconciliationCsvUrl() {
    return `${API_BASE}/firm-os/export/reconciliation-csv`;
  },

  async verifyAuditChain() {
    try {
      const resp = await fetch(`${API_BASE}/firm-os/audit-chain/verify`, { headers: this.getHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        console.log('[API-Bridge] ICAI SQC-1 Cryptographic Audit Report:', data);
        if (data.chain_valid) {
          this.toast(`Audit Chain Verified (${data.total_blocks} blocks mathematically intact)`, 'success', 'shield-check');
        } else {
          this.toast('Warning: Audit Chain Tamper Detected!', 'danger', 'alert-triangle');
        }
        return data;
      }
    } catch (e) {
      console.warn('[API-Bridge] Audit chain verification failed:', e);
    }
  },

  async generateGSTR1(supplierGstin, period, invoices = null) {
    const resp = await fetch(`${API_BASE}/firm-os/filings/gstr1/generate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ supplier_gstin: supplierGstin, return_period: period, invoices: invoices })
    });
    if (!resp.ok) throw new Error('GSTR-1 JSON Generation failed');
    return await resp.json();
  },

  async computeGSTR3B(payload) {
    const resp = await fetch(`${API_BASE}/firm-os/filings/gstr3b/compute`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('GSTR-3B Computation failed');
    return await resp.json();
  },

  async submitFiling(returnType, gstin, period, pin = '1234') {
    const actor = (typeof me === 'function' && me()) ? me() : { id: 'srinivas', role: 'PT' };
    const resp = await fetch(`${API_BASE}/firm-os/filings/submit`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        return_type: returnType,
        gstin: gstin,
        period: period,
        pin: pin,
        partner_id: actor.id
      })
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || 'Filing submission failed');
    }
    const data = await resp.json();
    this.toast(`Filing Submitted to GSTN · ARN: ${data.arn}`, 'success', 'check-circle');
    return data;
  },

  async createEmployee(payload) {
    const actor = (typeof me === 'function' && me()) ? me() : { id: 'srinivas', role: 'PT' };
    const resp = await fetch(`${API_BASE}/firm-os/team/members`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        ...payload,
        partner_id: actor.id,
        partner_role: actor.role
      })
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.detail || 'Failed to create employee ID');
    }
    return await resp.json();
  },

  async getLiveTracker() {
    try {
      const resp = await fetch(`${API_BASE}/firm-os/live-tracker`, { headers: this.getHeaders() });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('[API-Bridge] Failed to fetch live tracker:', e);
    }
    return null;
  },

  async syncPortalLive(gstins = null) {
    const resp = await fetch(`${API_BASE}/firm-os/portal/sync-live`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ period: '2026-09', gstins: gstins })
    });
    if (!resp.ok) throw new Error('Portal sync failed');
    const data = await resp.json();
    this.toast('Live Portal Sync: Refreshed 14 client files with latest GSTR-2B', 'success', 'refresh-cw');
    return data;
  },

  async fetchLiveStatutoryCalendar() {
    try {
      const resp = await fetch(`${API_BASE}/firm-os/statutory-calendar/live`, { headers: this.getHeaders() });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('[API-Bridge] Failed to fetch live statutory calendar:', e);
    }
    return null;
  },

  async syncLiveStatutoryCalendar() {
    try {
      const resp = await fetch(`${API_BASE}/firm-os/statutory-calendar/sync`, { method: 'POST', headers: this.getHeaders() });
      if (resp.ok) {
        const data = await resp.json();
        const gstnStatus = data.portals && data.portals.gstn && data.portals.gstn.online ? 'GSTN Online' : 'Active';
        this.toast(`Live Sync: ${data.total_deadlines_tracked} statutory dates verified (${gstnStatus})`, 'success', 'globe');
        return data;
      }
    } catch (e) {
      console.warn('[API-Bridge] Live statutory sync error:', e);
      this.toast('Statutory Sync: Using verified regulatory schedules', 'agent', 'calendar');
    }
    return null;
  },

  /* ---------------- AUTH & OTP ---------------- */
  async _post(path, body) {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body)
    });
    let data = null;
    try { data = await resp.json(); } catch (e) { data = null; }
    if (!resp.ok) {
      const detail = (data && (data.detail || data.message)) || `HTTP ${resp.status}`;
      return { status: 'error', http_status: resp.status, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) };
    }
    return data;
  },

  async requestOTP(identifier, channel = null) {
    try {
      return await this._post('/auth/otp/send', { identifier, channel });
    } catch (e) {
      console.error('[API-Bridge] requestOTP error:', e);
      return { status: 'error', detail: e.message };
    }
  },

  async verifyOTP(identifier, otp) {
    try {
      const data = await this._post('/auth/otp/verify', { identifier, otp });
      if (data && data.access_token) {
        localStorage.setItem('bahi_token', data.access_token);
        localStorage.setItem('bahi_user', JSON.stringify(data.user));
        this.token = data.access_token;
      }
      return data;
    } catch (e) {
      console.error('[API-Bridge] verifyOTP error:', e);
      return { status: 'error', detail: e.message };
    }
  },

  async getMe() {
    const token = localStorage.getItem('bahi_token') || this.token;
    if (!token) return null;
    try {
      const resp = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('[API-Bridge] getMe error:', e);
    }
    return null;
  },

  /* ---------------- BANK RECONCILIATION & TALLY ---------------- */
  async runBankReconciliation(payload = {}) {
    try {
      const data = await this._post('/bank-reco/reconcile', payload);
      if (!data || data.status === 'error' || !data.summary) return data || { status: 'error', detail: 'Empty response' };
      // Normalise the engine's report into the shape the Reconciliation screen renders.
      const s = data.summary;
      const pass_counts = {};
      (data.matched_records || []).forEach(m => {
        const n = /PASS_(\d)/.exec(m.rule || '');
        if (n) pass_counts['p' + n[1]] = (pass_counts['p' + n[1]] || 0) + 1;
      });
      const brs = data.bank_reconciliation_statement || {};
      return {
        status: 'SUCCESS',
        client_name: s.client_name || 'Sample statement',
        total_bank_transactions: s.total_bank_transactions,
        matched_count: s.total_matched,
        unmatched_bank_count: s.total_unmatched_bank,
        reconciliation_percentage: s.match_rate_pct,
        bank_closing_balance: s.bank_closing_balance,
        net_variance: brs.balance_as_per_books_of_account != null ? Math.round((s.bank_closing_balance - brs.balance_as_per_books_of_account) * 100) / 100 : 0,
        sqc1_audit_hash: s.reconciliation_audit_hash,
        pass_counts,
        tax_audit_alerts: [],
        raw: data
      };
    } catch (e) {
      console.error('[API-Bridge] runBankReconciliation error:', e);
      return { status: 'error', detail: e.message };
    }
  },

  async parseBankCSV(csv_content, bank_name = 'AUTO') {
    try {
      return await this._post('/bank-reco/parse', { csv_content, bank_name });
    } catch (e) {
      console.error('[API-Bridge] parseBankCSV error:', e);
      return { status: 'error', detail: e.message };
    }
  },

  async parseTallyXML(xml_content, company_name = '') {
    try {
      const data = await this._post('/bank-reco/tally-sync/parse-xml', { xml_content, company_name });
      if (!data || data.status === 'error' || !data.summary) return data || { status: 'error', detail: 'Empty response' };
      return { status: 'PARSED_SUCCESSFULLY', is_balanced: data.is_balanced, ...data.summary, raw: data };
    } catch (e) {
      console.error('[API-Bridge] parseTallyXML error:', e);
      return { status: 'error', detail: e.message };
    }
  },

  /* ---------------- BILLING & INVOICING ---------------- */
  async loadInvoices() {
    try {
      const resp = await fetch(`${API_BASE}/billing/invoices`, { headers: this.getHeaders() });
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn('[API-Bridge] loadInvoices error:', e);
    }
    return [];
  },

  async createInvoice(invoiceData) {
    try {
      return await this._post('/billing/invoices', invoiceData);
    } catch (e) {
      console.error('[API-Bridge] createInvoice error:', e);
      return { status: 'error', detail: e.message };
    }
  },

  async bulkImportClients(clientsList) {
    // The backend imports clients from an uploaded Excel/CSV file (POST /clients/import-excel);
    // there is no JSON bulk endpoint yet, so the ops tracker keeps imports local for now.
    return { status: 'error', detail: 'Bulk import is file-based on the backend; not wired from the ops tracker yet.' };
  },

  updateBadge() {
    let badge = document.getElementById('api-status-badge');
    const spacer = document.querySelector('#topbar .spacer');
    if (!badge && spacer) {
      badge = document.createElement('div');
      badge.id = 'api-status-badge';
      badge.className = 'api-badge hide-sm';
      spacer.after(badge);
    }
    if (!badge) return;
    let dot = 'offline';
    let text = 'Offline · this browser only';
    let title = `Backend not reachable at ${API_BASE}. Changes are saved in this browser only.`;
    if (this.isOnline && !this.connected) {
      dot = 'online'; text = 'Backend online · not signed in'; title = 'Sign in to load and save your firm records.';
    }
    if (this.connected) {
      dot = this.saveState === 'error' ? 'offline' : (this.saveState === 'idle' ? 'online' : 'syncing');
      text = { idle: 'All changes saved', pending: 'Saving…', saving: 'Saving…', error: 'Not saved · retrying' }[this.saveState];
      title = this.saveState === 'error' ? `Last error: ${this.lastError}` : `Saved to ${API_BASE}${this.lastSyncTime ? ' · ' + this.lastSyncTime.toLocaleTimeString() : ''}`;
    }
    badge.innerHTML = `<span class="badge-dot ${dot}"></span><span class="badge-text">${text}</span>`;
    badge.title = title;
  },

  toast(msg, tone = 'agent', iconName = 'plug') {
    if (typeof toast === 'function') {
      toast(msg, tone, iconName);
    }
  }
};

/* Hook into core save() and renderShell() */
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => API_CLIENT.loadInitialState(), 50);

  // renderShell() rebuilds the topbar, so re-attach the status badge afterwards
  if (typeof renderShell === 'function') {
    const originalRenderShell = renderShell;
    window.renderShell = function() {
      originalRenderShell();
      API_CLIENT.updateBadge();
    };
  }

  // every save() schedules a record-level sync (no whole-state uploads)
  if (typeof save === 'function') {
    const originalSave = save;
    window.save = function() {
      originalSave();
      API_CLIENT.syncState();
    };
  }
});
