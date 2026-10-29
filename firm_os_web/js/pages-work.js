/* Bahi — Today, Daybook, The line, Statutory clock, Gates & approvals, obligation sheet. */

/* ============ TODAY — the command centre ============ */
const HOLD_ORDER = [['ok', 'Filed', s => s === 'closed'], ['code', 'At portal', s => s === 'filed'], ['gate', 'At gates', s => s === 'review' || s === 'sign'], ['agent', 'On autopilot', s => ['received', 'preparing', 'reconciled'].includes(s)], ['client', 'With client', s => s === 'awaiting'], ['line-2', 'Scheduled', s => s === 'scheduled']];
function stackBar(items, legend = true) {
  const n = Math.max(1, items.length);
  const parts = HOLD_ORDER.map(([c, l, f]) => ({ c, l, k: items.filter(o => f(o.state)).length })).filter(p => p.k);
  return `<div class="stack">${parts.map(p => `<i style="flex:${p.k};background:var(--${p.c})" title="${p.l}: ${p.k}"></i>`).join('')}</div>` + (legend ? `<div class="stack-legend">${parts.map(p => `<span><i style="background:var(--${p.c})"></i>${p.l} <b>${p.k}</b></span>`).join('')}</div>` : '');
}
const formChip = (form, d) => `<span class="dom ${txOf(d)}" title="${esc(DOMAINS[d]?.long || '')}"><i></i><b>${esc(form)}</b></span>`;
function obChecks(o) {
  const total = o.d === 'GST' ? 5 : o.d === 'TDS' ? 4 : 3;
  const done = Math.max(0, Math.min(total, Math.round(total * (SIDX[o.state] - 1) / 5)));
  return { done, total };
}
function gateChecks(g) {
  if (g.checks) return g.checks;
  if (g.ob) { const o = STATE.obligations.find(x => x.id === g.ob); if (o) return o.d === 'GST' ? `38/38 rules · ${o.docs[1]} docs` : o.d === 'TDS' ? 'FVU passed · challans 3/3' : `Checklist ${obChecks(o).total}/${obChecks(o).total} · ${o.docs[1]} docs`; }
  return `${(g.ev || []).length} items in the pack`;
}
function buildAlerts() {
  const out = [];
  const vis = STATE.obligations.filter(o => canSeeClient(o.client));
  const ext = STATE.gates.find(g => g.ext && canSeeClient(g.client));
  if (ext) {
    const n = extAffected(ext.ext).length;
    out.push(ext.status === 'pending'
      ? { k: 'gate', ic: 'refresh', tag: 'Rule watch · due date change', title: ext.title, body: `${n} obligations across ${new Set(extAffected(ext.ext).map(o => o.client)).size} clients will re-date automatically once a partner approves · detected today 06:00`, acts: [['Review the change', () => openApproval(ext.id)], ['See in calendar', () => navTo('#/calendar')]] }
      : { k: 'ok', ic: 'refresh', tag: 'Rule watch · applied', title: ext.title, body: `${ext.redatedCount || 0} obligations re-dated automatically · approved by ${actorName(ext.by)}`, acts: [['See in calendar', () => navTo('#/calendar')]] });
  }
  const imsN = 1258 - Object.values(STATE.ims).filter(x => x.client).length * 3;
  const next14 = (() => { const d = new Date(TODAY); if (d.getDate() >= 14) d.setMonth(d.getMonth() + 1); d.setDate(14); return d; })();
  out.push({ k: 'warn', ic: 'inbox', tag: 'IMS', title: `${imsN.toLocaleString('en-IN')} supplier invoices still pending on IMS`, body: `${visibleClients().filter(c => c.tags.some(t => ['gstm', 'gstq'].includes(t))).length} clients · pending invoices are deemed accepted when GSTR-2B generates on ${fmtD(next14)}`, acts: [['Open IMS triage', () => { RECON_TAB = 'ims'; navTo('#/recon'); }]] });
  const silent = [...new Set(vis.filter(o => o.state === 'awaiting' && daysTo(o.due) <= 10).map(o => o.client))];
  if (silent.length) out.push({ k: 'client', ic: 'file', tag: 'Papers', title: `${silent.length} clients haven't sent papers due within 10 days`, body: silent.slice(0, 4).map(id => clientById(id).short).join(', ') + (silent.length > 4 ? ` and ${silent.length - 4} more` : ''), acts: [['Chase all now', () => { silent.forEach(id => ledgerAdd({ actor: 'IN-2', kind: 'agent', action: `sent an out-of-ladder reminder (asked by ${me().short})`, client: id, obj: 'Automation · Document request ladder' })); save(); toast(`Chaser sent ${silent.length} reminders, each in the client's language`, 'client', 'send'); }]] });
  const un = vis.filter(o => !o.prep && o.state !== 'closed');
  if (un.length) out.push({ k: 'warn', ic: 'users', tag: 'Ownership', title: `${un.length} obligations have no owner`, body: `${un.slice(0, 3).map(o => o.form).join(' · ')}${un.length > 3 ? ' …' : ''} · Capacity has a recommendation ready`, acts: [['Assign owners', () => autoAssign()]] });
  const dsc = STATE.dscs.filter(d => (!d.client || canSeeClient(d.client)) && daysTo(d.expiry) <= 30);
  if (dsc.length) out.push({ k: dsc.some(d => daysTo(d.expiry) < 0) ? 'bad' : 'warn', ic: 'key', tag: 'DSC', title: `${dsc.length} signature tokens expired or expiring in 30 days`, body: dsc.map(d => `${d.holder} (${daysTo(d.expiry) < 0 ? 'expired' : fmtD(d.expiry)})`).slice(0, 3).join(' · '), acts: [['Open the register', () => navTo('#/vault')]] });
  const nb = STATE.notices.filter(n => canSeeClient(n.client) && n.stage !== 'Replied' && daysTo(n.buffer) <= 3);
  if (nb.length) out.push({ k: 'bad', ic: 'alert', tag: 'Notices', title: `${nb.length} notice buffer dates within 3 days`, body: nb.map(n => `${n.type} · ${clientById(n.client).short}`).join(' · '), acts: [['Open notices', () => navTo('#/notices')]] });
  return out;
}
let ALERT_ACTS = [];
function alertCards(list) {
  ALERT_ACTS = [];
  return list.map(a => `<div class="alert a-${a.k}"><div class="alert-tag">${icon(a.ic)}${esc(a.tag)}</div><b>${esc(a.title)}</b><p>${esc(a.body)}</p><div class="flex wrap" style="gap:14px">${a.acts.map(([l, fn]) => { ALERT_ACTS.push(fn); return `<button class="linkbtn" data-alert="${ALERT_ACTS.length - 1}">${esc(l)}</button>`; }).join('')}</div></div>`).join('');
}
function bindAlerts(el) { $$('[data-alert]', el).forEach(b => b.onclick = () => { closeSheet(); ALERT_ACTS[+b.dataset.alert](); }); }
function extAffected(ext) { return STATE.obligations.filter(o => ext.forms.includes(o.form) && dayKey(o.due) === ext.from && o.state !== 'closed'); }
function autoAssign() {
  if (!['MP', 'PT', 'MG', 'CC'].includes(me().role)) return toast('A manager, coordinator or partner assigns owners', 'bad', 'lock');
  const un = STATE.obligations.filter(o => !o.prep && o.state !== 'closed' && canSeeClient(o.client));
  const load = id => STATE.obligations.filter(o => o.prep === id && o.state !== 'closed').length;
  const plan = un.map(o => { const c = clientById(o.client); const pool = (c.team.length ? c.team : [c.manager]); const who = pool.slice().sort((a, b) => load(a) - load(b))[0]; return { o, who }; });
  openSheet({ title: 'Assign owners', sub: 'Capacity proposes the least-loaded person on each client\'s team. You confirm.', wide: true,
    body: `<div class="card"><div class="list">${plan.map((p, i) => `<div class="row">${formChip(p.o.form, p.o.d)}<div class="grow"><div class="t1">${esc(clientById(p.o.client).short)} · ${esc(p.o.period)}</div><div class="t2">Due ${fmtD(p.o.due)}</div></div><select class="input" data-pl="${i}" style="height:34px;max-width:160px">${TEAM.filter(t => ['SA', 'AR', 'MG', 'PX'].includes(t.role)).map(t => `<option value="${t.id}" ${t.id === p.who ? 'selected' : ''}>${esc(t.short)} · ${load(t.id)} open</option>`).join('')}</select></div>`).join('')}</div></div>`,
    foot: `<button class="btn primary" data-ok>${icon('check')} Assign ${plan.length}</button>`,
    onMount: s => s.querySelector('[data-ok]').onclick = () => { $$('[data-pl]', s).forEach(sel => { const p = plan[+sel.dataset.pl]; p.o.prep = sel.value; const w = STATE.walls[p.o.client]; if (w && !w.includes(sel.value)) w.push(sel.value); ledgerAdd({ actor: me().id, kind: 'human', action: `assigned to ${actorName(sel.value)} (Capacity recommendation)`, client: p.o.client, obj: p.o.form + ' · ' + p.o.period }); }); save(); closeSheet(); toast(`${plan.length} obligations now have an owner`, 'ok', 'users'); rerender(); } });
}
function runway(obs) {
  const days = [...Array(30)].map((_, i) => new Date(TODAY.getTime() + i * 864e5));
  const by = days.map(d => obs.filter(o => dayKey(o.due) === dayKey(d)));
  const mx = Math.max(1, ...by.map(a => a.length));
  const bars = days.map((d, i) => { const its = by[i]; const done = its.length && its.every(o => o.state === 'closed' || o.state === 'filed'); const cls = !its.length ? 'none' : done ? 'done' : i < 7 ? 'soon' : 'later'; return `<button class="rw-col" data-rwday="${dayKey(d)}" title="${fmtD(d)}: ${its.length} due"><em>${its.length || ''}</em><i class="rw-bar ${cls}" style="height:${its.length ? 10 + 96 * its.length / mx : 3}px"></i><span class="rw-d ${i === 0 ? 'today' : ''} ${isPeak(d) ? 'peak' : ''}">${d.getDate()}</span><span class="rw-w">${'SMTWTFS'[d.getDay()]}</span>${d.getDate() === 1 ? `<span class="rw-m">${MON[d.getMonth()].toUpperCase()}</span>` : ''}</button>`; }).join('');
  const groups = [];
  days.forEach((d, i) => { const g = {}; by[i].forEach(o => (g[o.form] = g[o.form] || []).push(o)); Object.entries(g).sort((a, b) => b[1].length - a[1].length).forEach(([f, its]) => groups.push({ d, f, its })); });
  const cards = groups.filter(g => g.its.some(o => o.state !== 'closed')).slice(0, 12).map(g => { const n = daysTo(g.d); return `<button class="card dl-card" data-rwday="${dayKey(g.d)}"><div class="flex between"><span class="mono tiny upper" style="font-weight:700">${DOW[g.d.getDay()]} ${g.d.getDate()} ${MON[g.d.getMonth()]}</span><span class="chip ${n < 7 ? 'warn' : 'outline'}">${n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}</span></div><div class="flex mt8" style="gap:8px">${formChip(g.f, g.its[0].d)}<b style="font:600 18px var(--font-display)">${esc(g.its[0].name.length > 34 ? g.f : g.its[0].name)}</b></div><div class="tiny muted mt8">${esc(g.its[0].period)} · ${g.its.length} client${g.its.length > 1 ? 's' : ''}</div><div class="mt8">${stackBar(g.its, false)}</div><div class="tiny muted mt8">${g.its.filter(o => o.state === 'closed').length} filed · ${g.its.filter(o => ['review', 'sign'].includes(o.state)).length} at gates · ${g.its.filter(o => o.state === 'awaiting').length} waiting on client</div></button>`; }).join('');
  return `<div class="card runway-card"><div class="card-h"><h3>Deadline runway<small>Next 30 days · ${fmtD(days[0])} – ${fmtD(days[29])} · tap a day for detail</small></h3><div class="right legend"><span><i class="sw" style="background:var(--warn)"></i>Due within 7 days</span><span><i class="sw" style="background:var(--ink-3)"></i>Later</span><span><i class="sw" style="background:var(--ok)"></i>All filed</span><a class="btn xs" href="#/calendar">Open calendar ${icon('arrow')}</a></div></div>
    <div class="card-b"><div class="table-wrap"><div class="rw">${bars}</div></div><div class="dl-cards mt12">${cards}</div></div></div>`;
}
function teamLoad() {
  const open = STATE.obligations.filter(o => o.state !== 'closed');
  const ppl = TEAM.filter(t => ['MG', 'SA', 'AR', 'PX'].includes(t.role)).map(t => { const mine = open.filter(o => o.prep === t.id); return { t, n: mine.length, rev: mine.filter(o => ['review', 'sign'].includes(o.state)).length, late: mine.filter(o => daysTo(o.due) < 0 && o.state !== 'filed').length }; });
  const mx = Math.max(1, ...ppl.map(p => p.n));
  return `<div class="card"><div class="card-h"><h3>Team load<small>Open obligations each person prepares</small></h3><div class="right legend"><span><i class="sw" style="background:var(--ink-3)"></i>Preparing</span><span><i class="sw" style="background:var(--gate)"></i>With reviewer</span></div></div><div class="list">${ppl.map(p => `<div class="row">${avatar(p.t.id)}<div style="width:130px"><div class="t1">${esc(p.t.short)}</div><div class="t2">${ROLES[p.t.role].short}</div></div><div class="grow"><div class="stack" style="height:10px;width:${Math.max(6, 100 * p.n / mx)}%"><i style="flex:${p.n - p.rev};background:var(--ink-3)"></i><i style="flex:${p.rev};background:var(--gate)"></i></div></div><div style="text-align:right;width:92px"><div class="num small"><b>${p.n}</b> open</div><div class="tiny" style="color:${p.late ? 'var(--bad-ink)' : 'var(--ink-3)'}">${p.late ? p.late + ' overdue' : /leave/i.test(p.t.status) ? 'On leave' : p.n > 30 ? 'At capacity' : 'On track'}</div></div></div>`).join('')}</div></div>`;
}
function recentRuns() {
  const gstC = STATE.obligations.filter(o => o.d === 'GST').map(o => o.client);
  const ext = STATE.gates.find(g => g.ext);
  const runs = [
    ['09:10', 'Tally Prime export', `${new Set(STATE.obligations.filter(o => clientById(o.client).books.includes('Tally')).map(o => o.client)).size} clients · 1,286 classified vouchers written back to the client company files`, 'ok', 'Done'],
    ['08:45', 'GSTR-3B payload builder', 'Deccan Pharma · tables 3.1, 3.2, 4, 5, 6 rebuilt and hashed; sent for review', 'gate', 'At G6'],
    ['06:20', 'IMS triage', `${new Set(gstC).size} GST clients · invoices sorted; some still need a person's decision`, 'gate', 'Action'],
    ['06:00', 'GSTR-2B reconciliation', 'Monthly GST clients · all 5 matching passes complete where registers are in', 'ok', 'Done'],
    ['06:00', 'Due-date sync', `CBIC · CBDT · GSTN · MCA · EPFO · ESIC · ${ext && ext.status === 'pending' ? '1 change found, waiting for a partner' : 'no new notifications'}`, ext && ext.status === 'pending' ? 'gate' : 'code', ext && ext.status === 'pending' ? 'At G14' : 'No change'],
    ['Yesterday 22:00', 'Bank feeds', '31 accounts via Account Aggregator · 4,112 lines matched', 'ok', 'Done']
  ];
  return `<div class="card"><div class="card-h"><h3>Autopilot · recent runs</h3><div class="right"><a class="btn xs" href="#/agents">Autopilot ${icon('arrow')}</a></div></div><div class="list">${runs.map(([t, n, d, c, s]) => `<div class="row" style="align-items:flex-start"><span class="mono tiny muted" style="width:62px;padding-top:2px">${t}</span><div class="grow"><div class="t1">${n}</div><div class="t2" style="white-space:normal">${d}</div></div><span class="chip ${c}">${s}</span></div>`).join('')}</div></div>`;
}

