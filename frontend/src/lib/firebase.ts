import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { 
  getAuth, 
  Auth, 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  ConfirmationResult 
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSy_DEMO_KEY_REPLACE_WITH_YOURS",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "ca-agentic-platform.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "ca-agentic-platform",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "ca-agentic-platform.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1234567890:web:abcdef123456"
};

let app: FirebaseApp;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    const fApp = getFirebaseApp();
    auth = getAuth(fApp);
  }
  return auth;
}

// In-memory holder for active ConfirmationResult per browser session
declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
    confirmationResult?: ConfirmationResult;
  }
}

export function setupRecaptcha(containerId: string = "recaptcha-container"): RecaptchaVerifier {
  if (typeof window === "undefined") {
    throw new Error("reCAPTCHA can only be initialized in the browser");
  }

  const authInstance = getFirebaseAuth();

  if (window.recaptchaVerifier) {
    try {
      window.recaptchaVerifier.clear();
    } catch (e) {
      // Ignored if already cleared
    }
  }

  window.recaptchaVerifier = new RecaptchaVerifier(authInstance, containerId, {
    size: "invisible",
    callback: () => {
      // reCAPTCHA solved, phone auth proceeds
    },
    "expired-callback": () => {
      console.warn("reCAPTCHA expired, reset required");
    }
  });

  return window.recaptchaVerifier;
}

export async function sendFirebasePhoneOtp(phoneNumber: string): Promise<ConfirmationResult> {
  const authInstance = getFirebaseAuth();
  const verifier = window.recaptchaVerifier || setupRecaptcha("recaptcha-container");
  
  const confirmationResult = await signInWithPhoneNumber(authInstance, phoneNumber, verifier);
  window.confirmationResult = confirmationResult;
  return confirmationResult;
}

export async function confirmFirebasePhoneOtp(verificationCode: string): Promise<{ idToken: string; user: any }> {
  if (!window.confirmationResult) {
    throw new Error("No active OTP request found. Please request a new OTP.");
  }

  const result = await window.confirmationResult.confirm(verificationCode);
  const idToken = await result.user.getIdToken();
  return { idToken, user: result.user };
}
