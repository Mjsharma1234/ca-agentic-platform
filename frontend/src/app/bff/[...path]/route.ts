/**
 * Backend-for-frontend proxy.
 *
 * The browser never holds the API bearer token: login responses are intercepted here, the
 * JWT is stored in an httpOnly / SameSite=Strict cookie, and it is re-attached server-side
 * on every proxied call. This removes the token from JavaScript reach (XSS cannot steal it)
 * and lets the API stay off the public CORS surface.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE = "ca_session";
const ALLOWED_ROOTS = new Set([
  "auth", "gates", "clients", "dashboard", "documents", "returns", "billing", "bank-reco", "signing", "firm-os",
]);
const SEGMENT = /^[A-Za-z0-9_.~:@-]+$/;
const MAX_BODY_BYTES = 30 * 1024 * 1024;
const LOGIN_PATHS = new Set(["auth/otp/verify", "auth/firebase/verify"]);
const FORWARD_REQUEST_HEADERS = ["content-type", "accept", "accept-language"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control"];

function apiOrigin(): string {
  const origin = process.env.API_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000");
  if (!origin) throw new Error("API_URL is not configured");
  return origin.replace(/\/+$/, "");
}

function fail(status: number, detail: string) {
  return NextResponse.json({ detail }, { status, headers: { "cache-control": "no-store" } });
}

function jwtExpirySeconds(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function sessionCookie(token: string) {
  const exp = jwtExpirySeconds(token);
  const maxAge = exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 3600;
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.length || path.some((s) => s === ".." || s === "." || !SEGMENT.test(s))) return fail(400, "Invalid path.");
  if (!ALLOWED_ROOTS.has(path[0])) return fail(404, "Not found.");
  const joined = path.join("/");
  // FastAPI list routes are mounted with a trailing slash (and the static-file mount at "/" prevents
  // its slash-redirect from ever firing), so preserve exactly what the browser asked for.
  const trailingSlash = req.nextUrl.pathname.endsWith("/") ? "/" : "";
  const method = req.method.toUpperCase();

  if (method !== "GET" && method !== "HEAD") {
    // CSRF defence in depth on top of SameSite=Strict: custom header + same-origin Origin.
    if (req.headers.get("x-requested-with") !== "ca-web") return fail(403, "Missing CSRF header.");
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) return fail(403, "Cross-origin request blocked.");
  }

  if (joined === "auth/logout" && method === "POST") {
    const res = new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
    res.cookies.set({ ...sessionCookie(""), maxAge: 0 });
    return res;
  }

  const token = req.cookies.get(COOKIE)?.value;
  const headers = new Headers();
  for (const h of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (token && !LOGIN_PATHS.has(joined)) headers.set("authorization", `Bearer ${token}`);
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > MAX_BODY_BYTES) return fail(413, "Request body too large.");
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return fail(413, "Request body too large.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${apiOrigin()}/api/v1/${joined}${trailingSlash}${req.nextUrl.search}`, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return fail(502, "The compliance API is unreachable.");
  }

  const out = new Headers({ "cache-control": "no-store" });
  for (const h of FORWARD_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }

  if (LOGIN_PATHS.has(joined) && upstream.ok) {
    const data = await upstream.json();
    const accessToken: string | undefined = data?.access_token;
    delete data.access_token;
    const res = NextResponse.json(data, { status: upstream.status, headers: { "cache-control": "no-store" } });
    if (accessToken) res.cookies.set(sessionCookie(accessToken));
    return res;
  }

  const res = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: out,
  });
  if (upstream.status === 401 && token) res.cookies.set({ ...sessionCookie(""), maxAge: 0 });
  return res;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