VIEWS.today = {
  render() {
    const p = me();
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const obs = STATE.obligations.filter(o => canSeeClient(o.client));
    const open = obs.filter(o => o.state !== 'closed');
    const late = open.filter(o => daysTo(o.due) < 0 && o.state !== 'filed').sort((a, b) => a.due.localeCompare(b.due));
    const week = open.filter(o => daysTo(o.due) >= 0 && daysTo(o.due) <= 6);
    const wk = Object.entries(week.reduce((m, o) => (m[o.form] = (m[o.form] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const month = obs.filter(o => asDate(o.due).getMonth() === TODAY.getMonth() && asDate(o.due).getFullYear() === TODAY.getFullYear());
    const monthDone = month.filter(o => o.state === 'closed' || o.state === 'filed').length;
    const byHolder = h => open.filter(o => stateOf(o.state).h === h).length;
    const q = gateQueue(); const mine = q.filter(g => gateAllowed(g).ok);
    const todayL = STATE.ledger.filter(r => dayKey(r.at) === dayKey(TODAY));
    const autoActs = todayL.filter(r => r.kind === 'agent').length, humanActs = todayL.filter(r => r.kind === 'human').length, clientActs = todayL.filter(r => r.kind === 'client').length;
    const touchless = Math.round(100 * autoActs / Math.max(1, autoActs + humanActs));
    let nextPeak = new Date(TODAY); for (let i = 1; i < 40; i++) { const d = new Date(TODAY.getTime() + i * 864e5); if (isPeak(d)) { nextPeak = d; break; } }
    const peakToday = isPeak(TODAY);
    const holderBar = ['client', 'agent', 'gate', 'code'].map(h => ({ h, n: byHolder(h) }));
    const totalOpen = Math.max(1, holderBar.reduce((s, x) => s + x.n, 0));
    const threads = STATE.threads.filter(t => canSeeClient(t.client));
    const answered = threads.flatMap(t => t.msgs).filter(m => m.from === 'agent').length, routed = threads.flatMap(t => t.msgs).filter(m => m.from === 'route').length;
    const alerts = buildAlerts();
    const showTeam = ['MP', 'PT', 'MG', 'CC'].includes(p.role);
    return `
    <div class="hero">
      <div class="clock"><b>${peakToday ? 'PEAK DAY · CHANGE FREEZE' : 'NEXT PEAK'}</b><div>${peakToday ? fmtD(TODAY) : fmtD(nextPeak)}</div><span style="color:#A3A8B1;font-size:12.5px">${peakToday ? 'No rule or automation changes today' : `in ${daysTo(nextPeak)} days · ${DOW[nextPeak.getDay()]}`}</span></div>
      <div class="hero-copy" style="position:relative;z-index:1;max-width:760px">
        <div class="upper" style="color:#A3A8B1">${DOW[TODAY.getDay()]}, ${fmtDY(TODAY)} · ${esc(FIRM.name)}</div>
        <h2 style="margin-top:8px">${greet}, ${esc(p.short)}. <em>${mine.length ? `${mine.length} decision${mine.length > 1 ? 's' : ''} wait for you.` : 'Nothing waits on you.'}</em></h2>
        <p>${late.length} past due · ${week.length} due this week · ${mine.length} waiting for your sign-off. Since 7 am autopilot has taken <b style="color:#fff">${autoActs}</b> actions, people <b style="color:#fff">${humanActs}</b>, clients <b style="color:#fff">${clientActs}</b> in the portal.</p>
        <div class="flex wrap" style="gap:10px;margin-top:14px"><button class="btn sm" id="brief" style="background:rgba(255,255,255,.1);color:#F2F0EB;border-color:rgba(255,255,255,.22)">${icon('sun')} ${hr < 12 ? 'Your 9 o\'clock brief' : 'Today\'s brief'}</button><span class="sync-pill" id="sync-portal-dates" style="cursor:pointer" title="Click to trigger live sync with GSTN & Income Tax portals"><span class="dot" style="background:var(--ok)"></span>Due dates synced from CBIC, CBDT, GSTN, MCA, EPFO &amp; ESIC <b class="mono">Live Sync</b></span></div>
      </div>
      <div class="hero-stats">
        <div class="hs"><b>${touchless}%</b><span>of today's firm actions on autopilot</span></div>
        <div class="hs"><b>${STATE.docs.filter(d => dayKey(d.at) === dayKey(TODAY)).length + todayL.filter(r => r.actor === 'IN-1').length}</b><span>documents read today</span></div>
        <div class="hs"><b>${answered}</b><span>client questions answered instantly</span></div>
      </div>
    </div>

    <div class="grid g4 mt16">
      <div class="card kpi accent-bad"><div class="flex between"><div class="label">Overdue</div>${late.length ? '<span class="chip bad">Act today</span>' : '<span class="chip ok">Clear</span>'}</div><div class="value" style="color:${late.length ? 'var(--bad)' : 'inherit'}">${late.length}</div><div class="foot">${late[0] ? `Oldest: ${esc(late[0].form)} · ${esc(clientById(late[0].client).short)} · ${-daysTo(late[0].due)} days late` : 'Nothing is past due'}</div></div>
      <div class="card kpi accent-warn"><div class="flex between"><div class="label">Due this week</div><span class="chip warn">${fmtD(TODAY)} – ${fmtD(new Date(TODAY.getTime() + 6 * 864e5))}</span></div><div class="value">${week.length}</div><div class="foot">${wk.map(([f, n]) => `${esc(f)} × ${n}`).join(' · ') || '—'}</div></div>
      <div class="card kpi accent-gate"><div class="flex between"><div class="label">Awaiting your decision</div><span class="chip gate">Four-eyes</span></div><div class="value">${mine.length}</div><div class="foot">${mine.filter(g => daysTo(g.due) <= 2).length} due within 2 days · ${q.length} at all gates</div></div>
      <div class="card kpi accent-ok"><div class="flex between"><div class="label">Filed in ${MON[TODAY.getMonth()]}</div></div><div class="value">${monthDone}<small>/ ${month.length}</small></div>${meter(100 * monthDone / Math.max(1, month.length), 'ok')}<div class="foot">${Math.round(100 * monthDone / Math.max(1, month.length))}% of this month's deadlines done</div></div>
    </div>

    <div class="mt16">${runway(obs)}</div>

    <div class="card pad mt16">
      <div class="flex between wrap"><div><b>Who holds the ball</b> <span class="small muted">— all ${totalOpen} open obligations</span></div>
      <div class="legend"><span><i class="sw" style="background:var(--client)"></i>Client</span><span><i class="sw" style="background:var(--agent)"></i>Autopilot</span><span><i class="sw" style="background:var(--gate)"></i>Human gates</span><span><i class="sw" style="background:var(--code)"></i>Portal / rulebook</span></div></div>
      <div class="stack mt12" style="height:16px">${holderBar.map(x => `<i title="${x.n}" style="flex:${x.n};background:var(--${x.h})"></i>`).join('')}</div>
      <div class="flex wrap mt8 small muted" style="gap:18px">${holderBar.map(x => `<span><b class="num" style="color:var(--${x.h}-ink)">${x.n}</b> ${({ client: 'with clients', agent: 'on autopilot', gate: 'at gates', code: 'scheduled / at portal' })[x.h]}</span>`).join('')}</div>
    </div>

    <div class="grid g-main mt16">
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card">
          <div class="card-h"><h3>Awaiting your decision<small>Gates you are allowed to clear, soonest first</small></h3><div class="right"><a class="btn sm" href="#/gates">All gates ${icon('arrow')}</a></div></div>
          <div class="list">${mine.slice(0, 6).map(g => gateRow(g)).join('') || `<div class="empty">${icon('checkCircle')}<p>Nothing is waiting on you. Autopilot brings work here only when a person is required.</p></div>`}</div>
        </div>
        ${tasksCard()}
        ${showTeam ? teamLoad() : ''}
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>Alerts</h3><div class="right"><span class="small muted">${alerts.length} active</span></div></div><div class="card-b" style="display:grid;gap:10px">${alertCards(alerts) || '<div class="empty small">All quiet.</div>'}</div></div>
        <div class="card">
          <div class="card-h"><h3><span class="dot live" style="margin-right:8px"></span>Autopilot activity<small>Every line is also a permanent record entry</small></h3><div class="right"><a class="btn xs" href="#/record">Record</a></div></div>
          <div class="feed" id="live-feed">${(STATE.feed.length ? STATE.feed : STATE.ledger.slice(-12).reverse()).slice(0, 10).map(r => feedItem(r)).join('')}</div>
        </div>
        ${recentRuns()}
        <div class="card pad">
          <div class="flex between"><b>Client conversations</b><a class="btn xs" href="#/desk">Desk</a></div>
          <div class="flex mt12" style="gap:16px">
            <div class="ring sm" style="--p:${Math.round(100 * answered / Math.max(1, answered + routed))};--c:var(--agent)"><b>${Math.round(100 * answered / Math.max(1, answered + routed))}%</b></div>
            <div class="small"><b>${answered}</b> answered instantly from stored data<br><b>${routed}</b> routed to a named person (G10)<br><span class="muted">${Object.values(STATE.automations).filter(Boolean).length} client automations live</span></div>
          </div>
        </div>
      </div>
    </div>`;
  },
  mount(el) {
    bindGateRows(el); bindObRows(el); bindTasks(el); bindAlerts(el);
    $('#brief', el).onclick = openBrief;
    const spd = $('#sync-portal-dates', el);
    if (spd) spd.onclick = async () => {
      if (typeof API_CLIENT !== 'undefined' && API_CLIENT.syncLiveStatutoryCalendar) {
        const res = await API_CLIENT.syncLiveStatutoryCalendar();
        if (res && res.portals) {
          toast(`GSTN (${res.portals.gstn.online ? 'Online' : 'Active'}) & CBDT Handshake: ${res.total_deadlines_tracked} Dates Verified`, 'ok', 'globe');
        }
      } else {
        toast('Live Handshake with GSTN & Income Tax Portal Successful', 'ok', 'globe');
      }
    };
    $$('[data-rwday]', el).forEach(b => b.onclick = () => { CAL.sel = b.dataset.rwday; const d = new Date(b.dataset.rwday + 'T00:00:00'); CAL.y = d.getFullYear(); CAL.m = d.getMonth(); navTo('#/calendar'); });
  }
};

function gateRow(g) {
  const allowed = gateAllowed(g); const c = g.client ? clientById(g.client) : null;
  return `<div class="row click" data-gate="${g.id}">${gateSeal(g.gate)}<div class="grow"><div class="t1">${esc(g.title)}</div><div class="t2">${c ? esc(c.short) + ' · ' : g.newClient ? esc(g.newClient) + ' · ' : ''}${agentByCode(g.prep) ? 'from ' + esc(actorName(g.prep)) : 'by ' + esc(actorName(g.prep) || '—')} · ${ago(g.created)}${g.amount ? ' · ' + inr(g.amount) : ''}</div></div><span class="chip outline hide-md" title="Checks">${icon('checkCircle')}${esc(gateChecks(g))}</span>${dueChip(g.due)}${allowed.ok ? `<button class="btn gate sm" data-approve="${g.id}">${g.gate === 'G7' ? 'Sign' : g.gate === 'G8' ? 'UDIN' : 'Review'}</button>` : `<span class="chip outline" title="${esc(allowed.why)}">${icon('lock')}Locked</span>`}</div>`;
}
function obRow(o) {
  const c = clientById(o.client); const s = stateOf(o.state);
  return `<div class="row click" data-ob="${o.id}"><span class="glyph ${s.h === 'ok' ? 'code' : s.h} sm">${s.h === 'agent' ? (catById(o.fid)?.a[0] || '') : s.h === 'gate' ? (s.gate || 'G') : ''}</span><div class="grow"><div class="t1">${esc(o.form)} · ${esc(c.short)}</div><div class="t2">${esc(o.period)} · ${s.n} · ${esc(s.who)}</div></div>${domChip(o.d)}${dueChip(o.due, o.state === 'closed')}${icon('chev', 'chev')}</div>`;
}
function bindGateRows(el) {
  $$('[data-approve]', el).forEach(b => b.onclick = e => { e.stopPropagation(); openApproval(b.dataset.approve); });
  $$('[data-gate]', el).forEach(r => r.onclick = () => openApproval(r.dataset.gate));
}
function bindObRows(el) { $$('[data-ob]', el).forEach(r => r.onclick = () => openObligation(r.dataset.ob)); }

/* ============ DAYBOOK — the firm's day, written automatically ============ */
VIEWS.daybook = {
  render(arg) {
    const sel = arg || dayKey(TODAY);
    const days = [0, -1, -2, -3].map(n => dayKey(new Date(TODAY.getTime() + n * 864e5)));
    const L = STATE.ledger.filter(r => dayKey(r.at) === sel && (canSeeClient(r.client)));
    const ag = L.filter(r => r.kind === 'agent'), hu = L.filter(r => r.kind === 'human');
    const clients = [...new Set(L.map(r => r.client).filter(Boolean))];
    const docs = ag.filter(r => r.actor === 'IN-1').length;
    const acks = L.filter(r => /acknowledgement/.test(r.action)).length;
    const signs = L.filter(r => /G7/.test(r.action)).length;
    const reviews = L.filter(r => /G6/.test(r.action)).length;
    const chases = L.filter(r => r.actor === 'IN-2').length;
    const desk = L.filter(r => r.actor === 'CL-1').length;
    const people = TEAM.map(t => ({ t, rs: hu.filter(r => r.actor === t.id) })).filter(x => x.rs.length);
    const byHour = {}; L.forEach(r => { const h = asDate(r.at).getHours(); (byHour[h] = byHour[h] || []).push(r); });
    const dLabel = new Date(sel + 'T00:00:00');
    const signed = STATE.daySignedOff && STATE.daySignedOff[sel];
    return pageHead('Daybook · written by the platform', `${DOW[dLabel.getDay()]}, <em>${fmtDY(dLabel)}</em>`, 'Nobody writes this. Every automated action, gate decision, client message and document is turned into the firm\'s diary, each person\'s timesheet and each client\'s work notes — the same lines feed billing and inspection files.',
      `<div class="seg">${days.map((d, i) => `<button class="${d === sel ? 'on' : ''}" data-day="${d}">${i === 0 ? 'Today' : i === 1 ? 'Yesterday' : fmtD(d + 'T00:00:00')}</button>`).join('')}</div>`) + `
    <div class="grid g-main">
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card pad" style="background:var(--card);background-image:repeating-linear-gradient(180deg,transparent 0 27px,var(--rule) 27px 28px);">
          <div class="upper muted">The day in words</div>
          <p class="serif" style="font-size:19px;line-height:1.6;margin:10px 0 0">
            ${L.length ? `Work touched <b>${clients.length} clients</b>. Autopilot read <b>${docs}</b> batches of documents, chased <b>${chases}</b> times on the ladder and answered <b>${desk}</b> client questions from stored data. People cleared <b>${reviews}</b> four-eyes reviews and partners signed <b>${signs}</b> filings; <b>${acks}</b> acknowledgements were captured from the portals. ${hu.length ? `${people.length} people acted ${hu.length} times — every act carries their name.` : ''}` : 'Nothing recorded for this day yet.'}
          </p>
          <div class="flex mt16 wrap">${signed ? `<span class="stamp gate">Signed off · ${esc(actorName(signed.by))} · ${fmtT(signed.at)}</span>` : `<button class="btn gate sm" id="signoff" ${['MP', 'PT', 'MG', 'CC'].includes(me().role) ? '' : 'disabled title="Manager, coordinator or partner"'}>${icon('stamp')} Sign off the day</button>`}<span class="small muted">Sign-off freezes the narrative into the record; the underlying lines were never editable.</span></div>
        </div>
        <div class="card">
          <div class="card-h"><h3>Hour by hour<small>${L.length} permanent lines</small></h3></div>
          <div class="card-b"><div class="timeline">${Object.keys(byHour).sort((a, b) => a - b).map(h => `<div class="tl ${byHour[h].some(r => r.kind === 'human') ? 'gate' : 'agent'}"><div class="tt">${String(h).padStart(2, '0')}:00 — ${byHour[h].length} actions</div><div class="td">${summariseHour(byHour[h])}</div></div>`).join('') || '<div class="muted">—</div>'}</div></div>
        </div>
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card">
          <div class="card-h"><h3>Auto-timesheets<small>Derived from actions — nobody fills a timesheet</small></h3></div>
          <div class="list">${people.map(({ t, rs }) => { const mins = rs.length * 18 + 30; return `<div class="row">${avatar(t.id)}<div class="grow"><div class="t1">${esc(t.short)}</div><div class="t2">${[...new Set(rs.map(r => clientById(r.client)?.short).filter(Boolean))].slice(0, 3).join(', ')}</div></div><span class="num small">${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m</span></div>`; }).join('') || '<div class="empty small">No human actions recorded.</div>'}</div>
        </div>
        <div class="card">
          <div class="card-h"><h3>Client work notes<small>Feeds the itemised invoice narrative (FO-3)</small></h3></div>
          <div class="list">${clients.slice(0, 9).map(id => { const rs = L.filter(r => r.client === id); return `<div class="row"><div class="grow"><div class="t1">${esc(clientById(id)?.short)}</div><div class="t2">${esc(rs.slice(0, 2).map(r => r.action).join(' · '))}</div></div><span class="chip outline num">${rs.length}</span></div>`; }).join('')}</div>
        </div>
      </div>
    </div>`;
  },
  mount(el, arg) {
    $$('[data-day]', el).forEach(b => b.onclick = () => navTo('#/daybook/' + b.dataset.day));
    const so = $('#signoff', el);
    if (so) so.onclick = () => { const sel = arg || dayKey(TODAY); STATE.daySignedOff = STATE.daySignedOff || {}; STATE.daySignedOff[sel] = { by: me().id, at: new Date().toISOString() }; ledgerAdd({ actor: me().id, kind: 'human', action: 'signed off the Daybook', obj: 'Daybook ' + sel }); save(); toast('Day signed off and sealed into the record', 'gate', 'stamp'); rerender(); };
  }
};
function summariseHour(rs) {
  const g = {}; rs.forEach(r => { const k = r.kind === 'agent' ? r.actor : actorName(r.actor); g[k] = (g[k] || 0) + 1; });
  return Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${esc(k)} ×${n}`).join(' · ') + ' — e.g. ' + esc(rs[0].action);
}

/* ============ THE LINE — obligations kanban ============ */
let LINE_F = { who: 'all', dom: 'all', q: '', view: 'board', late: false };
VIEWS.line = {
  render() {
    const base = lineBase();
    const obs = lineFiltered();
    const doms = ['all', ...Object.keys(DOMAINS).filter(d => STATE.obligations.some(o => o.d === d))];
    const ppl = TEAM.filter(t => ['MG', 'SA', 'AR', 'PX', 'CC'].includes(t.role)).map(t => [t.id, base.filter(o => o.prep === t.id).length]).filter(x => x[1]);
    const lateN = base.filter(o => daysTo(o.due) < 0 && !['closed', 'filed'].includes(o.state)).length;
    const chips = [['all', 'Everyone', base.length], ['me', 'My work', base.filter(o => [o.prep, o.rev, o.partner].includes(me().id)).length], ...ppl.map(([id, n]) => [id, actorName(id), n]), ['none', 'Unassigned', base.filter(o => !o.prep).length]];
    return pageHead('The line · work allocation · moves only forwards', 'Every obligation, <em>one board</em>', 'One card = one client × one statutory requirement × one period. Drag a card forward; the board refuses to let it pass a gate without the named person. The only backward move is “changes requested”, with the reviewer\'s note on the card.',
      `<button class="btn" id="line-legend">${icon('palette')} Colour key</button><button class="btn primary" id="line-task">${icon('plus')} Assign task</button>`) + `
    <div class="flex wrap mb12" style="gap:6px">${chips.map(([k, n, c]) => `<button class="fchip ${LINE_F.who === k ? 'on' : ''}" data-who="${k}">${k === 'all' ? icon('users') : k === 'me' ? icon('user') : k === 'none' ? '<span class="av sm" style="background:transparent;border:1.5px dashed var(--ink-3);color:var(--ink-3)">–</span>' : avatar(k, 'sm')}${esc(n)} <span class="mono">${c}</span></button>`).join('')}</div>
    <div class="flex wrap mb16" style="gap:10px">
      <div class="seg"><button class="${LINE_F.view === 'board' ? 'on' : ''}" data-view="board">Board</button><button class="${LINE_F.view === 'list' ? 'on' : ''}" data-view="list">List</button></div>
      <div class="seg">${doms.map(d => `<button class="${LINE_F.dom === d ? 'on' : ''}" data-dom="${d}">${d === 'all' ? 'All laws' : `<i class="swatch ${txOf(d)}"></i>` + DOMAINS[d].name}</button>`).join('')}</div>
      <input class="input" id="line-q" placeholder="Filter by client or form…" value="${esc(LINE_F.q)}" style="max-width:220px;height:36px">
      <button class="fchip ${LINE_F.late ? 'on' : ''}" id="late-only">${icon('alert')}Overdue only <span class="mono">${lateN}</span></button>
      <span class="small muted" style="margin-left:auto">${obs.length} cards</span>
    </div>
    ${LINE_F.view === 'board' ? `<div class="lanes" id="lanes">
      ${STATES.map(s => { const its = obs.filter(o => o.state === s.k); return `<section class="lane" data-lane="${s.k}" data-h="${s.h}"><div class="lane-h"><span class="glyph ${s.h === 'ok' ? 'code' : s.h} sm" style="${s.h === 'ok' ? 'background:var(--ok)' : ''}">${s.gate || ''}</span><div><b>${s.n}</b><span class="holder">${s.who}</span></div><span class="n">${its.length}</span></div><div class="lane-body">${its.slice(0, 60).map(o => obCard(o)).join('')}${its.length > 60 ? `<div class="tiny muted" style="text-align:center">+${its.length - 60} more</div>` : ''}</div></section>`; }).join('')}
    </div>` : `<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Client & filing</th><th>Owner</th><th>Where it is</th><th>Checks</th><th>Due</th></tr></thead><tbody>${obs.slice().sort((a, b) => a.due.localeCompare(b.due)).slice(0, 200).map(o => { const ck = obChecks(o); return `<tr class="click" data-ob="${o.id}"><td><div class="flex">${formChip(o.form, o.d)}<div><b>${esc(clientById(o.client).short)}</b><span class="sub">${esc(o.period)}</span></div></div></td><td>${o.prep ? `<span class="flex">${avatar(o.prep, 'sm')}<span class="small">${esc(actorName(o.prep))}</span></span>` : '<span class="chip warn">Unassigned</span>'}</td><td>${stateChip(o.state)}${o.returned ? ' <span class="chip warn">Changes requested</span>' : ''}</td><td class="small num">${icon('checkCircle').replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px"')} ${ck.done}/${ck.total} · ${o.docs[1]} docs</td><td>${dueChip(o.due, o.state === 'closed')}</td></tr>`; }).join('')}</tbody></table></div></div>`}`;
  },
  mount(el) {
    $$('[data-who]', el).forEach(b => b.onclick = () => { LINE_F.who = b.dataset.who; rerender(); });
    $$('[data-view]', el).forEach(b => b.onclick = () => { LINE_F.view = b.dataset.view; rerender(); });
    $$('[data-dom]', el).forEach(b => b.onclick = () => { LINE_F.dom = b.dataset.dom; rerender(); });
    $('#late-only', el).onclick = () => { LINE_F.late = !LINE_F.late; rerender(); };
    $('#line-task', el).onclick = () => openTaskModal();
    const q = $('#line-q', el); q.oninput = () => { LINE_F.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { rerender(); const n = $('#line-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    $('#line-legend', el).onclick = openLegend;
    bindObRows(el);
    $$('.ob-card', el).forEach(c => {
      c.onclick = () => openObligation(c.dataset.id);
      c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); DRAG = STATE.obligations.find(o => o.id === c.dataset.id); });
      c.addEventListener('dragend', () => { c.classList.remove('dragging'); $$('.lane').forEach(l => l.classList.remove('drop-ok', 'drop-no')); DRAG = null; });
    });
    $$('.lane', el).forEach(l => {
      l.addEventListener('dragover', e => { if (!DRAG) return; e.preventDefault(); const chk = moveCheck(DRAG, l.dataset.lane); l.classList.toggle('drop-ok', chk.ok); l.classList.toggle('drop-no', !chk.ok); });
      l.addEventListener('dragleave', () => l.classList.remove('drop-ok', 'drop-no'));
      l.addEventListener('drop', e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); const o = STATE.obligations.find(x => x.id === id); l.classList.remove('drop-ok', 'drop-no'); if (o) tryMove(o, l.dataset.lane); });
    });
  }
};
let DRAG = null;
function lineBase() {
  return STATE.obligations.filter(o => canSeeClient(o.client)
    && (LINE_F.dom === 'all' || o.d === LINE_F.dom)
    && (!LINE_F.q || (o.form + ' ' + clientById(o.client).name + ' ' + o.period).toLowerCase().includes(LINE_F.q.toLowerCase()))
    && (o.state !== 'closed' || daysTo(o.due) > -10));
}
function lineFiltered() {
  return lineBase().filter(o => (LINE_F.who === 'all' || (LINE_F.who === 'me' ? [o.prep, o.rev, o.partner].includes(me().id) : LINE_F.who === 'none' ? !o.prep : o.prep === LINE_F.who))
    && (!LINE_F.late || (daysTo(o.due) < 0 && !['closed', 'filed'].includes(o.state))));
}
function obCard(o) {
  const c = clientById(o.client); const s = stateOf(o.state); const dd = daysTo(o.due); const ck = obChecks(o);
  const open = o.state !== 'closed' && o.state !== 'filed';
  const lateCls = open ? (dd < 0 ? 'late' : dd <= 2 ? 'soon' : '') : '';
  const due = o.state === 'closed' ? `<span class="chip ok">${icon('check')}Filed</span>` : dd < 0 && open ? `<span class="chip bad">Overdue · ${-dd} day${dd === -1 ? '' : 's'}</span>` : `<span class="chip ${dd <= 2 && open ? 'warn' : 'outline'}">Due ${fmtD(o.due)}${dd <= 6 && dd >= 0 ? ` · ${dd === 0 ? 'today' : 'in ' + dd + (dd === 1 ? ' day' : ' days')}` : ''}</span>`;
  return `<article class="ob-card h-${s.h} ${lateCls}" draggable="true" data-id="${o.id}">
    <div class="flex" style="gap:6px">${formChip(o.form, o.d)}<span class="tiny muted">${esc(o.period)}</span>${o.mode === 'cert' ? '<span class="chip gate" style="height:18px;font-size:10.5px">certify</span>' : ''}</div>
    <div class="cname">${esc(c.short)}</div>
    <div class="nm">${esc(o.name)}</div>
    ${o.returned ? `<div class="note">${esc(actorName(o.returned.by))}: ${esc(o.returned.note)}</div>` : ''}
    <div class="mt8">${due}</div>
    <div class="m">${o.prep ? avatar(o.prep, 'sm') : '<span class="av sm" title="Unassigned" style="background:transparent;border:1.5px dashed var(--ink-3);color:var(--ink-3)">–</span>'}<span class="tiny">${icon('checkCircle').replace('<svg', '<svg width="12" height="12" style="vertical-align:-2px"')} ${ck.done}/${ck.total}</span><span class="tiny">${icon('file').replace('<svg', '<svg width="12" height="12" style="vertical-align:-2px"')} ${o.docs[1]}</span>${o.touchless && open ? '<span class="tiny" style="color:var(--agent-ink);margin-left:auto">touchless</span>' : ''}</div>
    <span class="ftab ${txOf(o.d)}" title="${esc(DOMAINS[o.d]?.long || '')}"></span>
  </article>`;
}
function moveCheck(o, to) {
  const from = SIDX[o.state], t = SIDX[to];
  if (t === from) return { ok: false, why: 'Same column' };
  if (t < from) return to === 'preparing' && from >= SIDX.reconciled && from <= SIDX.sign ? { ok: true, back: true } : { ok: false, why: 'Work moves only forwards. The single backward move is a rejection to "Preparing".' };
  if (from < SIDX.review && t > SIDX.review) return { ok: false, why: 'Every filing passes four-eyes review (G6) first.' };
  if (from === SIDX.review && t > SIDX.review) return { ok: true, gate: 'G6' };
  if (from === SIDX.sign && t >= SIDX.filed) return { ok: true, gate: 'G7' };
  if (from === SIDX.filed && t === SIDX.closed) return { ok: true, ack: true };
  if (t > from + 1 && from >= SIDX.review) return { ok: false, why: 'One gate at a time.' };
  if (!can('prepare')) return { ok: false, why: 'Your role cannot move preparation work.' };
  return { ok: true };
}
function tryMove(o, to) {
  const chk = moveCheck(o, to);
  if (!chk.ok) { toast(chk.why, 'bad', 'lock'); return; }
  if (chk.back) return rejectObligation(o);
  if (chk.gate) return openApproval('ob:' + o.id);
  if (chk.ack) return captureAck(o);
  o.state = to; ledgerAdd({ actor: me().id, kind: 'human', action: `moved to "${stateOf(to).n}" (manual)`, client: o.client, obj: o.form + ' · ' + o.period }); save();
  toast(`${o.form} · ${clientById(o.client).short} → ${stateOf(to).n}`, stateOf(to).h === 'gate' ? 'gate' : 'agent', 'arrow'); rerender();
}
function rejectObligation(o) {
  openModal({ html: `<div class="modal-b"><div class="upper muted">The one backward arrow</div><h2>Send back to the preparer</h2><p class="dim small">${esc(o.form)} · ${esc(clientById(o.client).short)} returns to ${esc(actorName(o.prep))} with your reason attached. The reason is permanent.</p><textarea class="input mt12" id="rj" placeholder="What needs fixing?"></textarea><div class="flex mt16" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn danger" data-ok>${icon('undo')} Send back</button></div></div>`,
    onMount: el => { el.querySelector('[data-x]').onclick = () => closeModal(); el.querySelector('[data-ok]').onclick = () => { const why = $('#rj').value.trim(); if (!why) { $('#rj').classList.add('shake'); setTimeout(() => $('#rj').classList.remove('shake'), 500); return; } o.state = 'preparing'; o.returned = { by: me().id, note: why, at: new Date().toISOString() }; ledgerAdd({ actor: me().id, kind: 'human', action: `requested changes — “${why}”`, client: o.client, obj: o.form + ' · ' + o.period }); save(); closeModal(); closeSheet(); toast('Sent back to ' + actorName(o.prep), 'warn', 'undo'); rerender(); }; } });
}
function captureAck(o) {
  toast('FL-1 polling the portal…', 'agent', 'refresh');
  setTimeout(() => { o.state = 'closed'; o.ack = (o.d === 'GST' ? 'AA36' : 'ACK') + String(Math.floor(Math.random() * 1e12)).padStart(12, '0'); ledgerAdd({ actor: 'FL-1', kind: 'agent', action: `captured acknowledgement ${o.ack}`, client: o.client, obj: o.form + ' · ' + o.period }); save(); toast(`Acknowledged · ${o.ack} — client notified automatically`, 'ok', 'check'); closeSheet(); rerender(); }, 1100);
}

/* ============ OBLIGATION SHEET ============ */
function openObligation(id) {
  const o = STATE.obligations.find(x => x.id === id); if (!o) return;
  const c = clientById(o.client), f = catById(o.fid), s = stateOf(o.state), md = MODE_LABEL[f.m];
  const hist = STATE.ledger.filter(r => r.client === o.client && r.obj && r.obj.includes(o.form)).slice(-8).reverse();
  const actions = {
    scheduled: `<button class="btn" data-a="request">${icon('send')} Start document request now</button>`,
    awaiting: `<button class="btn" data-a="chase">${icon('send')} Chase now (IN-2)</button><button class="btn agent" data-a="received">${icon('inbox')} Mark papers received</button>`,
    received: `<button class="btn agent" data-a="next">${icon('arrow')} Advance to preparing</button>`,
    preparing: `<button class="btn agent" data-a="next">${icon('arrow')} Mark reconciled</button>`,
    reconciled: `<button class="btn agent" data-a="next">${icon('arrow')} Submit for review</button>`,
    review: `<button class="btn danger" data-a="reject">${icon('undo')} Send back</button><button class="btn gate" data-a="gate">${icon('stamp')} Review · G6</button>`,
    sign: `<button class="btn danger" data-a="reject">${icon('undo')} Send back</button><button class="btn gate" data-a="gate">${icon('pen')} Sign with DSC · G7</button>`,
    filed: `<button class="btn" data-a="ack">${icon('refresh')} Poll portal for acknowledgement</button>`,
    closed: `<button class="btn" data-a="sendack">${icon('send')} Send acknowledgement to client · G12</button>`
  }[o.state];
  openSheet({
    title: `${esc(o.form)} <span class="muted" style="font-weight:400">· ${esc(o.period)}</span>`, sub: `${esc(c.name)} · ${esc(f.n)}`, wide: true,
    body: `
      <div class="flex wrap" style="gap:8px">${domChip(o.d)}${stateChip(o.state)}${dueChip(o.due, o.state === 'closed')}<span class="chip ${md.c}">${md.t}</span>${o.touchless ? '<span class="chip agent">Touchless so far</span>' : ''}</div>
      ${stepper(o.state)}
      <div class="flex between tiny muted"><span>Scheduled</span><span>Papers</span><span>Prepared</span><span>Review</span><span>Sign</span><span>Filed</span><span>Closed</span></div>
      ${o.state === 'closed' && o.ack ? `<div class="mt16"><span class="stamp ok big">Acknowledged · ${esc(o.ack)}</span></div>` : ''}
      ${o.returned ? `<div class="callout warn mt16">${icon('undo')}<div><b>Changes requested by ${esc(actorName(o.returned.by))}</b> · ${fmtDT(o.returned.at)}<br>${esc(o.returned.note)}</div></div>` : ''}${daysTo(o.due) < 0 && !['closed', 'filed'].includes(o.state) ? `<div class="callout bad mt16">${icon('alert')}<div><b>Past due by ${-daysTo(o.due)} days.</b> FO-2 ranked this first and alerted ${esc(actorName(c.partner))}. Late fee and interest are accruing under the rule in force on the due date.</div></div>` : ''}
      <div class="grid g2 mt16">
        <div class="card pad"><div class="upper muted mb8">Who does what</div>
          <dl class="kv"><dt>Holder now</dt><dd>${s.who}</dd><dt>Preparer</dt><dd>${o.prep ? esc(actorName(o.prep)) : `<select class="input" id="assign-prep" style="height:32px"><option value="">Unassigned — choose…</option>${TEAM.filter(t => ['SA', 'AR', 'MG', 'PX'].includes(t.role)).map(t => `<option value="${t.id}">${esc(t.short)}</option>`).join('')}</select>`}</dd><dt>Reviewer (G6)</dt><dd>${esc(actorName(o.rev))}</dd><dt>Signs (G7)</dt><dd>${esc(actorName(o.partner))}</dd><dt>Autopilot</dt><dd>${f.a.map(agentHex).join(' ') || '—'}</dd><dt>Gates</dt><dd>${f.g.map(gateSeal).join(' ') || '—'}</dd></dl>
        </div>
        <div class="card pad"><div class="upper muted mb8">The rule</div>
          <dl class="kv"><dt>Law</dt><dd>${DOMAINS[f.d].long}</dd><dt>Due rule</dt><dd>${esc(f.due)}</dd><dt>Portal</dt><dd>${esc(f.p)}</dd><dt>How it is filed</dt><dd>${md.d}</dd><dt>Rule version</dt><dd class="mono">rb 2026.10.2</dd></dl>
        </div>
      </div>
      <div class="card mt16"><div class="card-h"><h3>Evidence pack<small>What the reviewer and partner will see</small></h3></div><div class="list">${evidenceFor(o).map(e => `<div class="row" style="min-height:44px">${icon('check', 'chev')}<div class="grow small">${esc(e)}</div></div>`).join('')}</div></div>
      <div class="card mt16"><div class="card-h"><h3>Documents<small>${o.docs[1]} of ${o.docs[0]} received</small></h3></div><div class="card-b">${meter(100 * o.docs[1] / o.docs[0], o.docs[1] === o.docs[0] ? 'ok' : 'client')}<div class="flex wrap mt12" style="gap:6px">${['Sales register', 'Purchase invoices', 'Bank statement', 'Expense bills', 'Credit notes', 'Payroll summary', 'Challans'].slice(0, o.docs[0]).map((d, i) => `<span class="chip ${i < o.docs[1] ? 'ok' : 'client'}">${i < o.docs[1] ? icon('check') : icon('clock')}${d}</span>`).join('')}</div></div></div>
      <div class="card mt16"><div class="card-h"><h3>History<small>From the permanent record</small></h3></div><div class="feed">${hist.map(r => feedItem(r)).join('') || '<div class="empty small">No lines yet.</div>'}</div></div>`,
    foot: `<span class="small muted" style="margin-right:auto">Owner: ${esc(actorName(o.prep))}</span>${actions || ''}`,
    onMount: el => { const ap = $('#assign-prep', el); if (ap) ap.onchange = () => { if (!['MP', 'PT', 'MG', 'CC'].includes(me().role)) return toast('A manager, coordinator or partner assigns work', 'bad', 'lock'); o.prep = ap.value; ledgerAdd({ actor: me().id, kind: 'human', action: `assigned to ${actorName(ap.value)}`, client: o.client, obj: o.form + ' · ' + o.period }); save(); toast(`Assigned to ${actorName(ap.value)}`, 'ok', 'users'); closeSheet(); rerender(); };
      $$('[data-a]', el).forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'chase' || a === 'request') { if (a === 'request') o.state = 'awaiting'; ledgerAdd({ actor: 'IN-2', kind: 'agent', action: `sent a specific document request in ${c.lang} (requested by ${me().short})`, client: o.client, obj: o.form + ' · ' + o.period }); save(); toast(`IN-2 sent the request to ${c.short} on ${c.channel} in ${c.lang}`, 'client', 'send'); closeSheet(); rerender(); }
      if (a === 'received') { o.docs[1] = o.docs[0]; tryMove(o, 'received'); closeSheet(); }
      if (a === 'next') { tryMove(o, STATES[SIDX[o.state] + 1].k); closeSheet(); }
      if (a === 'reject') rejectObligation(o);
      if (a === 'gate') { closeSheet(true); openApproval('ob:' + o.id); }
      if (a === 'ack') captureAck(o);
      if (a === 'sendack') { if (!can('send')) return toast('Your role cannot click send on documents (G12)', 'bad', 'lock'); ledgerAdd({ actor: me().id, kind: 'human', action: 'sent acknowledgement PDF to client (G12)', client: o.client, obj: o.form + ' · ' + o.period }); save(); toast(`Acknowledgement sent to ${c.short} by ${me().short}`, 'ok', 'send'); closeSheet(); }
    }) }
  });
}

/* ============ STATUTORY CLOCK — calendar ============ */
let CAL = { y: TODAY.getFullYear(), m: TODAY.getMonth(), dom: 'all', sel: null };
const DOW_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function formGroups(list) { const g = {}; list.forEach(o => (g[o.form] = g[o.form] || []).push(o)); return Object.entries(g).sort((a, b) => b[1].length - a[1].length); }
function groupTone(its) {
  if (its.some(o => !['closed', 'filed'].includes(o.state) && daysTo(o.due) < 0)) return 'bad';
  if (its.every(o => ['closed', 'filed'].includes(o.state))) return 'done';
  const open = its.filter(o => !['closed', 'filed'].includes(o.state)).sort((a, b) => SIDX[a.state] - SIDX[b.state]);
  const h = stateOf(open[0].state).h; return h === 'code' ? '' : h;
}
function cutoffs(obs) {
  const out = [];
  const byDay = {}; obs.forEach(o => { if (['GSTR-1', 'GSTR-3B', '281-TDS', 'PF-ECR', '24Q', '26Q', 'AOC-4', 'ITR-6', 'ITR-5'].includes(o.form)) { const k = dayKey(o.due) + '|' + o.form; (byDay[k] = byDay[k] || []).push(o); } });
  Object.entries(byDay).forEach(([k, its]) => { if (its.length < 2) return; const d = new Date(new Date(its[0].due).getTime() - 3 * 864e5); out.push({ day: dayKey(d), form: k.split('|')[1], n: its.length, waiting: its.filter(o => o.state === 'awaiting').length }); });
  return out;
}
VIEWS.calendar = {
  render() {
    const first = new Date(CAL.y, CAL.m, 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const cells = [...Array(42)].map((_, i) => new Date(start.getTime() + i * 864e5));
    const all = STATE.obligations.filter(o => canSeeClient(o.client));
    const inMonth = all.filter(o => asDate(o.due).getMonth() === CAL.m && asDate(o.due).getFullYear() === CAL.y);
    const obs = all.filter(o => CAL.dom === 'all' || o.d === CAL.dom);
    const doms = Object.keys(DOMAINS).map(d => [d, inMonth.filter(o => o.d === d).length]).filter(x => x[1]);
    const cuts = cutoffs(obs);
    const fd = (STATE.firmDeadlines || []);
    if (!CAL.sel || new Date(CAL.sel + 'T00:00:00').getMonth() !== CAL.m) { const nx = cells.find(d => d.getMonth() === CAL.m && d >= TODAY && obs.some(o => dayKey(o.due) === dayKey(d))) || cells.find(d => d.getMonth() === CAL.m && obs.some(o => dayKey(o.due) === dayKey(d))); CAL.sel = nx ? dayKey(nx) : dayKey(first); }
    const ext = STATE.gates.find(g => g.ext);
    const changes = (STATE.ruleLog || []).length + (ext && ext.status === 'pending' ? 1 : 0);
    return pageHead(`All ${visibleClients().filter(c => !c.internal).length} clients · ${fyOf(new Date(CAL.y, CAL.m, 1))}`, 'Statutory <em>clock</em>', 'Every statutory due date your clients face, worked out by the rulebook from each client\'s profile — and moved automatically, after a partner approves, when a government notification changes a date.',
      `<button class="btn" id="add-fd">${icon('plus')} Add firm deadline</button>`) + `
    <div class="watch mb16"><div class="flex wrap" style="gap:10px;align-items:center"><span class="dot live"></span><span>Watching <b>CBIC · CBDT · GSTN · MCA · EPFO · ESIC · ICAI</b></span><span class="mono tiny" style="color:var(--client-ink)">LAST CHECK 06:00</span></div>
      ${ext ? `<div class="flex wrap mt8" style="gap:10px;align-items:center"><span class="chip ${ext.status === 'pending' ? 'gate' : 'ok'}">${ext.status === 'pending' ? `${changes} change${changes > 1 ? 's' : ''} · waiting for a partner` : 'Applied'}</span><span class="small">${esc(ext.title)}</span></div>` : ''}
      <div class="flex wrap mt8" style="gap:16px;justify-content:flex-end"><button class="linkbtn" id="clog">View change log</button><button class="linkbtn" id="checknow">${icon('refresh').replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px"')} Check now</button></div></div>
    <div class="flex wrap mb16" style="gap:10px;align-items:center">
      <div class="seg"><button data-nav="-1" aria-label="Previous month">${icon('chevL').replace('<svg', '<svg width="16" height="16"')}</button><button data-nav="0">Today</button><button data-nav="1" aria-label="Next month">${icon('chev').replace('<svg', '<svg width="16" height="16"')}</button></div>
      <b class="serif" style="font-size:24px">${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][CAL.m]} ${CAL.y}</b>
      <div class="flex wrap" style="gap:6px;margin-left:auto">${[['all', inMonth.length], ...doms].map(([d, n]) => `<button class="fchip ${CAL.dom === d ? 'on' : ''}" data-dom="${d}">${d === 'all' ? 'All' : `<i class="swatch ${txOf(d)}"></i>${DOMAINS[d].name}`} <span class="mono">${n}</span></button>`).join('')}</div>
    </div>
    <div class="cal-wrap">
      <div><div class="cal">${DOW_MON.map(d => `<div class="dow">${d}</div>`).join('')}
        ${cells.map(d => { const k = dayKey(d); const its = obs.filter(o => dayKey(o.due) === k); const fg = formGroups(its); const cu = cuts.filter(c => c.day === k); const f2 = fd.filter(x => x.date === k); const out = d.getMonth() !== CAL.m;
          return `<div class="day ${out ? 'out' : ''} ${k === dayKey(TODAY) ? 'today' : ''} ${isPeak(d) ? 'peak' : ''} ${k === CAL.sel ? 'sel' : ''}" data-d="${k}"><div class="dn"><b>${d.getDate()}</b>${its.length ? `<span class="tiny muted">${its.length}</span>` : ''}</div>
            ${fg.slice(0, 3).map(([f, a]) => { const t = groupTone(a); return `<div class="pill ${t === 'done' ? 'done' : t} ${txOf(a[0].d)}" title="${esc(a[0].name)}"><span>${esc(f)}</span><b>${a.length}</b></div>`; }).join('')}${fg.length > 3 ? `<div class="more">+${fg.length - 3} forms</div>` : ''}
            ${cu.slice(0, 1).map(c => `<div class="pill cut" title="Internal cut-off for client papers"><span>Cut-off · ${esc(c.form)}</span><b>${c.n}</b></div>`).join('')}${f2.map(x => `<div class="pill cut firm" title="Firm deadline"><span>${esc(x.title)}</span></div>`).join('')}
            ${its.length ? `<div class="heat">${fg.slice(0, 6).map(([, a]) => `<i class="dot" style="background:var(--${groupTone(a) === 'done' ? 'ok' : groupTone(a) || 'code'})"></i>`).join('')}</div>` : ''}</div>`; }).join('')}
      </div>
      <div class="legend mt12"><span><i class="sw" style="background:var(--client)"></i>Waiting on client</span><span><i class="sw" style="background:var(--agent)"></i>On autopilot</span><span><i class="sw" style="background:var(--gate)"></i>At a gate</span><span><i class="sw" style="background:var(--ok)"></i>All filed</span><span><i class="sw" style="background:var(--bad)"></i>Late</span><span><i class="sw" style="border:1.5px dashed var(--ink-3);background:transparent"></i>Internal cut-off / firm deadline</span><span><i class="swatch tx-gst" style="margin:0"></i>Texture = law</span></div></div>
      ${calSide(CAL.sel, obs, cuts, fd)}
    </div>
    <div class="card mt24">
      <div class="card-h"><h3>The shape of every month<small>Learn this once; each month is this plus an overlay of annual and quarterly work</small></h3></div>
      <div class="card-b grid g4">
        ${[['01–06', 'Intake & preparation', 'Documents chased, books written up, BRS, payroll processed, TDS computed.', 'client'], ['07', 'Tax deposit', 'TDS / TCS deposited. Interest runs from the day it is missed.', 'bad'], ['08–10', 'Sales validation', 'Sales vs e-invoices & e-way bills; last cheap chance to fix.', 'agent'], ['11–13', 'GST outward', 'GSTR-1 on the 11th, IFF & quarterly on the 13th. Then locked.', 'bad'], ['14–15', 'Credit & payroll', 'GSTR-2B on the 14th; IMS decisions; PF & ESI on the 15th.', 'gate'], ['16–19', 'Reconcile & decide', 'Bought vs declared vs billed — ends in a number a partner approves.', 'gate'], ['20–25', 'Pay', 'GSTR-3B on the 20th; QRMP 22nd/24th; PMT-06 on the 25th.', 'bad'], ['26–31', 'Internal week', 'Quality sampling, billing, collections, training, article records.', 'code']].map(([d, t, x, h]) => `<div><div class="mono" style="color:var(--${h});font-weight:700">${d}</div><b>${t}</b><div class="small muted">${x}</div></div>`).join('')}
      </div>
    </div>`;
  },
  mount(el) {
    $$('[data-nav]', el).forEach(b => b.onclick = () => { const n = +b.dataset.nav; if (n === 0) { CAL.y = TODAY.getFullYear(); CAL.m = TODAY.getMonth(); CAL.sel = dayKey(TODAY); } else { const d = new Date(CAL.y, CAL.m + n, 1); CAL.y = d.getFullYear(); CAL.m = d.getMonth(); CAL.sel = null; } rerender(); });
    $$('[data-dom]', el).forEach(b => b.onclick = () => { CAL.dom = b.dataset.dom; rerender(); });
    $$('[data-d]', el).forEach(c => c.onclick = () => { CAL.sel = c.dataset.d; if (matchMedia('(max-width: 1100px)').matches) { rerender(); setTimeout(() => $('.cal-side')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); } else rerender(); });
    bindObRows(el);
    $('#checknow', el).onclick = () => { ledgerAdd({ actor: 'FO-4', kind: 'agent', action: 'checked CBIC, CBDT, GSTN, MCA, EPFO, ESIC & ICAI on request — no new notifications', obj: 'Rule watch' }); save(); toast('Rule watch checked 7 sources — nothing new since 06:00', 'agent', 'refresh'); };
    $('#clog', el).onclick = openChangeLog;
    $('#add-fd', el).onclick = () => openModal({ html: `<div class="modal-b"><h2>Add a firm deadline</h2><p class="small dim">Internal dates — client-paper cut-offs, partner review days, billing runs. They show on the calendar as dashed entries.</p><div class="field"><label for="fd-t">What</label><input class="input" id="fd-t" placeholder="e.g. Partner review day — tax audits"></div><div class="field"><label for="fd-d">Date</label><input class="input" type="date" id="fd-d" value="${CAL.sel}"></div><div class="flex" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-ok>Add</button></div></div>`,
      onMount: m => { m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-ok]').onclick = () => { const t = $('#fd-t', m).value.trim(); if (!t) return $('#fd-t', m).classList.add('shake'); STATE.firmDeadlines = STATE.firmDeadlines || []; STATE.firmDeadlines.push({ title: t, date: $('#fd-d', m).value, by: me().id }); ledgerAdd({ actor: me().id, kind: 'human', action: `added firm deadline “${t}” on ${$('#fd-d', m).value}`, obj: 'Calendar' }); save(); closeModal(); toast('Firm deadline added', 'ok', 'calendar'); rerender(); }; } });
  }
};
function calSide(k, obs, cuts, fd) {
  const d = new Date(k + 'T00:00:00'); const n = daysTo(d);
  const its = obs.filter(o => dayKey(o.due) === k); const fg = formGroups(its);
  return `<aside class="card cal-side"><div class="card-b">
    <div class="upper muted">${DOW[d.getDay()]} · ${n === 0 ? 'today' : n > 0 ? `in ${n} day${n > 1 ? 's' : ''}` : `${-n} day${n < -1 ? 's' : ''} ago`}${isPeak(d) ? ' · peak day' : ''}</div>
    <h2 class="serif" style="font-size:28px;margin:6px 0 2px">${d.getDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${d.getFullYear()}</h2>
    <div class="muted">${its.length ? `${its.length} filing${its.length > 1 ? 's' : ''} due` : 'A capacity day — nothing statutory due'}</div>
    ${cuts.filter(c => c.day === k).map(c => `<div class="callout client mt12" style="border-style:dashed">${icon('clock')}<div><b>Cut-off for client papers · ${esc(c.form)}</b><br><span class="small">${c.waiting} of ${c.n} clients still to send</span></div></div>`).join('')}
    ${fd.filter(x => x.date === k).map(x => `<div class="callout mt12" style="border-style:dashed">${icon('calendar')}<div><b>${esc(x.title)}</b><br><span class="small">Firm deadline · added by ${esc(actorName(x.by))}</span></div></div>`).join('')}
    ${fg.map(([f, a]) => { const c = catById(a[0].fid); const cut = new Date(d.getTime() - 3 * 864e5); return `<div class="side-form mt12"><div class="flex between">${formChip(f, a[0].d)}<span class="chip outline">${DOMAINS[a[0].d].name}</span></div><b style="display:block;font:600 19px var(--font-display);margin-top:8px">${esc(c ? c.n : f)}</b><div class="small muted">${esc(a[0].period)} · ${a.length} client${a.length > 1 ? 's' : ''}</div>
      <dl class="kv mt8" style="grid-template-columns:1fr 1fr;gap:2px 12px"><dt>Portal</dt><dt>Internal cut-off</dt><dd class="small">${esc((c?.p || '').split(' ·')[0])}</dd><dd class="small">${fmtD(cut)}</dd></dl>
      <div class="mt8">${stackBar(a)}</div>
      <details class="mt8"><summary class="small" style="cursor:pointer;font-weight:600">Clients</summary><div class="list">${a.map(o => `<div class="row click" data-ob="${o.id}" style="padding:8px 4px;min-height:40px"><div class="grow small"><b>${esc(clientById(o.client).short)}</b>${o.redated ? ` <span class="chip outline" style="height:18px">re-dated from ${fmtD(o.redated)}</span>` : ''}</div>${stateChip(o.state)}</div>`).join('')}</div></details></div>`; }).join('')}
  </div></aside>`;
}
function openChangeLog() {
  const ext = STATE.gates.find(g => g.ext);
  openSheet({ title: 'Rulebook change log', sub: 'Every change to a rate, threshold or due date — with its source and who approved it', wide: true,
    body: `${ext ? `<div class="card mb16"><div class="list"><div class="row">${gateSeal('G14')}<div class="grow"><div class="t1">${esc(ext.title)}</div><div class="t2">${ext.status === 'pending' ? 'Detected today 06:00 · waiting for a partner' : `Approved by ${esc(actorName(ext.by))} · ${ext.redatedCount || 0} obligations re-dated automatically`}</div></div>${ext.status === 'pending' ? `<button class="btn xs gate" data-ext>Review</button>` : '<span class="chip ok">Applied</span>'}</div></div></div>` : ''}
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Rule</th><th>Value</th><th>From</th><th>Version</th><th>Source</th></tr></thead><tbody>${RULES.slice().sort((a, b) => b.from.localeCompare(a.from)).map(r => `<tr><td><b>${esc(r.k)}</b></td><td>${esc(r.v)}</td><td class="small">${fmtDY(r.from)}</td><td class="mono small">${esc(r.ver)}</td><td class="small dim">${esc(r.src)}</td></tr>`).join('')}</tbody></table></div></div>`,
    onMount: s => { const b = s.querySelector('[data-ext]'); if (b) b.onclick = () => { closeSheet(true); openApproval(ext.id); }; } });
}

/* ============ GATES & APPROVALS ============ */
let GATE_F = 'mine';
VIEWS.gates = {
  render() {
    const q = gateQueue();
    const filt = { mine: g => gateAllowed(g).ok, all: () => true, partner: g => GATES[g.gate].partner, production: g => ['G2', 'G3', 'G4', 'G5', 'G6', 'G17'].includes(g.gate), client: g => ['G1', 'G9', 'G10', 'G12', 'G13', 'G16', 'G18'].includes(g.gate) };
    const list = q.filter(filt[GATE_F]);
    const done = STATE.gates.filter(g => g.status !== 'pending').slice(-6).reverse();
    const sec = (title, sub, items, empty) => `<div class="card mb16"><div class="card-h"><h3>${title} <span class="chip gate" style="margin-left:6px">${items.length}</span><small>${sub}</small></h3></div><div class="list">${items.map(g => gateRow(g)).join('') || `<div class="empty small" style="margin:12px">${empty}</div>`}</div></div>`;
    const grouped = GATE_F === 'mine'
      ? sec('Waiting for your review', 'Four-eyes (G6) — approve, or send back with a note', list.filter(g => g.gate === 'G6'), 'Nothing waiting for your review.')
        + sec('Approved · waiting for your DSC', 'G7 signature and G8 UDIN — plug in your Class-3 token', list.filter(g => ['G7', 'G8'].includes(g.gate)), 'Nothing waiting for your signature.')
        + sec('Other decisions', 'Credit calls, invoices, clients, rules, documents out', list.filter(g => !['G6', 'G7', 'G8'].includes(g.gate)), 'No other decisions waiting.')
      : `<div class="card"><div class="list">${list.map(g => gateRow(g)).join('') || `<div class="empty">${icon('checkCircle')}<p>Nothing here.</p></div>`}</div></div>`;
    return pageHead('Gates · where the work stops until a named person acts', 'Gates & <em>approvals</em>', 'Autopilot proposes; people decide. Nothing reaches a government portal until a second person has checked it and a partner has signed it with their DSC. There is no bulk-approve, by design: Quality check plants known-defective items to make sure reviewers still read.') + `
    <div class="grid g4 mb16">
      ${[['Waiting for you', q.filter(g => gateAllowed(g).ok).length, 'gate'], ['Partner-only', q.filter(g => GATES[g.gate].partner).length, 'gate'], ['Due today or late', q.filter(g => daysTo(g.due) <= 0).length, 'warn'], ['Decided this session', STATE.gates.filter(g => g.status !== 'pending').length, 'ok']].map(([l, n, c]) => `<div class="card kpi accent-${c}"><div class="label">${l}</div><div class="value">${n}</div></div>`).join('')}
    </div>
    <div class="seg mb16">${[['mine', 'Yours to clear'], ['all', 'Everything'], ['partner', 'Partner-only'], ['production', 'Production'], ['client', 'Client & firm']].map(([k, n]) => `<button class="${GATE_F === k ? 'on' : ''}" data-f="${k}">${n} <span class="n">${q.filter(filt[k]).length}</span></button>`).join('')}</div>
    <div class="grid g-main">
      <div>${grouped}</div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>The eighteen gates</h3></div><div class="card-b" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">
          ${Object.entries(GATES).map(([k, G]) => { const n = q.filter(x => x.gate === k).length; return `<div class="flex" style="gap:8px;align-items:flex-start" title="${esc(G.why)}">${gateSeal(k)}<div><div class="small" style="font-weight:600;line-height:1.25">${esc(G.n)}</div><div class="tiny muted">${esc(G.who)}${n ? ` · <b style="color:var(--gate-ink)">${n} open</b>` : ''}</div></div></div>`; }).join('')}
        </div></div>
        <div class="card"><div class="card-h"><h3>Recently decided</h3></div><div class="list">${done.map(g => `<div class="row">${gateSeal(g.gate)}<div class="grow"><div class="t1">${esc(g.title)}</div><div class="t2">${g.status} by ${esc(actorName(g.by))} · ${fmtT(g.at)}</div></div><span class="stamp ${g.status === 'approved' ? 'gate' : 'bad'}">${g.status}</span></div>`).join('') || '<div class="empty small">Decisions you make appear here and in the record.</div>'}</div></div>
      </div>
    </div>`;
  },
  mount(el) { $$('[data-f]', el).forEach(b => b.onclick = () => { GATE_F = b.dataset.f; rerender(); }); bindGateRows(el); }
};

function findGateItem(id) { return gateQueue().find(g => g.id === id) || STATE.gates.find(g => g.id === id); }
function openApproval(id) {
  const g = findGateItem(id); if (!g) return toast('That item has already been decided', 'ok', 'check');
  const G = GATES[g.gate]; const allowed = gateAllowed(g); const c = g.client ? clientById(g.client) : null;
  const special = g.gate === 'G7' ? 'Sign with DSC' : g.gate === 'G8' ? 'Generate UDIN' : g.gate === 'G3' ? 'Commit decisions' : g.gate === 'G12' ? 'Send' : g.gate === 'G13' ? 'Accept client' : g.gate === 'G18' ? 'Resign engagement' : 'Approve';
  openSheet({
    title: `${gateSeal(g.gate)} <span style="margin-left:8px">${esc(g.title)}</span>`, sub: `${esc(G.n)} · ${esc(G.who)}${c ? ' · ' + esc(c.name) : g.newClient ? ' · ' + esc(g.newClient) : ''}`, wide: true,
    body: `
      <div class="flex wrap" style="gap:8px">${dueChip(g.due)}${g.amount ? `<span class="chip outline num">${inr(g.amount)}</span>` : ''}<span class="chip ${agentByCode(g.prep) ? 'agent' : 'outline'}">Prepared by ${esc(actorName(g.prep))}</span>${g.amount > 50000 && G.capHigh ? '<span class="chip gate">Above ₹50,000 → partner</span>' : ''}</div>
      <div class="callout gate mt16">${icon('info')}<div><b>Why a person:</b> ${esc(G.why)}</div></div>
      ${!allowed.ok ? `<div class="callout bad mt12">${icon('lock')}<div><b>You cannot clear this gate.</b> ${esc(allowed.why)}</div></div>` : ''}
      <div class="card mt16"><div class="card-h"><h3>Evidence pack<small>Check the citation, not the reasoning</small></h3></div><div class="list">${(g.ev || []).map((e, i) => `<div class="row" style="min-height:46px"><span class="num tiny muted" style="width:18px">${i + 1}</span><div class="grow small">${esc(e)}</div><span class="chip outline">${icon('link')}source</span></div>`).join('')}</div></div>
      ${g.gate === 'G3' ? `<div class="callout agent mt16">${icon('scale')}<div>The invoice-by-invoice proposals are on the <a href="#/recon">Reconciliation → IMS triage</a> screen, where you can change any proposal before committing.</div></div>` : ''}
      <div class="field mt16"><label>Your note (written to the record)${['G14', 'G11', 'G18'].includes(g.gate) ? ' — required: write the reasoning down today' : ''}</label><textarea class="input" id="gate-note" placeholder="Optional for most gates"></textarea></div>`,
    foot: allowed.ok ? `<button class="btn danger" data-rej>${icon('undo')} Reject</button><button class="btn gate" data-ok>${icon(g.gate === 'G7' ? 'pen' : 'stamp')} ${special}</button>` : `<span class="small muted">Switch person (top right) to someone who holds this gate.</span><button class="btn" data-x>Close</button>`,
    onMount: el => {
      const note = () => $('#gate-note', el).value.trim();
      const needNote = ['G14', 'G11', 'G18'].includes(g.gate);
      el.querySelector('[data-x]') && (el.querySelector('[data-x]').onclick = () => closeSheet());
      el.querySelector('[data-rej]') && (el.querySelector('[data-rej]').onclick = () => { if (!note()) { $('#gate-note', el).classList.add('shake'); $('#gate-note', el).placeholder = 'A rejection needs a reason'; setTimeout(() => $('#gate-note', el).classList.remove('shake'), 500); return; } resolveGate(g, false, note()); });
      el.querySelector('[data-ok]') && (el.querySelector('[data-ok]').onclick = () => {
        if (needNote && !note()) { $('#gate-note', el).classList.add('shake'); setTimeout(() => $('#gate-note', el).classList.remove('shake'), 500); return toast('Write the reasoning down — this gate requires it', 'warn', 'pen'); }
        if (g.gate === 'G7') return pinPad(g, note());
        if (g.gate === 'G8') return udinFlow(g, note());
        resolveGate(g, true, note());
      });
    }
  });
}
function resolveGate(g, ok, note) {
  const verb = ok ? 'approved' : 'rejected';
  if (g.src === 'ob' || g.ob) {
    const o = STATE.obligations.find(x => x.id === (g.ob || g.id.replace('ob:', '')));
    if (o) {
      if (!ok) o.state = 'preparing';
      else if (g.gate === 'G6') o.state = o.mode === 'int' ? 'closed' : 'sign';
      else if (g.gate === 'G7') { o.state = o.mode === 'int' ? 'closed' : 'filed'; o.filedAt = new Date().toISOString(); }
      if (ok && g.gate === 'G7') { const c = clientById(o.client); if (o.mode === 'api') setTimeout(() => { if (o.state === 'filed') { o.state = 'closed'; o.ack = (o.d === 'GST' ? 'AA36' : 'ACK') + String(Math.floor(Math.random() * 1e12)).padStart(12, '0'); ledgerAdd({ actor: 'FL-1', kind: 'agent', action: `captured acknowledgement ${o.ack} · client told automatically`, client: o.client, obj: o.form + ' · ' + o.period }); save(); toast(`FL-1: ${o.form} for ${c.short} acknowledged — ${o.ack}`, 'ok', 'check'); updateCounts(); } }, 5000); }
    }
  } else {
    const it = STATE.gates.find(x => x.id === g.id);
    Object.assign(it, { status: verb, by: me().id, at: new Date().toISOString(), note });
    if (ok && g.ext) { const its = extAffected(g.ext); its.forEach(o => { o.redated = o.due; o.due = new Date(g.ext.to + 'T17:00:00').toISOString(); }); it.redatedCount = its.length; (STATE.ruleLog = STATE.ruleLog || []).push({ at: new Date().toISOString(), title: g.title, n: its.length, by: me().id }); ledgerAdd({ actor: 'system', kind: 'code', action: `re-dated ${its.length} obligations from ${fmtD(g.ext.from + 'T00:00:00')} to ${fmtD(g.ext.to + 'T00:00:00')} under rulebook 2026.10.3`, obj: 'Rulebook' }); setTimeout(() => toast(`${its.length} obligations re-dated automatically`, 'code', 'refresh'), 600); }
    if (ok && g.gate === 'G13' && g.newClient) { STATE.newClients.push({ id: 'n' + Date.now().toString(36), name: g.newClient, short: g.newClient.split(' ').slice(0, 2).join(' '), type: 'Private company', pan: 'AAMCR' + Math.floor(1000 + Math.random() * 8999) + 'K', state: 'AP', city: 'Kurnool', tags: ['co', 'gstm', 'tds', 'saudit', 'taudit', 'einv'], partner: me().id, manager: 'farhan', team: ['lavanya'], turnover: 380000000, fee: g.amount, lang: 'Telugu-English', channel: 'Email', risk: 'Medium', health: 80, since: TODAY.getFullYear(), contact: 'Managing director', books: 'Tally Prime (desktop)' }); }
    if (ok && g.gate === 'G9') { const inv = STATE.invoices.find(i => i.client === g.client && i.status.startsWith('Draft')); if (inv) { inv.status = 'Sent'; inv.date = new Date().toISOString(); } }
  }
  ledgerAdd({ actor: me().id, kind: 'human', action: `${verb} at ${g.gate} — ${g.title}${note ? ` · “${note}”` : ''}`, client: g.client, obj: g.title });
  save(); closeModal(true); closeSheet();
  toast(`${g.gate} ${verb} · ${g.title}`, ok ? 'gate' : 'warn', ok ? 'stamp' : 'undo');
  updateCounts(); rerender();
}
function pinPad(g, note) {
  let pin = '';
  const m = openModal({
    html: `<div class="modal-b" style="text-align:center"><div class="upper muted">G7 · the signature</div><h2>Enter your DSC PIN</h2><p class="small dim">${esc(g.title)} · ${esc(clientById(g.client)?.name || '')}</p>
      <div class="pin-dots" id="dots">${[...Array(6)].map(() => '<i></i>').join('')}</div>
      <div class="pinpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div>
      <p class="tiny muted mt16">${icon('lock').replace('<svg', '<svg width="12" height="12"')} Held in memory for seconds and never stored. Nothing automated can reach this screen.</p>
      <button class="btn ghost sm mt8" data-x>Cancel</button></div>`,
    onMount: el => {
      const draw = () => $$('#dots i', el).forEach((d, i) => d.classList.toggle('on', i < pin.length));
      const press = k => {
        if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 6) pin += k;
        draw();
        if (pin.length === 6) setTimeout(() => {
          el.querySelector('.modal-b').innerHTML = `<div class="upper muted">Signed</div><div class="seal-anim">SIGNED<br>DSC<br>${esc(me().short.toUpperCase())}</div><p class="small dim">PIN discarded. Signature applied to the payload; ${['api'].includes(STATE.obligations.find(o => 'ob:' + o.id === g.id)?.mode) ? 'submitting by interface — FL-1 will wait for the acknowledgement.' : 'the pack is ready for filing.'}</p>`;
          pin = '';
          setTimeout(() => resolveGate(g, true, note), 1300);
        }, 150);
      };
      $$('[data-k]', el).forEach(b => b.onclick = () => press(b.dataset.k));
      el.querySelector('[data-x]').onclick = () => { pin = ''; closeModal(); };
      el._key = e => { if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') press('⌫'); };
      document.addEventListener('keydown', el._key);
      const obs = new MutationObserver(() => { if (!document.body.contains(el)) { document.removeEventListener('keydown', el._key); obs.disconnect(); } });
      obs.observe(document.body, { childList: true });
    }
  });
}
function udinFlow(g, note) {
  const mno = me().mno || '000000';
  const udin = String(TODAY.getFullYear()).slice(2) + mno + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('') + String(Math.floor(1000 + Math.random() * 8999));
  openModal({
    html: `<div class="modal-b"><div class="upper muted">G8 · human-started</div><h2>Generate UDIN</h2><p class="small dim">ICAI requires the member to generate the UDIN personally. CA Firm OS has prepared every field; you start it.</p>
      <dl class="kv mt12"><dt>Member</dt><dd>${esc(me().name)} · M.No ${esc(mno)}</dd><dt>Document</dt><dd>${esc(g.title)}</dd><dt>Client</dt><dd>${esc(clientById(g.client)?.name || '')}</dd><dt>Key figures</dt><dd>Prepared from the signed report</dd></dl>
      <div id="udin-out" class="mt16"></div>
      <div class="flex mt16" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn gate" data-go>${icon('globe')} Open ICAI UDIN portal &amp; generate</button></div></div>`,
    onMount: el => {
      el.querySelector('[data-x]').onclick = () => closeModal();
      el.querySelector('[data-go]').onclick = e => {
        e.target.disabled = true; $('#udin-out', el).innerHTML = `<div class="pipe"><span class="ps run">OTP to member's mobile</span></div>`;
        setTimeout(() => { $('#udin-out', el).innerHTML = `<div class="callout gate"><div><div class="tiny upper">UDIN generated by ${esc(me().short)}</div><div class="mono" style="font-size:20px;letter-spacing:.06em;margin-top:4px">${udin}</div><div class="tiny">Recorded against the report. FL-1 will check it appears on the filed form.</div></div></div>`; e.target.outerHTML = `<button class="btn gate" data-done>${icon('check')} Record &amp; close</button>`; el.querySelector('[data-done]').onclick = () => resolveGate(g, true, (note ? note + ' · ' : '') + 'UDIN ' + udin); }, 1400);
      };
    }
  });
}


/* ============ added in the owner's review: tasks, morning brief ============ */
function tasksCard() {
  const mine = STATE.tasks.filter(x => x.who === me().id && !x.done).sort((a, b) => a.due.localeCompare(b.due));
  const given = STATE.tasks.filter(x => x.by === me().id && x.who !== me().id && !x.done);
  return `<div class="card"><div class="card-h"><h3>Tasks<small>Non-statutory work — calls, files, quotes, errands. Logged like everything else.</small></h3><div class="right"><button class="btn sm" id="add-task">${icon('plus')} Task</button></div></div>
    <div class="list">${mine.map(x => `<div class="row"><input type="checkbox" data-done="${x.id}" style="width:19px;height:19px;accent-color:var(--ok)"><div class="grow"><div class="t1">${esc(x.title)}</div><div class="t2">${x.client ? esc(clientById(x.client)?.short) + ' · ' : ''}from ${esc(actorName(x.by))}</div></div>${dueChip(x.due)}</div>`).join('') || '<div class="empty small" style="padding:18px">No tasks for you.</div>'}
    ${given.length ? `<div class="row" style="min-height:40px;background:var(--card-2)"><span class="tiny upper muted">You asked others · ${given.length}</span><span class="small muted" style="margin-left:auto">${given.map(x => esc(actorName(x.who))).join(', ')}</span></div>` : ''}</div></div>`;
}
function bindTasks(el) {
  $$('[data-done]', el).forEach(c => c.onchange = () => { const x = STATE.tasks.find(k => k.id === c.dataset.done); x.done = true; ledgerAdd({ actor: me().id, kind: 'human', action: `completed task — ${x.title}`, client: x.client, obj: 'Tasks' }); save(); toast('Task done — written to the Daybook', 'ok'); setTimeout(rerender, 350); });
  const b = $('#add-task', el); if (b) b.onclick = () => openTaskModal();;
}
function openBrief() {
  const since = new Date(TODAY.getTime() - 864e5); since.setHours(18, 0, 0, 0);
  const L = STATE.ledger.filter(r => new Date(r.at) >= since && canSeeClient(r.client));
  const threads = STATE.threads.filter(t => canSeeClient(t.client));
  const routed = threads.flatMap(t => t.msgs.filter(m => m.from === 'route' && new Date(m.at) >= since).map(m => ({ t, m })));
  const answered = threads.flatMap(t => t.msgs.filter(m => m.from === 'agent' && new Date(m.at) >= since)).length;
  const q = gateQueue().filter(g => gateAllowed(g).ok);
  const late = STATE.obligations.filter(o => canSeeClient(o.client) && !['closed', 'filed'].includes(o.state) && daysTo(o.due) < 0);
  const notices = STATE.notices.filter(n => canSeeClient(n.client) && n.stage !== 'Replied' && daysTo(n.buffer) <= 3);
  const today = STATE.obligations.filter(o => canSeeClient(o.client) && o.state !== 'closed' && daysTo(o.due) <= 1 && daysTo(o.due) >= 0);
  const tasks = STATE.tasks.filter(x => x.who === me().id && !x.done && daysTo(x.due) <= 0);
  const sec = (title, cls, items) => items.length ? `<div class="card mt12"><div class="card-h"><span class="dot" style="background:var(--${cls})"></span><h3>${title}</h3><div class="right"><span class="chip outline num">${items.length}</span></div></div><div class="list">${items.join('')}</div></div>` : '';
  openSheet({
    title: `${new Date().getHours() < 12 ? 'Good morning' : 'Your brief'}, ${esc(me().short)}`, sub: `Written by CL-1 and FO-2 from the record since 6 pm yesterday · ${L.length} lines read`, wide: true,
    body: `<p class="serif" style="font-size:18px;line-height:1.55;margin:0">Overnight, clients sent messages on WhatsApp and email; CL-1 answered <b>${answered}</b> from stored facts and routed <b>${routed.length}</b> to people. You have <b>${q.length}</b> decisions at your gates, <b>${late.length}</b> obligations past due and <b>${notices.length}</b> notice buffers within three days.</p>
      ${sec('Same-day statutory risk', 'bad', late.slice(0, 5).map(o => obRow(o)))}
      ${sec('Notices with a buffer date this week', 'bad', notices.map(n => `<div class="row"><div class="grow"><div class="t1">${esc(n.type)} · ${esc(clientById(n.client).short)}</div><div class="t2">${esc(n.stage)}</div></div>${dueChip(n.buffer)}</div>`))}
      ${sec('Waiting on your gates', 'gate', q.slice(0, 6).map(g => gateRow(g)))}
      ${sec('Due today or tomorrow', 'warn', today.slice(0, 6).map(o => obRow(o)))}
      ${sec('Client questions routed to people', 'client', routed.slice(0, 5).map(({ t, m }) => `<div class="row"><span class="glyph client sm"></span><div class="grow"><div class="t1">${esc(clientById(t.client).short)}</div><div class="t2">${esc(m.text)}</div></div></div>`))}
      ${sec('Your tasks for today', 'ok', tasks.map(x => `<div class="row"><div class="grow"><div class="t1">${esc(x.title)}</div></div>${dueChip(x.due)}</div>`))}`,
    foot: `<label class="flex small" style="margin-right:auto;gap:8px"><label class="switch"><input type="checkbox" checked id="brief-wa"><span></span></label>Also send to my WhatsApp at 09:00</label><button class="btn primary" data-x>Start the day</button>`,
    onMount: s => { bindGateRows(s); bindObRows(s); s.querySelector('[data-x]').onclick = () => closeSheet(); $('#brief-wa', s).onchange = e => toast(e.target.checked ? 'Brief will arrive on WhatsApp at 09:00' : 'WhatsApp brief off', 'agent', 'chat'); }
  });
}

function openTaskModal() {
    const vc = visibleClients().filter(c => !c.internal);
    openModal({ html: `<div class="modal-b"><h2>New task</h2><div class="field"><label>What</label><input class="input" id="tk-t" placeholder="e.g. Collect signed engagement letter"></div><div class="grid g2"><div class="field"><label>For</label><select class="input" id="tk-w">${TEAM.map(p => `<option value="${p.id}" ${p.id === me().id ? 'selected' : ''}>${esc(p.short)}</option>`).join('')}</select></div><div class="field"><label>Due</label><input type="date" class="input" id="tk-d" value="${dayKey(new Date(TODAY.getTime() + 864e5))}"></div></div><div class="field"><label>Client (optional)</label><select class="input" id="tk-c"><option value="">Firm-wide</option>${vc.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div><div class="flex" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-ok>Add task</button></div></div>`,
      onMount: m => { $('#tk-t', m).focus(); m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-ok]').onclick = () => { const title = $('#tk-t', m).value.trim(); if (!title) return $('#tk-t', m).classList.add('shake'); const x = { id: 'tk' + Date.now(), title, client: $('#tk-c', m).value || null, who: $('#tk-w', m).value, by: me().id, due: new Date($('#tk-d', m).value + 'T17:00:00').toISOString(), done: false }; STATE.tasks.push(x); ledgerAdd({ actor: me().id, kind: 'human', action: `assigned task to ${actorName(x.who)} — ${title}`, client: x.client, obj: 'Tasks' }); save(); closeModal(); toast(x.who === me().id ? 'Task added' : `Task sent to ${actorName(x.who)}`, 'ok', 'plus'); rerender(); }; } });
}
