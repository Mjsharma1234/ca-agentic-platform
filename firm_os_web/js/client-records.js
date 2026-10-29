/* CA Firm OS — each client's records, shared by the firm's client page and the client portal:
   the year's calendar (due / filed / late), every filing filed, every document, and the filings the firm handles. */

const TL_INDEX = {};
const TL_CACHE = {};
let CCAL = {}, FLF = {}, DOCF = {};

function fyBounds(d = TODAY) { const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return [new Date(y, 3, 1), new Date(y + 1, 2, 31, 23, 59)]; }

/* History (1 April → the live window) and the rest of the year (live window → 31 March), generated from the same rules. */
function timelineOb(c, f, due, period, kind) {
  const id = 'ob-' + fnv(c.id + f.id + period + due.toISOString()).slice(0, 7);
  const r = seeded(id);
  const team = c.team.length ? c.team : [c.manager];
  const prep = pick(team, r);
  const n = Math.floor(r() * 4) + 3;
  const o = { id, client: c.id, fid: f.id, form: f.f, name: f.n, d: f.d, mode: f.m, due: due.toISOString(), period, prep, rev: c.manager === prep ? c.partner : c.manager, partner: c.partner, docs: [n, kind === 'past' ? n : 0], touchless: r() < 0.78, amount: f.d === 'GST' || f.d === 'TDS' ? Math.round((c.turnover || 2e7) * (0.002 + r() * 0.006) / 100) * 100 : 0, gen: kind };
  if (kind === 'past') {
    const late = r() < 0.05; const shift = late ? 1 + Math.floor(r() * 5) : -Math.floor(r() * 6);
    o.state = 'closed'; o.filedOn = new Date(due.getTime() + shift * 864e5).toISOString(); o.lateBy = late ? shift : 0;
    o.ack = (f.d === 'GST' ? 'AA' + (c.gstin || '36').slice(0, 2) : f.d === 'ROC' || f.d === 'LLP' ? 'SRN-' : 'ACK') + String(Math.floor(r() * 1e12)).padStart(12, '0');
  } else o.state = 'scheduled';
  return o;
}
function clientTimeline(cid) {
  const c = clientById(cid); if (!c) return [];
  if (!TL_CACHE[cid]) {
    const [fs, fe] = fyBounds();
    const liveS = new Date(TODAY.getTime() - 26 * 864e5), liveE = new Date(TODAY.getTime() + 45 * 864e5);
    const gen = [];
    CATALOGUE.filter(f => f.rule && f.m !== 'int' && applies(f, c)).forEach(f => {
      dueDatesInWindow(f.rule, fs, new Date(liveS.getTime() - 1)).forEach(({ due, period }) => gen.push(timelineOb(c, f, due, period, 'past')));
      dueDatesInWindow(f.rule, new Date(liveE.getTime() + 1), fe).forEach(({ due, period }) => gen.push(timelineOb(c, f, due, period, 'future')));
    });
    TL_CACHE[cid] = gen;
  }
  const live = STATE.obligations.filter(o => o.client === cid && o.mode !== 'int');
  const all = [...TL_CACHE[cid], ...live].sort((a, b) => a.due.localeCompare(b.due));
  all.forEach(o => { TL_INDEX[o.id] = o; });
  return all;
}
const isFiled = o => o.state === 'closed';
const isLate = o => !['closed', 'filed'].includes(o.state) && daysTo(o.due) < 0;
const filedOn = o => o.filedOn || o.filedAt || new Date(new Date(o.due).getTime() - 864e5).toISOString();
const recTone = o => isFiled(o) ? 'filed' : isLate(o) ? 'bad' : o.state === 'filed' ? 'code' : o.state === 'scheduled' ? 'sched' : stateOf(o.state).h;
function recStatus(o, mode) {
  if (isFiled(o)) return `<span class="chip ok">${icon('check')}Filed ${fmtD(filedOn(o))}</span>${o.lateBy ? ` <span class="chip warn">${o.lateBy} day${o.lateBy > 1 ? 's' : ''} late</span>` : ''}`;
  if (isLate(o)) return `<span class="chip bad">${icon('alert')}Overdue · ${-daysTo(o.due)} day${daysTo(o.due) === -1 ? '' : 's'}</span>`;
  if (mode === 'portal') return pState(o.state);
  return stateChip(o.state);
}

