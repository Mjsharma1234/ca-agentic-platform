/* CA Firm OS — the client portal: sign-in, and each client's own view of their compliance.
   Every action a client takes here is written to the firm's record in the client's colour (blue). */

const PT = {
  English: { calendar: 'Calendar', scope: 'What we handle for you', home: 'Home', docs: 'Documents', approve: 'Approvals', pay: 'Payments', chat: 'Messages', filings: 'Filings', profile: 'Profile', signout: 'Sign out', hello: 'Namaste', needYou: '{n} things need you', allClear: 'You\'re all caught up', upload: 'Upload', withTeam: 'With your CA team', filed: 'Filed for you', upcoming: 'Coming up', payNow: 'Pay now', approveBtn: 'Approve', signinTitle: 'Sign in to your client portal', mobile: 'Mobile number', sendCode: 'Send code', enterCode: 'Enter the 6-digit code', verify: 'Verify and continue', trust: 'Trust this device for 30 days' },
  'हिन्दी': { calendar: 'कैलेंडर', scope: 'हम आपके लिए क्या संभालते हैं', home: 'होम', docs: 'दस्तावेज़', approve: 'मंज़ूरी', pay: 'भुगतान', chat: 'संदेश', filings: 'फाइलिंग', profile: 'प्रोफ़ाइल', signout: 'साइन आउट', hello: 'नमस्ते', needYou: '{n} काम आपकी प्रतीक्षा में', allClear: 'सब कुछ पूरा है', upload: 'अपलोड करें', withTeam: 'आपकी CA टीम के पास', filed: 'आपके लिए फाइल किया गया', upcoming: 'आने वाली तारीखें', payNow: 'अभी भुगतान करें', approveBtn: 'मंज़ूर करें', signinTitle: 'अपने क्लाइंट पोर्टल में साइन इन करें', mobile: 'मोबाइल नंबर', sendCode: 'कोड भेजें', enterCode: '6 अंकों का कोड डालें', verify: 'सत्यापित करें और आगे बढ़ें', trust: 'इस डिवाइस पर 30 दिन भरोसा करें' },
  'తెలుగు': { calendar: 'క్యాలెండర్', scope: 'మేము మీ కోసం చూసుకునేవి', home: 'హోమ్', docs: 'పత్రాలు', approve: 'ఆమోదాలు', pay: 'చెల్లింపులు', chat: 'సందేశాలు', filings: 'ఫైలింగ్స్', profile: 'ప్రొఫైల్', signout: 'సైన్ అవుట్', hello: 'నమస్తే', needYou: '{n} పనులు మీ కోసం వేచి ఉన్నాయి', allClear: 'అన్నీ పూర్తయ్యాయి', upload: 'అప్‌లోడ్ చేయండి', withTeam: 'మీ CA బృందం వద్ద', filed: 'మీ కోసం ఫైల్ చేసినవి', upcoming: 'రాబోయే గడువులు', payNow: 'ఇప్పుడే చెల్లించండి', approveBtn: 'ఆమోదించండి', signinTitle: 'మీ క్లయింట్ పోర్టల్‌లో సైన్ ఇన్ చేయండి', mobile: 'మొబైల్ నంబర్', sendCode: 'కోడ్ పంపండి', enterCode: '6 అంకెల కోడ్ నమోదు చేయండి', verify: 'ధృవీకరించి కొనసాగండి', trust: 'ఈ పరికరాన్ని 30 రోజులు నమ్మండి' }
};
const DEMO_OTP = '246810';
const PAYABLE_FORMS = ['GSTR-3B', 'GSTR-3B (Q)', 'PMT-06', 'CMP-08', '281-TDS', '281-TCS', 'ADV-TAX', 'DRC-03'];
let LOGIN = { step: 'id', method: 'otp', user: null, lang: 'English', tries: 4, err: '' };
let P_TAB = 'home';
const pLang = () => (STATE.portal && STATE.portal.lang) || LOGIN.lang;
const pt = k => (PT[pLang()] || PT.English)[k] || PT.English[k];
const pUser = () => PORTAL_USERS.find(u => u.id === STATE.portal?.user);
const pClient = () => clientById(STATE.portal?.active);
const maskPhone = p => '+91 ' + p.slice(0, 5) + ' •••' + p.slice(-2);
const maskEmail = e => e[0] + '•••' + e.slice(e.indexOf('@'));
const P_WORDS = {
  scheduled: ['Scheduled', 'code'], awaiting: ['Waiting for your papers', 'client'],
  received: ['Our team is preparing it', 'agent'], preparing: ['Our team is preparing it', 'agent'], reconciled: ['Our team is preparing it', 'agent'],
  review: ['A second reviewer is checking it', 'gate'], sign: ['With the partner for signature', 'gate'],
  filed: ['Submitted · awaiting acknowledgement', 'code'], closed: ['Filed', 'ok']
};
const pState = k => { const [w, c] = P_WORDS[k]; return `<span class="chip ${c}"><span class="dot" style="background:var(--${c})"></span>${w}</span>`; };
const DOC_NAMES = ['Sales register', 'Purchase invoices', 'Bank statement', 'Expense bills', 'Credit notes', 'Payroll summary', 'Challans'];
function pLog(action, client, obj) { ledgerAdd({ actor: pUser().name, kind: 'client', action, client: client || pClient().id, obj: obj || 'Client portal' }); }

VIEWS.portal = {
  render(arg) { if (arg && PT.English[arg]) P_TAB = arg; return STATE.portal && pUser() ? portalApp() : loginView(); },
  mount(el) { if (STATE.portal && pUser()) mountPortal(el); else mountLogin(el); }
};

