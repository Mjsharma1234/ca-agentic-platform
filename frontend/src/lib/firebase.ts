import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  Auth,
  ConfirmationResult,
  RecaptchaVerifier,
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  signInWithPhoneNumber,
  signOut,
} from "firebase/auth";

// Public web-app configuration from the Firebase console (Project settings > Your apps). These are identifiers,
// not secrets; access is enforced by Firebase Auth and by the API verifying every ID token server-side.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

let auth: Auth | null = null;
let recaptcha: RecaptchaVerifier | null = null;
let confirmation: ConfirmationResult | null = null;

function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

function getFirebaseAuth(): Auth {
  if (!auth) {
    const app = getFirebaseApp();
    try {
      // The platform issues its own session; keep Firebase's in memory only, never in browser storage.
      auth = initializeAuth(app, { persistence: inMemoryPersistence });
    } catch {
      auth = getAuth(app); // already initialised (hot reload)
    }
  }
  auth.languageCode = "en"; // localises the reCAPTCHA and the SMS; set before the verifier is rendered
  return auth;
}

function resetRecaptcha(): void {
  try {
    recaptcha?.clear();
  } catch {
    /* already cleared */
  }
  recaptcha = null;
}

/** Plain-language message for the Firebase error codes a user can actually hit. */
export function describeFirebaseError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-phone-number":
      return "That mobile number is not valid. Enter a 10-digit Indian number.";
    case "auth/too-many-requests":
      return "Too many attempts from this device. Please wait a few minutes and try again.";
    case "auth/quota-exceeded":
      return "SMS limit reached for today. Please try again later or contact support.";
    case "auth/invalid-verification-code":
      return "That code is incorrect. Check the SMS and try again.";
    case "auth/code-expired":
    case "auth/session-expired":
      return "That code has expired. Request a new one.";
    case "auth/captcha-check-failed":
    case "auth/missing-app-credential":
      return "Security check failed. Refresh the page and try again.";
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again.";
    case "auth/billing-not-enabled":
      return "SMS sign-in needs billing on the Firebase project (Blaze plan), or a registered Firebase test number. Contact your administrator.";
    case "auth/operation-not-allowed":
      return "Phone sign-in is not enabled for this firm yet. Contact support.";
    case "auth/unauthorized-domain":
      return "This web address is not authorised for sign-in. Ask your administrator to add it in Firebase.";
    default:
      return "Could not verify your number. Please try again.";
  }
}

export async function sendFirebasePhoneOtp(e164Phone: string, containerId = "recaptcha-container"): Promise<void> {
  if (typeof window === "undefined") throw new Error("Phone sign-in runs in the browser only.");
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured.");
  const instance = getFirebaseAuth();
  resetRecaptcha(); // a verifier is single-use after a failure; always start clean
  recaptcha = new RecaptchaVerifier(instance, containerId, { size: "invisible" });
  try {
    confirmation = await signInWithPhoneNumber(instance, e164Phone, recaptcha);
  } catch (err) {
    confirmation = null;
    resetRecaptcha();
    throw err;
  }
}

export function hasPendingFirebaseOtp(): boolean {
  return confirmation !== null;
}

/** Confirms the SMS code and returns a fresh Firebase ID token for the API to verify. */
export async function confirmFirebasePhoneOtp(code: string): Promise<string> {
  if (!confirmation) throw new Error("No active OTP request. Please request a new code.");
  const result = await confirmation.confirm(code);
  const idToken = await result.user.getIdToken(true);
  confirmation = null;
  resetRecaptcha();
  await signOut(getFirebaseAuth()); // the platform session replaces the Firebase one
  return idToken;
}
