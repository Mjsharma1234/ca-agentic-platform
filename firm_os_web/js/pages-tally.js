/* ============ TALLY SYNC ============
   Manage the Tally desktop agent: issue/revoke agent keys and link each Tally company to a client.
   Talks to /api/v1/tally-agent/* (managers and partners only; the server enforces it).
   The agent itself runs on the client's PC (tally-agent/) and pushes the purchase register to the server. */

const TALLY_API = {
  agents: () => API_CLIENT._get('/tally-agent/agents'),
  companies: () => API_CLIENT._get('/tally-agent/companies'),
  clients: () => API_CLIENT._get('/clients/'),
  create: name => API_CLIENT._send('POST', '/tally-agent/agents', { name }),
  revoke: id => API_CLIENT._send('DELETE', `/tally-agent/agents/${id}`),
  link: (id, client_id) => API_CLIENT._send('PUT', `/tally-agent/companies/${id}/link`, { client_id })
};

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
      'A small program on the client’s PC reads the purchase register from Tally and sends it here, where it feeds GSTR-2B reconciliation. Issue a key for each PC, then link each Tally company to the client it belongs to.') +
      '<div id="tally-root"><div class="card pad"><p class="muted">Loading…</p></div></div>';
  },
  mount(el) {
    const root = $('#tally-root', el);
    if (typeof API_CLIENT === 'undefined' || !API_CLIENT.connected) {
      root.innerHTML = `<div class="card pad" style="max-width:640px"><b>Sign in to the server to use Tally sync</b><p class="small muted">This page manages keys and links stored on the server, so it is not available in the offline demo.</p></div>`;
      return;
    }
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

    const draw = (agents, companies, clients) => {
      const live = agents.filter(a => !a.revoked);
      root.innerHTML = `
      <div class="grid g-main">
        <div class="grid" style="gap:16px;align-content:start">
          <div class="card"><div class="card-h"><h3>Tally companies<small>Appear here the first time an agent sees them in Tally</small></h3></div>
            ${companies.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Tally company</th><th>Linked client</th><th>Last sync</th><th class="r">Vouchers</th><th></th></tr></thead><tbody>
              ${companies.map(c => `<tr><td><b>${esc(c.company_name)}</b><div class="small muted">via ${esc(c.agent_name)}</div></td>
                <td><select class="input" data-link="${esc(c.id)}" aria-label="Client for ${esc(c.company_name)}"><option value="">— not linked —</option>${clients.map(k => `<option value="${esc(k.id)}" ${k.id === c.client_id ? 'selected' : ''}>${esc(k.name)}${k.gstin ? ' · ' + esc(k.gstin) : ''}</option>`).join('')}</select></td>
                <td class="small">${c.last_synced_at ? esc(tallyAgo(c.last_synced_at)) + `<div class="muted">${esc(c.last_period_from || '')} to ${esc(c.last_period_to || '')}</div>` : '—'}</td>
                <td class="r num">${c.last_voucher_count ?? '—'}</td>
                <td>${c.last_error ? `<span class="chip bad" title="${esc(c.last_error)}">Problem</span>` : c.linked ? (c.last_synced_at ? '<span class="chip ok">Synced</span>' : '<span class="chip outline">Waiting for first sync</span>') : '<span class="chip gate">Needs a client</span>'}</td></tr>
                ${c.last_error ? `<tr><td colspan="5" class="small" style="color:var(--bad)">${esc(c.last_error)}</td></tr>` : ''}`).join('')}
            </tbody></table></div>` : `<div class="card-b"><p class="muted">No Tally company has reported in yet. Install the agent on the PC where Tally runs, then run <span class="mono">firmos-tally-agent check</span>.</p></div>`}
          </div>
        </div>
        <div class="grid" style="gap:16px;align-content:start">
          <div class="card"><div class="card-h"><h3>Agent keys<small>One per PC</small></h3><div class="right"><button class="btn sm primary" id="tally-new">${icon('plus')} Issue key</button></div></div>
            ${agents.length ? `<div class="list">${agents.map(a => `<div class="row"><div class="grow"><div class="t1">${esc(a.name)} ${a.revoked ? '<span class="chip bad">Revoked</span>' : ''}</div>
              <div class="t2"><span class="mono">${esc(a.key_prefix)}…</span> · last contact ${esc(tallyAgo(a.last_seen_at))}${a.agent_version ? ' · v' + esc(a.agent_version) : ''}</div></div>
              ${a.revoked ? '' : `<button class="btn xs" data-revoke="${esc(a.id)}" data-name="${esc(a.name)}">Revoke</button>`}</div>`).join('')}</div>`
              : `<div class="card-b"><p class="muted small">No keys yet. Issue one for each PC that runs Tally.</p></div>`}
          </div>
          <div class="card pad"><b>Setting up a PC</b>
            <ol class="small muted" style="padding-left:18px;margin:8px 0 0">
              <li>Issue a key here and copy it.</li>
              <li>In Tally: F1 Help, Settings, Connectivity: act as Both, port 9000. Open the company.</li>
              <li>On the PC run <span class="mono">firmos-tally-agent setup</span>, then <span class="mono">check</span>.</li>
              <li>Link the company to its client in the table.</li>
            </ol>${live.length ? '' : '<p class="small muted mt8">No active key yet.</p>'}</div>
        </div>
      </div>`;

      $$('[data-link]', root).forEach(sel => sel.onchange = async () => {
        try {
          await TALLY_API.link(sel.dataset.link, sel.value || null);
          toast(sel.value ? 'Company linked. The agent sends its register on the next sync.' : 'Company unlinked', 'ok', 'plug');
        } catch (e) { toast(esc(e.message), 'warn', 'lock'); }
        load();
      });
      $('#tally-new', root).onclick = () => openModal({
        html: `<div class="modal-b"><h2>Issue an agent key</h2><p class="dim small">Name the PC it will run on, so you can tell keys apart and revoke the right one later.</p>
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
                html: `<div class="modal-b"><h2>Copy this key now</h2><p class="dim small">It is shown once and cannot be recovered. If it is lost, revoke it and issue a new one.</p>
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
      $$('[data-revoke]', root).forEach(b => b.onclick = () => confirmModal('Revoke this key?',
        `The agent “${esc(b.dataset.name)}” stops syncing immediately. Data already sent stays in Firm OS. This cannot be undone; issue a new key to reconnect.`, 'Revoke key',
        async () => { try { await TALLY_API.revoke(b.dataset.revoke); toast('Key revoked', 'ok', 'lock'); } catch (e) { toast(esc(e.message), 'warn', 'lock'); } load(); }, 'danger'));
    };
    load();
  }
};
