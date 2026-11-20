// Runs firm_os_web/js/firebase-login.js against fake Firebase SDKs to check how sendCode behaves when Firebase hangs, is blocked, or errors.
const fs = require('fs');
const vm = require('vm');
const file = require('path').join(__dirname, '..', '..', '..', 'firm_os_web', 'js', 'firebase-login.js');
let src = fs.readFileSync(file, 'utf8').replace('const SEND_TIMEOUT_MS = 25000;', 'const SEND_TIMEOUT_MS = 60;');
src += '\n;globalThis.__F = FIREBASE_LOGIN;';
const ctx = { console, setTimeout, clearTimeout, Promise, Object, Error, document: { getElementById: () => null } };
vm.createContext(ctx); vm.runInContext(src, ctx);
const F = ctx.__F;
const fakeSdk = signIn => ({ RecaptchaVerifier: function () { this.clear = () => {}; }, signInWithPhoneNumber: signIn });
let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(ok ? 'PASS' : 'FAIL', name, detail || ''); };

(async () => {
  // 1. Firebase never answers (the invisible reCAPTCHA never completes): must give up with a clear message, not hang.
  F._load = async () => { F._auth = {}; return fakeSdk(() => new Promise(() => {})); };
  const t0 = Date.now();
  try { await F.sendCode({}, '+919999999999', 'x'); check('hang -> error', false); }
  catch (e) { check('hang -> gives up', e.code === 'app/send-timeout' && Date.now() - t0 < 1000, e.code);
              check('hang -> message says what to do', /normal Chrome or Edge/.test(F.describe(e)) && /No SMS was sent/.test(F.describe(e))); }
  check('hang -> no stale code kept', F._confirmation === null);

  // 2. The sign-in script itself cannot be loaded (blocked).
  F._load = async () => { throw new TypeError('Failed to fetch dynamically imported module'); };
  try { await F.sendCode({}, '+919999999999', 'x'); check('blocked sdk -> error', false); }
  catch (e) { check('blocked sdk -> clear message', e.code === 'app/sdk-blocked' && /Could not load/.test(F.describe(e)), e.code); }

  // 3. Firebase answers with a normal error: still passed through untouched.
  F._load = async () => fakeSdk(() => Promise.reject(Object.assign(new Error('x'), { code: 'auth/billing-not-enabled' })));
  try { await F.sendCode({}, '+919999999999', 'x'); check('firebase error -> error', false); }
  catch (e) { check('firebase error -> unchanged', e.code === 'auth/billing-not-enabled' && /Blaze/.test(F.describe(e)), e.code); }

  // 4. Firebase answers normally: the confirmation is kept and no timeout fires later.
  const confirmation = { confirm: async () => ({}) };
  F._load = async () => fakeSdk(async () => confirmation);
  await F.sendCode({}, '+919999999999', 'x');
  await new Promise(r => setTimeout(r, 120));
  check('success -> confirmation kept', F._confirmation === confirmation);
  process.exit(failed ? 1 : 0);
})();
