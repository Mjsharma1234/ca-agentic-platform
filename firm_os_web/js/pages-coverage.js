/* Bahi — the owner's coverage audit: every internal daily operation of the firm, mapped to where it runs. */

const LEVELS = {
  auto: { t: 'Runs on its own', c: 'agent' },
  code: { t: 'Deterministic code', c: 'code' },
  gate: { t: 'Autopilot prepares · person decides', c: 'gate' },
  human: { t: 'Person only — by law', c: 'outline' }
};
const OPS = [
  ['Front office', 'Receive documents on WhatsApp, email, portal, Tally, bank feeds', 'intake', 'auto', 'IN-1 reads, classifies, de-duplicates, files the original'],
  ['Front office', 'Acknowledge every receipt to the client', 'automations', 'auto', 'Receipt acknowledgement automation, same channel'],
  ['Front office', 'Answer routine client questions (status, due dates, receipts)', 'desk', 'auto', 'CL-1 closed list of seven, client\'s language'],
  ['Front office', 'Route advisory, penalty and notice questions to the right person', 'desk', 'gate', 'G10 — refusal to improvise is the default'],
  ['Front office', 'Physical inward / outward register & couriers', 'intake', 'human', 'Register with location; scans go to the vault'],
  ['Front office', 'DSC token custody and movement', 'vault', 'human', 'Issue / receive logged; expiry alerts to clients'],
  ['Front office', 'Schedule client meetings and calls', 'automations', 'auto', 'Meeting scheduler offers slots from the owner\'s calendar'],
  ['Client lifecycle', 'KYC, AML, PEP and conflict checks for a new client', 'clients', 'gate', 'Onboarding step 4 → G13 partner acceptance'],
  ['Client lifecycle', 'Engagement letter and fee proposal', 'clients', 'gate', 'Drafted at onboarding, accepted at G13'],
  ['Client lifecycle', 'Work out every filing that applies to the client', 'clients', 'code', 'Obligation engine enrols from the 372-type catalogue'],
  ['Client lifecycle', 'Annual continuance or resignation', 'gates', 'human', 'G13 / G18 — partner only'],
  ['Client lifecycle', 'Client health and risk rating', 'clients', 'auto', 'Health from lateness, responsiveness, fees, notices'],
  ['Client lifecycle', 'Each client\'s year: calendar of what is due and filed, filed history with acknowledgements, every document, the filings the firm handles and who handles each', 'clients', 'auto', 'Same records in the firm\'s client page and in the client portal'],
  ['Client lifecycle', 'Log calls, meetings and voice notes to the client file', 'clients', 'auto', 'Log button + WhatsApp voice notes transcribed by IN-1'],
  ['Calendar & allocation', 'Maintain the statutory due-date calendar', 'calendar', 'code', 'Rulebook, effective-dated — never guessed'],
  ['Calendar & allocation', 'Track notifications, circulars and extensions', 'rulebook', 'gate', 'FO-4 drafts; partner approves (G14)'],
  ['Calendar & allocation', 'Track the status of every obligation for every client', 'line', 'auto', 'The line — nine states, forward only'],
  ['Calendar & allocation', 'Allocate and reallocate work between staff', 'team', 'gate', 'FO-1 recommends; partner reassigns'],
  ['Calendar & allocation', 'Escalate same-day statutory risk', 'today', 'auto', 'FO-2 ranks; bypasses to the partner'],
  ['Calendar & allocation', 'Change freeze around peak days', 'agents', 'code', 'Peak-day pill; no prompt / rule / model changes'],
  ['Calendar & allocation', 'Ad-hoc tasks — calls, files, quotes, errands', 'today', 'auto', 'Tasks card; completions written to the Daybook'],
  ['Collecting papers', 'Request exactly the papers needed, per client, per period', 'automations', 'auto', 'IN-2 ladder: day −7, −3, −1, overdue'],
  ['Collecting papers', 'Decide whether to chase a silent client harder or stop', 'gates', 'gate', 'G1 — partner\'s relationship call'],
  ['Collecting papers', 'Confirm values the machine is unsure of', 'intake', 'gate', 'G2 below the 0.85 confidence bar'],
  ['Books', 'Ledger write-up and transaction classification', 'books', 'gate', 'IN-3 patterns; corrections train next month'],
  ['Books', 'Bank reconciliation and client questions', 'recon', 'auto', 'IN-4 never forces a balance'],
  ['Books', 'Second approval of hand-typed journals', 'books', 'gate', 'G5 above ₹2,00,000'],
  ['Books', 'Month-end close and MIS delivery', 'books', 'gate', 'Close checklist; MIS sent by a person (G12)'],
  ['Compliance production', 'GST: sales four-way, IMS triage, 2B credit, returns', 'recon', 'gate', 'GS-1…GS-5 · G3 · G4 · G6 · G7'],
  ['Compliance production', 'TDS / TCS: section, rate, threshold, challan, FVU return', 'line', 'gate', 'DT-1 + computation core · G6 · G7'],
  ['Compliance production', 'Income tax: AIS / 26AS reconciliation, returns', 'line', 'gate', 'DT-2 blocks filing until differences explained'],
  ['Compliance production', 'Advance tax estimates with stated assumptions', 'automations', 'gate', 'DT-3 ten days before each instalment · G4'],
  ['Compliance production', 'Payroll: PF, ESI, professional tax, LWF', 'line', 'gate', 'PY-1 three-way check · G17'],
  ['Compliance production', 'Company law: registers, MCA packs', 'catalogue', 'gate', 'CO-1 builds the pack; a person files'],
  ['Compliance production', 'Audit working papers & tax audit clauses', 'catalogue', 'gate', 'AU-1 / AU-2 — never conclude, never judge materiality'],
  ['Compliance production', 'Annual GST reconciliation (9 / 9C)', 'gates', 'gate', 'GS-6 from the year-long difference log · G15'],
  ['Compliance production', 'Certificates — net worth, 15CB, turnover, RERA', 'catalogue', 'human', 'Partner signs; UDIN by a human'],
  ['Review, sign & file', 'Four-eyes review of every filing', 'gates', 'gate', 'G6 — preparer can never be the only reviewer'],
  ['Review, sign & file', 'Partner signature', 'gates', 'human', 'G7 DSC PIN — held seconds, never stored'],
  ['Review, sign & file', 'UDIN generation', 'gates', 'human', 'G8 — human-started on the ICAI portal'],
  ['Review, sign & file', 'Submit, wait for the acknowledgement, translate rejections', 'line', 'auto', 'FL-1; a filing closes only with its reference'],
  ['Review, sign & file', 'Tell the client it is filed', 'automations', 'auto', 'Text confirmation automatic; ack PDF one click (G12)'],
  ['Review, sign & file', 'Tell the client how much tax to pay and by when', 'automations', 'auto', 'Tax-payable intimation: GST · TDS · PF/ESI'],
  ['Notices', 'Recognise a notice, extract dates and demand, open a job', 'notices', 'auto', 'CL-2 with five working days of buffer'],
  ['Notices', 'Reply to the tax officer', 'notices', 'human', 'G11 — written by the partner, always'],
  ['Billing & collections', 'Turn finished work into an itemised invoice', 'billing', 'gate', 'FO-3 drafts from the record · G9'],
  ['Billing & collections', 'Payment reminders and collection', 'automations', 'auto', 'UPI link; day 15 / 30; 90+ to partner'],
  ['Billing & collections', 'Client profitability', 'billing', 'auto', 'Fee vs effort captured from the record'],
  ['Billing & collections', 'Firm expenses & staff reimbursements', 'billing', 'gate', 'Claims anywhere; partner approves; rebill to client'],
  ['People', 'Attendance', 'team', 'auto', 'Sign-in, VPN and client-site geo check-ins'],
  ['People', 'Timesheets', 'daybook', 'auto', 'Derived from actions — nobody fills one'],
  ['People', 'Leave approval with peak-day clash warnings', 'team', 'gate', 'Manager / partner approves'],
  ['People', 'Articleship register, study leave, stipend', 'team', 'auto', 'The principal\'s legal duty, tracked'],
  ['People', 'CPE hours for members', 'team', 'auto', 'Against firm target and ICAI block'],
  ['People', 'Ask what the law says (staff training)', 'rulebook', 'auto', 'KN-1 cites a source or declines'],
  ['Quality & risk', 'Re-perform a sample of finished work', 'quality', 'auto', 'FO-5 monthly, risk-stratified'],
  ['Quality & risk', 'Test whether reviewers are still reading', 'quality', 'auto', 'FO-5 canaries per reviewer'],
  ['Quality & risk', 'Peer review / SQC 1 readiness', 'quality', 'auto', 'Inspection pack built from the record'],
  ['Quality & risk', 'Tax audit signing ceiling — 60 per member', 'team', 'auto', 'FO-1 counts across firms on the date of signing'],
  ['Quality & risk', 'Monitor autopilot routines; switch one to shadow when wrong', 'agents', 'gate', 'On-call may demote; only the MP promotes'],
  ['Quality & risk', 'Find everyone affected by a wrong output', 'record', 'auto', 'Blast-radius query on the hash-chained record'],
  ['Security & access', 'Staff sign-in with an email code or single sign-on; clients have their own door', 'login', 'auto', 'Sign-in page links to the client portal; every sign-in logged'],
  ['Security & access', 'Role permissions and personal professional acts', 'access', 'human', 'Locked rows; file/sign/submit assigned to nobody'],
  ['Security & access', 'Ethical walls per client', 'access', 'human', 'Staff see only their clients; attempts logged'],
  ['Security & access', 'Client portal credentials', 'vault', 'gate', 'Reveal with reason, 20 seconds, logged'],
  ['Security & access', 'Exports and downloads', 'record', 'gate', 'Watermarked with the person and time'],
  ['The firm itself', 'The firm\'s own GST, TDS and income tax', 'line', 'gate', 'The firm is a client of itself on the line'],
  ['The firm itself', 'ICAI COP renewal, Form 18, peer review, PII, PMLA, DPDP', 'catalogue', 'gate', '“The firm itself” domain in the catalogue'],
  ['Client portal', 'Clients sign in without passwords — mobile OTP, email link or DigiLocker', 'portal', 'auto', 'One-time codes · trusted devices · every sign-in logged'],
  ['Client portal', 'Clients upload exactly the papers each return needs', 'portal', 'auto', 'Lands in Intake, ticks the checklist, moves the card'],
  ['Client portal', 'Clients confirm facts, consents and letters sent in their name', 'portal', 'gate', 'Recorded as the client\'s word; the firm still commits at its own gates'],
  ['Client portal', 'Clients pay tax and fees', 'portal', 'auto', 'UPI or net banking; the reference lands on the obligation'],
  ['Client portal', 'Client-side users and access levels', 'portal', 'human', 'The owner invites colleagues: full, upload & view, view only'],
  ['Client portal', 'Client consents under the DPDP Act', 'portal', 'human', 'Given and withdrawn by the client; each change logged'],
  ['Calendar & allocation', 'Due-date extensions re-date the work', 'calendar', 'gate', 'Rule watch detects · partner approves (G14) · obligations move'],
  ['Calendar & allocation', 'Internal cut-offs and firm deadlines', 'calendar', 'code', 'Cut-off three days before big deadlines; firm dates added by hand'],
  ['Review, sign & file', 'Changes requested, with the reviewer\'s note on the card', 'line', 'gate', 'The only backward move on the line'],
  ['Documentation', 'Write down what the firm did today', 'daybook', 'auto', 'Daybook narrative, sealed at sign-off'],
  ['Documentation', 'Partner\'s morning brief', 'today', 'auto', 'CL-1 + FO-2 summary; also on WhatsApp at 09:00'],
  ['Documentation', 'A permanent, provable record of every act', 'record', 'code', 'Append-only, hash-chained, 8-year retention']
];
const REVIEW_LOG = [
  ['Firm expenses and staff reimbursements had nowhere to live — conveyance to client sites, couriers, stamp paper, rebillable costs.', 'Added claims (from anywhere, incl. Team and ⌘K), partner approval, and rebill-to-client onto the next invoice.', 'billing'],
  ['Only statutory work was tracked. A partner\'s "call Kakatiya\'s MD" or "collect the original deed" lived on paper.', 'Added Tasks on Today — assign to anyone, due dates, completion written to the Daybook and record.', 'today'],
  ['Calls and meetings with clients were not captured, so promises made on the phone were lost.', 'Added "Calls, meetings & notes" to each client file, with voice notes transcribed by IN-1 and optional follow-up tasks.', 'clients'],
  ['No partner\'s morning brief — the design calls for a 09:00 summary of who asked what and what is still open.', 'Added the brief on Today: overnight messages, gates, late work, notice buffers, tasks — and WhatsApp delivery.', 'today'],
  ['Attendance was a single number, not a register an inspector or HR could rely on.', 'Added the attendance register: sign-in, VPN and client-site geo check-ins per person.', 'team'],
  ['Tax-payable intimation only covered GST; clients also fund TDS on the 7th and PF/ESI on the 15th.', 'Widened the automation to GST · TDS · PF/ESI, each a few days before its deposit date.', 'automations'],
  ['Colour coding leaked: staff avatars, "prepared by" chips, staff-location chips and DSC custody used the autopilot / client / gate hues.', 'People now use neutral ink tones; every hue means exactly one actor, and red / amber / green only ever mean lateness or health.', 'today'],
  ['Staff could not submit expense claims because Billing is behind an access wall.', 'Claims open from Team, the command palette and Billing; approval stays with partners.', 'team']
];
const REVIEW_LOG_2 = [
  ['Clients had no way in of their own — the phone preview was only a mock-up.', 'Built the client portal: password-free sign-in, uploads, approvals, payments, messages, filings with acknowledgements, client-side users, consents and service requests. Every client action lands in the firm\'s record in blue.', 'portal'],
  ['Headline numbers said how many, not what to do.', 'Overdue shows the oldest item; due this week shows the form mix; filed this month shows progress against the month.', 'today'],
  ['There was no 30-day view of how deadlines bunch up.', 'Added the deadline runway with per-form cards and progress bars.', 'today'],
  ['A government extension would have meant re-dating work by hand.', 'Rule watch detects it, a partner approves, every affected obligation re-dates and the change log records it.', 'calendar'],
  ['Alerts were scattered across pages.', 'One Alerts panel and a bell: rule changes, the IMS lock date, clients missing papers, unowned work, DSC expiry, notice buffers.', 'today'],
  ['The calendar showed one pill per client and hid the day\'s detail in a pop-up.', 'One pill per form with a count, struck through when filed; internal cut-offs; Monday-first weeks; a side panel with per-form progress; firm deadlines.', 'calendar'],
  ['The board could not filter by person, show unowned work or keep the reviewer\'s note.', 'Person chips with counts, Unassigned, board and list views, overdue-only, checklist and attachment counts, and the "changes requested" note on the card.', 'line'],
  ['Reviews and signatures sat in one queue.', 'Separate "waiting for your review" and "waiting for your DSC" queues, each row with a Checks summary.', 'gates'],
  ['The client list lacked GST frequency and document status, and showed full GSTINs.', 'Added both; GSTINs and PANs are partly masked in lists.', 'clients'],
  ['Which law a card belonged to could only be read from its text.', 'Each law family has its own texture — on file tabs, calendar entries, catalogue strips and form chips — so colour still means only who holds the work.', 'catalogue'],
  ['Surfaces were flat.', 'Paper grain, the woven bahi-cloth spine, stamp-paper guilloche on covers, inked rubber stamps, and a honeycomb wherever autopilot is working.', 'today'],
  ['Engineering vocabulary was showing through.', 'Autopilot and 27 plainly named routines replace it everywhere.', 'agents']
];
const BY_DESIGN = [
  ['Filing on MCA, EPFO, ESIC, DGFT and RBI portals', 'No interface; scripting is brittle, against terms, and risks a half-submitted statutory filing. CA Firm OS builds the pack.'],
  ['Autopilot signing, certifying, filing or generating a UDIN', 'Personal professional acts. The capability does not exist in the software; a build-blocking test enforces it.'],
  ['Autopilot writing a reply to a tax officer', 'Every word is written by the professional whose name is on it (G11).'],
  ['Anything but the computation core producing a number on a return', 'The deterministic computation core produces every figure; autopilot only explains it.'],
  ['Bulk approval at any gate', 'It turns controls into a queue people click through. FO-5 canaries depend on it.']
];

