/* ============ PURCHASE REGISTER + GSTR-2B RECONCILIATION ============
   #/tallybooks/<company id>: the client's purchase register as synced from Tally, and a GSTR-2B file upload that
   matches it. The file is read in the browser, sent to the server, matched and discarded (only counts are audited).
   Uses TALLY_API, tallyAgo and the helpers from pages-tally.js (loaded first). */

const TB_LABELS = {
  value_mismatches: ['Amounts differ', 'Same invoice in both, but the tax or value is different. Ask the supplier or fix the entry.', 'warn'],
  missing_in_2b: ['In Tally, not in GSTR-2B', 'The supplier has not reported it, so the credit is at risk. Follow up with the supplier.', 'bad'],
  unclaimed_in_books: ['In GSTR-2B, not in Tally', 'The supplier reported it but it is not in the books. Enter it, or ask whether it is yours.', 'gate'],
  blocked_credits_17_5: ['Blocked credit, Section 17(5)', 'Matches a blocked category, so the credit is not available.', 'bad'],
  fuzzy_matches: ['Matched (invoice number formatted differently)', 'Same supplier and amount; the invoice numbers differ only in punctuation or zeros.', 'agent'],
  exact_matches: ['Matched', 'Same supplier, invoice number and amount.', 'ok']
};
const TB_EXCEPTIONS = ['value_mismatches', 'missing_in_2b', 'unclaimed_in_books', 'blocked_credits_17_5'];
const TB_ORDER = [...TB_EXCEPTIONS, 'fuzzy_matches', 'exact_matches'];