/* ================= SIGN-IN ================= */
function loginView() {
  const u = PORTAL_USERS.find(x => x.id === LOGIN.user);
  let step = '';
  if (LOGIN.step === 'id') {
    step = `<div class="seg mb16" style="width:100%">${[['otp', 'Mobile · OTP'], ['email', 'Email link'], ['digi', 'DigiLocker']].map(([k, n]) => `<button class="${LOGIN.method === k ? 'on' : ''}" data-m="${k}" style="flex:1">${n}</button>`).join('')}</div>` +
      (LOGIN.method === 'otp' ? `<label class="small" style="font-weight:600;color:var(--ink-2)" for="lg-phone">${pt('mobile')}</label><div class="phone-in mt8"><span>+91</span><input id="lg-phone" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="98490 12312" value="${u ? u.phone : ''}"></div><button class="btn client lg block mt12" id="lg-send">${pt('sendCode')} ${icon('arrow')}</button>`
        : LOGIN.method === 'email' ? `<label class="small" style="font-weight:600;color:var(--ink-2)" for="lg-email">Email</label><input class="input mt8" id="lg-email" type="email" autocomplete="email" placeholder="you@company.in" value="${u ? u.email : ''}" style="height:48px;font-size:16px"><button class="btn client lg block mt12" id="lg-send">Email me a sign-in link ${icon('arrow')}</button>`
          : `<button class="btn lg block" id="lg-send" style="border-color:var(--client);color:var(--client-ink)">${icon('shield')} Continue with DigiLocker</button><p class="tiny muted mt8">With your consent we read only your name and PAN to match you to your firm's records.</p>`);
  } else if (LOGIN.step === 'code') {
    step = `<p class="dim" style="margin:0">We sent a code to <b class="mono">${maskPhone(u.phone)}</b>.</p><label class="sr" for="otp0">${pt('enterCode')}</label><div class="otp" id="otp">${[...Array(6)].map((_, i) => `<input id="otp${i}" inputmode="numeric" maxlength="1" autocomplete="${i ? 'off' : 'one-time-code'}" aria-label="Digit ${i + 1}">`).join('')}</div>
      <button class="chip client" id="fill-demo" style="border:0;cursor:pointer">Demo code ${DEMO_OTP} · tap to fill</button>
      <label class="check mt12"><input type="checkbox" id="lg-trust" checked>${pt('trust')}</label>
      ${LOGIN.err ? `<div class="callout bad mt12">${icon('alert')}<div>${esc(LOGIN.err)}</div></div>` : ''}
      <button class="btn client lg block mt12" id="lg-verify">${pt('verify')}</button>
      <button class="btn ghost sm block mt8" id="lg-back">Use a different number</button>`;
  } else if (LOGIN.step === 'link') {
    step = `<div class="callout client">${icon('mail')}<div>We emailed a sign-in link to <b>${maskEmail(u.email)}</b>. It works once and expires in 10 minutes.</div></div><button class="btn client lg block mt12" id="lg-link">Open the demo link</button><button class="btn ghost sm block mt8" id="lg-back">Use a different email</button>`;
  }
  return `<div class="login">
    <section class="login-cover">
      <div class="lc-top">${BRAND_MARK}<div><b>${esc(FIRM.name)}</b><span>${esc(FIRM.sub)} · ${esc(FIRM.city)}</span></div></div>
      <div class="lc-mid"><div class="upper" style="color:var(--gold)">Client portal</div><h1>Your compliance,<br><em>in one place.</em></h1>
        <ul><li>Send papers from your phone — photos are fine</li><li>See every filing with its acknowledgement</li><li>Approve, pay tax and pay fees in one tap</li><li>Ask questions in English, हिन्दी, తెలుగు or தமிழ்</li></ul></div>
      <div class="lc-foot">Secured by one-time codes · every sign-in is logged · runs on CA Firm OS</div>
    </section>
    <section class="login-panel"><div class="login-card">
      <div class="flex between wrap" style="gap:8px"><span class="upper muted">Client sign-in</span><span class="flex" style="gap:6px">${themeBtn()}<div class="seg">${Object.keys(PT).map(l => `<button class="${LOGIN.lang === l ? 'on' : ''}" data-lang="${l}">${l === 'English' ? 'EN' : l === 'हिन्दी' ? 'हि' : 'తె'}</button>`).join('')}</div></span></div>
      <h2>${pt('signinTitle')}</h2>
      <p class="small muted" style="margin:0 0 18px">Use the mobile number or email your CA has on file. No passwords.</p>
      ${step}
      <div class="hr"></div>
      <div class="upper muted mb8">Try a demo client</div>
      <div class="demo-acc">${PORTAL_USERS.map(x => `<button class="${LOGIN.user === x.id ? 'on' : ''}" data-u="${x.id}"><span class="glyph client sm" style="font:700 10px var(--font-body)">${x.first.slice(0, 2).toUpperCase()}</span><span style="flex:1;min-width:0"><b class="small">${esc(x.name)}</b><span class="tiny muted" style="display:block">${esc(x.title)}${x.entities.length > 1 ? ` · ${x.entities.length} entities` : ''}</span></span><span class="tiny muted">${esc(x.lang)}</span></button>`).join('')}</div>
      <p class="tiny muted mt16">${icon('lock').replace('<svg', '<svg width="12" height="12" style="vertical-align:-2px"')} Your CA will never ask for your GST or income-tax portal passwords here. Sessions end after 15 idle minutes.</p>
      <a href="#/login" class="small" style="color:var(--ink-2)">Firm staff? Sign in to the workspace →</a>
    </div></section>
  </div>`;
}
function mountLogin(el) {
  const redraw = () => { el.innerHTML = loginView(); mountLogin(el); };
  bindThemeBtn(el);
  $$('[data-lang]', el).forEach(b => b.onclick = () => { LOGIN.lang = b.dataset.lang; redraw(); });
  $$('[data-m]', el).forEach(b => b.onclick = () => { LOGIN.method = b.dataset.m; LOGIN.err = ''; redraw(); });
  $$('[data-u]', el).forEach(b => b.onclick = () => { const u = PORTAL_USERS.find(x => x.id === b.dataset.u); LOGIN.user = u.id; LOGIN.lang = u.lang; LOGIN.step = 'id'; LOGIN.err = ''; redraw(); });
  const send = $('#lg-send', el);
  if (send) send.onclick = () => {
    if (LOGIN.method === 'otp') {
      const v = $('#lg-phone', el).value.replace(/\D/g, '');
      const u = PORTAL_USERS.find(x => x.phone === v);
      if (!u) { toast(v.length < 10 ? 'Enter your 10-digit mobile number' : 'No client account uses this number. Ask your CA to invite you, or pick a demo client below.', 'bad', 'alert'); $('#lg-phone', el).closest('.phone-in').classList.add('shake'); return; }
      LOGIN.user = u.id; LOGIN.step = 'code'; LOGIN.tries = 4; LOGIN.err = ''; redraw(); toast(`Code sent to ${maskPhone(u.phone)}`, 'client', 'phone');
    } else if (LOGIN.method === 'email') {
      const v = $('#lg-email', el).value.trim().toLowerCase();
      const u = PORTAL_USERS.find(x => x.email === v);
      if (!u) { toast('No client account uses this email. Pick a demo client below.', 'bad', 'alert'); return; }
      LOGIN.user = u.id; LOGIN.step = 'link'; redraw();
    } else {
      if (!LOGIN.user) return toast('Pick a demo client below first', 'warn', 'info');
      const u = PORTAL_USERS.find(x => x.id === LOGIN.user);
      openModal({ html: `<div class="modal-b"><div class="upper muted">DigiLocker · consent</div><h2>Share with ${esc(FIRM.name)}?</h2><dl class="kv mt12"><dt>Name</dt><dd>${esc(u.name)}</dd><dt>PAN</dt><dd class="mono">${esc(clientById(u.entities[0]).pan.slice(0, 5))}•••••</dd><dt>Purpose</dt><dd>Sign in to the client portal</dd><dt>Valid for</dt><dd>This sign-in only</dd></dl><div class="flex mt16" style="justify-content:flex-end"><button class="btn ghost" data-x>Deny</button><button class="btn client" data-ok>Allow</button></div></div>`, onMount: m => { m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-ok]').onclick = () => { closeModal(); portalSignIn(u, true, 'DigiLocker'); }; } });
    }
  };
  const otp = $$('#otp input', el);
  otp.forEach((inp, i) => {
    inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && otp[i + 1]) otp[i + 1].focus(); if (otp.every(x => x.value)) $('#lg-verify', el).click(); };
    inp.onkeydown = e => { if (e.key === 'Backspace' && !inp.value && otp[i - 1]) otp[i - 1].focus(); };
    inp.onpaste = e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (d.length) { e.preventDefault(); d.split('').forEach((c, k) => otp[k] && (otp[k].value = c)); if (d.length === 6) $('#lg-verify', el).click(); } };
  });
  if (otp[0]) setTimeout(() => otp[0].focus(), 60);
  const fill = $('#fill-demo', el); if (fill) fill.onclick = () => { DEMO_OTP.split('').forEach((c, k) => otp[k].value = c); $('#lg-verify', el).click(); };
  const ver = $('#lg-verify', el); if (ver) ver.onclick = () => {
    const code = otp.map(x => x.value).join('');
    if (code === DEMO_OTP) return portalSignIn(PORTAL_USERS.find(x => x.id === LOGIN.user), $('#lg-trust', el).checked, 'mobile OTP');
    LOGIN.tries--; LOGIN.err = LOGIN.tries > 0 ? `That code doesn't match. ${LOGIN.tries} ${LOGIN.tries === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Wait 15 minutes, or ask your CA to reset access.';
    redraw(); $('#otp', el)?.classList.add('shake');
  };
  const back = $('#lg-back', el); if (back) back.onclick = () => { LOGIN.step = 'id'; LOGIN.err = ''; redraw(); };
  const link = $('#lg-link', el); if (link) link.onclick = () => portalSignIn(PORTAL_USERS.find(x => x.id === LOGIN.user), false, 'email link');
}
function portalSignIn(u, trusted, how) {
  STATE.portal = { user: u.id, active: u.entities[0], lang: LOGIN.lang, trusted, since: new Date().toISOString() };
  P_TAB = 'home'; LOGIN.step = 'id'; LOGIN.err = '';
  pLog(`signed in to the client portal (${how}${trusted ? ', trusted device' : ''})`, u.entities[0]);
  save(); rerender(); toast(`${pt('hello')}, ${u.first}`, 'client', 'user');
}

/* ================= THE CLIENT'S APP ================= */
function pData(c) {
  const obs = STATE.obligations.filter(o => o.client === c.id);
  const need = obs.filter(o => o.state === 'awaiting').sort((a, b) => a.due.localeCompare(b.due));
  const tax = obs.filter(o => o.amount && PAYABLE_FORMS.includes(o.form) && ['reconciled', 'review', 'sign'].includes(o.state) && !STATE.payments[o.id]).sort((a, b) => a.due.localeCompare(b.due));
  const fees = STATE.invoices.filter(i => i.client === c.id && ['Sent', 'Overdue'].includes(i.status));
  const team = obs.filter(o => !['awaiting', 'closed', 'scheduled'].includes(o.state)).sort((a, b) => a.due.localeCompare(b.due));
  const filed = obs.filter(o => o.state === 'closed' && o.ack).sort((a, b) => b.due.localeCompare(a.due));
  const coming = obs.filter(o => o.state !== 'closed' && daysTo(o.due) >= 0).sort((a, b) => a.due.localeCompare(b.due));
  const notices = STATE.notices.filter(n => n.client === c.id);
  const approvals = pApprovals(c);
  return { obs, need, tax, fees, team, filed, coming, notices, approvals, n: need.length + approvals.length + tax.length + fees.length };
}
function pApprovals(c) {
  const done = k => STATE.portalDone[c.id + ':' + k];
  const list = [];
  if (c.id === 'c01') {
    list.push({ k: 'ims', kind: 'ims', title: 'Did you receive these goods?', sub: 'Six supplier invoices on the GST invoice system need your word. Your CA still makes the final call — your answer is recorded as your proposal.' });
    list.push({ k: 'gs4', kind: 'letter', title: 'Send a reminder to Sai Tooling Works in your company\'s name?', sub: '₹96,400 of your input credit is stuck because this supplier hasn\'t filed GSTR-1. We drafted a polite letter. Nothing is sent without you.', amount: 96400 });
    list.push({ k: 'au2', kind: 'facts', title: 'Confirm three facts for your tax audit', sub: 'Form 3CD needs your written confirmation of these factual points. Your CA reports what you confirm.', facts: ['Cash payments above ₹10,000 to one person in a day: none', 'Loans or deposits taken in cash: none', 'Payments to related parties: ₹18.4 lakh to Kesarla Tools (sister concern)'] });
    list.push({ k: 'g16', kind: 'consent', title: 'Share audited financials with SBI?', sub: 'For your cash-credit renewal. Goes as a 7-day watermarked link that you can revoke from Profile.' });
  } else if (c.tags.some(t => ['gstm', 'gstq'].includes(t))) {
    list.push({ k: 'ims', kind: 'imsSimple', title: 'Confirm supplier invoices for this month', sub: '12 supplier invoices arrived on the GST system; 9 already match your purchase orders. Tell us if any goods or services did not arrive.' });
  }
  if (c.tags.includes('adv') || c.tags.includes('prof')) {
    const amt = c.turnover ? Math.round(c.turnover * 0.018 / 100) * 100 : 84600;
    list.push({ k: 'dt3', kind: 'estimate', title: 'Advance tax · 15 December instalment', sub: `We estimate ${inr(amt)} is due. Check the assumptions now, so you can argue with them rather than with the interest later.`, amount: amt, facts: ['Income so far this year from your books and AIS, carried at the same pace to March', c.id === 'c25' ? 'Capital gain on the October share sale: ₹2.1 lakh' : 'No one-off income expected before March', 'Tax already deducted at source counted in full'] });
  }
  if (['c01', 'c03', 'c05', 'c15', 'c25'].includes(c.id)) list.push({ k: 'el', kind: 'esign', title: 'Engagement letter for FY 2026-27', sub: 'What we do for you, the fees, and who is responsible for what. E-sign with an Aadhaar OTP.' });
  return list.filter(x => !done(x.k));
}
function portalApp() {
  const u = pUser(), c = pClient(), d = pData(c);
  const tabs = [['home', 'sun'], ['calendar', 'calendar'], ['docs', 'file'], ['approve', 'stamp'], ['pay', 'rupee'], ['chat', 'chat'], ['filings', 'checkCircle'], ['profile', 'user']];
  const badge = { docs: d.need.length, approve: d.approvals.length, pay: d.tax.length + d.fees.length, chat: 0 };
  const body = { home: pHome, calendar: c => `<h2 class="p-h">${pt('calendar')}</h2>` + clientCalendar(c, 'portal'), docs: pDocs, approve: pApprove, pay: pPay, chat: pChat, filings: pFilings, profile: pProfile }[P_TAB](c, d, u);
  return `<div class="portal">
    <header class="p-top">
      <div class="p-brand">${BRAND_MARK}<div><b>${esc(FIRM.name)}</b><span>Client portal</span></div></div>
      <div class="spacer" style="flex:1"></div>
      ${u.entities.length > 1 ? `<label class="sr" for="p-ent">Entity</label><select class="input" id="p-ent" style="height:38px;width:auto;max-width:220px">${u.entities.map(id => `<option value="${id}" ${id === c.id ? 'selected' : ''}>${esc(clientById(id).short)}</option>`).join('')}</select>` : `<span class="chip outline hide-sm">${esc(c.short)}</span>`}
      ${themeBtn()}
      <label class="sr" for="p-lang">Language</label><select class="input" id="p-lang" style="height:38px;width:auto">${Object.keys(PT).map(l => `<option ${l === pLang() ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="persona" id="p-me" title="${esc(u.name)}"><span class="glyph client sm" style="font:700 10px var(--font-body)">${u.first.slice(0, 2).toUpperCase()}</span><span class="who hide-sm">${esc(u.first)}<small>${pt('signout')}</small></span></button>
    </header>
    <nav class="p-tabs" aria-label="Portal">${tabs.map(([k, i]) => `<button class="${P_TAB === k ? 'on' : ''}" data-pt="${k}">${icon(i)}${pt(k)}${badge[k] ? `<span class="n">${badge[k]}</span>` : ''}</button>`).join('')}</nav>
    <main class="p-main">${body}</main>
    <nav class="p-bottom" aria-label="Portal">${tabs.slice(0, 6).map(([k, i]) => `<button class="${P_TAB === k ? 'on' : ''}" data-pt="${k}">${icon(i)}<span>${pt(k)}</span>${badge[k] ? '<b></b>' : ''}</button>`).join('')}</nav>
  </div>`;
}
function mountPortal(el) {
  const c = pClient();
  bindThemeBtn(el);
  $$('[data-pt]', el).forEach(b => b.onclick = () => { P_TAB = b.dataset.pt; rerender(); window.scrollTo({ top: 0 }); });
  const ent = $('#p-ent', el); if (ent) ent.onchange = () => { STATE.portal.active = ent.value; save(); rerender(); toast(`Switched to ${clientById(ent.value).short}`, 'client', 'building'); };
  $('#p-lang', el).onchange = e => { STATE.portal.lang = e.target.value; save(); rerender(); };
  $('#p-me', el).onclick = () => confirmModal(pt('signout') + '?', 'You\'ll need a fresh one-time code to come back.', pt('signout'), portalSignOut);
  $$('[data-go-tab]', el).forEach(b => b.onclick = () => { P_TAB = b.dataset.goTab; rerender(); window.scrollTo({ top: 0 }); });
  $$('[data-ack]', el).forEach(b => b.onclick = () => openAck(b.dataset.ack));
  ({ docs: mountPDocs, approve: mountPApprove, pay: mountPPay, chat: mountPChat, profile: mountPProfile, home: mountPHome }[P_TAB] || (() => { }))(el, c);
  bindClientRecords(el, c, 'portal');
}
function portalSignOut() { pLog('signed out of the client portal'); STATE.portal = null; save(); rerender(); toast('Signed out', 'code', 'lock'); }

/* ---- Home ---- */
function pHome(c, d, u) {
  const nextFiled = d.filed.slice(0, 3);
  const mgr = person(c.manager);
  const tile = (tab, ic, n, label, sub) => `<button class="card p-act" data-go-tab="${tab}"><span class="p-ic">${icon(ic)}</span><span class="p-n">${n}</span><b>${label}</b><span class="tiny muted">${sub}</span></button>`;
  const payTotal = d.tax.reduce((s, o) => s + o.amount, 0) + d.fees.reduce((s, i) => s + i.amt, 0);
  return `<section class="p-cover">
      <div class="upper" style="color:#A3A8B1">${DOW[TODAY.getDay()]}, ${fmtDY(TODAY)} · ${esc(c.name)}</div>
      <h1>${pt('hello')}, ${esc(u.first)}. <em>${d.n ? pt('needYou').replace('{n}', d.n) : pt('allClear')}</em></h1>
      <div class="flex wrap" style="gap:18px;margin-top:14px;position:relative;z-index:1">
        <div class="ring sm" style="--p:${c.health};--c:var(--gold)"><b style="color:var(--ink)">${c.health}</b></div>
        <div class="small" style="color:#C9CCD2;max-width:440px">Compliance health for ${esc(c.short)}. ${d.filed.length} filings done in the last few weeks; ${d.coming.length} coming up. Your manager is <b style="color:#fff">${esc(mgr.name)}</b>.</div>
      </div>
    </section>
    <div class="grid g3 mt16">
      ${tile('docs', 'upload', d.need.length, pt('upload'), d.need.length ? `Papers for ${d.need.slice(0, 2).map(o => o.form).join(', ')}` : 'Nothing requested right now')}
      ${tile('approve', 'stamp', d.approvals.length, pt('approve'), d.approvals.length ? d.approvals[0].title : 'Nothing waiting')}
      ${tile('pay', 'rupee', d.tax.length + d.fees.length, pt('pay'), payTotal ? inr(payTotal) + ' due' : 'Nothing due')}
    </div>
    <div class="grid g-main mt16">
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>${pt('withTeam')}<small>What your CA firm is working on for you</small></h3></div><div class="list">${d.team.slice(0, 6).map(o => `<div class="row"><div class="grow"><div class="t1">${esc(o.form)} · ${esc(o.period)}</div><div class="t2">${esc(o.name)}</div></div>${domChip(o.d)}${pState(o.state)}</div>`).join('') || '<div class="empty small">Nothing in progress.</div>'}</div></div>
        <div class="card"><div class="card-h"><h3>${pt('filed')}</h3><div class="right"><button class="btn xs" data-go-tab="filings">All</button></div></div><div class="list">${nextFiled.map(o => `<div class="row"><span class="glyph code sm" style="background:var(--ok)"></span><div class="grow"><div class="t1">${esc(o.form)} · ${esc(o.period)}</div><div class="t2 mono">${esc(o.ack)}</div></div><button class="btn xs" data-ack="${o.id}">${icon('eye')}View</button></div>`).join('') || '<div class="empty small">Your filings will appear here with their acknowledgements.</div>'}</div></div>
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>${pt('upcoming')}</h3><div class="right"><button class="btn xs" data-go-tab="calendar">${icon('calendar')} ${pt('calendar')}</button></div></div><div class="card-b"><div class="timeline">${d.coming.slice(0, 5).map(o => `<div class="tl ${P_WORDS[o.state][1]}"><div class="tt">${fmtD(o.due)} · ${esc(o.form)}</div><div class="td">${esc(o.period)} · ${P_WORDS[o.state][0]}</div></div>`).join('') || '<div class="muted small">No dates in the next few weeks.</div>'}</div></div></div>
        ${d.notices.length ? `<div class="card"><div class="card-h"><h3>Notices</h3></div><div class="list">${d.notices.map(n => `<div class="row"><span class="glyph gate sm">!</span><div class="grow"><div class="t1">${esc(n.type)}</div><div class="t2" style="white-space:normal">${n.stage === 'Replied' ? 'Replied by your partner' : `Your partner ${esc(actorName(n.owner))} is handling it · reply due ${fmtD(n.replyBy)}`}</div></div></div>`).join('')}</div></div>` : ''}
        <div class="card pad"><div class="flex">${avatar(mgr.id, 'lg')}<div style="flex:1"><b>${esc(mgr.name)}</b><div class="small muted">${esc(mgr.focus)}</div></div></div><div class="flex mt12"><button class="btn sm block" data-go-tab="chat">${icon('chat')} Message</button><button class="btn sm block" id="book">${icon('calendar')} Book a call</button></div></div>
      </div>
    </div>`;
}
function mountPHome(el, c) { const b = $('#book', el); if (b) b.onclick = () => bookCall(c); }
function bookCall(c) {
  const mgr = person(c.manager); const slots = [1, 1, 2, 2, 3].map((dd, i) => { const d = new Date(TODAY.getTime() + dd * 864e5); d.setHours([11, 16, 10, 15, 12][i], i % 2 ? 30 : 0); return d; });
  openModal({ html: `<div class="modal-b"><h2>Book a call with ${esc(mgr.short)}</h2><p class="small dim">15 minutes, by phone or video. Slots come from ${esc(mgr.short)}'s calendar.</p><div class="grid g2 mt12" style="gap:8px">${slots.map((s, i) => `<button class="btn" data-slot="${i}">${DOW[s.getDay()]} ${fmtD(s)} · ${fmtT(s)}</button>`).join('')}</div><div class="flex mt16" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button></div></div>`,
    onMount: m => { m.querySelector('[data-x]').onclick = () => closeModal(); $$('[data-slot]', m).forEach(b => b.onclick = () => { const s = slots[+b.dataset.slot]; pLog(`booked a call with ${mgr.short} for ${fmtDT(s)}`, c.id); STATE.tasks.push({ id: 'tk' + Date.now(), title: `Client call · ${c.short} (booked in portal)`, client: c.id, who: mgr.id, by: mgr.id, due: s.toISOString(), done: false }); save(); closeModal(); toast(`Booked · ${DOW[s.getDay()]} ${fmtD(s)} at ${fmtT(s)}`, 'client', 'calendar'); }); } });
}

/* ---- Documents ---- */
function pDocs(c, d) {
  const docs = STATE.docs.filter(x => x.client === c.id).sort((a, b) => b.at.localeCompare(a.at));
  const word = x => x.status === 'G2' ? '<span class="chip client">Unclear — please re-send</span>' : /CL-2/.test(x.status) ? '<span class="chip gate">Notice · partner handling</span>' : /Duplicate/.test(x.status) ? '<span class="chip warn">Looks like a duplicate</span>' : '<span class="chip ok">' + icon('check') + 'Received & read</span>';
  return `<h2 class="p-h">${pt('docs')}</h2>
    <div class="drop" id="p-drop">${icon('upload')}<h3 class="serif" style="margin:8px 0 4px;font-size:20px">Drop files or tap to choose</h3><p class="small muted" style="margin:0 0 10px">Photos of bills are fine. We sort them into the right return for you.</p><button class="btn client" id="p-pick">${icon('file')} Choose files</button><input type="file" id="p-file" multiple hidden></div>
    <div id="p-pipes" class="mt12"></div>
    <div class="mt16">
      <div class="card"><div class="card-h"><h3>What we need from you<small>${d.need.length} returns waiting on papers</small></h3></div><div class="list">${d.need.map(o => `<div class="row" style="align-items:flex-start"><div class="grow"><div class="t1">${esc(o.form)} · ${esc(o.period)}</div><div class="t2">Send by ${fmtD(new Date(new Date(o.due).getTime() - 3 * 864e5))} · due ${fmtD(o.due)}</div><div class="flex wrap mt8" style="gap:6px">${DOC_NAMES.slice(0, o.docs[0]).map((n, i) => `<span class="chip ${i < o.docs[1] ? 'ok' : 'client'}">${i < o.docs[1] ? icon('check') : icon('upload')}${n}</span>`).join('')}</div></div><button class="btn xs client" data-up="${o.id}">${pt('upload')}</button></div>`).join('') || `<div class="empty">${icon('checkCircle')}<p>Nothing requested right now.</p></div>`}</div></div>
    </div>
    <h2 class="p-h mt24">All documents</h2>
    ${clientDocs(c, 'portal')}`;
}
function mountPDocs(el, c) {
  const f = $('#p-file', el); let target = null;
  $('#p-pick', el).onclick = () => { target = null; f.click(); };
  $$('[data-up]', el).forEach(b => b.onclick = () => { target = b.dataset.up; f.click(); });
  f.onchange = () => portalUpload([...f.files], c, target);
  const dz = $('#p-drop', el);
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => portalUpload([...e.dataTransfer.files], c, null));
}
function portalUpload(files, c, obId) {
  if (!files.length) return;
  const pipes = $('#p-pipes');
  files.forEach((file, i) => {
    const k = classify(file.name); const id = 'pu' + Date.now().toString(36) + i;
    pipes.insertAdjacentHTML('afterbegin', `<div class="card pad mb8" id="${id}"><div class="flex between"><b class="small">${esc(file.name)}</b><span class="tiny muted">${(file.size / 1024).toFixed(0)} KB</span></div><div class="pipe mt8"><span class="ps run">Uploading</span><span class="ps">Received</span><span class="ps">Reading</span><span class="ps">Filed with your return</span></div></div>`);
    const ps = $$('#' + id + ' .ps'); let s = 0;
    const tick = () => {
      ps[s].className = 'ps done'; s++;
      if (s < ps.length) { ps[s].className = 'ps run'; setTimeout(tick, 450); return; }
      const ob = obId ? STATE.obligations.find(o => o.id === obId) : STATE.obligations.find(o => o.client === c.id && o.state === 'awaiting');
      STATE.docs.unshift({ id, name: file.name, client: c.id, ch: 'Client portal', at: new Date().toISOString(), cls: k.cls, period: ob ? ob.period : '—', conf: +k.conf.toFixed(2), status: k.conf < 0.85 ? 'G2' : k.notice ? 'CL-2 → partner' : 'Filed', fields: { 'Uploaded by': pUser().name } });
      if (ob && ob.docs[1] < ob.docs[0]) { ob.docs[1]++; if (ob.docs[1] >= ob.docs[0] && ob.state === 'awaiting') ob.state = 'received'; }
      if (k.conf < 0.85) STATE.gates.push({ id: 'g2-' + id, gate: 'G2', title: `Confirm values · ${file.name}`, client: c.id, amount: 0, prep: 'IN-1', created: new Date().toISOString(), due: new Date(Date.now() + 8 * 3600e3).toISOString(), status: 'pending', ev: [`Uploaded by ${pUser().name} in the client portal`, `Confidence ${k.conf.toFixed(2)} — below the 0.85 bar`] });
      pLog(`uploaded “${file.name}”${ob ? ' for ' + ob.form + ' · ' + ob.period : ''}`, c.id, ob ? ob.form + ' · ' + ob.period : 'Vault');
      ledgerAdd({ actor: 'IN-1', kind: 'agent', action: `read “${file.name}” as ${k.cls} · confidence ${k.conf.toFixed(2)}`, client: c.id, obj: 'Vault' });
      save(); updateCounts();
      toast(k.conf < 0.85 ? `${file.name}: received, but a little unclear — someone at the firm will check it` : `${file.name} received and filed`, 'client', 'check');
      if (i === files.length - 1) setTimeout(rerender, 900);
    };
    setTimeout(tick, 300 + i * 200);
  });
}

/* ---- Approvals ---- */
function pApprove(c, d) {
  const card = a => {
    let inner = '';
    if (a.kind === 'ims') inner = `<div class="list mt12" style="border:1px solid var(--line);border-radius:12px">${IMS.slice(0, 6).map(r => `<div class="row"><div class="grow"><div class="t1">${esc(r.sup)}</div><div class="t2 mono">${esc(r.inv)} · ${inr(r.val)}</div></div><div class="seg" data-imsrow="${esc(r.inv)}"><button class="on">Received</button><button>Not received</button></div></div>`).join('')}</div>`;
    if (a.kind === 'letter') inner = `<details class="mt12"><summary class="small" style="cursor:pointer;font-weight:600">Read the letter</summary><div class="ack-doc mt8 small">Dear Sir/Madam,<br><br>Our records show invoice STW/112 for ₹6,32,000 dated 08-Sep-2026 has not been reported in your GSTR-1 for September 2026. As a result the input tax credit of ₹96,400 is not available to us. We request you to file or amend your return at the earliest and confirm.<br><br>For ${esc(c.name)}<br>(Authorised signatory)</div></details>`;
    if (a.kind === 'facts' || a.kind === 'estimate') inner = `<ul class="mt12 small" style="margin-bottom:0;padding-left:18px;display:grid;gap:6px">${a.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>${a.amount && a.kind === 'estimate' ? `<div class="mt12"><span class="upper muted">Estimated instalment</span><div class="num" style="font:600 26px var(--font-display)">${inr(a.amount)}</div></div>` : ''}`;
    const btns = { ims: ['Send my answers', 'Ask a question'], imsSimple: ['All received', 'Some did not arrive'], letter: ['Approve & send', 'Not now'], facts: ['Confirm all three', 'Something is wrong'], consent: ['Allow sharing', 'Don\'t share'], estimate: ['Looks right', 'Challenge an assumption'], esign: ['E-sign with Aadhaar OTP', 'Ask a question'] }[a.kind];
    return `<div class="card pad p-appr" data-ak="${a.k}"><div class="flex" style="align-items:flex-start"><span class="glyph client sm"></span><div style="flex:1;min-width:0"><b style="font-size:15.5px">${esc(a.title)}</b><p class="small dim" style="margin:4px 0 0">${esc(a.sub)}</p>${inner}<div class="flex wrap mt12"><button class="btn client sm" data-yes="${a.k}">${btns[0]}</button><button class="btn sm" data-no="${a.k}">${btns[1]}</button></div></div></div></div>`;
  };
  const done = Object.entries(STATE.portalDone).filter(([k]) => k.startsWith(c.id + ':'));
  return `<h2 class="p-h">${pt('approve')}</h2>
    <div class="callout client mb16">${icon('info')}<div>These need your word. Your CA firm does the work; things only you can confirm — receipt of goods, facts for the audit, sharing your data, letters in your name — wait here for you.</div></div>
    <div class="grid" style="gap:12px">${d.approvals.map(card).join('') || `<div class="card empty">${icon('checkCircle')}<p>Nothing waiting for your approval.</p></div>`}</div>
    ${done.length ? `<div class="card mt16"><div class="card-h"><h3>Done</h3></div><div class="list">${done.map(([k, v]) => `<div class="row"><span class="chip ${v.yes ? 'ok' : 'outline'}">${v.yes ? icon('check') : ''}${esc(v.label)}</span><div class="grow small">${esc(v.title)}</div><span class="tiny muted">${fmtDT(v.at)}</span></div>`).join('')}</div></div>` : ''}`;
}
function mountPApprove(el, c) {
  $$('[data-imsrow]', el).forEach(sg => $$('button', sg).forEach(b => b.onclick = () => $$('button', sg).forEach(x => x.classList.toggle('on', x === b))));
  const finish = (a, yes, label, extra) => {
    STATE.portalDone[c.id + ':' + a.k] = { yes, label, title: a.title, at: new Date().toISOString() };
    pLog(`${yes ? 'approved' : 'declined'} — ${a.title}${extra ? ' · ' + extra : ''}`, c.id, 'Client approval');
    save(); toast(yes ? 'Done — your CA team has been told' : 'Noted — your CA team will follow up', 'client', yes ? 'check' : 'chat'); rerender();
  };
  const find = k => pApprovals(c).find(x => x.k === k);
  $$('[data-yes]', el).forEach(b => b.onclick = () => {
    const a = find(b.dataset.yes);
    if (a.kind === 'ims') { const rows = $$('[data-imsrow]', el).map(sg => [sg.dataset.imsrow, $('button.on', sg).textContent === 'Received' ? 'Accept' : 'Reject']); rows.forEach(([inv, v]) => { if (STATE.ims[inv]) STATE.ims[inv].client = v; }); return finish(a, true, 'Answered', `${rows.filter(r => r[1] === 'Accept').length} received, ${rows.filter(r => r[1] === 'Reject').length} not received — recorded as the client's proposal; the firm still commits at G3`); }
    if (a.kind === 'esign') return esignFlow(a, () => finish(a, true, 'E-signed', 'Aadhaar OTP e-sign'));
    if (a.kind === 'letter') return finish(a, true, 'Approved', 'letter sent to Sai Tooling Works in the client\'s name (G12 client approval)');
    if (a.kind === 'consent') return finish(a, true, 'Allowed', '7-day link to SBI (G16 consent on file)');
    finish(a, true, a.kind === 'facts' ? 'Confirmed' : 'Accepted');
  });
  $$('[data-no]', el).forEach(b => b.onclick = () => {
    const a = find(b.dataset.no);
    if (['letter', 'consent'].includes(a.kind)) return finish(a, false, a.kind === 'letter' ? 'Not now' : 'Declined');
    openModal({ html: `<div class="modal-b"><h2>Tell your CA team</h2><p class="small dim">${esc(a.title)}</p><textarea class="input mt12" id="p-why" rows="4" placeholder="What's different, or what would you like to ask?"></textarea><div class="flex mt16" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn client" data-ok>Send</button></div></div>`,
      onMount: m => { m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-ok]').onclick = () => { const why = $('#p-why', m).value.trim(); if (!why) return $('#p-why', m).classList.add('shake'); const t = pThread(c); t.msgs.push({ at: new Date().toISOString(), from: 'in', text: `${a.title}: ${why}` }, { at: new Date().toISOString(), from: 'route', text: `Routed to ${actorName(c.manager)} · G10` }); t.unread = (t.unread || 0) + 1; closeModal(); finish(a, false, 'Questioned', '“' + why + '”'); }; } });
  });
}
function esignFlow(a, done) {
  openModal({ html: `<div class="modal-b" style="text-align:center"><div class="upper muted">Aadhaar e-sign</div><h2>Enter the OTP sent to your Aadhaar-linked mobile</h2><div class="otp" id="es">${[...Array(6)].map((_, i) => `<input id="es${i}" inputmode="numeric" maxlength="1" aria-label="Digit ${i + 1}">`).join('')}</div><button class="chip client" id="es-fill" style="border:0;cursor:pointer">Demo code ${DEMO_OTP} · tap to fill</button><div class="flex mt16" style="justify-content:center"><button class="btn ghost" data-x>Cancel</button><button class="btn client" data-ok>Sign</button></div></div>`,
    onMount: m => {
      const ins = $$('#es input', m);
      ins.forEach((inp, i) => { inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && ins[i + 1]) ins[i + 1].focus(); }; });
      $('#es-fill', m).onclick = () => DEMO_OTP.split('').forEach((c, k) => ins[k].value = c);
      m.querySelector('[data-x]').onclick = () => closeModal();
      m.querySelector('[data-ok]').onclick = () => { if (ins.map(x => x.value).join('') !== DEMO_OTP) { $('#es', m).classList.add('shake'); return; } m.querySelector('.modal-b').innerHTML = `<div class="seal-anim" style="color:var(--client);border-color:var(--client)">E-SIGNED<br>AADHAAR<br>${fmtD(new Date()).toUpperCase()}</div><p class="small dim">${esc(a.title)}</p>`; setTimeout(() => { closeModal(); done(); }, 1200); };
    } });
}

/* ---- Payments ---- */
function pPay(c, d) {
  const hist = [...Object.entries(STATE.payments).filter(([id]) => STATE.obligations.find(o => o.id === id && o.client === c.id)).map(([id, p]) => ({ t: STATE.obligations.find(o => o.id === id).form + ' · tax', amt: p.amt, at: p.at, ref: p.ref })), ...STATE.invoices.filter(i => i.client === c.id && i.status === 'Paid').map(i => ({ t: 'Fees · ' + i.no, amt: i.amt, at: i.paidAt || i.date, ref: i.ref || '—' }))].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return `<h2 class="p-h">${pt('pay')}</h2>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h3>Tax to pay<small>Computed by your CA firm's engine and checked by a reviewer</small></h3></div><div class="list">${d.tax.map(o => `<div class="row"><div class="grow"><div class="t1">${esc(o.form)} · ${esc(o.period)}</div><div class="t2">Pay before ${fmtD(new Date(new Date(o.due).getTime() - 864e5))} · return due ${fmtD(o.due)}</div></div><b class="num">${inr(o.amount)}</b><button class="btn xs client" data-paytax="${o.id}">${pt('payNow')}</button></div>`).join('') || `<div class="empty small">No tax waiting for payment.</div>`}</div></div>
      <div class="card"><div class="card-h"><h3>Fees<small>Invoices from ${esc(FIRM.name)}</small></h3></div><div class="list">${d.fees.map(i => `<div class="row"><div class="grow"><div class="t1 mono">${esc(i.no)}</div><div class="t2">${i.age} days old${i.age > 60 ? ' · please settle soon' : ''}</div></div><b class="num">${inr(i.amt)}</b><button class="btn xs client" data-payfee="${esc(i.no)}">${pt('payNow')}</button></div>`).join('') || `<div class="empty small">No fees outstanding. Thank you.</div>`}</div></div>
    </div>
    <div class="card mt16"><div class="card-h"><h3>Payment history</h3></div><div class="list">${hist.map(h => `<div class="row"><span class="chip ok">${icon('check')}Paid</span><div class="grow"><div class="t1">${esc(h.t)}</div><div class="t2 mono">${esc(h.ref)}</div></div><span class="num">${inr(h.amt)}</span></div>`).join('') || '<div class="empty small">Payments you make here will be listed with their bank reference.</div>'}</div></div>`;
}
function mountPPay(el, c) {
  $$('[data-paytax]', el).forEach(b => b.onclick = () => { const o = STATE.obligations.find(x => x.id === b.dataset.paytax); payFlow(`${o.form} · ${o.period}`, o.amount, 'Challan PMT-06 / ITNS 281 generated by your CA', ref => { STATE.payments[o.id] = { amt: o.amount, at: new Date().toISOString(), ref }; pLog(`paid ${inr(o.amount)} for ${o.form} · ${o.period} — CIN ${ref}`, c.id, o.form + ' · ' + o.period); }); });
  $$('[data-payfee]', el).forEach(b => b.onclick = () => { const i = STATE.invoices.find(x => x.no === b.dataset.payfee); payFlow(`Fees · ${i.no}`, i.amt, `Pay ${FIRM.name}`, ref => { i.status = 'Paid'; i.paidAt = new Date().toISOString(); i.ref = ref; pLog(`paid fee invoice ${i.no} — ${inr(i.amt)} · UTR ${ref}`, c.id, 'Billing'); }); });
}
function payFlow(title, amt, sub, onPaid) {
  const r = seeded(title); const cells = [...Array(441)].map((_, i) => { const x = i % 21, y = Math.floor(i / 21); const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13); if (finder) { const fx = x > 13 ? x - 14 : x, fy = y > 13 ? y - 14 : y; return (fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx > 1 && fx < 5 && fy > 1 && fy < 5)) ? 1 : 0; } return r() > 0.52 ? 1 : 0; });
  openModal({ html: `<div class="modal-b" style="text-align:center"><div class="upper muted">${esc(sub)}</div><h2>${esc(title)}</h2><div class="num" style="font:600 34px var(--font-display);margin:6px 0 14px">${inr(amt)}</div>
    <div id="pay-body"><div class="qr" style="margin:0 auto">${cells.map(v => `<i class="${v ? '' : 'o'}"></i>`).join('')}</div><p class="small dim mt12">Scan with any UPI app, or choose one:</p><div class="flex wrap" style="justify-content:center;gap:8px">${['BHIM', 'PhonePe', 'Google Pay', 'Net banking'].map(n => `<button class="btn sm" data-app="${n}">${n}</button>`).join('')}</div></div>
    <p class="tiny muted mt16">Demo only — no money moves. In production the payment goes straight to the government or the firm's bank, never through CA Firm OS.</p><button class="btn ghost sm" data-x>Cancel</button></div>`,
    onMount: m => {
      m.querySelector('[data-x]').onclick = () => closeModal();
      $$('[data-app]', m).forEach(b => b.onclick = () => {
        $('#pay-body', m).innerHTML = `<div class="pipe" style="justify-content:center"><span class="ps run">Waiting for ${esc(b.dataset.app)} to confirm…</span></div>`;
        setTimeout(() => { const ref = String(Math.floor(1e11 + Math.random() * 9e11)); onPaid(ref); save(); $('#pay-body', m).innerHTML = `<div class="seal-anim" style="color:var(--ok);border-color:var(--ok)">PAID<br>${fmtD(new Date()).toUpperCase()}</div><p class="small">Reference <b class="mono">${ref}</b></p>`; m.querySelector('[data-x]').textContent = 'Done'; m.querySelector('[data-x]').onclick = () => { closeModal(); rerender(); }; toast('Payment received — your CA team can see it', 'ok', 'check'); }, 1500);
      });
    } });
}