VIEWS.coverage = {
  render() {
    const areas = [...new Set(OPS.map(o => o[0]))];
    const cnt = k => OPS.filter(o => o[3] === k).length;
    const pct = Math.round(100 * (cnt('auto') + cnt('code')) / OPS.length);
    return pageHead('Owner\'s coverage audit · checked by the managing partner', `${OPS.length} internal operations, <em>${OPS.length} covered</em>`, 'Acting as the head of the firm, every daily internal operation was walked against the build: where it happens, and how much of it a person still has to touch. Where something was missing, it was fixed — the log is at the bottom.') + `
    <div class="grid g4 mb16">
      ${Object.entries(LEVELS).map(([k, L]) => `<div class="card kpi accent-${L.c === 'outline' ? 'ink' : L.c}"><div class="label"><span class="chip ${L.c}">${L.t}</span></div><div class="value">${cnt(k)}</div><div class="foot">${k === 'auto' ? 'no human touch unless an exception' : k === 'code' ? 'one right answer — never a guess' : k === 'gate' ? 'the machine does the effort, a person releases' : 'personal professional acts, by law'}</div></div>`).join('')}
    </div>
    <div class="card pad mb16 flex wrap" style="gap:22px">
      <div class="ring" style="--p:${pct};--c:var(--agent)"><b>${pct}%</b></div>
      <div style="flex:1;min-width:260px"><b class="serif" style="font-size:20px">${pct}% of operations need no human touch at all.</b><p class="dim small" style="margin:6px 0 0">The rest stop at a gate because the law, the firm's liability, or a client relationship requires a named person — and there the machine has already done the effort: the evidence pack, the draft, the citation.</p></div>
    </div>
    <div class="card mb16">
      <div class="cov-row head"><span>Operation</span><span>How it runs</span><span>Level</span><span>Where</span></div>
      ${areas.map(a => `<div class="cov-row" style="background:var(--paper-2)"><b class="upper" style="color:var(--ink-2)">${a}</b><span></span><span></span><span></span></div>` + OPS.filter(o => o[0] === a).map(([, op, page, lvl, how]) => `<div class="cov-row"><span><span style="color:var(--ok)">${icon('check').replace('<svg', '<svg width="15" height="15" style="vertical-align:-3px;margin-right:6px"')}</span>${esc(op)}</span><span class="small dim">${esc(how)}</span><span><span class="chip ${LEVELS[lvl].c}">${LEVELS[lvl].t}</span></span><span><a class="btn xs" href="#/${page}">Open ${icon('arrow')}</a></span></div>`).join('')).join('')}
    </div>
    <div class="card mb16"><div class="card-h"><h3>Second review — against the reference product and your notes</h3><div class="right"><span class="chip ok">${REVIEW_LOG_2.length} changes</span></div></div>
      <div class="list">${REVIEW_LOG_2.map(([found, fixed, page], i) => `<div class="row" style="align-items:flex-start"><span class="num tiny muted" style="width:18px;padding-top:3px">${i + 1}</span><div class="grow"><div class="small" style="white-space:normal"><b>Found:</b> ${esc(found)}</div><div class="small" style="white-space:normal;color:var(--ok-ink);margin-top:4px"><b>Changed:</b> ${esc(fixed)}</div></div><a class="btn xs" href="#/${page}">See</a></div>`).join('')}</div></div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h3>First review — gaps found and fixed</h3><div class="right"><span class="chip ok">${REVIEW_LOG.length} fixed</span></div></div>
        <div class="list">${REVIEW_LOG.map(([found, fixed, page], i) => `<div class="row" style="align-items:flex-start"><span class="num tiny muted" style="width:18px;padding-top:3px">${i + 1}</span><div class="grow"><div class="small" style="white-space:normal"><b>Found:</b> ${esc(found)}</div><div class="small" style="white-space:normal;color:var(--ok-ink);margin-top:4px"><b>Fixed:</b> ${esc(fixed)}</div></div><a class="btn xs" href="#/${page}">See</a></div>`).join('')}</div></div>
      <div class="card"><div class="card-h"><h3>Deliberately not automated</h3></div>
        <div class="list">${BY_DESIGN.map(([w, why]) => `<div class="row" style="align-items:flex-start">${icon('lock', 'chev')}<div class="grow"><div class="t1" style="white-space:normal">${esc(w)}</div><div class="small dim" style="white-space:normal">${esc(why)}</div></div></div>`).join('')}</div></div>
    </div>`;
  }
};
