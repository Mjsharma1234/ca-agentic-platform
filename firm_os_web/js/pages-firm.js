/* Bahi — Team, Billing, DSC & credentials, Quality, Agents, Connectors, Rulebook, Record, Access, Coverage audit. */

/* ============ TEAM & CAPACITY ============ */
VIEWS.team = {
  render() {
    const open = STATE.obligations.filter(o => o.state !== 'closed');
    const days = [...Array(14)].map((_, i) => new Date(TODAY.getTime() + i * 864e5));
    const loadOf = (id, d) => open.filter(o => (o.prep === id || o.rev === id) && dayKey(o.due) === dayKey(d)).length;
    const partners = TEAM.filter(t => ['MP', 'PT'].includes(t.role));
    const showCost = can('team_cost');
    const st = s => /leave/i.test(s) ? 'warn' : /home|site/i.test(s) ? 'outline' : 'ok';
    return pageHead('Team & capacity · FO-1 forecasts; partners decide allocation', 'The people <em>behind the gates</em>', 'Workload against the people available, week by week — and, separately and more importantly, every partner\'s count of tax audit reports signed against the ceiling of 60, aggregated across every firm they belong to, counted on the date of signing.') + `
    <div class="grid g4 mb16">
      <div class="card kpi"><div class="label">Headcount</div><div class="value">${TEAM.length}</div><div class="foot">${TEAM.filter(t => t.role === 'AR').length} articles · ${TEAM.filter(t => ['MP', 'PT'].includes(t.role)).length} partners</div></div>
      <div class="card kpi accent-ok"><div class="label">In office today</div><div class="value">${TEAM.filter(t => /In office/.test(t.status)).length}</div><div class="foot">${TEAM.filter(t => /site/.test(t.status)).length} at client sites · ${TEAM.filter(t => /home/.test(t.status)).length} WFH</div></div>
      <div class="card kpi accent-warn"><div class="label">On leave</div><div class="value">${TEAM.filter(t => /leave/i.test(t.status)).length}</div><div class="foot">${STATE.leaves.filter(l => l.status === 'Pending').length} requests pending</div></div>
      <div class="card kpi accent-agent"><div class="label">Attendance</div><div class="value">Auto</div><div class="foot">From log-in & client-site check-ins</div></div>
    </div>
    <div class="grid g2 mb16">
      ${partners.map(p => { const total = p.signed + p.ceilingOther; const fc = Math.round(total * 1.18); return `<div class="card pad"><div class="flex">${avatar(p.id, 'lg')}<div style="flex:1"><b>${esc(p.name)}</b><div class="small muted">M.No ${p.mno} · tax audits signed this year</div></div><div class="ring sm" style="--p:${Math.round(100 * total / 60)};--c:var(--${total >= 54 ? 'bad' : total >= 45 ? 'warn' : 'ok'})"><b>${total}</b></div></div>
        <div class="mt12">${meter(100 * total / 60, total >= 54 ? 'bad' : total >= 45 ? 'warn' : 'ok', 100 * fc / 60 > 100 ? 99 : 100 * fc / 60)}</div>
        <div class="flex between tiny muted mt8"><span>${p.signed} here + ${p.ceilingOther} in other firms</span><span>forecast ${fc} · ceiling 60</span></div>
        ${fc > 55 ? `<div class="callout warn mt12" style="padding:9px 12px">${icon('alert')}<span class="small"><b>FO-1:</b> forecast ${fc} exceeds safe headroom. Reallocate ${fc - 52} reports now — discovered in September it is unfixable.</span></div>` : ''}</div>`; }).join('')}
    </div>
    <div class="card mb16"><div class="card-h"><h3>Who is loaded, the next 14 days<small>Obligations due where the person prepares or reviews · peak days striped</small></h3></div>
      <div class="card-b table-wrap"><table class="t" style="min-width:820px"><thead><tr><th>Person</th>${days.map(d => `<th class="r" style="${isPeak(d) ? 'color:var(--bad)' : ''}">${d.getDate()}<span class="sub">${DOW[d.getDay()][0]}</span></th>`).join('')}<th class="r">Total</th></tr></thead><tbody>
      ${TEAM.filter(t => !['FO'].includes(t.role)).map(t => { const ls = days.map(d => loadOf(t.id, d)); const tot = ls.reduce((a, b) => a + b, 0); return `<tr><td><div class="flex">${avatar(t.id, 'sm')}<span class="small" style="font-weight:600">${esc(t.short)}</span><span class="chip ${st(t.status)}" style="height:20px;font-size:10.5px">${esc(t.status.split(' ·')[0])}</span></div></td>${ls.map((n, i) => `<td class="r"><span style="display:inline-grid;place-items:center;width:26px;height:26px;border-radius:7px;font:600 11.5px var(--font-mono);background:${n ? `color-mix(in srgb, ${n > 4 ? 'var(--bad)' : n > 2 ? 'var(--warn)' : 'var(--ink-3)'} ${n > 2 ? Math.min(95, 40 + n * 10) : 14 + n * 10}%, transparent)` : 'transparent'};color:${n > 2 ? '#fff' : 'var(--ink-2)'}">${n || '·'}</span></td>`).join('')}<td class="r num"><b>${tot}</b></td></tr>`; }).join('')}
      </tbody></table></div></div>
    <div class="grid g-main">
      <div class="card"><div class="card-h"><h3>The team</h3><div class="right"><button class="btn xs" id="claim">${icon('rupee')} Claim expense</button>${isPartner() ? `<button class="btn xs" id="realloc">${icon('users')} Reallocate work</button><button class="btn xs primary" id="add-employee" style="margin-left:6px">${icon('plus')} Add employee / Issue ID</button>` : ''}</div></div><div class="list">${TEAM.map(t => { const prep = open.filter(o => o.prep === t.id).length, rev = open.filter(o => o.rev === t.id).length; const clients = Object.values(STATE.walls).filter(v => v.includes(t.id)).length; return `<div class="row">${avatar(t.id, 'lg')}<div class="grow"><div class="t1">${esc(t.name)} <span class="chip outline" style="margin-left:4px">${ROLES[t.role].short}</span></div><div class="t2">${esc(t.focus)} · ${(STATE.caps.all_clients || []).includes(t.role) ? 'all' : clients} clients · ${prep} preparing · ${rev} reviewing</div></div><span class="chip ${st(t.status)}">${esc(t.status)}</span>${showCost && t.cost ? `<span class="num small muted" style="width:90px;text-align:right">${inr(t.cost)}/mo</span>` : ''}</div>`; }).join('')}</div></div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>Attendance register · today<small>Captured from sign-in, VPN and client-site geo check-ins</small></h3></div><div class="list">${TEAM.map(p => `<div class="row" style="min-height:44px">${avatar(p.id, 'sm')}<div class="grow small"><b>${esc(p.short)}</b></div><span class="small ${/leave/i.test(p.status) ? '' : 'mono'}">${/leave/i.test(p.status) ? '<span class="chip warn">On leave</span>' : esc(CHECKINS[p.id] || '—')}</span></div>`).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>Leave requests</h3></div><div class="list">${STATE.leaves.map((l, i) => `<div class="row">${avatar(l.who, 'sm')}<div class="grow"><div class="t1">${esc(actorName(l.who))} · ${esc(l.kind)}</div><div class="t2">${fmtD(l.from)} – ${fmtD(l.to)}${l.clash ? ` · <span style="color:var(--bad-ink)">${esc(l.clash)}</span>` : ''}</div></div>${l.status === 'Pending' ? (['MP', 'PT', 'MG'].includes(me().role) ? `<button class="btn xs" data-lv="${i}" data-v="Declined">Decline</button><button class="btn xs ok" data-lv="${i}" data-v="Approved">Approve</button>` : '<span class="chip warn">Pending</span>') : `<span class="chip ${l.status === 'Approved' ? 'ok' : 'outline'}">${l.status}</span>`}</div>`).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>Articleship register<small>The principal's legal duty, tracked</small></h3></div><div class="list">${TEAM.filter(t => t.article).map(t => { const m = Math.max(0, Math.round((TODAY - new Date(t.article.start)) / (30.4 * 864e5))); return `<div class="row">${avatar(t.id, 'sm')}<div class="grow"><div class="t1">${esc(t.short)} · month ${m} of 36</div><div class="t2">${esc(t.article.reg)} · study leave ${t.article.study} d used${showCost ? ' · stipend ' + inr(t.article.stipend) : ''}</div>${meter(100 * m / 36, 'ink')}</div></div>`; }).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>CPE hours · members<small>Firm target 40 a year</small></h3></div><div class="card-b">${TEAM.filter(t => t.cpe != null).map(t => `<div class="mb8"><div class="flex between small"><span>${esc(t.short)}</span><span class="num">${t.cpe} / 40</span></div>${meter(100 * t.cpe / 40, t.cpe >= 40 ? 'ok' : t.cpe >= 25 ? 'ink' : 'warn')}</div>`).join('')}</div></div>
      </div>
    </div>`;
  },
  mount(el) {
    $$('[data-lv]', el).forEach(b => b.onclick = () => { const l = STATE.leaves[+b.dataset.lv]; l.status = b.dataset.v; ledgerAdd({ actor: me().id, kind: 'human', action: `${b.dataset.v.toLowerCase()} leave for ${actorName(l.who)}`, obj: 'Leave' }); save(); toast(`Leave ${b.dataset.v.toLowerCase()}`, 'ok'); rerender(); });
    const ra = $('#realloc', el); if (ra) ra.onclick = openRealloc;
    const ae = $('#add-employee', el); if (ae) ae.onclick = openAddEmployee;
    $('#claim', el).onclick = openExpenseClaim;
  }
};
function openAddEmployee() {
  openSheet({
    title: 'Onboard Staff & Issue Employee ID',
    sub: 'Partner Authority (SQC 1) · Generates unique firm ID, sets access boundaries, and seals into audit ledger.',
    wide: true,
    body: `
      <div class="card pad mb16">
        <div class="grid g2" style="gap:14px">
          <div>
            <label class="label">Full Name</label>
            <input class="input" id="emp-name" placeholder="e.g. CA Ananya Sharma" style="width:100%">
          </div>
          <div>
            <label class="label">Firm Role & Authority</label>
            <select class="input" id="emp-role" style="width:100%">
              <option value="AR">Article Trainee (AR) — Intake & prep</option>
              <option value="SA">Senior Assistant (SA) — Reconciliations</option>
              <option value="MG">Manager (MG) — G6 Four-Eyes review</option>
              <option value="PT">Partner (PT) — G7 DSC & G12 Filing</option>
              <option value="PX">Paid Assistant (PX)</option>
            </select>
          </div>
          <div>
            <label class="label">Official Email</label>
            <input class="input" id="emp-email" type="email" placeholder="ananya@nallamala.in" style="width:100%">
          </div>
          <div>
            <label class="label">Mobile Number</label>
            <input class="input" id="emp-phone" placeholder="9876543210" style="width:100%">
          </div>
          <div>
            <label class="label">ICAI Membership / Student Reg No.</label>
            <input class="input" id="emp-mno" placeholder="e.g. 298124 or SRO-049812" style="width:100%">
          </div>
          <div>
            <label class="label">Assigned Practice Focus</label>
            <input class="input" id="emp-focus" placeholder="e.g. GST & Rule 88D Reconciliations" style="width:100%">
          </div>
          <div>
            <label class="label">Monthly Cost / Stipend (₹)</label>
            <input class="input" id="emp-cost" type="number" value="15000" style="width:100%">
          </div>
        </div>
      </div>
      <div class="callout agent">
        ${icon('shield')}
        <div class="small"><b>ICAI SQC-1 Compliance:</b> Generating this ID automatically provisions role-based access control, restricts Article self-approvals, and writes a tamper-evident record into the firm's cryptographic audit chain.</div>
      </div>
    `,
    foot: `<button class="btn primary" id="btn-create-emp">${icon('check')} Issue Employee ID & Credentials</button>`,
    onMount: el => {
      const btn = el.querySelector('#btn-create-emp');
      if (btn) btn.onclick = async () => {
        const name = (el.querySelector('#emp-name').value || '').trim();
        const role = el.querySelector('#emp-role').value;
        const email = (el.querySelector('#emp-email').value || '').trim();
        const phone = (el.querySelector('#emp-phone').value || '').trim();
        const mno = (el.querySelector('#emp-mno').value || '').trim();
        const focus = (el.querySelector('#emp-focus').value || '').trim() || 'General Compliance';
        const cost = parseFloat(el.querySelector('#emp-cost').value) || 12000;

        if (!name || !email) {
          toast('Please enter staff name and email', 'warn');
          return;
        }

        btn.disabled = true;
        btn.innerHTML = 'Generating Credentials...';

        try {
          if (typeof API_CLIENT !== 'undefined' && API_CLIENT.createEmployee) {
            const res = await API_CLIENT.createEmployee({
              full_name: name,
              email: email,
              role: role,
              phone: phone,
              membership_no: mno,
              focus: focus,
              stipend_or_cost: cost
            });

            const empId = res.username || res.employee_id.toLowerCase();
            TEAM.push({
              id: empId,
              name: name,
              short: name.split(' ')[0],
              role: role,
              focus: focus,
              mno: mno,
              status: 'In office · Active',
              cost: cost
            });

            closeSheet();
            openSheet({
              title: 'Employee ID Provisioned',
              sub: 'Share these initial credentials securely with the team member.',
              wide: false,
              body: `
                <div class="card pad">
                  <div class="small muted mb8">SYSTEM EMPLOYEE ID</div>
                  <div class="mono" style="font-size:18px;font-weight:700;color:var(--accent)">${res.employee_id}</div>
                  <hr style="margin:12px 0;border:0;border-top:1px solid var(--border)">
                  <div class="grid g2" style="gap:10px;font-size:13px">
                    <div><b>Username:</b> <span class="mono">${res.username}</span></div>
                    <div><b>Role:</b> <span class="chip outline">${ROLES[role].short}</span></div>
                    <div><b>Temp Password:</b> <span class="mono" style="color:var(--ok)">${res.temporary_password}</span></div>
                    <div><b>ICAI / Reg:</b> <span>${res.membership_or_reg_no}</span></div>
                  </div>
                </div>
              `,
              foot: `<button class="btn primary" onclick="closeSheet();rerender();">Done</button>`
            });
            toast(`Staff ID ${res.employee_id} created`, 'ok', 'user-check');
            save();
            rerender();
          } else {
            const rand = Math.floor(1000 + Math.random() * 9000);
            const empId = 'emp_' + rand;
            TEAM.push({
              id: empId,
              name: name,
              short: name.split(' ')[0],
              role: role,
              focus: focus,
              mno: mno,
              status: 'In office · Active',
              cost: cost
            });
            closeSheet();
            toast(`Staff ID EMP-2026-${rand} created`, 'ok', 'user-check');
            save();
            rerender();
          }
        } catch (err) {
          btn.disabled = false;
          btn.innerHTML = 'Issue Employee ID & Credentials';
          toast(err.message || 'Failed to create employee', 'bad');
        }
      };
    }
  });
}
function openRealloc() {
  const open = STATE.obligations.filter(o => o.state !== 'closed' && daysTo(o.due) >= 0 && daysTo(o.due) <= 10 && ['awaiting', 'received', 'preparing'].includes(o.state));
  const onLeave = TEAM.filter(t => /leave/i.test(t.status)).map(t => t.id);
  const stuck = open.filter(o => onLeave.includes(o.prep));
  openSheet({
    title: 'Reallocate work', sub: 'FO-1 recommends; only a partner reassigns. Every move is recorded.', wide: true,
    body: `${stuck.length ? `<div class="callout warn mb16">${icon('alert')}<div><b>${stuck.length} obligations</b> sit with people on leave and fall due in the next 10 days.</div></div>` : ''}
      <div class="card"><div class="list">${(stuck.length ? stuck : open.slice(0, 8)).map(o => `<div class="row"><div class="grow"><div class="t1">${esc(o.form)} · ${esc(clientById(o.client).short)} · ${esc(o.period)}</div><div class="t2">now with ${esc(actorName(o.prep))} · due ${fmtD(o.due)}</div></div><select class="input" data-ro="${o.id}" style="height:34px;max-width:170px">${TEAM.filter(t => ['SA', 'AR', 'MG', 'PX'].includes(t.role) && !onLeave.includes(t.id)).map(t => `<option value="${t.id}" ${t.id === o.prep ? 'selected' : ''}>${esc(t.short)}</option>`).join('')}</select></div>`).join('')}</div></div>`,
    foot: `<button class="btn primary" data-ok>${icon('check')} Apply reassignments</button>`,
    onMount: el => el.querySelector('[data-ok]').onclick = () => { let n = 0; $$('[data-ro]', el).forEach(s => { const o = STATE.obligations.find(x => x.id === s.dataset.ro); if (o.prep !== s.value) { ledgerAdd({ actor: me().id, kind: 'human', action: `reassigned from ${actorName(o.prep)} to ${actorName(s.value)}`, client: o.client, obj: o.form + ' · ' + o.period }); o.prep = s.value; const w = STATE.walls[o.client]; if (!w.includes(s.value)) w.push(s.value); n++; } }); save(); closeSheet(); toast(`${n} obligation${n === 1 ? '' : 's'} reassigned`, 'ok', 'users'); rerender(); }
  });
}