function tbCsv(rows) {
  const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return rows.map(r => r.map(cell).join(',')).join('\r\n');
}
function tbDownload(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const tbAmt = n => `<span style="${n < 0 ? 'color:var(--bad)' : ''}">${inr(n, 2)}</span>`;

VIEWS.tallybooks = {
  title: 'Purchase register',
  render() {
    return pageHead('Tally sync · read-only', 'Purchase <em>register</em>',
      'The purchase invoices and debit notes synced from Tally, and a check of them against the supplier-reported GSTR-2B.') +
      '<div id="tb-root"><div class="card pad"><p class="muted">Loading…</p></div></div>';
  },
  mount(el, companyId) {
    const root = $('#tb-root', el);
    if (typeof API_CLIENT === 'undefined' || !API_CLIENT.connected) {
      tallySignInCard(root, 'Sign in to the server to see the register',
        'Your browser is not signed in to the server (it may hold an old demo session).', 'tallybooks/' + companyId);
      return;
    }
    let period = '';
    const back = '<a class="small" href="#/tally">← Tally sync</a>';
    const fail = e => { root.innerHTML = `<div class="card pad" style="max-width:640px">${back}<h3 style="margin:8px 0">${e.status === 409 ? 'Link this company to a client first' : 'Could not load the register'}</h3><p class="small muted">${esc(e.message)}</p></div>`; };

    const load = async () => {
      let d;
      try { d = await TALLY_API.register(companyId, period); } catch (e) { return fail(e); }
      draw(d);
    };

    const draw = d => {
      const t = d.totals;
      root.innerHTML = `
      <div class="mb16">${back} <span class="small muted" style="margin-left:10px"><b>${esc(d.company.name)}</b> → ${esc(d.client.name)}${d.client.gstin ? ' · ' + esc(d.client.gstin) : ''} · synced ${esc(tallyAgo(d.company.last_synced_at))}</span></div>
      <div class="grid g4 mb16">
        <div class="card kpi"><div class="label">Vouchers</div><div class="value">${d.count}${d.debit_notes ? `<small>${d.debit_notes} debit note${d.debit_notes > 1 ? 's' : ''}</small>` : ''}</div></div>
        <div class="card kpi"><div class="label">Taxable value</div><div class="value num" style="font-size:22px">${inrShort(t.taxable_value)}</div></div>
        <div class="card kpi"><div class="label">Input tax</div><div class="value num" style="font-size:22px">${inrShort(t.total_tax)}</div><div class="foot">CGST ${inr(t.cgst)} · SGST ${inr(t.sgst)} · IGST ${inr(t.igst)}</div></div>
        <div class="card kpi"><div class="label">Month</div><div class="value" style="font-size:16px"><input type="month" class="input" id="tb-period" value="${esc(period)}" aria-label="Show purchases booked in one month" title="Show purchases booked in one month"> ${period ? '<button class="btn xs" id="tb-all">All</button>' : ''}</div></div>
      </div>
      <div class="card mb16"><div class="card-h"><h3>Reconcile with GSTR-2B<small>Download the file from the GST portal (Returns, GSTR-2B, Download JSON), then choose it here</small></h3></div>
        <div class="card-b">
          <div class="flex" style="gap:12px;flex-wrap:wrap;align-items:center">
            <input type="file" id="tb-file" accept=".json,application/json" aria-label="GSTR-2B JSON file">
            <label class="small"><input type="checkbox" id="tb-allmonths"> Match every month in the register, not only the file's return month</label>
          </div>
          <div id="tb-result" class="mt8"></div>
        </div></div>
      <div class="card"><div class="card-h"><h3>Register<small>${d.truncated ? 'Showing the first ' + d.rows.length + ' of ' + d.count + '. ' : ''}Newest first. Debit notes are negative. The date is the supplier's invoice date; where Tally has none it is the date the purchase was entered.</small></h3>
        <div class="right"><input class="input" id="tb-filter" placeholder="Filter by supplier or invoice" style="width:220px" aria-label="Filter the register"></div></div>
        ${d.rows.length ? `<div class="table-wrap"><table class="t" id="tb-table"><thead><tr><th>Invoice</th><th>Date</th><th>Supplier</th><th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">IGST</th><th class="r">Total</th></tr></thead><tbody>
          ${d.rows.map(r => `<tr data-q="${esc((r.invoice_number + ' ' + r.supplier_name + ' ' + r.supplier_gstin).toLowerCase())}"><td><b>${esc(r.invoice_number)}</b>${r.is_debit_note ? ' <span class="chip warn">Debit note</span>' : ''}<div class="small muted">Tally ${esc(r.voucher_number)}</div></td>
            <td class="small">${esc(r.invoice_date)}</td><td>${esc(r.supplier_name)}<div class="small muted mono">${esc(r.supplier_gstin) || '<span style="color:var(--bad)">no GSTIN</span>'}</div></td>
            <td class="r num">${tbAmt(r.taxable_value)}</td><td class="r num">${tbAmt(r.cgst)}</td><td class="r num">${tbAmt(r.sgst)}</td><td class="r num">${tbAmt(r.igst)}</td><td class="r num">${tbAmt(r.total_value)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="card-b"><p class="muted">No vouchers' + (period ? ' in ' + esc(period) : ' yet. They arrive with the next sync') + '.</p></div>'}
      </div>`;

      $('#tb-period', root).onchange = e => { period = e.target.value; load(); };
      const all = $('#tb-all', root); if (all) all.onclick = () => { period = ''; load(); };
      const f = $('#tb-filter', root);
      f.oninput = () => { const q = f.value.trim().toLowerCase(); $$('#tb-table tbody tr', root).forEach(tr => { tr.style.display = !q || tr.dataset.q.includes(q) ? '' : 'none'; }); };
      $('#tb-file', root).onchange = async ev => {
        const file = ev.target.files[0]; if (!file) return;
        const out = $('#tb-result', root);
        if (file.size > 20 * 1024 * 1024) { out.innerHTML = '<p style="color:var(--bad)">That file is larger than 20 MB, so it is probably not a GSTR-2B.</p>'; return; }
        let json;
        try { json = JSON.parse(await file.text()); } catch (e) { out.innerHTML = '<p style="color:var(--bad)">That is not a valid JSON file. Download the GSTR-2B as JSON from the GST portal.</p>'; return; }
        out.innerHTML = '<p class="muted">Matching…</p>';
        try { showResult(out, await TALLY_API.reconcile(companyId, json, $('#tb-allmonths', root).checked)); }
        catch (e) { out.innerHTML = `<p style="color:var(--bad)">${esc(e.message)}</p>`; }
      };
    };

    const showResult = (out, r) => {
      const m = r.meta, s = r.summary;
      const attention = TB_EXCEPTIONS.reduce((n, k) => n + r[k].length, 0);
      const section = k => {
        const [title, hint, tone] = TB_LABELS[k], rows = r[k];
        if (!rows.length) return '';
        const mismatch = k === 'value_mismatches';
        return `<details class="mt8" ${TB_EXCEPTIONS.includes(k) ? 'open' : ''}><summary><span class="chip ${tone}">${esc(title)}</span> <b>${rows.length}</b> <span class="small muted">${esc(hint)}</span></summary>
          <div class="table-wrap"><table class="t"><thead><tr><th>Invoice</th><th>Supplier</th><th>Date</th><th class="r">Taxable</th><th class="r">Tax</th>${mismatch ? '<th class="r">Tax in 2B</th><th class="r">Difference</th>' : ''}</tr></thead><tbody>
          ${rows.map(i => {
            const g = i.gstr2b_ref || {}, g2 = (g.cgst || 0) + (g.sgst || 0) + (g.igst || 0);
            return `<tr><td><b>${esc(i.invoice_number)}</b></td><td>${esc(i.supplier_name)}<div class="small muted mono">${esc(i.supplier_gstin)}</div></td><td class="small">${esc(i.invoice_date)}</td><td class="r num">${tbAmt(i.taxable_value)}</td><td class="r num">${tbAmt(i.total_tax)}</td>${mismatch ? `<td class="r num">${tbAmt(g2)}</td><td class="r num">${tbAmt(i.variance_amount)}</td>` : ''}</tr>`;
          }).join('')}
          </tbody></table></div></details>`;
      };
      out.innerHTML = `
        <div class="small muted">GSTR-2B ${esc(m.gstr2b_period || 'period unknown')}${m.gstr2b_gstin ? ' · ' + esc(m.gstr2b_gstin) : ''} · ${m.gstr2b_documents} documents in the file · ${m.books_period_filter ? m.books_considered + ' purchases booked in ' + esc(m.books_period_filter) + ' checked for missing credit (purchases booked in other months were still used to find matches)' : m.books_total + ' purchases compared (all months)'}</div>
        ${r.warnings.length ? `<ul class="small" style="color:var(--warn);margin:6px 0;padding-left:18px">${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        <div class="grid g4 mt8">
          <div class="card kpi accent-ok"><div class="label">Matched</div><div class="value">${r.exact_matches.length + r.fuzzy_matches.length}</div></div>
          <div class="card kpi ${attention ? 'accent-bad' : ''}"><div class="label">Need attention</div><div class="value">${attention}</div></div>
          <div class="card kpi"><div class="label">Credit in books · in 2B</div><div class="value num" style="font-size:18px">${inrShort(s.books_total_tax)} · ${inrShort(s.gstr2b_total_tax)}</div></div>
          <div class="card kpi"><div class="label">Credit at risk</div><div class="value num" style="font-size:20px">${inrShort(s.missing_in_2b)}</div><div class="foot">in Tally, not reported by the supplier</div></div>
        </div>
        <div class="flex mt8" style="gap:8px"><button class="btn xs" id="tb-csv" ${attention ? '' : 'disabled'}>Download the exceptions (CSV)</button></div>
        ${TB_ORDER.map(section).join('')}`;
      $('#tb-csv', out).onclick = () => {
        const rows = [['Category', 'Invoice', 'Supplier', 'GSTIN', 'Date', 'Taxable', 'Tax', 'Difference']];
        TB_EXCEPTIONS.forEach(k => r[k].forEach(i => rows.push([TB_LABELS[k][0], i.invoice_number, i.supplier_name, i.supplier_gstin, i.invoice_date, i.taxable_value, i.total_tax, i.variance_amount])));
        tbDownload('gstr2b-exceptions.csv', tbCsv(rows));
      };
    };
    load();
  }
};
