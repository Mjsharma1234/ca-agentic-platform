# Login with Firebase phone OTP

Every staff login to Firm OS is a Firebase Authentication phone-number sign-in (SMS OTP). The browser asks Firebase
to text a code, Firebase confirms it, and the app sends the resulting **ID token** to `POST /api/v1/auth/firebase/verify`.
The API verifies the token and issues the platform's own RBAC session token. The Firebase session is kept in memory
and signed out straight after that exchange.

This applies to both web apps:

- **Firm OS web (`firm_os_web/`, the ops tracker)** reads its Firebase web config from `GET /api/v1/auth/config`,
  so the static site needs no build-time variables. The SDK is loaded from Firebase's CDN only when the server
  says Firebase is on (`js/firebase-login.js`).
- **Next.js app (`frontend/`)** reads `NEXT_PUBLIC_FIREBASE_*` at build time and keeps the session in an httpOnly cookie.

## Set-up (once)

1. Create (or pick) a Firebase project. Firebase console > **Authentication > Sign-in method**: enable **Phone**.
   Then open the phone provider's **SMS region policy** and allow **India (IN)**: new projects allow no regions, so
   no SMS is sent until you do ([Firebase phone-auth guide](https://firebase.google.com/docs/auth/web/phone-auth)).
   **Billing:** sending real SMS needs the project on the **Blaze (pay-as-you-go)** plan; on the free Spark plan the
   browser gets `auth/billing-not-enabled`. Test numbers (step 7) work without billing. Set a budget alert and a
   daily SMS quota when you upgrade.
2. **Authentication > Settings > Authorized domains**: add every web address the app is opened from
   (e.g. `firmosweb.vercel.app`, your own domain). Firebase documents that `localhost` is not supported as a hosted
   domain for phone auth, so if real SMS sign-in fails on `http://localhost:8000`, test from an authorised domain
   (a deployed preview or an HTTPS tunnel whose host you add here) or use a Firebase test number.
3. **Project settings > Your apps**: add a **Web app** and copy `apiKey`, `projectId` and `appId`.
4. Backend env (Render: `backend/render.yaml`; local: `backend/.env`):

   | Variable | Value |
   |---|---|
   | `LOGIN_PROVIDER` | `firebase` |
   | `FIREBASE_PROJECT_ID` | the project id |
   | `FIREBASE_WEB_API_KEY` | the web app's `apiKey` (a public identifier, not a secret) |
   | `FIREBASE_APP_ID` | the web app's `appId` |
   | `FIREBASE_AUTH_DOMAIN` | optional; defaults to `<project id>.firebaseapp.com` |
   | `BOOTSTRAP_ADMIN_PHONE` | `+91…` of the first partner, for the first deployment only |

   In production (`DEBUG=false`) the API refuses to start without `FIREBASE_PROJECT_ID`.
5. Next.js app only: `frontend/.env.example` (`NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`).
6. Recommended against SMS-pumping cost: enable **App Check** (reCAPTCHA Enterprise), set an **SMS region policy**
   allowing India only, and set a daily SMS quota.
7. Testing without real SMS: **Authentication > Sign-in method > Phone > Phone numbers for testing** registers
   up to 10 fictional numbers with a fixed code. No SMS is sent and they use no quota. Their tokens are signed like
   real ones, so the API treats them as real users: pick hard-to-guess codes, rotate them, never reuse a number
   that belongs to a real person, and remove them before go-live. Never ship `appVerificationDisabledForTesting`
   or hard-coded test numbers.
8. Privacy: Google stores the phone number for spam and abuse prevention, so both login screens tell people their
   number is sent to Google (Firebase) before they request a code. Keep that notice if you restyle the screen.
   Firebase also throttles SMS per number; throttled requests fail with `auth/too-many-requests`.

## Who can sign in

The verified phone number must already belong to **one active user** of a firm. Unknown numbers get 403 and no
account is created; a number registered twice gets 409; deactivated users get 403.

- **First partner:** with `BOOTSTRAP_ADMIN_PHONE` set and no users yet, that number becomes the firm's first Partner
  on first login. They then choose "Load demo workspace" or "Start empty". Remove the variable afterwards.
- **Everyone else:** a partner adds them in **Team & capacity → Create employee** with their mobile number. Numbers
  are stored as `+91XXXXXXXXXX`, and a number can belong to only one account.

## What the API enforces (`app/core/firebase_auth.py`)

RS256 signature against Google's published certificates (cached, rotated by `kid`), `aud` = project id, `iss` =
`https://securetoken.google.com/<project>`, valid `exp`/`iat`, a `sub`, sign-in provider `phone` with an E.164 number,
**`auth_time` within 5 minutes**, and **single use** of each token (replay cache; Redis if `SHARED_STORE_URL` is set).
There is no "accept an unverified token" fallback. With Firebase as the provider the built-in `/auth/otp/*` endpoints
return 404, demo sign-in (`/ops/dev-login`) is refused outside local development, and the login is rate limited per IP.
Each success appends a `FIREBASE_AUTH_VERIFIED` block to the firm's SQC-1 audit chain.

## Local development

Without `FIREBASE_PROJECT_ID` the app uses the built-in sandbox OTP and the demo personas (`DEBUG=true` only).
To try Firebase locally, set the variables above in `backend/.env` and open the app on `http://localhost:8000`.
