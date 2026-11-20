/* ============ TALLY SYNC ============
   Connect a client's PC to Firm OS and watch it sync.
   Pairing is automatic: the agent on the PC opens #/tally/<code> in the browser, a manager approves it here once,
   and the PC then sends its purchase register on its own. Each Tally company links itself to the client with the
   exact same name; anything else is linked here by hand.
   Talks to /api/v1/tally-agent/* (managers and partners only; the server enforces it). */

const TALLY_API = {
  agents: () => API_CLIENT._get('/tally-agent/agents'),
  companies: () => API_CLIENT._get('/tally-agent/companies'),
  clients: () => API_CLIENT._get('/clients/'),
  create: name => API_CLIENT._send('POST', '/tally-agent/agents', { name }),
  revoke: id => API_CLIENT._send('DELETE', `/tally-agent/agents/${id}`),
  link: (id, client_id) => API_CLIENT._send('PUT', `/tally-agent/companies/${id}/link`, { client_id }),
  register: (id, period) => API_CLIENT._get(`/tally-agent/companies/${id}/register` + (period ? '?period=' + encodeURIComponent(period) : '')),
  reconcile: (id, gstr2b, allPeriods) => API_CLIENT._send('POST', `/tally-agent/companies/${id}/reconcile`, { gstr2b, all_periods: !!allPeriods }),
  syncNow: id => API_CLIENT._send('POST', `/tally-agent/companies/${id}/sync-now`, {}),
  createClient: body => API_CLIENT._send('POST', '/clients/', body),
  pairInfo: code => API_CLIENT._get(`/tally-agent/enroll/${encodeURIComponent(code)}`),
  pairApprove: code => API_CLIENT._send('POST', `/tally-agent/enroll/${encodeURIComponent(code)}/approve`, {}),
  pairDeny: code => API_CLIENT._send('POST', `/tally-agent/enroll/${encodeURIComponent(code)}/deny`, {})
};

let TALLY_FAST_UNTIL = 0;   // refresh the Tally page every few seconds until this time

/* "Not signed in to the server" card with a button that does something about it. A browser can hold an old demo session
   (the app looks signed in, but the server has no session); the button clears that, shows the real sign-in, and
   brings the person back to `next` (a route such as 'tally/ABCD-2345') once they are in. */
function tallySignInCard(root, headline, text, next) {
  root.innerHTML = `<div class="card pad" style="max-width:640px"><b>${esc(headline)}</b><p class="small muted">${esc(text)}</p><button class="btn primary" id="tally-signin">Sign in</button></div>`;
  $('#tally-signin', root).onclick = () => {
    if (typeof API_CLIENT !== 'undefined') API_CLIENT.setToken(null);
    STATE.session = null; save();
    LOGIN_NEXT = next;
    navTo('#/login');
  };
}

function tallyWhen(iso) {
  if (!iso) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
  return isNaN(d) ? null : d;
}
function tallyAgo(iso) {
  const d = tallyWhen(iso); if (!d) return 'never';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  if (m < 1440) return Math.round(m / 60) + ' h ago';
  return Math.round(m / 1440) + ' d ago';
}