/* ---- Messages ---- */
function pThread(c) {
  let t = STATE.threads.find(x => x.client === c.id);
  if (!t) { t = { id: 't-' + c.id, client: c.id, channel: 'Portal', lang: c.lang, unread: 0, msgs: [] }; STATE.threads.push(t); }
  return t;
}
function pBubble(m, c) {
  if (m.from === 'in') return `<div class="bubble out" style="background:var(--client)">${esc(m.text)}<div class="tiny" style="opacity:.8;margin-top:3px">${fmtT(m.at)}</div></div>`;
  if (m.from === 'agent') return `<div class="bubble in"><div class="tiny muted" style="margin-bottom:3px">${esc(FIRM.name)} · instant answer</div>${esc(m.text)}</div>`;
  if (m.from === 'staff') return `<div class="bubble in" style="border:1px solid var(--line-2)"><div class="tiny muted" style="margin-bottom:3px">${esc(actorName(m.by))} · ${esc(person(m.by)?.focus || '')}</div>${esc(m.text)}</div>`;
  return `<div class="bubble route">${/routed|Routed|closed list|G10|G12/.test(m.text) ? `Passed to ${esc(actorName(c.manager))} — they'll reply to you personally.` : esc(m.text)}</div>`;
}
function pChat(c) {
  const t = pThread(c);
  return `<h2 class="p-h">${pt('chat')}</h2>
    <div class="card" style="display:flex;flex-direction:column;min-height:540px">
      <div class="card-h">${avatar(c.manager)}<h3>${esc(actorName(c.manager))} & team<small>Simple questions are answered instantly from your records; anything else goes to a person.</small></h3></div>
      <div class="chat" id="p-chat" style="flex:1;overflow-y:auto;max-height:56vh">${t.msgs.map(m => pBubble(m, c)).join('') || '<div class="empty small">Ask anything — in English, हिन्दी, తెలుగు or தமிழ்.</div>'}</div>
      <div style="padding:10px 12px 0" class="flex wrap">${['Is it filed?', 'What is outstanding?', 'When is the next due date?', 'Who handles my account?'].map(q => `<button class="chip client" style="border:0;cursor:pointer" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="flex" style="padding:12px"><label class="sr" for="p-msg">Message</label><input class="input" id="p-msg" placeholder="Type a message…"><button class="btn client" id="p-send" aria-label="Send">${icon('send')}</button></div>
    </div>`;
}
function mountPChat(el, c) {
  const t = pThread(c); const box = $('#p-chat', el); box.scrollTop = box.scrollHeight;
  const send = txt => {
    txt = txt.trim(); if (!txt) return;
    const m = { at: new Date().toISOString(), from: 'in', text: txt }; t.msgs.push(m); pLog('sent a message in the portal', c.id, 'Messages');
    if (box.querySelector('.empty')) box.innerHTML = '';
    box.insertAdjacentHTML('beforeend', pBubble(m, c) + '<div class="bubble route" id="p-typing">…</div>'); box.scrollTop = box.scrollHeight;
    setTimeout(() => { $('#p-typing')?.remove(); const out = cl1Respond(t, txt); out.forEach(x => { t.msgs.push(x); box.insertAdjacentHTML('beforeend', pBubble(x, c)); }); if (out.some(x => x.from === 'route')) t.unread = (t.unread || 0) + 1; box.scrollTop = box.scrollHeight; save(); }, 800);
  };
  $('#p-send', el).onclick = () => { send($('#p-msg', el).value); $('#p-msg', el).value = ''; };
  $('#p-msg', el).onkeydown = e => { if (e.key === 'Enter') { send(e.target.value); e.target.value = ''; } };
  $$('[data-q]', el).forEach(b => b.onclick = () => send(b.dataset.q));
}

/* ---- Filings ---- */
function pFilings(c, d) {
  return `<h2 class="p-h">${pt('filings')}</h2>${filedList(c, 'portal')}<h2 class="p-h mt24">${pt('scope')}</h2>${scopePanel(c, 'portal')}`;
}
function openAck(id) {
  const o = STATE.obligations.find(x => x.id === id) || TL_INDEX[id]; if (!o) return; const c = clientById(o.client);
  openModal({ wide: true, html: `<div class="modal-b"><div class="ack-doc"><div class="flex between wrap"><b style="font:600 18px var(--font-display)">Acknowledgement</b><span class="stamp ok">Filed</span></div><div class="hr"></div><dl class="kv"><dt>Form</dt><dd>${esc(o.form)} — ${esc(o.name)}</dd><dt>Period</dt><dd>${esc(o.period)}</dd><dt>Taxpayer</dt><dd>${esc(c.name)}</dd><dt>${c.gstin ? 'GSTIN' : 'PAN'}</dt><dd class="mono">${esc(c.gstin || c.pan)}</dd><dt>Reference</dt><dd class="mono">${esc(o.ack)}</dd><dt>Filed on</dt><dd>${fmtDY(filedOn(o))}${o.lateBy ? ` · ${o.lateBy} day${o.lateBy > 1 ? 's' : ''} after the due date` : ''}</dd><dt>Filed by</dt><dd>${esc(FIRM.name)} on your behalf, signed by ${esc(actorName(o.partner))}</dd></dl><p class="tiny muted mt12">Demo rendering of the portal acknowledgement. The original PDF stays in your document vault.</p></div><div class="flex mt16" style="justify-content:flex-end"><button class="btn primary" data-x>Close</button></div></div>`, onMount: m => m.querySelector('[data-x]').onclick = () => closeModal() });
}

/* ---- Profile ---- */
function pProfile(c, d, u) {
  STATE.portalPrefs = STATE.portalPrefs || {};
  const pr = STATE.portalPrefs[c.id] = STATE.portalPrefs[c.id] || { ch: c.channel === 'Email' ? 'Email' : 'WhatsApp', quiet: true, wa: true, mk: false, sbi: !!STATE.portalDone[c.id + ':g16']?.yes };
  const org = (CLIENT_ORG[c.id] || [[u.name, 'Owner', 'Full access', 'Approve · pay · upload · message']]).concat((STATE.portalInvites || {})[c.id] || []);
  const services = CATALOGUE.filter(f => f.m === 'cert' && ['CERT'].includes(f.d) || f.d === 'ADV');
  return `<h2 class="p-h">${pt('profile')}</h2>
    <div class="grid g2">
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card pad"><div class="upper muted mb8">${esc(c.type)}</div><b style="font:600 20px var(--font-display)">${esc(c.name)}</b><dl class="kv mt12"><dt>PAN</dt><dd class="mono">${esc(c.pan)}</dd>${c.gstin ? `<dt>GSTIN</dt><dd class="mono">${esc(c.gstin)}</dd>` : ''}<dt>Partner</dt><dd>${esc(person(c.partner).name)}</dd><dt>Manager</dt><dd>${esc(person(c.manager).name)}</dd></dl></div>
        <div class="card"><div class="card-h"><h3>People with access<small>Who in your organisation can use this portal</small></h3><div class="right"><button class="btn xs client" id="invite">${icon('plus')} Invite</button></div></div><div class="list">${org.map(([n, r, lvl, what]) => `<div class="row"><span class="glyph client sm" style="font:700 9px var(--font-body)">${esc(n.split(' ').map(w => w[0]).join('').slice(0, 2))}</span><div class="grow"><div class="t1">${esc(n)}</div><div class="t2">${esc(r)} · ${esc(what)}</div></div><span class="chip ${lvl === 'Full access' ? 'client' : 'outline'}">${esc(lvl)}</span></div>`).join('')}</div></div>
        <div class="card"><div class="card-h"><h3>Request a service</h3></div><div class="card-b"><label class="sr" for="svc">Service</label><select class="input" id="svc">${services.map(f => `<option value="${esc(f.id)}">${esc(f.n)}</option>`).join('')}</select><textarea class="input mt8" id="svc-note" rows="2" placeholder="Anything we should know? (optional)"></textarea><button class="btn client sm mt8" id="svc-go">Send request</button></div></div>
      </div>
      <div class="grid" style="gap:16px;align-content:start">
        <div class="card"><div class="card-h"><h3>How we reach you</h3></div><div class="list">
          <div class="row"><div class="grow"><div class="t1">Channel</div></div><div class="seg" id="pf-ch">${['WhatsApp', 'Email', 'Both'].map(x => `<button class="${pr.ch === x ? 'on' : ''}">${x}</button>`).join('')}</div></div>
          <div class="row"><div class="grow"><div class="t1">Language</div><div class="t2">Messages, reminders and this portal</div></div><span class="chip outline">${esc(pLang())}</span></div>
          <div class="row"><div class="grow"><div class="t1">Quiet hours</div><div class="t2">No messages 9 pm – 8 am, except same-day deadlines</div></div><label class="switch"><input type="checkbox" id="pf-quiet" ${pr.quiet ? 'checked' : ''}><span></span></label></div>
        </div></div>
        <div class="card"><div class="card-h"><h3>Your consents<small>Under the Digital Personal Data Protection Act. Change them any time.</small></h3></div><div class="list">
          <div class="row"><div class="grow"><div class="t1">Use my data for my compliance work</div><div class="t2">Needed for your CA to act for you</div></div><span class="chip outline">${icon('lock')}Required</span></div>
          <div class="row"><div class="grow"><div class="t1">Updates on WhatsApp</div></div><label class="switch"><input type="checkbox" data-cs="wa" ${pr.wa ? 'checked' : ''}><span></span></label></div>
          ${c.id === 'c01' ? `<div class="row"><div class="grow"><div class="t1">Share audited financials with SBI</div><div class="t2">${pr.sbi ? '7-day link, watermarked' : 'Not shared'}</div></div><label class="switch"><input type="checkbox" data-cs="sbi" ${pr.sbi ? 'checked' : ''}><span></span></label></div>` : ''}
          <div class="row"><div class="grow"><div class="t1">Newsletters and tax tips</div></div><label class="switch"><input type="checkbox" data-cs="mk" ${pr.mk ? 'checked' : ''}><span></span></label></div>
        </div></div>
        <div class="card"><div class="card-h"><h3>Where you're signed in</h3></div><div class="list">
          <div class="row">${icon('globe', 'chev')}<div class="grow"><div class="t1">This browser</div><div class="t2">Since ${fmtDT(STATE.portal.since)}${STATE.portal.trusted ? ' · trusted for 30 days' : ''}</div></div><span class="chip ok">Now</span></div>
          <div class="row">${icon('phone', 'chev')}<div class="grow"><div class="t1">iPhone · WhatsApp link</div><div class="t2">2 days ago</div></div><button class="btn xs" id="kill">Sign out</button></div>
        </div></div>
        <button class="btn danger block" id="p-out">${icon('lock')} ${pt('signout')}</button>
      </div>
    </div>`;
}
function mountPProfile(el, c) {
  const pr = STATE.portalPrefs[c.id];
  $$('#pf-ch button', el).forEach(b => b.onclick = () => { pr.ch = b.textContent; pLog(`set preferred channel to ${pr.ch}`, c.id, 'Preferences'); save(); rerender(); });
  $('#pf-quiet', el).onchange = e => { pr.quiet = e.target.checked; save(); };
  $$('[data-cs]', el).forEach(s => s.onchange = () => { pr[s.dataset.cs] = s.checked; pLog(`${s.checked ? 'gave' : 'withdrew'} consent — ${s.closest('.row').querySelector('.t1').textContent}`, c.id, 'Consent (DPDP)'); save(); toast(s.checked ? 'Consent given — recorded' : 'Consent withdrawn — recorded', 'client', 'shield'); });
  $('#kill', el).onclick = e => { pLog('signed out another device', c.id, 'Sessions'); e.target.closest('.row').remove(); save(); toast('That device is signed out', 'client', 'lock'); };
  $('#p-out', el).onclick = portalSignOut;
  $('#svc-go', el).onclick = () => { const f = catById($('#svc', el).value); const note = $('#svc-note', el).value.trim(); STATE.tasks.push({ id: 'tk' + Date.now(), title: `Quote & scope: ${f.n} — requested by ${pUser().name}${note ? ' (' + note + ')' : ''}`, client: c.id, who: c.manager, by: c.manager, due: new Date(Date.now() + 2 * 864e5).toISOString(), done: false }); pLog(`requested a service — ${f.n}`, c.id, 'Service request'); save(); toast(`Request sent — ${actorName(c.manager)} will send a quote`, 'client', 'send'); $('#svc-note', el).value = ''; };
  $('#invite', el).onclick = () => openModal({ html: `<div class="modal-b"><h2>Invite someone from ${esc(c.short)}</h2><div class="field"><label for="iv-n">Name</label><input class="input" id="iv-n"></div><div class="field"><label for="iv-m">Mobile</label><input class="input mono" id="iv-m" inputmode="numeric" maxlength="10"></div><div class="field"><label>Access</label><div class="seg" id="iv-l">${['Full access', 'Upload & view', 'View only'].map((x, i) => `<button class="${i === 1 ? 'on' : ''}">${x}</button>`).join('')}</div></div><p class="tiny muted">They sign in with their own one-time code. You can remove them any time.</p><div class="flex mt16" style="justify-content:flex-end"><button class="btn ghost" data-x>Cancel</button><button class="btn client" data-ok>Send invite</button></div></div>`,
    onMount: m => { let lvl = 'Upload & view'; $$('#iv-l button', m).forEach(b => b.onclick = () => { lvl = b.textContent; $$('#iv-l button', m).forEach(x => x.classList.toggle('on', x === b)); }); m.querySelector('[data-x]').onclick = () => closeModal(); m.querySelector('[data-ok]').onclick = () => { const n = $('#iv-n', m).value.trim(); if (!n) return $('#iv-n', m).classList.add('shake'); STATE.portalInvites = STATE.portalInvites || {}; (STATE.portalInvites[c.id] = STATE.portalInvites[c.id] || []).push([n, 'Invited', lvl, 'Invite pending']); pLog(`invited ${n} with “${lvl}”`, c.id, 'Portal access'); save(); closeModal(); toast(`Invite sent to ${n}`, 'client', 'send'); rerender(); }; } });
}

/* ================= THEME SWITCH for sign-in pages and the portal ================= */
const isDark = () => document.documentElement.dataset.theme === 'dark';
const themeBtn = () => `<button class="icon-btn" data-theme-toggle aria-label="${isDark() ? 'Switch to light theme' : 'Switch to dark theme'}" title="${isDark() ? 'Light theme' : 'Dark theme'}">${icon(isDark() ? 'sun' : 'moon')}</button>`;
function bindThemeBtn(el) { $$('[data-theme-toggle]', el).forEach(b => b.onclick = () => { cycleTheme(); rerender(); }); }

/* ================= STAFF SIGN-IN — the front door, with the client portal beside it ================= */
let STAFF = { step: 'id', method: 'email', user: 'srinivas', err: '', tries: 4 };
const staffEmail = p => p.id + '@nallamala.example';
VIEWS.login = {
  render() {
    const u = person(STAFF.user);
    let step = '';
    if (STAFF.step === 'id') {
      step = `<div class="seg mb16" style="width:100%">${[['phone', 'Mobile OTP (SMS)'], ['email', 'Work email · code'], ['sso', 'Google / Microsoft']].map(([k, n]) => `<button class="${STAFF.method === k ? 'on' : ''}" data-sm="${k}" style="flex:1">${n}</button>`).join('')}</div>` +
        (STAFF.method === 'phone'
          ? `<label class="small" style="font-weight:600;color:var(--ink-2)" for="st-phone">10-Digit Indian Mobile Number (+91)</label><input class="input mt8" id="st-phone" type="tel" placeholder="+91 98765 43210" value="${u ? (u.phone || '+919876543210') : '+919876543210'}" style="height:50px;font-size:16px"><button class="btn primary lg block mt12" id="st-send-phone">Send OTP via SMS ${icon('arrow')}</button>`
          : STAFF.method === 'email'
          ? `<label class="small" style="font-weight:600;color:var(--ink-2)" for="st-email">Work email</label><input class="input mt8" id="st-email" type="email" autocomplete="username" value="${u ? staffEmail(u) : ''}" style="height:50px;font-size:16px"><button class="btn primary lg block mt12" id="st-send">Send sign-in code ${icon('arrow')}</button>`
          : `<button class="btn lg block" id="st-sso" data-p="Google Workspace">${icon('globe')} Continue with Google Workspace</button><button class="btn lg block mt8" id="st-sso2" data-p="Microsoft 365">${icon('layers')} Continue with Microsoft 365</button><p class="tiny muted mt8">Single sign-on through the firm's own domain. Two-factor is enforced by your identity provider.</p>`);
    } else {
      step = `<p class="dim" style="margin:0">We sent a 6-digit code to <b>${esc(staffEmail(u))}</b>.</p><label class="sr" for="sotp0">Enter the 6-digit code</label><div class="otp" id="sotp">${[...Array(6)].map((_, i) => `<input id="sotp${i}" inputmode="numeric" maxlength="1" autocomplete="${i ? 'off' : 'one-time-code'}" aria-label="Digit ${i + 1}">`).join('')}</div>
        <button class="chip outline" id="st-fill" style="cursor:pointer">Demo code ${DEMO_OTP} · tap to fill</button>
        ${STAFF.err ? `<div class="callout bad mt12">${icon('alert')}<div>${esc(STAFF.err)}</div></div>` : ''}
        <button class="btn primary lg block mt12" id="st-verify">Verify and sign in</button>
        <button class="btn ghost sm block mt8" id="st-back">Use a different account</button>`;
    }
    return `<div class="login">
      <section class="login-cover">
        <div class="lc-top">${BRAND_MARK}<div><b>${esc(FIRM.name)}</b><span>${esc(FIRM.sub)} · ${esc(FIRM.city)}</span></div></div>
        <div class="lc-mid"><div class="upper" style="color:var(--gold)">CA Firm OS</div><h1>The whole practice,<br><em>on one ledger.</em></h1>
          <ul><li>Every filing scheduled from each client's profile — ${CATALOGUE.length} types</li><li>Autopilot prepares; people approve at 18 gates</li><li>Nothing is filed without a partner's signature</li><li>Every act written to a permanent record</li></ul></div>
        <div class="lc-foot">Every sign-in is logged · sessions lock after 15 idle minutes</div>
      </section>
      <section class="login-panel"><div style="width:min(440px,100%);display:grid;gap:14px">
        <div class="login-card" style="width:100%">
          <div class="flex between" style="gap:8px"><span class="upper muted">Firm sign-in</span>${themeBtn()}</div>
          <h2>Sign in to ${esc(FIRM.name)}</h2>
          <p class="small muted" style="margin:0 0 18px">For partners, managers, staff and articles of the firm.</p>
          ${step}
          <div class="hr"></div>
          <label class="upper muted mb8" for="st-demo" style="display:block">Try as a member of the firm</label>
          <select class="input" id="st-demo">${TEAM.map(t => `<option value="${t.id}" ${t.id === STAFF.user ? 'selected' : ''}>${esc(t.name)} · ${ROLES[t.role].name}</option>`).join('')}</select>
          <p class="tiny muted mt8">Each role sees only what it is allowed to — try an article assistant to see the walls.</p>
        </div>
        <a class="card pad door" href="#/portal"><span class="glyph client"></span><div style="flex:1;min-width:0"><b>Are you a client of ${esc(FIRM.name)}?</b><div class="small muted">Sign in to the client portal to send papers, approve, pay and see your filings.</div></div>${icon('chev', 'chev')}</a>
      </div></section>
    </div>`;
  },
  mount(el) {
    bindThemeBtn(el);
    const redraw = () => { el.innerHTML = VIEWS.login.render(); VIEWS.login.mount(el); };
    $$('[data-sm]', el).forEach(b => b.onclick = () => { STAFF.method = b.dataset.sm; redraw(); });
    $('#st-demo', el).onchange = e => { STAFF.user = e.target.value; STAFF.step = 'id'; STAFF.err = ''; redraw(); };
    const send = $('#st-send', el); if (send) send.onclick = async () => {
      const v = $('#st-email', el).value.trim().toLowerCase(); const p = TEAM.find(t => staffEmail(t) === v) || TEAM[0];
      STAFF.user = p.id; STAFF.identifier = v; STAFF.step = 'code'; STAFF.tries = 4; STAFF.err = '';
      if (typeof API_CLIENT !== 'undefined' && API_CLIENT.requestOTP) {
        API_CLIENT.requestOTP(v, 'EMAIL');
      }
      redraw(); toast(`Verification code sent to ${v}`, 'code', 'mail');
    };
    const sendPhone = $('#st-send-phone', el); if (sendPhone) sendPhone.onclick = async () => {
      const phone = $('#st-phone', el).value.trim();
      STAFF.identifier = phone; STAFF.step = 'code'; STAFF.tries = 4; STAFF.err = '';
      if (typeof API_CLIENT !== 'undefined' && API_CLIENT.requestOTP) {
        API_CLIENT.requestOTP(phone, 'SMS');
      }
      redraw(); toast(`OTP sent via SMS to ${phone}`, 'ok', 'phone');
    };
    $$('#st-sso, #st-sso2', el).forEach(b => b.onclick = () => staffSignIn(person(STAFF.user), b.dataset.p));
    const otp = $$('#sotp input', el);
    otp.forEach((inp, i) => {
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && otp[i + 1]) otp[i + 1].focus(); if (otp.every(x => x.value)) $('#st-verify', el).click(); };
      inp.onkeydown = e => { if (e.key === 'Backspace' && !inp.value && otp[i - 1]) otp[i - 1].focus(); };
      inp.onpaste = e => { const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (d.length) { e.preventDefault(); d.split('').forEach((c, k) => otp[k] && (otp[k].value = c)); if (d.length === 6) $('#st-verify', el).click(); } };
    });
    if (otp[0]) setTimeout(() => otp[0].focus(), 60);
    const fill = $('#st-fill', el); if (fill) fill.onclick = () => { DEMO_OTP.split('').forEach((c, k) => otp[k].value = c); $('#st-verify', el).click(); };
    const ver = $('#st-verify', el); if (ver) ver.onclick = async () => {
      const entered = otp.map(x => x.value).join('');
      if (entered === DEMO_OTP) return staffSignIn(person(STAFF.user), 'demo OTP code');
      if (typeof API_CLIENT !== 'undefined' && API_CLIENT.verifyOTP) {
        const res = await API_CLIENT.verifyOTP(STAFF.identifier || staffEmail(person(STAFF.user)), entered);
        if (res && res.access_token) {
          toast('OTP Authenticated via FastAPI Backend (JWT issued)', 'ok', 'shield');
          return staffSignIn(person(STAFF.user), 'live OTP SMS');
        }
      }
      STAFF.tries--; STAFF.err = STAFF.tries > 0 ? `That code doesn't match. ${STAFF.tries} ${STAFF.tries === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask the managing partner to unlock your account.'; redraw(); $('#sotp', el)?.classList.add('shake');
    };
    const back = $('#st-back', el); if (back) back.onclick = () => { STAFF.step = 'id'; STAFF.err = ''; redraw(); };
  }
};
function staffSignIn(p, how) {
  STATE.session = { user: p.id, since: new Date().toISOString(), how };
  STATE.persona = p.id; STAFF.step = 'id'; STAFF.err = '';
  ledgerAdd({ actor: p.id, kind: 'human', action: `signed in to the workspace (${how})`, obj: 'Sign-in' });
  save(); renderShell();
  const next = LOGIN_NEXT && !/^#?\/?(login|portal)?$/.test(LOGIN_NEXT) ? LOGIN_NEXT : '#/today'; LOGIN_NEXT = null;
  navTo(next.startsWith('#') ? next : '#/' + next);
  toast(`Signed in as ${p.short} · ${ROLES[p.role].name}`, 'code', 'user');
}