/* ============ BILLING & RECOVERY ============ */
VIEWS.billing = {
  render() {
    const inv = STATE.invoices.filter(i => canSeeClient(i.client));
    const out = inv.filter(i => ['Sent', 'Overdue'].includes(i.status));
    const bucket = (a, b) => out.filter(i => i.age >= a && i.age <= b).reduce((s, i) => s + i.amt, 0);
    const buckets = [['0–30', bucket(0, 30), 'ok'], ['31–60', bucket(31, 60), 'agent'], ['61–90', bucket(61, 90), 'warn'], ['90+', bucket(91, 9999), 'bad']];
    const mx = Math.max(1, ...buckets.map(b => b[1]));
    const closed = STATE.obligations.filter(o => o.state === 'closed' && canSeeClient(o.client) && !clientById(o.client).internal);
    const unbilled = Object.entries(closed.reduce((m, o) => { m[o.client] = (m[o.client] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const prof = visibleClients().filter(c => !c.internal).map(c => { const eff = 20 + (c.tags.length * 9) + (parseInt(fnv(c.id), 16) % 90); return { c, eff, rate: c.fee / eff }; });
    const mxF = Math.max(...prof.map(p => p.c.fee)), mxE = Math.max(...prof.map(p => p.eff));
    return pageHead('Billing & recovery · FO-3 drafts; a partner reads every bill', 'Work that turns into <em>fees</em>', 'Completed obligations become itemised invoice lines with a narrative written from the record. Nothing reaches a client until a partner approves it (G9); reminders then run on their own; anything past 90 days goes to the partner personally.') + `
    <div class="grid g4 mb16">
      <div class="card kpi accent-agent"><div class="label">Unbilled completed work</div><div class="value">${closed.length}<small>obligations</small></div><div class="foot">FO-3 has drafts ready</div></div>
      <div class="card kpi accent-gate"><div class="label">Drafts at G9</div><div class="value">${inv.filter(i => i.status.startsWith('Draft')).length}</div></div>
      <div class="card kpi"><div class="label">Receivables</div><div class="value num" style="font-size:24px">${inrShort(out.reduce((s, i) => s + i.amt, 0))}</div></div>
      <div class="card kpi accent-bad"><div class="label">Over 90 days</div><div class="value num" style="font-size:24px">${inrShort(bucket(91, 9999))}</div><div class="foot">with the partner personally</div></div>
    </div>
    <div class="grid g-main">
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>Invoices</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Number</th><th>Client</th><th class="r">Amount</th><th>Status</th><th>Age</th><th></th></tr></thead><tbody>
        ${inv.map(i => `<tr><td class="mono small">${esc(i.no)}</td><td><b>${esc(clientById(i.client).short)}</b></td><td class="r num">${inr(i.amt)}</td><td><span class="chip ${i.status === 'Paid' ? 'ok' : i.status === 'Overdue' ? 'bad' : i.status.startsWith('Draft') ? 'gate' : 'client'}">${esc(i.status)}</span></td><td class="small">${i.status === 'Paid' ? '—' : i.status.startsWith('Draft') ? 'new' : i.age + ' d'}</td><td>${i.status.startsWith('Draft') ? `<button class="btn xs gate" data-g9="${i.client}">${icon('stamp')}Read & approve</button>` : ['Sent', 'Overdue'].includes(i.status) ? `<button class="btn xs" data-rem="${esc(i.no)}">${icon('send')}Remind</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div></div>
        <div class="card"><div class="card-h"><h3>Who quietly costs more than they pay<small>Fee against effort hours captured automatically from the record</small></h3></div><div class="card-b">
          <svg viewBox="0 0 600 260" style="width:100%;height:auto">
            <line x1="40" y1="230" x2="590" y2="230" stroke="var(--line-2)"/><line x1="40" y1="10" x2="40" y2="230" stroke="var(--line-2)"/>
            <line x1="40" y1="230" x2="590" y2="10" stroke="var(--line-2)" stroke-dasharray="4 4"/>
            <text x="590" y="250" text-anchor="end" font-size="11" fill="var(--ink-3)">effort hours →</text><text x="44" y="18" font-size="11" fill="var(--ink-3)">fee ↑</text>
            ${prof.map(p => { const x = 40 + 550 * p.eff / mxE, y = 230 - 220 * p.c.fee / mxF; const low = p.rate < 2500; return `<g><circle cx="${x}" cy="${y}" r="${low ? 7 : 5.5}" fill="var(--${low ? 'bad' : 'ok'})" fill-opacity=".85"><title>${esc(p.c.short)} · ${inr(p.c.fee)} / ${p.eff} h = ${inr(p.rate)}/h</title></circle>${low || p.c.fee > mxF * 0.5 ? `<text x="${x + 9}" y="${y + 4}" font-size="11" fill="var(--ink-2)">${esc(p.c.short)}</text>` : ''}</g>`; }).join('')}
          </svg>
          <div class="legend"><span><i class="sw" style="background:var(--ok)"></i>Earns above ₹2,500 / hour</span><span><i class="sw" style="background:var(--bad)"></i>Below — partner fee conversation</span></div>
        </div></div>
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card pad"><b>Receivables ageing</b><div class="bars mt8">${buckets.map(([l, v, c]) => `<div class="b"><em>${inrShort(v)}</em><i style="height:${8 + 120 * v / mx}px;background:var(--${c})"></i><span>${l} d</span></div>`).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>Completed, not yet invoiced</h3></div><div class="list">${unbilled.map(([cid, n]) => `<div class="row"><div class="grow"><div class="t1">${esc(clientById(cid).short)}</div><div class="t2">${n} obligations closed · narrative ready</div></div><button class="btn xs" data-draft="${cid}">${icon('plus')}Draft</button></div>`).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>Firm expenses & reimbursements<small>Rebillable costs flow onto the client's next invoice</small></h3><div class="right"><button class="btn xs" id="add-exp">${icon('plus')} Claim</button></div></div>
          <div class="list">${STATE.expenses.slice().reverse().map(x => `<div class="row">${avatar(x.who, 'sm')}<div class="grow"><div class="t1">${esc(x.what)}</div><div class="t2">${esc(actorName(x.who))}${x.client ? ' · ' + esc(clientById(x.client).short) : ''}${x.rebill ? ' · <b>rebill</b>' : ''}</div></div><span class="num small">${inr(x.amt)}</span>${x.status === 'Pending' && isPartner() ? `<button class="btn xs ok" data-exp="${x.id}">Approve</button>` : `<span class="chip ${x.status === 'Approved' ? 'ok' : 'outline'}">${x.status}</span>`}</div>`).join('')}</div></div>
        <div class="card pad"><b>Payment rails</b><p class="small muted">Every invoice carries a UPI / Razorpay link; payments reconcile to the receivable automatically and the client gets a receipt. Fee reminders run on the ladder in Client automations.</p></div>
      </div>
    </div>`;
  },
  mount(el) {
    $$('[data-g9]', el).forEach(b => b.onclick = () => { const g = STATE.gates.find(x => x.gate === 'G9' && x.client === b.dataset.g9 && x.status === 'pending'); if (g) openApproval(g.id); else { const inv = STATE.invoices.find(i => i.client === b.dataset.g9 && i.status.startsWith('Draft')); STATE.gates.push({ id: 'g9-' + Date.now(), gate: 'G9', title: `Approve invoice · ${clientById(b.dataset.g9).short} — ${inv.no}`, client: b.dataset.g9, amount: inv.amt, prep: 'FO-3', created: new Date().toISOString(), due: new Date(Date.now() + 2 * 864e5).toISOString(), status: 'pending', ev: ['Itemised from completed obligations in the record', 'Narrative drafted by FO-3; fee per engagement letter'] }); save(); openApproval(STATE.gates[STATE.gates.length - 1].id); } });
    $$('[data-rem]', el).forEach(b => b.onclick = () => { const i = STATE.invoices.find(x => x.no === b.dataset.rem); ledgerAdd({ actor: 'FO-3', kind: 'agent', action: `sent fee reminder for ${i.no}${i.age > 90 ? ' — escalated to partner' : ''}`, client: i.client, obj: 'Billing' }); save(); toast(i.age > 90 ? 'Over 90 days — the partner has been asked to call personally' : 'Reminder sent with UPI link', i.age > 90 ? 'warn' : 'client', 'send'); });
    $$('[data-exp]', el).forEach(b => b.onclick = () => { const x = STATE.expenses.find(e => e.id === b.dataset.exp); x.status = 'Approved'; ledgerAdd({ actor: me().id, kind: 'human', action: `approved reimbursement ${inr(x.amt)} to ${actorName(x.who)}${x.rebill ? ' — added to next invoice' : ''}`, client: x.client, obj: 'Expenses' }); save(); toast('Approved — payout in the next reimbursement run', 'ok'); rerender(); });
    $('#add-exp', el) && ($('#add-exp', el).onclick = openExpenseClaim);
    $$('[data-draft]', el).forEach(b => b.onclick = () => { const c = clientById(b.dataset.draft); const amt = Math.round(c.fee / 4 / 100) * 100 * 1.18; STATE.invoices.unshift({ no: 'NC/26-27/0' + (414 + STATE.invoices.length), client: c.id, amt, status: 'Draft — G9', date: new Date().toISOString(), age: 0 }); ledgerAdd({ actor: 'FO-3', kind: 'agent', action: `drafted itemised invoice ${inr(amt)} from completed work`, client: c.id, obj: 'Billing' }); save(); toast(`Draft invoice for ${c.short} waiting for a partner (G9)`, 'gate', 'stamp'); rerender(); });
  }
};

/* ============ DSC & CREDENTIALS ============ */
VIEWS.vault = {
  render() {
    const dscs = STATE.dscs.filter(d => !d.client || canSeeClient(d.client));
    const creds = CREDS.filter(c => canSeeClient(c.client));
    return pageHead('DSC & credentials · custody you can prove', 'Tokens, keys <em>and who held them</em>', 'Every digital signature token in the firm\'s custody, its expiry and where it is right now. Client portal credentials sit in an encrypted vault: masked by default, revealed only by a permitted role with a reason, hidden again in 20 seconds, and every reveal is a line in the record.') + `
    <div class="grid g4 mb16">
      <div class="card kpi"><div class="label">DSCs tracked</div><div class="value">${dscs.length}</div></div>
      <div class="card kpi accent-bad"><div class="label">Expired</div><div class="value">${dscs.filter(d => daysTo(d.expiry) < 0).length}</div></div>
      <div class="card kpi accent-warn"><div class="label">Expiring in 30 days</div><div class="value">${dscs.filter(d => daysTo(d.expiry) >= 0 && daysTo(d.expiry) <= 30).length}</div><div class="foot">clients alerted automatically</div></div>
      <div class="card kpi accent-client"><div class="label">Out of the safe</div><div class="value">${dscs.filter(d => d.out).length}</div></div>
    </div>
    <div class="card mb16"><div class="card-h"><h3>DSC register</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Holder</th><th>Client</th><th>Class</th><th>Expiry</th><th>Custody</th><th></th></tr></thead><tbody>
    ${dscs.map((d, i) => `<tr><td><b>${esc(d.holder)}</b><span class="sub">${esc(d.token)}</span></td><td>${d.client ? esc(clientById(d.client).short) : '<span class="muted">Firm</span>'}</td><td class="small">${esc(d.cls)}</td><td>${daysTo(d.expiry) < 0 ? `<span class="chip bad">Expired ${fmtD(d.expiry)}</span>` : `<span class="chip ${daysTo(d.expiry) <= 30 ? 'warn' : 'ok'}">${fmtDY(d.expiry)}</span>`}</td><td class="small">${d.out ? `<span class="chip outline">${icon('key')}Out with ${esc(actorName(d.out))}</span>` : esc(d.custody)}</td><td>${/safe/i.test(d.custody) || d.out ? `<button class="btn xs" data-dsc="${STATE.dscs.indexOf(d)}">${d.out ? 'Receive back' : 'Issue'}</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="card"><div class="card-h"><h3>Client portal credentials<small>${can('creds') ? 'You may reveal with a reason' : 'Your role cannot reveal credentials'}</small></h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Client</th><th>Portal</th><th>User ID</th><th>Password</th><th>Rotated</th><th>Second factor</th><th>Reveals</th></tr></thead><tbody>
    ${creds.map((c, i) => `<tr><td><b>${esc(clientById(c.client).short)}</b></td><td>${esc(c.portal)}</td><td class="mono small">${esc(c.user)}</td><td><span class="mono" id="pw-${i}">••••••••••</span> <button class="btn xs" data-rv="${i}" ${can('creds') ? '' : 'disabled'}>${icon('eye')}Reveal</button></td><td>${daysTo(c.rotated) < -180 ? `<span class="chip warn">${-daysTo(c.rotated)} d ago</span>` : `<span class="small">${-daysTo(c.rotated)} d ago</span>`}</td><td class="small">${esc(c.mfa)}</td><td class="num small">${c.reveals + STATE.reveals.filter(r => r.k === c.client + c.portal).length}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  },
  mount(el) {
    const creds = CREDS.filter(c => canSeeClient(c.client));
    $$('[data-rv]', el).forEach(b => b.onclick = () => {
      const c = creds[+b.dataset.rv];
      openModal({ html: `<div class="modal-b"><div class="upper muted">Reveal credential</div><h2>${esc(c.portal)} · ${esc(clientById(c.client).short)}</h2><p class="small dim">Your name, the time and this reason are written to the permanent record. The value hides itself after 20 seconds.</p><div class="field mt12"><label>Reason</label><select class="input" id="rr"><option>Filing a return on the portal</option><option>Downloading a notice / order</option><option>Responding to a portal advisory</option><option>Client asked us to check</option></select></div><div class="flex" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-ok>${icon('eye')} Reveal for 20 s</button></div></div>`,
        onMount: m => { m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-ok]').onclick = () => { const reason = $('#rr', m).value; STATE.reveals.push({ k: c.client + c.portal, by: me().id, at: new Date().toISOString(), reason }); ledgerAdd({ actor: me().id, kind: 'human', action: `revealed ${c.portal} credential — “${reason}”`, client: c.client, obj: 'Credential vault' }); save(); closeModal(); const pw = $('#pw-' + b.dataset.rv); pw.textContent = 'demo·' + fnv(c.user).slice(0, 6); pw.style.color = 'var(--gate-ink)'; let s = 20; const t = setInterval(() => { s--; if (s <= 0 || !document.body.contains(pw)) { clearInterval(t); if (document.body.contains(pw)) { pw.textContent = '••••••••••'; pw.style.color = ''; } } }, 1000); toast('Revealed for 20 seconds · logged', 'gate', 'eye'); }; } });
    });
    $$('[data-dsc]', el).forEach(b => b.onclick = () => {
      if (!can('dsc_custody')) return toast('Only front office and partners handle DSC custody', 'bad', 'lock');
      const d = STATE.dscs[+b.dataset.dsc];
      if (d.out) { ledgerAdd({ actor: me().id, kind: 'human', action: `received DSC token of ${d.holder} back from ${actorName(d.out)}`, client: d.client, obj: 'DSC register' }); d.out = null; save(); toast('Token back in the safe', 'ok', 'key'); return rerender(); }
      openModal({ html: `<div class="modal-b"><h2>Issue ${esc(d.holder)}'s token</h2><div class="field"><label>To</label><select class="input" id="to">${TEAM.filter(t => t.role !== 'FO').map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div><div class="field"><label>Purpose</label><input class="input" id="pp" value="Filing on portal"></div><div class="flex" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-ok>Issue</button></div></div>`, onMount: m => { m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-ok]').onclick = () => { d.out = $('#to', m).value; ledgerAdd({ actor: me().id, kind: 'human', action: `issued DSC token of ${d.holder} to ${actorName(d.out)} — ${$('#pp', m).value}`, client: d.client, obj: 'DSC register' }); save(); closeModal(); toast('Issued — the movement is in the register', 'client', 'key'); rerender(); }; } });
    });
  }
};

/* ============ QUALITY REVIEW — FO-5 ============ */
VIEWS.quality = {
  render() {
    const sqc = [['Leadership responsibility for quality', 'ok'], ['Ethical requirements & independence declarations', 'ok'], ['Client acceptance & continuance (G13)', 'ok'], ['Human resources — training, CPE, articleship', 'warn'], ['Engagement performance — review, consultation, EQCR', 'ok'], ['Monitoring — FO-5 re-performance & canaries', 'ok'], ['Documentation — audit file assembly within 60 days', 'warn']];
    return pageHead('Quality review · FO-5 re-performs; it never corrects', 'Quality you can <em>evidence</em>', 'Each month FO-5 independently re-performs a random sample of finished work and quietly injects known-defective proposals into review queues to test whether reviewers are still reading. Findings go to the partner whether or not anything was wrong — the log is the evidence peer review asks for.') + `
    <div class="grid g4 mb16">
      <div class="card kpi"><div class="label">Re-performed this month</div><div class="value">48</div><div class="foot">random, stratified by client risk</div></div>
      <div class="card kpi accent-warn"><div class="label">Findings</div><div class="value">${QFINDINGS.length}</div><div class="foot">${QFINDINGS.filter(f => f.sev === 'High').length} high</div></div>
      <div class="card kpi accent-gate"><div class="label">Canary catch-rate</div><div class="value">${Math.round(100 * QUALITY.reduce((s, q) => s + q.caught, 0) / QUALITY.reduce((s, q) => s + q.canaries, 0))}%</div><div class="foot">known-bad items stopped at review</div></div>
      <div class="card kpi accent-ok"><div class="label">Peer review</div><div class="value" style="font-size:20px">${esc(FIRM.peerReview)}</div></div>
    </div>
    <div class="grid g-main">
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>Are the reviewers still reading?<small>Planted defects caught at the gate, per reviewer</small></h3></div><div class="list">${QUALITY.map(q => { const r = q.caught / q.canaries; return `<div class="row">${avatar(q.who)}<div class="grow"><div class="t1">${esc(actorName(q.who))} · ${q.reviewed} reviews</div>${meter(100 * r, r === 1 ? 'ok' : r >= 0.8 ? 'warn' : 'bad')}</div><span class="num small">${q.caught}/${q.canaries}</span>${r < 0.8 ? '<span class="chip bad">talk to partner</span>' : r < 1 ? '<span class="chip warn">watch</span>' : '<span class="chip ok">reading</span>'}</div>`; }).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>Findings<small>Correction is a separate, tracked act by someone else</small></h3></div><div class="list">${QFINDINGS.map(f => `<div class="row"><span class="chip ${f.sev === 'High' ? 'bad' : f.sev === 'Medium' ? 'warn' : 'outline'}">${f.sev}</span><div class="grow"><div class="t1" style="white-space:normal">${esc(f.what)}</div><div class="t2">${esc(clientById(f.client).short)} · owner ${esc(actorName(f.owner))}</div></div><span class="chip ${f.state === 'Closed' ? 'ok' : 'outline'}">${esc(f.state)}</span></div>`).join('')}</div></div>
      </div>
      <div class="card"><div class="card-h"><h3>SQC 1 / SQM 1 readiness</h3></div><div class="list">${sqc.map(([n, s]) => `<div class="row"><span class="dot" style="background:var(--${s})"></span><div class="grow small">${n}</div><span class="chip ${s}">${s === 'ok' ? 'evidenced' : 'gap'}</span></div>`).join('')}</div><div class="card-b"><button class="btn block" id="qpack">${icon('download')} Build inspection pack</button></div></div>
    </div>`;
  },
  mount(el) { $('#qpack', el).onclick = () => { ledgerAdd({ actor: 'FO-5', kind: 'agent', action: 'assembled inspection pack from the record', obj: 'Quality' }); save(); toast('Inspection pack assembled — 412 evidenced lines', 'agent', 'download'); }; }
};

/* ============ AGENT BENCH ============ */
const MODE_CHIP = { live: ['agent', 'Live'], suggest: ['outline', 'Suggest only'], shadow: ['code', 'Shadow'] };
VIEWS.agents = {
  render() {
    const groups = [...new Set(AGENTS.map(a => a.group))];
    const m = STATE.agentModes;
    return pageHead('Autopilot · 27 routines, one engine', 'Twenty-seven routines, <em>none of which can sign</em>', 'Anything with one right answer is fixed code. Anything that needs reading, matching or drafting runs on autopilot. Anything that creates personal liability is a person — and no routine holds a tool capable of it, enforced by a test that fails the build.') + `
    <div class="callout ok mb16">${icon('shield')}<div><b>Authority test passing.</b> 27 routines checked · 0 can file, sign, certify or submit · every routine version-pinned · last run on commit <span class="mono">4e1a9c2</span> today 06:00.</div></div>
    <div class="grid g4 mb16">${Object.entries(MODE_CHIP).map(([k, [c, n]]) => `<div class="card kpi"><div class="label"><span class="chip ${c}">${n}</span></div><div class="value">${AGENTS.filter(a => m[a.code] === k).length}</div><div class="foot">${k === 'live' ? 'output used, gates still apply' : k === 'suggest' ? 'shown to a person, never auto-applied' : 'compared nightly to what a human did'}</div></div>`).join('')}<div class="card kpi accent-agent"><div class="label">Invocations today</div><div class="value">${AGENTS.reduce((s, a) => s + a.today, 0).toLocaleString('en-IN')}</div></div></div>
    <div class="card mb16"><div class="card-h"><h3>How a GSTR-3B gets filed<small>From registers to ARN in four stages · violet steps are where a person signs off</small></h3><div class="right"><span class="chip ok"><span class="dot live"></span>Engine live · last run 09:10</span></div></div>
      <div class="card-b pipeline">${[
        ['01 · Collect', [['agent', 'Registers & 2B feed', 'Sales and purchase registers from Tally / Zoho / Busy; GSTR-2B and 2A pulled from GSTN'], ['agent', 'IMS triage', 'Every supplier invoice proposed accept, reject or pending before the 14th'], ['gate', 'Gate G3 · commit IMS', 'A reviewer commits; above ₹50,000 a partner']]],
        ['02 · Compute', [['code', 'Reconcile · 5 passes', 'Exact, fuzzy, Rule 88D variance, missing in 2B, unclaimed in 2B'], ['code', 'Table 4', '4(A)(5) all other ITC · 4(B)(1) Sec 17(5) & Rule 42/43 reversals · 4(C) net ITC'], ['code', 'Section 50 engine', '18% p.a. interest on late cash and the late-fee cap']]],
        ['03 · Package', [['code', 'Payload builder', 'Tables 3.1, 3.2, 4, 5 and 6 with a SHA-256 hash and an hourly idempotency key'], ['code', '38 pre-filing checks', 'Deterministic rules; a failing check blocks approval'], ['agent', 'Variance in words', 'Why this month differs from last, so a partner can approve forty returns in an hour']]],
        ['04 · Approve & file', [['gate', 'Gate G6 · four eyes', 'A second person reviews what the preparer built'], ['gate', 'Gate G7 · DSC signing', 'Class-3 token held by the partner; PIN never stored'], ['ok', 'Filed · ARN saved', 'Acknowledgement in the client folder; client told automatically']]]
      ].map(([h, steps]) => `<div class="pipe-stage"><div class="mono tiny upper muted mb8" style="font-weight:700">${h} →</div>${steps.map(([k, t, d]) => `<div class="pipe-step s-${k}"><b>${t}</b><span>${d}</span></div>`).join('')}</div>`).join('')}</div></div>
    <div class="grid g2 mb16">${recentRuns()}<div class="card"><div class="card-h"><h3>Live now</h3><div class="right"><span class="small muted">Runs update the work they touch</span></div></div><div class="list">${[['GSTR-3B · October', 62, 'agent', '18 of 29 monthly clients reconciled'], ['GSTR-2B / 2A reconciliation', 100, 'ok', 'All passes complete'], ['IMS · invoice management', 74, 'gate', '1,212 proposed · waiting at G3'], ['TDS Q2 · FVU validation', 88, 'agent', '22 of 25 files validated'], ['Bank feeds', 100, 'ok', '31 accounts matched']].map(([n, p, c, d]) => `<div class="row" style="display:block"><div class="flex between"><b class="small">${n}</b><span class="mono tiny">${p}%</span></div>${meter(p, c)}<div class="tiny muted mt8">${d}</div></div>`).join('')}</div></div></div>
    ${groups.map(g => `<div class="upper muted mb8 mt16">${g}</div><div class="grid g3">${AGENTS.filter(a => a.group === g).map(a => `<div class="card pad hoverable" data-ag="${a.code}"><div class="flex">${agentHex(a.code)}<div style="flex:1;min-width:0"><b>${esc(a.short)}</b><div class="tiny muted">${esc(a.name)} · ${a.version}</div></div><span class="chip ${MODE_CHIP[m[a.code]][0]}">${MODE_CHIP[m[a.code]][1]}</span></div><p class="small dim" style="margin:10px 0">${esc(a.does)}</p><div class="flex wrap tiny muted" style="gap:12px"><span>false accept <b class="num" style="color:var(--ink)">${a.falseAccept}%</b></span><span>false reject <b class="num" style="color:var(--ink)">${a.falseReject}%</b></span><span>abstains <b class="num" style="color:var(--ink)">${a.abstain}%</b></span><span>${a.today} today</span></div>${a.gate && a.gate !== '—' ? `<div class="mt8">${/^G\d/.test(a.gate) ? gateSeal(a.gate) : `<span class="chip outline">${esc(a.gate)}</span>`}</div>` : ''}</div>`).join('')}</div>`).join('')}`;
  },
  mount(el) {
    $$('[data-ag]', el).forEach(c => c.onclick = () => {
      const a = agentByCode(c.dataset.ag); const mode = STATE.agentModes[a.code];
      openSheet({
        title: `${agentHex(a.code)} <span style="margin-left:8px">${esc(a.name)}</span>`, sub: `${esc(a.short)} · ${a.version} · pinned ${a.pinned}`, wide: true,
        body: `<p>${esc(a.does)}</p>
          <div class="grid g3 mt16"><div class="card kpi"><div class="label">False accept</div><div class="value">${a.falseAccept}%</div><div class="foot">wrong output passed</div></div><div class="card kpi"><div class="label">False reject</div><div class="value">${a.falseReject}%</div><div class="foot">good output stopped</div></div><div class="card kpi"><div class="label">Human agreement ceiling</div><div class="value">${a.iaa}%</div><div class="foot">inter-annotator rate</div></div></div>
          <div class="callout client mt12">${icon('info')}<div>Both directions of error are reported separately — an aggregate accuracy figure is an average of two unrelated things. No routine can beat the rate at which two qualified people agree.</div></div>
          <div class="card mt16"><div class="card-h"><h3>Declared tools — the authority boundary</h3></div><div class="card-b"><div class="flex wrap" style="gap:6px">${a.tools.map(t => `<span class="chip agent mono">${esc(t)}</span>`).join('')}</div><div class="hr"></div><div class="flex wrap" style="gap:6px">${['portal.file', 'portal.submit', 'dsc.sign', 'udin.generate', 'rulebook.write', 'client.send_document'].map(t => `<span class="chip bad mono" style="text-decoration:line-through">${t}</span>`).join('')}</div><p class="tiny muted mt8">Struck tools do not exist for any routine. Enabling one would be a code change, deliberately.</p></div></div>
          <div class="card mt16"><div class="card-h"><h3>Runbook</h3></div><div class="card-b small">1. If confidently wrong: demote to shadow <b>before</b> diagnosing. 2. Query the record for every invocation of this version since the defect entered — that is the blast radius. 3. Separate what reached a filing, what reached a client, what is still correctable. 4. The client conversation belongs to the partner and happens before the fix ships.</div></div>`,
        foot: `<span class="small muted" style="margin-right:auto">Now: ${MODE_CHIP[mode][1]}</span>${mode !== 'shadow' ? `<button class="btn danger" data-dm>${icon('pause')} Demote to shadow</button>` : ''}${mode !== 'live' ? `<button class="btn agent" data-pm>${icon('play')} Promote${mode === 'shadow' ? ' to suggest' : ' to live'}</button>` : ''}<a class="btn" href="#/record" data-br>${icon('chain')} Blast radius</a>`,
        onMount: s => {
          const dm = s.querySelector('[data-dm]'); if (dm) dm.onclick = () => { if (!can('agents')) return toast('Your role cannot switch routines to shadow', 'bad', 'lock'); STATE.agentModes[a.code] = 'shadow'; ledgerAdd({ actor: me().id, kind: 'human', action: `switched ${a.short} ${a.version} to shadow (on-call authority)`, obj: 'Autopilot' }); save(); closeSheet(); toast(`${a.code} demoted to shadow — its output now goes only to the record`, 'warn', 'pause'); rerender(); };
          const pm = s.querySelector('[data-pm]'); if (pm) pm.onclick = () => { if (!can('promote')) return toast('Only the managing partner can promote — on the evidence of a full shadow cycle', 'bad', 'lock'); const next = mode === 'shadow' ? 'suggest' : 'live'; STATE.agentModes[a.code] = next; ledgerAdd({ actor: me().id, kind: 'human', action: `promoted ${a.code} to ${next} — threshold accepted in writing`, obj: 'Autopilot' }); save(); closeSheet(); toast(`${a.code} promoted to ${next}`, 'agent', 'play'); rerender(); };
          s.querySelector('[data-br]').onclick = () => { RECORD_F.agent = a.code; closeSheet(); };
        }
      });
    });
  }
};

/* ============ CONNECTORS ============ */
VIEWS.connectors = {
  render() {
    const cats = [...new Set(CONNECTORS.map(c => c.cat))];
    const stChip = c => !STATE.connectors[c.id] ? '<span class="chip outline">Paused</span>' : /design/.test(c.status) ? `<span class="chip code">${icon('lock')}${esc(c.status)}</span>` : c.status === 'Degraded' ? '<span class="chip warn">Degraded</span>' : '<span class="chip ok">Healthy</span>';
    return pageHead('Connectors · what can actually be integrated with in India', 'Plumbing, <em>honestly labelled</em>', 'GST and income tax by interface. Withholding by validated file. The registrar, provident fund, state insurance, DGFT and RBI portals have no interface — scripting them is brittle, against their terms and can leave a half-submitted statutory filing. CA Firm OS builds the pack; a person files it.') + `
    <div class="callout warn mb16">${icon('clock')}<div><b>Peak-day behaviour:</b> on the 11th and 20th every taxpayer in India hits the same portals. CA Firm OS queues submissions with backoff, never retries a signed payload blindly, and FL-1 alerts a partner if an acknowledgement is silent for an hour.</div></div>
    ${cats.map(cat => `<div class="upper muted mb8 mt16">${cat}</div><div class="grid g3">${CONNECTORS.filter(c => c.cat === cat).map(c => `<div class="card pad"><div class="flex"><span class="glyph code" style="width:40px;font-size:8.5px">${c.mode === 'api' ? 'API' : c.mode === 'file' ? 'FILE' : 'PACK'}</span><div style="flex:1;min-width:0"><b>${esc(c.name)}</b><div class="tiny muted">${esc(c.scope)}</div></div>${/design/.test(c.status) ? '' : `<label class="switch"><input type="checkbox" data-cx="${c.id}" ${STATE.connectors[c.id] ? 'checked' : ''}><span></span></label>`}</div><div class="flex wrap mt12" style="gap:8px">${stChip(c)}${c.sync !== '—' ? `<span class="chip outline">${icon('refresh')}${esc(c.sync)}</span>` : ''}${c.quota !== '—' ? `<span class="chip outline">quota ${esc(c.quota)}</span>` : ''}</div></div>`).join('')}</div>`).join('')}
    <div class="card pad mt16"><b>Adding a filing application</b><p class="small dim">Any package that exposes an API, an export or a file drop can be connected: a connector declares what it reads, what it writes (never "submit"), its rate budget and its secret reference. Credentials live in the secret store — never in a prompt, never visible to any automation.</p><button class="btn sm" id="newcx">${icon('plus')} Request a connector</button></div>`;
  },
  mount(el) {
    $$('[data-cx]', el).forEach(t => t.onchange = () => { if (!can('connectors')) { t.checked = !t.checked; return toast('Only the managing partner manages connectors and secrets', 'bad', 'lock'); } STATE.connectors[t.dataset.cx] = t.checked; const c = CONNECTORS.find(x => x.id === t.dataset.cx); ledgerAdd({ actor: me().id, kind: 'human', action: `${t.checked ? 'resumed' : 'paused'} connector ${c.name}`, obj: 'Connectors' }); save(); toast(`${c.name} ${t.checked ? 'resumed' : 'paused'}`, t.checked ? 'agent' : 'warn', 'plug'); rerender(); });
    $('#newcx', el).onclick = () => openModal({ html: `<div class="modal-b"><h2>Request a connector</h2><div class="field"><label>Application</label><input class="input" placeholder="e.g. Marg ERP, Tally on cloud, HDFC corporate banking"></div><div class="field"><label>What should CA Firm OS read?</label><textarea class="input" placeholder="Vouchers, ledgers, bank lines…"></textarea></div><div class="callout gate">${icon('lock')}<div class="small">Connectors can read and prepare. None can submit to a government portal — that path exists only behind G7.</div></div><div class="flex mt16" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-ok>Send to engineering</button></div></div>`, onMount: m => { m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-ok]').onclick = () => { closeModal(); toast('Request logged for the principal engineer', 'ok'); }; } });
  }
};

/* ============ RULEBOOK & REFERENCE DESK ============ */
let RB_DATE = dayKey(TODAY);
VIEWS.rulebook = {
  render() {
    const asOf = new Date(RB_DATE + 'T12:00:00');
    const props = STATE.gates.filter(g => g.gate === 'G14');
    return pageHead('Rulebook · versioned and effective-dated', 'Never “what is the rule” — <em>“what was the rule on date X”</em>', 'Rates, thresholds and due dates live here as plain code, each with the date it took effect and the version it belongs to. FO-4 reads every notification and drafts changes; it has no write access — a partner approves every change (G14), because one wrong rule hits every client at once.',
      `<label class="small dim">As of <input type="date" class="input" id="rb-d" value="${RB_DATE}" style="height:38px;width:auto;display:inline-block;margin-left:6px"></label>`) + `
    <div class="grid g-main">
      <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Rule</th><th>Value</th><th>Effective from</th><th>Version</th><th>Source</th></tr></thead><tbody>
      ${RULES.map(r => { const live = new Date(r.from) <= asOf; return `<tr style="${live ? '' : 'opacity:.45'}"><td><b>${esc(r.k)}</b></td><td>${esc(r.v)}${live ? '' : '<span class="sub">not yet in force on this date</span>'}</td><td class="small">${fmtDY(r.from)}</td><td class="mono small">${esc(r.ver)}</td><td class="small dim">${esc(r.src)}</td></tr>`; }).join('')}
      </tbody></table></div></div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>FO-4 proposals<small>Drafted from notifications · partner approves</small></h3></div><div class="list">${props.map(g => g.status === 'pending' ? gateRow(g) : `<div class="row">${gateSeal('G14')}<div class="grow"><div class="t1">${esc(g.title)}</div><div class="t2">${g.status} by ${esc(actorName(g.by))}</div></div></div>`).join('')}
          <div class="row">${agentHex('FO-4')}<div class="grow"><div class="t1">Swept 6 sources · ${fmtT(new Date())}</div><div class="t2">CBIC · CBDT · GSTN · MCA · ICAI · RBI — no further changes</div></div></div></div></div>
        <div class="card"><div class="card-h">${agentHex('KN-1')}<h3>Reference desk<small>Cites a source or declines. No access to any client data — by construction.</small></h3></div>
          <div class="card-b"><div class="flex"><input class="input" id="kn-q" placeholder="e.g. Which credits are blocked under 17(5)?" style="height:38px"><button class="btn sm agent" id="kn-go">${icon('search')}</button></div><div id="kn-a" class="mt12"></div></div></div>
      </div>
    </div>`;
  },
  mount(el) {
    $('#rb-d', el).onchange = e => { RB_DATE = e.target.value || dayKey(TODAY); rerender(); };
    bindGateRows(el);
    const ask = () => {
      const q = $('#kn-q', el).value.trim().toLowerCase(); if (!q) return;
      const out = $('#kn-a', el);
      const clientish = ALL_CLIENTS.some(c => q.includes(c.short.toLowerCase().split(' ')[0])) || /my client|for kesarla|this client/.test(q);
      const kb = [[/17\(5\)|blocked/, 'Credits on motor vehicles (with exceptions), food & beverages, outdoor catering, club memberships, works contracts for immovable property, goods lost or given as free samples and personal consumption are blocked.', 'CGST Act, 2017 — section 17(5)'], [/180|rule 37|supplier.*pay/, 'Credit must be reversed if the supplier is not paid within 180 days of the invoice date; it is re-availed on payment.', 'CGST Rules — rule 37'], [/60|ceiling|tax audit.*limit/, 'A member in practice may accept not more than 60 tax audit assignments in a year, counted across firms.', 'ICAI Council guidelines — Chapter VI'], [/3b|20th|due/, 'GSTR-3B for monthly filers is due on the 20th of the following month.', 'CGST Rules — rule 61'], [/udin/, 'UDIN must be generated by the member for every certificate, report and attest document they sign.', 'ICAI UDIN guidelines'], [/three years|3 years|bar/, 'A return cannot be filed after three years from its due date.', 'CGST Act — section 39(11)']];
      if (clientish) { out.innerHTML = `<div class="callout gate">${icon('lock')}<div><b>Declined.</b> That question is about a specific client. KN-1 has no client data and cannot give client-specific advice — routed to a person.</div></div>`; return; }
      const hit = kb.find(([re]) => re.test(q));
      out.innerHTML = hit ? `<div class="callout agent"><div>${esc(hit[1])}<div class="tiny mt8">${icon('link').replace('<svg', '<svg width="12" height="12"')} <b>${esc(hit[2])}</b></div></div></div>` : `<div class="callout">${icon('info')}<div><b>I can't cite a source for that, so I won't answer it.</b> Try rephrasing, or ask the embedded CA.</div></div>`;
      ledgerAdd({ actor: 'KN-1', kind: 'agent', action: hit ? 'answered a staff question with citation' : clientish ? 'declined a client-specific question' : 'declined — no citable source', obj: 'Reference desk' }); save();
    };
    $('#kn-go', el).onclick = ask; $('#kn-q', el).onkeydown = e => { if (e.key === 'Enter') ask(); };
  }
};

/* ============ THE RECORD ============ */
let RECORD_F = { kind: 'all', q: '', agent: '' };
VIEWS.record = {
  render() {
    const L = STATE.ledger.filter(r => canSeeClient(r.client) && (RECORD_F.kind === 'all' || r.kind === RECORD_F.kind) && (!RECORD_F.q || (r.action + ' ' + r.obj + ' ' + actorName(r.actor) + ' ' + (clientById(r.client)?.short || '')).toLowerCase().includes(RECORD_F.q.toLowerCase())) && (!RECORD_F.agent || r.actor === RECORD_F.agent)).slice().reverse();
    const br = RECORD_F.agent ? STATE.ledger.filter(r => r.actor === RECORD_F.agent) : [];
    const brClients = [...new Set(br.map(r => r.client).filter(Boolean))];
    return pageHead('The record · append-only, hash-chained', 'Who did what, when, <em>from which document, under which rule</em>', 'Every arrow in the system writes one permanent line here — including which of the two people at the four-eyes gate and the signature gate was which. Nothing can be edited or deleted. It is what the firm shows a regulator, an insurer, or a client who asks how a number was arrived at three years later.',
      `<button class="btn" id="verify">${icon('shield')} Verify chain</button>${can('export') ? `<button class="btn" id="export">${icon('download')} Export</button>` : ''}`) + `
    <div id="verify-out"></div>
    <div class="grid g-main">
      <div>
        <div class="flex wrap mb16" style="gap:10px"><div class="seg">${[['all', 'All'], ['agent', 'Autopilot'], ['human', 'People'], ['client', 'Clients'], ['code', 'Code']].map(([k, n]) => `<button class="${RECORD_F.kind === k ? 'on' : ''}" data-k="${k}">${n}</button>`).join('')}</div><input class="input" id="rq" placeholder="Search the record" value="${esc(RECORD_F.q)}" style="max-width:260px;height:36px">${RECORD_F.agent ? `<button class="btn xs" id="clr-ag">${icon('x')} ${RECORD_F.agent}</button>` : ''}<span class="small muted" style="margin-left:auto">${L.length} lines</span></div>
        <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Client</th><th>Rule</th><th>Hash</th></tr></thead><tbody>
        ${L.slice(0, 160).map(r => `<tr class="k-${r.kind}"><td class="num tiny muted">${r.n}</td><td class="small" style="white-space:nowrap">${fmtDT(r.at)}</td><td>${r.kind === 'agent' ? `<span class="chip agent">${esc(actorName(r.actor))}</span>` : r.kind === 'client' ? `<span class="chip client">${esc(r.actor)}</span>` : r.kind === 'code' ? '<span class="chip code">core</span>' : `<span class="chip outline">${avatar(r.actor, 'sm').replace('class="av sm"', 'class="av sm" style="width:16px;height:16px;font-size:7px"')}${esc(actorName(r.actor))}</span>`}</td><td class="small">${esc(r.action)}<span class="sub">${esc(r.obj || '')}</span></td><td class="small">${esc(clientById(r.client)?.short || '—')}</td><td class="mono tiny">${esc(r.rule)}</td><td class="hash">${r.hash}</td></tr>`).join('')}
        </tbody></table></div></div>
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>Blast radius<small>“A routine was confidently wrong, and we found out three weeks later.”</small></h3></div><div class="card-b">
          <div class="field"><label>Routine</label><select class="input" id="br-ag"><option value="">Choose a routine…</option>${AGENTS.map(a => `<option value="${a.code}" ${RECORD_F.agent === a.code ? 'selected' : ''}>${esc(a.short)} · ${esc(a.name)} · ${a.version}</option>`).join('')}</select></div>
          ${RECORD_F.agent ? `<div class="grid g2"><div class="card kpi"><div class="label">Invocations</div><div class="value">${br.length}</div></div><div class="card kpi accent-bad"><div class="label">Clients touched</div><div class="value">${brClients.length}</div></div></div>
          <div class="flex wrap mt12" style="gap:6px">${brClients.slice(0, 18).map(id => `<span class="chip outline">${esc(clientById(id)?.short)}</span>`).join('')}</div>
          <p class="small dim mt12">Assume all are affected until shown otherwise. That is a query, not an investigation — the reason the record exists.</p>
          <button class="btn danger block" id="br-demote">${icon('pause')} Demote ${RECORD_F.agent} & open incident</button>` : '<p class="small muted">Pick a routine to see every run and every client it touched.</p>'}
        </div></div>
        <div class="card pad"><b>Retention</b><p class="small dim">Kept for 8 years after the relevant tax year. Read access is a capability; exports are watermarked with the person and time.</p></div>
      </div>
    </div>`;
  },
  mount(el) {
    $$('[data-k]', el).forEach(b => b.onclick = () => { RECORD_F.kind = b.dataset.k; rerender(); });
    const q = $('#rq', el); q.oninput = () => { RECORD_F.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { rerender(); const n = $('#rq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    $('#br-ag', el).onchange = e => { RECORD_F.agent = e.target.value; rerender(); };
    $('#clr-ag', el) && ($('#clr-ag', el).onclick = () => { RECORD_F.agent = ''; rerender(); });
    $('#verify', el).onclick = () => { const v = verifyChain(); $('#verify-out', el).innerHTML = `<div class="callout ${v.bad ? 'bad' : 'ok'} mb16">${icon(v.bad ? 'alert' : 'shield')}<div>${v.bad ? `<b>Chain broken at line ${v.bad}.</b> Investigate immediately.` : `<b>Chain intact.</b> ${v.ok} lines verified — each line's hash includes the one before it, so any edit anywhere would break every line after it.`}</div></div>`; };
    $('#export', el) && ($('#export', el).onclick = () => {
      const rows = [['n', 'at', 'actor', 'action', 'client', 'object', 'rule', 'hash'], ...STATE.ledger.map(r => [r.n, r.at, r.actor, r.action, clientById(r.client)?.short || '', r.obj, r.rule, r.hash])];
      const csv = `# Exported by ${me().name} at ${new Date().toISOString()} — watermarked\n` + rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      ledgerAdd({ actor: me().id, kind: 'human', action: 'exported the record (watermarked)', obj: 'Record' }); save();
      openModal({ wide: true, html: `<div class="modal-b"><div class="upper muted">Export · watermarked</div><h2>The record as CSV</h2><p class="small dim">${STATE.ledger.length} lines. Copy it into a spreadsheet; the first line names you and the time.</p><textarea class="input mono" id="csv-out" rows="12" readonly style="font-size:11.5px">${esc(csv)}</textarea><div class="flex mt16" style="justify-content:flex-end"><button class="btn ghost" data-x>Close</button><button class="btn primary" data-copy>${icon('clipboard')} Copy CSV</button></div></div>`,
        onMount: m => { m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-copy]').onclick = () => { const ta = $('#csv-out', m); const fallback = () => { ta.focus(); ta.select(); toast('Selected — press ⌘C / Ctrl+C to copy', 'code', 'clipboard'); }; try { navigator.clipboard.writeText(csv).then(() => toast('Copied to the clipboard', 'ok', 'check'), fallback); } catch (err) { fallback(); } }; } });
    });
    $('#br-demote', el) && ($('#br-demote', el).onclick = () => { if (!can('agents')) return toast('Your role cannot switch routines to shadow', 'bad', 'lock'); STATE.agentModes[RECORD_F.agent] = 'shadow'; ledgerAdd({ actor: me().id, kind: 'human', action: `demoted ${RECORD_F.agent} to shadow and opened an incident — blast radius ${STATE.ledger.filter(r => r.actor === RECORD_F.agent).length} invocations`, obj: 'Incident' }); save(); toast(`${RECORD_F.agent} in shadow · incident opened · partner notified`, 'warn', 'alert'); rerender(); });
  }
};

/* ============ ACCESS & ROLES ============ */
VIEWS.access = {
  render() {
    const roles = Object.keys(ROLES); const grps = [...new Set(CAPS.map(c => c.grp))];
    const editable = can('access');
    const vc = ALL_CLIENTS.filter(c => !c.internal);
    const staff = TEAM.filter(t => !['MP', 'PT', 'CC'].includes(t.role));
    return pageHead('Access & roles · who may see, prepare, approve and sign', 'Roles, gates <em>and ethical walls</em>', `Eight roles mirror how an Indian CA firm is actually shaped. Personal professional acts are locked to partners — the law decides those, not configuration. File, sign and submit are never automated. ${editable ? 'You can edit the unlocked cells.' : 'Read-only for your role.'}`) + `
    <div class="card mb16"><div class="table-wrap"><table class="t matrix" style="min-width:860px"><thead><tr><th>Capability</th>${roles.map(r => `<th class="r" style="text-align:center">${ROLES[r].short}</th>`).join('')}</tr></thead><tbody>
    ${grps.map(g => `<tr><td colspan="${roles.length + 1}" style="background:var(--paper-2)" class="upper muted">${g}</td></tr>` + CAPS.filter(c => c.grp === g).map(c => `<tr><td><b class="small">${esc(c.n)}</b>${c.note ? `<span class="sub">${esc(c.note)}</span>` : ''}${c.locked ? '<span class="sub" style="color:var(--gate-ink)">locked — personal professional act</span>' : ''}</td>${roles.map(r => { const on = STATE.caps[c.k].includes(r); const cls = c.never ? 'never' : on ? (c.locked ? 'gate' : 'on') : ''; return `<td class="cell"><span class="mx ${cls} ${c.locked || c.never || !editable ? 'lock' : ''}" data-cap="${c.k}" data-role="${r}" title="${c.never ? 'Assigned to nobody' : ''}">${c.never ? icon('x') : on ? icon('check') : ''}</span></td>`; }).join('')}</tr>`).join('')).join('')}
    </tbody></table></div></div>
    <div class="card mb16"><div class="card-h"><h3>Ethical walls<small>Staff see only the clients ticked here. Partners & the coordinator see all by role.</small></h3></div><div class="table-wrap"><table class="t matrix" style="min-width:900px"><thead><tr><th>Client</th>${staff.map(t => `<th style="text-align:center">${avatar(t.id, 'sm')}<span class="sub">${esc(t.short)}</span></th>`).join('')}</tr></thead><tbody>
    ${vc.map(c => `<tr><td class="small"><b>${esc(c.short)}</b></td>${staff.map(t => { const on = STATE.walls[c.id].includes(t.id); return `<td class="cell"><span class="mx ${on ? 'on' : ''} ${editable ? '' : 'lock'}" data-wall="${c.id}" data-p="${t.id}">${on ? icon('check') : ''}</span></td>`; }).join('')}</tr>`).join('')}
    </tbody></table></div></div>
    <div class="card"><div class="card-h"><h3>Security posture</h3></div><div class="list">${[['Two-factor sign-in for everyone', true], ['Session lock after 15 minutes idle', true], ['Office IP allow-list for credential vault', true], ['Watermark every download with name & time', true], ['Block WhatsApp export of client documents', true], ['Data stays in India region', true, 'Pending counsel\'s opinion on cross-border processing'], ['Retain the record 8 years after the tax year', true]].map(([n, on, note]) => `<div class="row"><div class="grow"><div class="t1">${n}</div>${note ? `<div class="t2" style="color:var(--warn-ink)">${note}</div>` : ''}</div><label class="switch gate"><input type="checkbox" ${on ? 'checked' : ''} ${editable ? '' : 'disabled'} data-sec="${esc(n)}"><span></span></label></div>`).join('')}</div></div>`;
  },
  mount(el) {
    const editable = can('access');
    $$('[data-cap]', el).forEach(x => x.onclick = () => {
      const c = CAPS.find(k => k.k === x.dataset.cap);
      if (c.never) return toast('File, sign and submit are never automated. Changing that is a code change, deliberately.', 'bad', 'lock');
      if (c.locked) return toast('Locked: this is a personal professional act under law', 'gate', 'lock');
      if (!editable) return toast('Only the managing partner edits roles', 'bad', 'lock');
      const arr = STATE.caps[c.k]; const r = x.dataset.role; const i = arr.indexOf(r); i >= 0 ? arr.splice(i, 1) : arr.push(r);
      ledgerAdd({ actor: me().id, kind: 'human', action: `${i >= 0 ? 'removed' : 'granted'} “${c.n}” ${i >= 0 ? 'from' : 'to'} ${ROLES[r].name}`, obj: 'Access' }); save(); renderShell(); rerender();
    });
    $$('[data-wall]', el).forEach(x => x.onclick = () => {
      if (!editable) return toast('Only the managing partner edits ethical walls', 'bad', 'lock');
      const w = STATE.walls[x.dataset.wall]; const i = w.indexOf(x.dataset.p); i >= 0 ? w.splice(i, 1) : w.push(x.dataset.p);
      ledgerAdd({ actor: me().id, kind: 'human', action: `${i >= 0 ? 'removed' : 'added'} ${actorName(x.dataset.p)} ${i >= 0 ? 'from' : 'to'} the wall`, client: x.dataset.wall, obj: 'Ethical wall' }); save(); rerender();
    });
    $$('[data-sec]', el).forEach(t => t.onchange = () => { ledgerAdd({ actor: me().id, kind: 'human', action: `${t.checked ? 'enabled' : 'disabled'} “${t.dataset.sec}”`, obj: 'Security' }); save(); toast('Security setting recorded', 'gate', 'shield'); });
  }
};

function openExpenseClaim() { const vc = visibleClients().filter(c => !c.internal); openModal({ html: `<div class="modal-b"><h2>Expense claim</h2><div class="field"><label>What</label><input class="input" id="ex-w" placeholder="e.g. Auto to Kesarla factory"></div><div class="grid g2"><div class="field"><label>Amount (₹)</label><input class="input num" id="ex-a" inputmode="numeric"></div><div class="field"><label>Client</label><select class="input" id="ex-c"><option value="">Firm cost</option>${vc.map(c => `<option value="${c.id}">${esc(c.short)}</option>`).join('')}</select></div></div><label class="check"><input type="checkbox" id="ex-r">Rebill to the client on the next invoice</label><p class="tiny muted mt8">Snap the bill on WhatsApp — IN-1 attaches it to this claim.</p><div class="flex" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-ok>Submit</button></div></div>`, onMount: m => { m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-ok]').onclick = () => { const what = $('#ex-w', m).value.trim(), amt = +$('#ex-a', m).value; if (!what || !amt) return toast('Add what and how much', 'warn', 'info'); STATE.expenses.push({ id: 'ex' + Date.now(), who: me().id, what, client: $('#ex-c', m).value || null, amt, rebill: $('#ex-r', m).checked, status: 'Pending', at: new Date().toISOString() }); ledgerAdd({ actor: me().id, kind: 'human', action: `claimed ${inr(amt)} — ${what}`, client: $('#ex-c', m).value || null, obj: 'Expenses' }); save(); closeModal(); toast('Claim submitted to a partner', 'ok'); rerender(); }; } }); }
