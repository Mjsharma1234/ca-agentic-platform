/* CA Firm OS — Backend API Bridge
   Connects the reactive browser state to the production FastAPI backend and database.
   Handles state persistence, deterministic multi-pass reconciliation, and G1-G18 gate decisions. */

const API_BASE = (window.location.origin && window.location.origin.includes(':8000')) 
  ? `${window.location.origin}/api/v1` 
  : 'http://127.0.0.1:8000/api/v1';

const API_CLIENT = {
  isOnline: false,
  isSyncing: false,
  lastSyncTime: null,
  syncTimer: null,

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

  async loadInitialState() {
    try {
      const ok = await this.checkHealth();
      if (!ok) return;

      const resp = await fetch(`${API_BASE}/firm-os/state`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === 'success' && data.state) {
          console.log('[API-Bridge] Hydrating state from persistent database...');
          STATE = data.state;
          if (typeof applyTheme === 'function') applyTheme();
          if (typeof renderShell === 'function') renderShell();
          if (typeof route === 'function') route();
          this.toast('Connected to Production Backend (Database Synced)', 'agent', 'plug');
        } else {
          console.log('[API-Bridge] Database state empty; syncing current seed state to backend...');
          this.syncState(STATE, true);
        }
      }
    } catch (e) {
      console.warn('[API-Bridge] Failed to load server state:', e);
    }
  },

  syncState(state, immediate = false) {
    if (!this.isOnline) return;
    clearTimeout(this.syncTimer);
    
    const execute = async () => {
      this.isSyncing = true;
      this.updateBadge();
      try {
        const resp = await fetch(`${API_BASE}/firm-os/state/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: state,
            synced_by: (typeof me === 'function' && me()) ? me().id : 'system'
          })
        });
        if (resp.ok) {
          this.lastSyncTime = new Date();
        }
      } catch (e) {
        console.warn('[API-Bridge] State sync error:', e);
      } finally {
        this.isSyncing = false;
        this.updateBadge();
      }
    };

    if (immediate) {
      execute();
    } else {
      this.syncTimer = setTimeout(execute, 400);
    }
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
        headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      const resp = await fetch(`${API_BASE}/firm-os/audit-chain/verify`);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier_gstin: supplierGstin, return_period: period, invoices: invoices })
    });
    if (!resp.ok) throw new Error('GSTR-1 JSON Generation failed');
    return await resp.json();
  },

  async computeGSTR3B(payload) {
    const resp = await fetch(`${API_BASE}/firm-os/filings/gstr3b/compute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error('GSTR-3B Computation failed');
    return await resp.json();
  },

  async submitFiling(returnType, gstin, period, pin = '1234') {
    const actor = (typeof me === 'function' && me()) ? me() : { id: 'srinivas', role: 'PT' };
    const resp = await fetch(`${API_BASE}/firm-os/filings/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  updateBadge() {
    let badge = document.getElementById('api-status-badge');
    const topbarRight = document.querySelector('.topbar-right');
    if (!badge && topbarRight) {
      badge = document.createElement('div');
      badge.id = 'api-status-badge';
      badge.className = 'api-badge';
      topbarRight.prepend(badge);
    }
    if (badge) {
      if (this.isOnline) {
        badge.innerHTML = `
          <span class="badge-dot ${this.isSyncing ? 'syncing' : 'online'}"></span>
          <span class="badge-text">${this.isSyncing ? 'Syncing...' : 'DB Online'}</span>
        `;
        badge.title = `Connected to FastAPI Backend (SQLite/PostgreSQL) · ${this.lastSyncTime ? 'Last synced ' + this.lastSyncTime.toLocaleTimeString() : 'Active'}`;
      } else {
        badge.innerHTML = `
          <span class="badge-dot offline"></span>
          <span class="badge-text">Local Cache</span>
        `;
        badge.title = 'Backend server offline · Running on local browser cache';
      }
    }
  },

  toast(msg, tone = 'agent', iconName = 'plug') {
    if (typeof toast === 'function') {
      toast(msg, tone, iconName);
    }
  }
};

/* Hook into core save() function to automatically stream state to server */
window.addEventListener('DOMContentLoaded', () => {
  API_CLIENT.checkHealth();
  setTimeout(() => API_CLIENT.loadInitialState(), 200);

  // Hook into existing save()
  if (typeof save === 'function') {
    const originalSave = save;
    window.save = function() {
      originalSave();
      API_CLIENT.syncState(STATE);
    };
  }
});