VIEWS.tally = {
  render() {
    return pageHead('Connectors · read-only · the agent never writes to Tally', 'Tally <em>sync</em>',
      'Start the Firm OS agent on the PC where Tally runs. It asks to connect, you approve it here once, and from then on it sends the purchase register by itself for GSTR-2B reconciliation.') +
      '<div id="tally-pair"></div><div id="tally-root"><div class="card pad"><p class="muted">Loading…</p></div></div>';
  },
  mount(el, code) {
    const root = $('#tally-root', el), pairBox = $('#tally-pair', el);
    if (typeof API_CLIENT === 'undefined' || !API_CLIENT.connected) {
      tallySignInCard(root, 'Sign in to the server to use Tally sync',
        code ? 'You opened a link from a PC that wants to connect. Sign in first; you will come back here to approve it.'
             : 'This page manages PCs and links stored on the server. Your browser is not signed in to the server (it may hold an old demo session).',
        'tally' + (code ? '/' + encodeURIComponent(code) : ''));
      return;
    }

    /* ---- the pairing request carried in the link ---- */
    const showPairing = async () => {
      if (!code) return;
      try {
        const p = await TALLY_API.pairInfo(code);
        pairBox.innerHTML = `<div class="card pad mb16" style="max-width:720px;border-color:var(--agent)">
          <div class="eyebrow">A PC wants to connect</div>
          <h3 style="margin:4px 0 8px">Approve <b>${esc(p.pc_name || 'this PC')}</b>?</h3>
          <p class="small">It will send Tally purchase data to <b>your firm</b> in Firm OS. It can only read from Tally, never change it.</p>
          <p class="small muted" style="margin:6px 0">Code shown on that PC. It must match:</p>
          <div class="mono" style="font-size:26px;letter-spacing:.12em;margin:2px 0 10px" aria-label="Pairing code">${esc(p.user_code)}</div>
          <p class="small muted">Tally companies it can see: ${p.companies.length ? p.companies.map(esc).join(', ') : 'none yet (Tally was closed)'}${p.agent_version ? ' · agent v' + esc(p.agent_version) : ''}</p>
          <p class="small" style="color:var(--warn);margin:8px 0 14px">Only approve if you started the agent on that PC just now and the code matches. If you did not, choose “Not me”.</p>
          <div class="flex" style="gap:8px"><button class="btn primary" id="pair-yes">Approve this PC</button><button class="btn ghost" id="pair-no">Not me</button></div></div>`;
        $('#pair-yes', pairBox).onclick = async () => {
          try { await TALLY_API.pairApprove(code); toast('Connected. The PC starts syncing in a few seconds.', 'ok', 'plug'); }
          catch (e) { toast(esc(e.message), 'warn', 'lock'); }
          // The PC collects its key within a few seconds: refresh quickly for a while. (navTo re-renders this page,
          // so the setting lives at module level where the new page instance reads it.)
          TALLY_FAST_UNTIL = Date.now() + 25000;
          pairBox.innerHTML = ''; navTo('#/tally');
        };
        $('#pair-no', pairBox).onclick = async () => {
          try { await TALLY_API.pairDeny(code); toast('Request declined', 'ok', 'lock'); } catch (e) { toast(esc(e.message), 'warn', 'lock'); }
          pairBox.innerHTML = ''; navTo('#/tally');
        };
      } catch (e) {
        pairBox.innerHTML = `<div class="card pad mb16" style="max-width:720px"><b>${e.status === 403 ? 'Managers and partners only' : 'This connection request is no longer available'}</b>
          <p class="small muted">${esc(e.status === 403 ? 'Ask a manager or partner to approve the PC.' : e.status === 404 ? 'The code has expired or was already used. Start the agent on the PC again to get a new one.' : e.message)}</p></div>`;
      }
    };

    const load = async () => {
      let agents, companies, clients;
      try {
        [agents, companies, clients] = await Promise.all([TALLY_API.agents(), TALLY_API.companies(), TALLY_API.clients()]);
      } catch (e) {
        root.innerHTML = `<div class="card pad" style="max-width:640px"><b>${e.status === 403 ? 'Managers and partners only' : 'Could not load Tally sync'}</b><p class="small muted">${esc(e.status === 403 ? 'Your role cannot manage Tally agents. Ask a manager or partner.' : e.message)}</p></div>`;
        return;
      }
      draw(agents, companies, clients);
    };

    /* A new firm has no clients, so a Tally company has nothing to link to. This creates the client (name taken from
       Tally) and links the company to it in one step. The PAN is worked out from the GSTIN when one is given. */
    const createClientFor = (companyId, companyName) => openModal({
      html: `<div class="modal-b"><h2>Create a client for this Tally company</h2>
        <p class="dim small">Adds the client to Firm OS and links “${esc(companyName)}” to it, so its purchases sync into this client's books.</p>
        <div style="display:grid;gap:10px;margin-top:12px">
          <label class="small muted">Client name<input class="input" id="cc-name" maxlength="200" value="${esc(companyName)}" style="width:100%"></label>
          <label class="small muted">GSTIN (optional)<input class="input mono" id="cc-gstin" maxlength="15" placeholder="27AABCS1429B1ZU" style="width:100%"></label>
          <label class="small muted">PAN<input class="input mono" id="cc-pan" maxlength="10" placeholder="AABCS1429B" style="width:100%"></label>
          <label class="small muted">Type<select class="input" id="cc-type" style="width:100%">${['Private Limited', 'LLP', 'Partnership', 'Individual', 'HUF', 'Trust'].map(t => `<option>${t}</option>`).join('')}</select></label>
          <div id="cc-err" class="small" style="color:var(--bad)" role="alert"></div>
        </div>
        <div class="flex" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-ok>Create and link</button></div></div>`,
      onMount: m => {
        const gstin = $('#cc-gstin', m), pan = $('#cc-pan', m), err = $('#cc-err', m), ok = $('[data-ok]', m);
        $('#cc-name', m).focus();
        gstin.oninput = () => { gstin.value = gstin.value.toUpperCase(); if (/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.value)) pan.value = gstin.value.slice(2, 12); };
        pan.oninput = () => { pan.value = pan.value.toUpperCase(); };
        $('[data-x]', m).onclick = () => closeModal();
        ok.onclick = async () => {
          const name = $('#cc-name', m).value.trim(), g = gstin.value.trim(), p = pan.value.trim(), type = $('#cc-type', m).value;
          err.textContent = '';
          if (name.length < 2) { err.textContent = 'Enter the client name.'; return; }
          if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p)) { err.textContent = 'PAN must look like AABCS1429B (5 letters, 4 digits, 1 letter).'; return; }
          if (g && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) { err.textContent = 'That GSTIN is not in the right format (15 characters).'; return; }
          if (g && g.slice(2, 12) !== p) { err.textContent = 'The PAN must match characters 3 to 12 of the GSTIN.'; return; }
          ok.disabled = true; ok.textContent = 'Creating…';
          let client;
          try { client = await TALLY_API.createClient({ name, pan: p, gstin: g || null, type }); }
          catch (e) { err.textContent = e.message; ok.disabled = false; ok.textContent = 'Create and link'; return; }
          try { await TALLY_API.link(companyId, client.id); toast('Client created and company linked. Its purchases arrive with the next sync.', 'ok', 'plug'); }
          catch (e) { toast('Client created, but linking failed: ' + esc(e.message) + '. Choose it in the dropdown.', 'warn', 'lock'); }
          closeModal(); load();
        };
      }
    });

    const draw = (agents, companies, clients) => {
      root.innerHTML = `
      <div class="grid g-main">
        <div class="grid" style="gap:16px;align-content:start">
          <div class="card"><div class="card-h"><h3>Tally companies<small>Appear here by themselves once a connected PC has Tally open</small></h3></div>
            ${companies.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Tally company</th><th>Linked client</th><th>Last sync</th><th class="r">Vouchers</th><th></th></tr></thead><tbody>
              ${companies.map(c => `<tr><td><b>${esc(c.company_name)}</b><div class="small muted">via ${esc(c.agent_name)}</div></td>
                <td><select class="input" data-link="${esc(c.id)}" aria-label="Client for ${esc(c.company_name)}"><option value="">— not linked —</option>${clients.map(k => `<option value="${esc(k.id)}" ${k.id === c.client_id ? 'selected' : ''}>${esc(k.name)}${k.gstin ? ' · ' + esc(k.gstin) : ''}</option>`).join('')}</select>
                  ${c.link_method === 'auto' ? '<div class="small muted">Linked automatically: its name matches this client exactly. Check it is right.</div>' : ''}</td>
                <td class="small">${c.last_synced_at ? esc(tallyAgo(c.last_synced_at)) + `<div class="muted">${esc(c.last_period_from || '')} to ${esc(c.last_period_to || '')}</div>` : '—'}</td>
                <td class="r num">${c.last_voucher_count ?? '—'}</td>
                <td>${c.last_error ? `<span class="chip bad" title="${esc(c.last_error)}">Problem</span>` : c.linked ? (c.last_synced_at ? '<span class="chip ok">Synced</span>' : '<span class="chip outline">Waiting for first sync</span>') : '<span class="chip gate">Pick a client</span>'}
                  ${c.linked ? `<div class="flex" style="gap:6px;margin-top:6px"><button class="btn xs primary" data-open="${esc(c.id)}">Open register</button><button class="btn xs" data-sync="${esc(c.id)}" ${c.sync_pending ? 'disabled' : ''}>${c.sync_pending ? 'Requested…' : 'Sync now'}</button></div>`
                    : `<div style="margin-top:6px"><button class="btn xs primary" data-create="${esc(c.id)}" data-name="${esc(c.company_name)}">Create client</button></div>`}</td></tr>
                ${c.last_error ? `<tr><td colspan="5" class="small" style="color:var(--bad)">${esc(c.last_error)}</td></tr>` : ''}`).join('')}
            </tbody></table></div>` : `<div class="card-b"><p class="muted">No Tally company has reported in yet. Start the agent on the PC where Tally runs and approve it when it asks.</p></div>`}
          </div>
        </div>
        <div class="grid" style="gap:16px;align-content:start">
          <div class="card"><div class="card-h"><h3>Connected PCs</h3></div>
            ${agents.length ? `<div class="list">${agents.map(a => `<div class="row"><div class="grow"><div class="t1">${esc(a.name)} ${a.revoked ? '<span class="chip bad">Disconnected</span>' : ''}</div>
              <div class="t2">last contact ${esc(tallyAgo(a.last_seen_at))}${a.agent_version ? ' · v' + esc(a.agent_version) : ''}</div></div>
              ${a.revoked ? '' : `<button class="btn xs" data-revoke="${esc(a.id)}" data-name="${esc(a.name)}">Disconnect</button>`}</div>`).join('')}</div>`
              : `<div class="card-b"><p class="muted small">No PC is connected yet.</p></div>`}
          </div>
          <div class="card pad"><b>Connecting a PC</b>
            <ol class="small muted" style="padding-left:18px;margin:8px 0 0">
              <li>On the PC where Tally runs, start the Firm OS agent. It opens this page with a code.</li>
              <li>Check the code matches, then click <b>Approve</b>.</li>
              <li>That is all. The PC syncs now and keeps syncing every hour, and starts again when Windows starts.</li>
            </ol>
            <p class="small muted mt8">In Tally, the HTTP server must be on (F1 Help, Settings, Connectivity: act as Both, port 9000).</p>
            <div class="flex mt8" style="gap:6px"><input class="input mono" id="tally-code" maxlength="9" placeholder="ABCD-2345" style="width:130px" aria-label="Pairing code from a PC"><button class="btn xs" id="tally-code-go">Enter a code</button></div>
            <details class="mt8"><summary class="small muted">Advanced: issue a key by hand</summary>
              <p class="small muted">For a PC that cannot open a browser. Copy the key into <span class="mono">firmos-tally-agent setup</span>.</p><button class="btn xs" id="tally-new">${icon('plus')} Issue key</button></details>
          </div>
        </div>
      </div>`;

      $$('[data-link]', root).forEach(sel => sel.onchange = async () => {
        try {
          await TALLY_API.link(sel.dataset.link, sel.value || null);
          toast(sel.value ? 'Company linked. Its register is sent on the next sync.' : 'Company unlinked', 'ok', 'plug');
        } catch (e) { toast(esc(e.message), 'warn', 'lock'); }
        load();
      });
      $$('[data-create]', root).forEach(b => b.onclick = () => createClientFor(b.dataset.create, b.dataset.name));
      $$('[data-open]', root).forEach(b => b.onclick = () => navTo('#/tallybooks/' + b.dataset.open));
      $$('[data-sync]', root).forEach(b => b.onclick = async () => {
        try { const r = await TALLY_API.syncNow(b.dataset.sync); toast(esc(r.message), 'ok', 'plug'); }
        catch (e) { toast(esc(e.message), 'warn', 'lock'); }
        TALLY_FAST_UNTIL = Date.now() + 75000;   // the PC picks the request up within a minute; watch for it
        load();
      });
      $('#tally-code-go', root).onclick = () => { const v = $('#tally-code', root).value.trim(); if (v) navTo('#/tally/' + encodeURIComponent(v.toUpperCase())); };
      $('#tally-new', root).onclick = () => openModal({
        html: `<div class="modal-b"><h2>Issue an agent key</h2><p class="dim small">Name the PC it will run on, so you can tell keys apart and disconnect the right one later.</p>
          <input class="input" id="tally-name" maxlength="120" placeholder="e.g. Reception PC" style="width:100%;margin-top:12px" aria-label="PC name">
          <div class="flex" style="justify-content:flex-end;margin-top:18px"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-ok>Issue key</button></div></div>`,
        onMount: m => {
          const inp = $('#tally-name', m); inp.focus();
          $('[data-x]', m).onclick = () => closeModal();
          $('[data-ok]', m).onclick = async () => {
            const name = inp.value.trim(); if (!name) { inp.focus(); return; }
            try {
              const k = await TALLY_API.create(name);
              closeModal(true);
              openModal({
                html: `<div class="modal-b"><h2>Copy this key now</h2><p class="dim small">It is shown once and cannot be recovered. If it is lost, disconnect it and issue a new one.</p>
                  <input class="input mono" id="tally-key" readonly value="${esc(k.key)}" style="width:100%;margin-top:12px" aria-label="Agent key">
                  <div class="flex" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="tally-copy">Copy</button><button class="btn primary" data-ok>I have copied it</button></div></div>`,
                onMount: m2 => {
                  $('#tally-key', m2).select();
                  $('#tally-copy', m2).onclick = () => { navigator.clipboard && navigator.clipboard.writeText(k.key).then(() => toast('Key copied', 'ok'), () => toast('Select the key and copy it by hand', 'warn')); };
                  $('[data-ok]', m2).onclick = () => { closeModal(); load(); };
                }
              });
            } catch (e) { toast(esc(e.message), 'warn', 'lock'); }
          };
        }
      });
      $$('[data-revoke]', root).forEach(b => b.onclick = () => confirmModal('Disconnect this PC?',
        `“${esc(b.dataset.name)}” stops syncing immediately. Data already sent stays in Firm OS. To reconnect it, start the agent on that PC again and approve it.`, 'Disconnect',
        async () => { try { await TALLY_API.revoke(b.dataset.revoke); toast('PC disconnected', 'ok', 'lock'); } catch (e) { toast(esc(e.message), 'warn', 'lock'); } load(); }, 'danger'));
    };

    showPairing();
    load();
    // Keep the page live: a newly approved PC, its companies and sync results appear without a reload. Every 3 seconds
    // while something is expected (just approved, or a sync was requested), otherwise every 10. Skipped while a dropdown or dialog is in use.
    let lastLoad = Date.now();
    const timer = setInterval(() => {
      if (!root.isConnected) return clearInterval(timer);
      const every = TALLY_FAST_UNTIL > Date.now() ? 3000 : 10000;
      const busy = (document.activeElement && document.activeElement.tagName === 'SELECT' && root.contains(document.activeElement)) || document.querySelector('.modal.show');
      if (!busy && Date.now() - lastLoad >= every - 200) { lastLoad = Date.now(); load(); }
    }, 1000);
  }
};
