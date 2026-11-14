/* CA Firm OS — Firebase phone sign-in (SMS OTP)

   Used only when the backend reports login_provider = "firebase" (GET /api/v1/auth/config). Flow:
     1. Firebase sends the SMS (with an invisible reCAPTCHA check against SMS abuse)
     2. the person types the code; Firebase confirms it and gives us a short-lived ID token
     3. the backend verifies that token (signature, project, freshness, one-time use) and issues the
        firm session — POST /api/v1/auth/firebase/verify
   The Firebase session itself is kept in memory only and signed out straight after the exchange: the
   platform's own session is the only one that matters. The SDK loads from Firebase's CDN on first use. */

const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.14.1';

const FIREBASE_LOGIN = {
  _sdk: null,
  _auth: null,
  _verifier: null,
  _confirmation: null,

  async _load(config) {
    if (!this._sdk) {
      const [appMod, authMod] = await Promise.all([
        import(`${FIREBASE_SDK}/firebase-app.js`),
        import(`${FIREBASE_SDK}/firebase-auth.js`)
      ]);
      this._sdk = { ...appMod, ...authMod };
    }
    if (!this._auth) {
      const s = this._sdk;
      const app = s.getApps().length ? s.getApp() : s.initializeApp(config);
      try { this._auth = s.initializeAuth(app, { persistence: s.inMemoryPersistence }); }
      catch (e) { this._auth = s.getAuth(app); }
      this._auth.languageCode = 'en';
    }
    return this._sdk;
  },

  _resetVerifier() {
    try { if (this._verifier) this._verifier.clear(); } catch (e) { /* already cleared */ }
    this._verifier = null;
    const box = document.getElementById('fb-recaptcha');
    if (box) box.replaceChildren();
  },

  /* Sends the SMS. `phone` must be E.164 (+91…). `containerId` is an empty element for the reCAPTCHA. */
  async sendCode(config, phone, containerId) {
    const s = await this._load(config);
    this._resetVerifier();
    this._verifier = new s.RecaptchaVerifier(this._auth, containerId, { size: 'invisible' });
    try {
      this._confirmation = await s.signInWithPhoneNumber(this._auth, phone, this._verifier);
    } catch (e) {
      this._resetVerifier();
      throw e;
    }
  },

  /* Confirms the code and returns a fresh Firebase ID token for the backend to verify. */
  async confirmCode(code) {
    const pending = this._confirmation;
    this._confirmation = null;           // a code can be confirmed once: a second, simultaneous call fails fast
    if (!pending) throw Object.assign(new Error('Ask for a new code first.'), { code: 'app/no-code' });
    let cred;
    try { cred = await pending.confirm(code); } catch (e) { this._confirmation = pending; throw e; }  // wrong code: allow a retry
    const token = await cred.user.getIdToken(true);
    try { await this._sdk.signOut(this._auth); } catch (e) { /* the platform session is what counts */ }
    this._resetVerifier();
    return token;
  },

  /* Plain-language messages for the errors a person can actually hit. */
  describe(err) {
    let code = (err && err.code) || '';
    if (code.startsWith('auth/api-key-not-valid')) code = 'auth/invalid-api-key';
    return ({
      'auth/invalid-phone-number': 'That mobile number is not valid. Use a 10-digit Indian mobile number.',
      'auth/missing-phone-number': 'Enter your mobile number.',
      'auth/too-many-requests': 'Too many attempts from this device. Wait a few minutes and try again.',
      'auth/quota-exceeded': 'The SMS limit for today has been reached. Contact your firm administrator.',
      'auth/invalid-verification-code': 'That code is not correct. Check the SMS and try again.',
      'auth/code-expired': 'That code has expired. Ask for a new one.',
      'auth/captcha-check-failed': 'The security check failed. Reload the page and try again.',
      'auth/network-request-failed': 'No connection to Firebase. Check your internet and try again.',
      'auth/operation-not-allowed': 'Phone sign-in is not enabled for this Firebase project (Authentication → Sign-in method → Phone).',
      'auth/billing-not-enabled': 'SMS sign-in needs billing on the Firebase project (upgrade to the Blaze plan), or use a registered Firebase test number.',
      'auth/unauthorized-domain': 'This web address is not an authorised domain in the Firebase project (Authentication → Settings → Authorised domains).',
      'auth/invalid-api-key': 'The Firebase web API key on the server is wrong (FIREBASE_WEB_API_KEY).',
      'app/no-code': 'Ask for a new code first.'
    })[code] || (err && err.message) || 'Sign-in failed. Please try again.';
  }
};