/* ---------- 1. the client's calendar ---------- */
function clientCalendar(c, mode) {
  const tl = clientTimeline(c.id);
  const st = CCAL[c.id] = CCAL[c.id] || { y: TODAY.getFullYear(), m: TODAY.getMonth() };
  const [fs] = fyBounds();
  const months = [...Array(12)].map((_, i) => new Date(fs.getFullYear(), 3 + i, 1));
  const inM = (o, d) => { const x = asDate(o.due); return x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear(); };
  const first = new Date(st.y, st.m, 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = [...Array(42)].map((_, i) => new Date(start.getTime() + i * 864e5));
  const mItems = tl.filter(o => inM(o, first));
  const f = mItems.filter(isFiled).length, l = mItems.filter(isLate).length;
  const fyFiled = tl.filter(o => isFiled(o)).length, fyLate = tl.filter(isLate).length, fyOpen = tl.length - fyFiled;
  const label = (t => mode === 'portal' ? { filed: 'Filed', bad: 'Overdue', client: 'Needs you', agent: 'Being prepared', gate: 'With a reviewer / partner', code: 'Submitted', sched: 'Scheduled' }[t] : { filed: 'Filed', bad: 'Overdue', client: 'Waiting on client', agent: 'On autopilot', gate: 'At a gate', code: 'Awaiting ack', sched: 'Scheduled' }[t]);
  return `<div class="card mb16"><div class="card-h"><h3>${fyOf(fs)} at a glance<small>${fyFiled} filed · ${fyOpen} still to come${fyLate ? ` · <span style="color:var(--bad-ink)">${fyLate} overdue</span>` : ''} — tap a month</small></h3></div>
    <div class="card-b"><div class="yr">${months.map(d => { const its = tl.filter(o => inM(o, d)); const fi = its.filter(isFiled).length, la = its.filter(isLate).length, op = its.length - fi - la; const cur = d.getMonth() === st.m && d.getFullYear() === st.y; return `<button class="yr-m ${cur ? 'on' : ''} ${d.getMonth() === TODAY.getMonth() && d.getFullYear() === TODAY.getFullYear() ? 'now' : ''}" data-ccm="${d.getFullYear()}-${d.getMonth()}"><b>${MON[d.getMonth()]}</b><span class="stack" style="height:6px">${fi ? `<i style="flex:${fi};background:var(--ok)"></i>` : ''}${la ? `<i style="flex:${la};background:var(--bad)"></i>` : ''}${op ? `<i style="flex:${op};background:var(--line-2)"></i>` : ''}</span><span class="tiny muted num">${fi}/${its.length}</span></button>`; }).join('')}</div></div></div>
  <div class="cc-wrap">
    <div class="card"><div class="card-h"><div class="seg"><button data-ccnav="-1" aria-label="Previous month">${icon('chevL').replace('<svg', '<svg width="16" height="16"')}</button><button data-ccnav="0">Today</button><button data-ccnav="1" aria-label="Next month">${icon('chev').replace('<svg', '<svg width="16" height="16"')}</button></div><h3 style="margin-left:6px">${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][st.m]} ${st.y}<small>${mItems.length} due · ${f} filed${l ? ` · ${l} overdue` : ''}</small></h3></div>
      <div class="card-b"><div class="cal cc">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('')}
        ${cells.map(d => { const its = tl.filter(o => dayKey(o.due) === dayKey(d)); const out = d.getMonth() !== st.m; return `<div class="day ${out ? 'out' : ''} ${dayKey(d) === dayKey(TODAY) ? 'today' : ''} ${isPeak(d) ? 'peak' : ''}"><div class="dn"><b>${d.getDate()}</b></div>${its.slice(0, 3).map(o => `<button class="pill rp-${recTone(o)} ${txOf(o.d)}" data-cob="${o.id}" title="${esc(o.name)} · ${esc(o.period)} · ${label(recTone(o))}"><span>${esc(o.form)}</span><b>${isFiled(o) ? '✓' : isLate(o) ? '!' : ''}</b></button>`).join('')}${its.length > 3 ? `<div class="more">+${its.length - 3} more</div>` : ''}${its.length ? `<div class="heat">${its.slice(0, 6).map(o => `<i class="dot rd-${recTone(o)}"></i>`).join('')}</div>` : ''}</div>`; }).join('')}
      </div>
      <div class="legend mt12">${['filed', 'bad', 'client', 'agent', 'gate', 'sched'].map(t => `<span><i class="sw rd-${t}"></i>${label(t)}</span>`).join('')}</div></div></div>
    <div class="card"><div class="card-h"><h3>Due in ${MON[st.m]} ${st.y}</h3></div><div class="list">${mItems.map(o => `<button class="row click rrow" data-cob="${o.id}"><div class="cc-date"><b>${asDate(o.due).getDate()}</b><span>${DOW[asDate(o.due).getDay()]}</span></div><div class="grow"><div class="flex" style="gap:6px">${formChip(o.form, o.d)}<span class="t2">${esc(o.period)}</span></div><div class="t1 mt8" style="white-space:normal;font-weight:500">${esc(o.name)}</div><div class="mt8">${recStatus(o, mode)}</div>${o.ack && isFiled(o) ? `<div class="tiny muted mono mt8">${esc(o.ack)}</div>` : ''}</div></button>`).join('') || '<div class="empty small">Nothing due this month.</div>'}</div></div>
  </div>`;
}

/* ---------- 2. filings filed ---------- */
function filedList(c, mode) {
  const all = clientTimeline(c.id).filter(o => isFiled(o) && o.ack).sort((a, b) => filedOn(b).localeCompare(filedOn(a)));
  const doms = [...new Set(all.map(o => o.d))];
  const fd = FLF[c.id] || 'all';
  const list = all.filter(o => fd === 'all' || o.d === fd);
  const late = all.filter(o => o.lateBy).length;
  return `<div class="grid g4 mb16">
      <div class="card kpi accent-ok"><div class="label">Filed this year</div><div class="value">${all.length}</div><div class="foot">${fyOf(TODAY)}</div></div>
      <div class="card kpi accent-ok"><div class="label">On time</div><div class="value">${all.length - late}</div><div class="foot">${all.length ? Math.round(100 * (all.length - late) / all.length) : 100}% of filings</div></div>
      <div class="card kpi ${late ? 'accent-warn' : 'accent-ok'}"><div class="label">Filed late</div><div class="value">${late}</div><div class="foot">${late ? 'Late fee & interest computed by the engine' : 'No late fees this year'}</div></div>
      <div class="card kpi"><div class="label">Last filed</div><div class="value" style="font-size:20px">${all[0] ? esc(all[0].form) : '—'}</div><div class="foot">${all[0] ? fmtDY(filedOn(all[0])) : ''}</div></div>
    </div>
    <div class="flex wrap mb12" style="gap:6px">${[['all', 'All', all.length], ...doms.map(d => [d, DOMAINS[d].name, all.filter(o => o.d === d).length])].map(([k, n, ct]) => `<button class="fchip ${fd === k ? 'on' : ''}" data-flf="${k}">${k !== 'all' ? `<i class="swatch ${txOf(k)}"></i>` : ''}${n} <span class="mono">${ct}</span></button>`).join('')}</div>
    <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Filing</th><th>Period</th><th>Due</th><th>Filed on</th><th>Reference</th><th>Status</th>${mode === 'firm' ? '<th>Signed by</th>' : ''}<th></th></tr></thead><tbody>
    ${list.map(o => `<tr><td><div class="flex">${formChip(o.form, o.d)}<span class="small">${esc(o.name)}</span></div></td><td class="small">${esc(o.period)}</td><td class="small num">${fmtD(o.due)}</td><td class="small num">${fmtDY(filedOn(o))}</td><td class="mono small">${esc(o.ack)}</td><td>${o.lateBy ? `<span class="chip warn">${o.lateBy} day${o.lateBy > 1 ? 's' : ''} late</span>` : '<span class="chip ok">On time</span>'}</td>${mode === 'firm' ? `<td><span class="flex">${avatar(o.partner, 'sm')}<span class="small">${esc(actorName(o.partner))}</span></span></td>` : ''}<td><button class="btn xs" data-ack="${o.id}">${icon('eye')}Acknowledgement</button></td></tr>`).join('') || `<tr><td colspan="8"><div class="empty small">Nothing filed yet${fd !== 'all' ? ' under this law' : ''}.</div></td></tr>`}
    </tbody></table></div></div>`;
}

/* ---------- 3. every document ---------- */
function clientDocs(c, mode) {
  const vault = STATE.docs.filter(d => d.client === c.id).map(d => ({ id: d.id, name: d.name, type: d.cls, period: d.period, from: d.ch === 'Client portal' ? (mode === 'portal' ? 'You · portal' : 'Client · portal') : d.ch, at: d.at, grp: 'in', status: d.status, doc: d }));
  const acks = clientTimeline(c.id).filter(o => isFiled(o) && o.ack).map(o => ({ id: o.id, name: `Acknowledgement — ${o.form} · ${o.period}.pdf`, type: 'Acknowledgement', period: o.period, from: FIRM.name, at: filedOn(o), grp: 'ack', ack: o.id }));
  const firm = [...STATE.invoices.filter(i => i.client === c.id).map(i => ({ id: i.no, name: `Invoice ${i.no}.pdf`, type: 'Fee invoice', period: fmtD(i.date), from: FIRM.name, at: i.date, grp: 'firm', status: i.status })),
    { id: 'el-' + c.id, name: `Engagement letter FY 2026-27.pdf`, type: 'Engagement letter', period: 'FY 2026-27', from: FIRM.name, at: new Date(TODAY.getFullYear(), 3, 8).toISOString(), grp: 'firm', status: STATE.portalDone[c.id + ':el'] ? 'E-signed' : 'Awaiting e-sign' }];
  const all = [...vault, ...acks, ...firm].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const fl = DOCF[c.id] || { g: 'all', q: '' };
  const list = all.filter(d => (fl.g === 'all' || d.grp === fl.g) && (!fl.q || (d.name + ' ' + d.type + ' ' + d.period).toLowerCase().includes(fl.q.toLowerCase())));
  const groups = [['all', 'All'], ['in', mode === 'portal' ? 'Sent by you' : 'From the client'], ['ack', 'Acknowledgements'], ['firm', mode === 'portal' ? 'From your CA' : 'From the firm']];
  const stat = d => d.grp === 'ack' ? '<span class="chip ok">' + icon('check') + 'Filed</span>' : d.grp === 'firm' ? `<span class="chip ${/Paid|signed/i.test(d.status) ? 'ok' : /Overdue/.test(d.status) ? 'bad' : 'outline'}">${esc(d.status)}</span>` : d.status === 'G2' ? `<span class="chip ${mode === 'portal' ? 'client' : 'gate'}">${mode === 'portal' ? 'Unclear — please re-send' : 'G2 · confirm'}</span>` : /CL-2/.test(d.status) ? '<span class="chip gate">Notice · partner</span>' : '<span class="chip ok">' + icon('check') + 'Received & read</span>';
  return `<div class="flex wrap mb12" style="gap:10px"><div class="seg">${groups.map(([k, n]) => `<button class="${fl.g === k ? 'on' : ''}" data-docf="${k}">${n} <span class="n">${all.filter(d => k === 'all' || d.grp === k).length}</span></button>`).join('')}</div><input class="input" id="docq-${c.id}" data-docq placeholder="Search documents…" value="${esc(fl.q)}" style="max-width:240px;height:36px"><span class="small muted" style="margin-left:auto">${list.length} documents</span></div>
    <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Document</th><th>Type</th><th>Period</th><th>From</th><th>Date</th><th>Status</th></tr></thead><tbody>
    ${list.slice(0, 200).map(d => `<tr class="click" ${d.ack ? `data-ack="${d.ack}"` : d.doc && mode === 'firm' ? `data-doc="${d.id}"` : ''}><td><div class="flex"><span class="glyph ${d.grp === 'in' ? 'client' : 'code'} sm" style="${d.grp === 'ack' ? 'background:var(--ok)' : ''}"></span><b class="small" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</b></div></td><td class="small">${esc(d.type)}</td><td class="small">${esc(d.period)}</td><td class="small">${esc(d.from)}</td><td class="small num">${fmtD(d.at)}</td><td>${stat(d)}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty small">No documents match.</div></td></tr>'}
    </tbody></table></div></div>`;
}

/* ---------- 4. the filings the firm handles for this client, and who handles each ---------- */
function scopePanel(c, mode) {
  const tl = clientTimeline(c.id);
  const enrolled = CATALOGUE.filter(f => applies(f, c));
  const rec = enrolled.filter(f => f.rule), ev = enrolled.filter(f => !f.rule);
  const doms = [...new Set(rec.map(f => f.d))];
  const who = f => { const its = tl.filter(o => o.fid === f.id); const cnt = {}; its.forEach(o => { if (o.prep) cnt[o.prep] = (cnt[o.prep] || 0) + 1; }); const p = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; return p ? p[0] : (c.team[0] || c.manager); };
  const row = f => { const its = tl.filter(o => o.fid === f.id); const next = its.filter(o => !isFiled(o) && daysTo(o.due) >= -40).sort((a, b) => a.due.localeCompare(b.due))[0]; const last = its.filter(isFiled).sort((a, b) => filedOn(b).localeCompare(filedOn(a)))[0]; const pr = who(f);
    return `<tr><td><div class="flex">${formChip(f.f, f.d)}<span class="small">${esc(f.n)}</span></div></td><td class="small">${esc(f.q)}</td><td>${next ? `<span class="small num">${fmtD(next.due)}</span> ${isLate(next) ? '<span class="chip bad">overdue</span>' : ''}` : '<span class="muted small">—</span>'}</td><td>${last ? `<span class="small num">${fmtD(filedOn(last))}</span>` : '<span class="muted small">—</span>'}</td><td class="num small">${its.filter(isFiled).length}</td>
      <td><span class="flex">${avatar(pr, 'sm')}<span class="small">${esc(actorName(pr))}</span></span></td>${mode === 'firm' ? `<td><span class="flex">${avatar(c.manager, 'sm')}<span class="small">${esc(actorName(c.manager))}</span></span></td>` : ''}<td><span class="flex">${avatar(c.partner, 'sm')}<span class="small">${esc(actorName(c.partner))}</span></span></td></tr>`; };
  return `<div class="callout ${mode === 'portal' ? 'client' : 'agent'} mb16">${icon('sparkle')}<div>${mode === 'portal' ? `${esc(FIRM.name)} handles <b>${rec.length} recurring filing types</b> for ${esc(c.short)}, and opens <b>${ev.length} more</b> automatically when the event happens (an allotment, a notice, a remittance, a director change). Your manager is <b>${esc(person(c.manager).name)}</b>; <b>${esc(person(c.partner).name)}</b> signs.` : `Enrolled from this client's profile: <b>${rec.length} recurring filing types</b> scheduled by the rulebook, plus <b>${ev.length} event-driven</b> types that open when their trigger occurs. Signing partner: <b>${esc(person(c.partner).name)}</b>.`}</div></div>
    ${doms.map(d => { const fs = rec.filter(f => f.d === d); return `<div class="card mb12"><div class="card-h"><i class="swatch lg ${txOf(d)}"></i><h3>${DOMAINS[d].name}<small>${DOMAINS[d].long} · ${fs.length} type${fs.length > 1 ? 's' : ''}</small></h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Filing</th><th>How often</th><th>Next due</th><th>Last filed</th><th>Filed this FY</th><th>Prepared by</th>${mode === 'firm' ? '<th>Reviewed by</th>' : ''}<th>Signed by</th></tr></thead><tbody>${fs.map(row).join('')}</tbody></table></div></div>`; }).join('')}
    <div class="card"><div class="card-h"><h3>Opens when it happens<small>Event-driven filings handled for ${esc(c.short)}</small></h3></div><div class="card-b"><div class="flex wrap" style="gap:6px">${ev.map(f => `<span class="dom ${txOf(f.d)}" title="${esc(f.n)} — ${esc(f.due)}"><i></i><b>${esc(f.f)}</b></span>`).join('')}</div></div></div>`;
}

/* ---------- interactions for all four panels ---------- */
function bindClientRecords(el, c, mode) {
  $$('[data-ccm]', el).forEach(b => b.onclick = () => { const [y, m] = b.dataset.ccm.split('-').map(Number); CCAL[c.id] = { y, m }; rerender(); });
  $$('[data-ccnav]', el).forEach(b => b.onclick = () => { const n = +b.dataset.ccnav; const s = CCAL[c.id]; if (n === 0) CCAL[c.id] = { y: TODAY.getFullYear(), m: TODAY.getMonth() }; else { const d = new Date(s.y, s.m + n, 1); CCAL[c.id] = { y: d.getFullYear(), m: d.getMonth() }; } rerender(); });
  $$('[data-cob]', el).forEach(b => b.onclick = e => {
    e.stopPropagation(); const o = TL_INDEX[b.dataset.cob]; if (!o) return;
    if (isFiled(o) && o.ack) return openAck(o.id);
    if (mode === 'firm' && STATE.obligations.some(x => x.id === o.id)) return openObligation(o.id);
    toast(`${o.form} · ${o.period} — ${o.state === 'scheduled' ? 'scheduled; the request for papers goes out ' + fmtD(new Date(new Date(o.due).getTime() - 7 * 864e5)) : (mode === 'portal' ? P_WORDS[o.state][0] : stateOf(o.state).n)}`, 'code', 'calendar');
  });
  $$('[data-flf]', el).forEach(b => b.onclick = () => { FLF[c.id] = b.dataset.flf; rerender(); });
  $$('[data-docf]', el).forEach(b => b.onclick = () => { DOCF[c.id] = { ...(DOCF[c.id] || { q: '' }), g: b.dataset.docf }; rerender(); });
  $$('[data-docq]', el).forEach(q => q.oninput = () => { DOCF[c.id] = { ...(DOCF[c.id] || { g: 'all' }), q: q.value }; clearTimeout(q._t); q._t = setTimeout(() => { rerender(); const n = $('#docq-' + c.id); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
  $$('[data-ack]', el).forEach(b => b.onclick = () => openAck(b.dataset.ack));
  if (mode === 'firm') $$('[data-doc]', el).forEach(r => r.onclick = () => openDoc(r.dataset.doc));
}
