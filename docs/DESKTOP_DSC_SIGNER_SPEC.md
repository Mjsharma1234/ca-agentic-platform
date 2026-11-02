# Desktop DSC Signer — Engineering Specification

| | |
|---|---|
| **Component** | CA Firm OS Desktop DSC Signer ("the signer") |
| **Gate** | G7 — Partner Class-3 DSC signing |
| **Protocol version** | `CAFOS-DSC-V1` |
| **Status** | Server side implemented (see §13 for gaps); desktop app **not yet built** — this document is its specification |
| **Source of truth for the contract** | `backend/app/api/v1/signing.py`, `backend/app/deterministic_core/dsc_signing.py`, `backend/app/models/signing.py` |
| **Reference signer** | `make_cert()` / `sign()` in `backend/tests/test_api_security_gates.py` |

Legend used throughout: **[IMPLEMENTED]** = exists in the backend today. **[NOT IMPLEMENTED]** = a requirement this spec places on the server or app that does not exist yet. **[RECOMMENDED]** = design guidance for the desktop app.

---

## 1. Purpose & non-goals

### 1.1 Purpose

Statutory returns (GSTR-1/3B/9/9C, ITR, TDS, MCA forms) must be signed with the authorised signatory's **Class-3 Digital Signature Certificate (DSC)**, whose private key lives on a FIPS-class USB crypto-token (ePass2003, Watchdata ProxKey, etc.) and is unlocked by a PIN. The platform's architecture document states the invariant: *the platform physically lacks signing capabilities*; Gate G7 is a human-and-hardware enclave in which the partner connects the token and enters the PIN, and the PIN lives in RAM for under 30 seconds (`HIGH_LEVEL_SYSTEM_ARCHITECTURE.md`, "Gate G7 Zero-Trust DSC RAM Protocol"; `GOVERNMENT_PORTAL_API_FILING_MATRIX.md` §1.2 and §4.2).

The signer is a small native desktop application, running on the partner's own computer, that:

1. authenticates to the platform as the partner,
2. fetches the partner's pending G7 signing challenge,
3. shows the partner exactly what is being signed (WYSIWYS — *what you see is what you sign*),
4. obtains the PIN through a native secure dialog and performs the signature **on the token** via PKCS#11,
5. returns only the **signature and the public certificate** to the platform, and
6. wipes the PIN from memory.

### 1.2 Why a desktop app and not the browser

* **IT Act, 2000 s.42 (custody of the private key) and s.43A (reasonable security practices).** Typing a PIN into a cloud web page, or exporting/hosting a private key server-side to enable unattended signing, breaches key custody and, per the project's legal note, can invalidate the certificate. The PIN must therefore never be typed into, transmitted to, or logged by the web application or the server.
* A browser cannot speak PKCS#11 directly and a web page is the most exposed surface in the system (XSS, extensions).
* The previous simulated flow (`POST /api/v1/firm-os/dsc/sign` with a `pin` field) sent the PIN to the server. **[IMPLEMENTED]** that endpoint now returns **HTTP 410** whenever `ENVIRONMENT=production` or `DEBUG=false`; it exists only as a development simulation. The signer replaces it.

### 1.3 Non-goals

* The signer does **not** file anything with GSTN / Income-Tax / MCA. Submission and the final "Submit & File with DSC/EVC" action remain human actions on the government portal (G7 is *signing*; filing is a separate gate).
* It does **not** store, export, back up or import private keys. It never touches key material outside the token.
* It does **not** decide anything. It cannot create, approve or modify a signing request. It can only *complete* or *reject* a request that is addressed to its logged-in partner.
* It does **not** sign anything other than the server-issued `CAFOS-DSC-V1` canonical message (§4.3). In particular it never signs arbitrary bytes supplied by a web page, a local process, or a request that fails local validation.
* It does **not** replace UDIN generation (Gate G8), Aadhaar OTP / EVC entry, or director DSC flows for MCA (see §13.6).
* It does not run unattended, in the background without the user present, or on a server/VDI that does not physically host the token.

---

## 2. Threat model

Assets: (A1) DSC private key + PIN, (A2) integrity of *what* is signed, (A3) authenticity of *who* signed, (A4) the audit trail, (A5) the partner's session/credentials.

Trust boundaries: partner's machine (signer + token) ↔ platform API ↔ web UI/other staff. The platform server is **not trusted with A1** by design; it is trusted to *issue* challenges and *verify* signatures but the signer treats every server field as untrusted input until locally validated.

### 2.1 STRIDE table

| # | Threat | STRIDE | Attack | Mitigation (and where it lives) |
|---|---|---|---|---|
| T1 | **Malicious / compromised server** asks the partner to sign something other than what the UI shows | Tampering, Spoofing | Server returns `message_b64` that does not match displayed `document_label` / hash | **[RECOMMENDED]** Signer *rebuilds* the canonical message itself from the structured fields (`id`, `entity_type`, `entity_id`, `gate_id`, `document_hash`, `nonce`, `signer_id`, `expires_at`) using §4.3 and aborts if it is not byte-identical to `message_b64`. The signer displays the hash it will actually sign. Residual: server can still lie about what `document_hash` *means*; mitigated by partner reviewing the return in the web evidence pack (hash is shown in both places) and by the return-bound check below. |
| T2 | Server/staff substitute a different return after review | Tampering | Request is created for a hash that is not the reviewed payload | **[IMPLEMENTED]** For `entity_type=GST_RETURN`, `POST /signing/requests` requires `document_hash == GSTReturn.payload_hash` (409 otherwise), return status in `REVIEWED`/`SIGNING_PENDING`, a non-null `reviewer_id`, and `preparer_id != signer`. |
| T3 | **Compromised web app / XSS** tries to trigger signing | Elevation, Tampering | Malicious JS calls the signer or creates its own requests | Signer exposes **no** inbound network or IPC surface a web page can reach (§8.3). Web app cannot complete a request: `/complete` needs the partner's own JWT and a valid signature from a *registered* DSC. Creating requests needs MANAGER+ and cannot choose the nonce. **[IMPLEMENTED]** server side; **[RECOMMENDED]** local side. |
| T4 | **Stolen / leaked JWT** | Spoofing | Attacker uses partner's bearer token | A stolen JWT alone **cannot sign**: it cannot produce a signature from the token. It could (a) read the partner's pending challenge incl. nonce, (b) call `/reject`, (c) burn the 3-attempt budget (DoS, §T9). **[NOT IMPLEMENTED]** short-lived, device-bound tokens for the signer (§5); today `auth.py` issues 7-day JWTs. |
| T5 | **Replay** of a captured signature | Tampering, Repudiation | Re-POST an old signature, or reuse it on another request | **[IMPLEMENTED]** Nonce is 256-bit random (`secrets.token_hex(32)`), unique-indexed, bound into the signed message together with request id, entity, gate, hash, signer id and expiry; a request transitions `PENDING → SIGNED` once (second `/complete` → 409); expiry enforced (`SIGNING_REQUEST_TTL_SECONDS`, default 300 s). A signature for request X is invalid for any other request. |
| T6 | **Document substitution at the signer** (local malware swaps what is shown) | Tampering | UI shows document A, signer signs B | Signer renders from the same validated struct that produced the signed bytes (single source of truth, §7). Out of scope: fully compromised OS — mitigate with hardened runtime, code signing, and token PIN-pad/“secure PIN entry” where hardware supports it (§6.5). |
| T7 | **PIN keylogging / shoulder surfing / memory scraping** | Information disclosure | Keylogger or malware reads PIN | PIN entered in a native dialog (not a web view), held in a locked, zeroising buffer, passed straight to `C_Login`, wiped immediately and in any case < 30 s (§6.4, §8.1). Prefer tokens/readers with hardware PIN pad. PIN never logged, never serialised, never sent to the platform. |
| T8 | **Rogue token / unregistered certificate** | Spoofing | Attacker signs with their own key | **[IMPLEMENTED]** `/complete` requires the presented certificate's SHA-256 fingerprint to be registered, `ACTIVE`, owned by the calling partner *and tenant*; otherwise 403. Certificate must be in validity, key ≥ RSA-2048 or ECDSA P-256/P-384, key usage permitting signatures, not a CA cert; optional trust-anchor check (§13.2). |
| T9 | **Attempt-budget DoS / brute force** | DoS | Attacker with JWT posts garbage signatures to lock the request | **[IMPLEMENTED]** each failed verification increments `attempts`; at `MAX_ATTEMPTS = 3` status becomes `FAILED` and cannot be revived (a *new* request must be created). This bounds brute force but is also a DoS lever for a JWT thief — see T4 and §13.5. |
| T10 | **Supply-chain / update tampering** | Tampering, Elevation | Trojaned installer, poisoned dependency, malicious auto-update | Code-signed installers, signed update manifests verified against **pinned** public keys, reproducible builds, SBOM, dependency pinning and audit (§8.5, §10). |
| T11 | **Malicious PKCS#11 module** (DLL planting) | Elevation | Attacker drops `*.dll`/`*.so`/`*.dylib` where module discovery looks | Load only from an allow-list of absolute system paths with signature/hash verification; never from CWD or user-writable dirs (§6.2). |
| T12 | **Repudiation** by partner or by staff | Repudiation | "I never signed" / "the system signed" | Every state change is sealed in the firm's SHA-256 hash-chained audit log (**[IMPLEMENTED]**, §11): `SIGNING_REQUESTED`, `DSC_SIGNED` (with cert fingerprint, device label, document hash), `SIGNING_REJECTED_BY_PARTNER`, `SIGNING_REJECTED_BY_SERVER`. `SigningRequest.audit_block_hash` links the row to the block. |
| T13 | **Cross-tenant access** | Information disclosure | Partner of firm B reads firm A's challenge | **[IMPLEMENTED]** every query is filtered by `tenant_id == user.tenant_id`; `/pending` additionally by `signer_id == user.id`. Cross-tenant signer ids are rejected at creation (422). |
| T14 | **Clock manipulation** | Tampering | Local clock set back to extend an expired challenge | Server clock is authoritative: `/complete` on an expired row → status `EXPIRED`, 409. Signer must not try to "help" by ignoring local expiry; local expiry is only for UX (§4.7). |
| T15 | **Clickjacking / auto-sign** | Elevation | Script or accessibility tool clicks "Sign" | Signing requires an explicit, interactive PIN entry per request; no "remember PIN", no batch sign, no command-line sign (§7.4). |

### 2.2 Explicitly accepted residual risks

* A fully compromised partner workstation (kernel-level malware) can mislead the partner about what is displayed. Mitigation is procedural (hardware PIN-pad readers, managed endpoints) and is a documented limitation.
* The server can *deny service* (never create/serve challenges). It cannot forge a signature.
* Revocation (CRL/OCSP) is not checked server-side today (§13.3).

---

## 3. Architecture

### 3.1 Components

```
 Partner's workstation                                     Platform (cloud)
┌───────────────────────────────────────────────┐        ┌─────────────────────────────┐
│  Browser (web UI)  ── no link to signer ──╳   │        │  FastAPI /api/v1/signing/*  │
│                                               │        │   - challenge issue         │
│  ┌──────────── Desktop DSC Signer ──────────┐ │ HTTPS  │   - signature verification  │
│  │ UI shell (native)      Auth (OS keystore)│◄┼────────┼►  - SQC-1 audit chain       │
│  │ Protocol client        Validation core   │ │ TLS1.3 │   - tenant / RBAC           │
│  │ PKCS#11 adapter ──┐    Secure PIN dialog │ │        └─────────────────────────────┘
│  └───────────────────┼──────────────────────┘ │
│                      ▼ PKCS#11 (local only)   │
│            [ USB crypto-token — private key ] │
└───────────────────────────────────────────────┘
```

Data that leaves the machine: request-completion JSON containing `signature_b64`, `certificate_pem` (public), `signer_device` (label). Data that never leaves: PIN, private key, token serial/PIN counters, any document content beyond what the server already has.

### 3.2 Sequence diagram

```mermaid
sequenceDiagram
    autonumber
    participant Mgr as Manager (web UI)
    participant API as Platform API
    participant App as Desktop Signer
    participant P as Partner (human)
    participant Tok as USB Token (PKCS#11)

    Note over P,API: One-time: partner registers PUBLIC DSC cert<br/>POST /signing/certificates (PARTNER)
    Mgr->>API: POST /signing/requests {entity_type, entity_id, document_hash, document_label, signer_id}
    API->>API: Validate: reviewed return, hash == payload_hash,<br/>reviewer set, preparer != signer, signer is active Partner
    API-->>Mgr: 201 {id, status: PENDING, expires_at} (no nonce)
    API->>API: audit: SIGNING_REQUESTED
    loop poll (§4.6)
        App->>API: GET /signing/requests/pending  (partner JWT)
        API-->>App: [{id, ..., nonce, message_b64}]
    end
    App->>App: Rebuild canonical message; compare to message_b64;<br/>check signer_id == me, not expired locally
    App->>P: Show WYSIWYS: label, entity, SHA-256, requester, countdown, liability text
    P->>App: Confirm + enter PIN (native secure dialog)
    App->>Tok: C_Login(PIN) → C_SignInit/C_Sign(message)
    Tok-->>App: signature
    App->>Tok: C_Logout; zeroize PIN buffer (< 30 s total)
    App->>API: POST /signing/requests/{id}/complete {signature_b64, certificate_pem, signer_device}
    API->>API: Validate cert, fingerprint registered+active+owned,<br/>verify signature over canonical message
    API-->>App: 200 {status: SIGNED, cert_fingerprint, signed_at}
    API->>API: Return → SIGNED; audit: DSC_SIGNED
    Mgr->>API: (Partner, in web) POST /gates/{G7 id}/approve → allowed only if a SIGNED request exists
```

Alternate path: the partner declines → `POST /signing/requests/{id}/reject {reason}` → `REJECTED`, audit `SIGNING_REJECTED_BY_PARTNER`.

### 3.3 Relationship to Gate G7 approval

Signing and gate approval are two separate server facts. `POST /api/v1/gates/{id}/approve` on a `G7` gate returns **409** ("Gate G7 cannot be approved without a verified desktop-signer signature") unless a `SigningRequest` with the same `entity_type`/`entity_id` and status `SIGNED` exists. The signer never calls the gates API.

---

## 4. Protocol

Base path: `/api/v1/signing`. All requests are HTTPS (TLS ≥ 1.2, 1.3 preferred) with `Authorization: Bearer <JWT>` and `Accept: application/json`. IDs are UUIDs. Timestamps from the server are ISO-8601 with offset (e.g. `2026-11-01T06:35:00+00:00`).

### 4.1 Roles (as enforced today)

Role levels come from `ROLE_HIERARCHY`: `CLIENT_USER`=0, `ARTICLE_TRAINEE`=1, `REVIEWER`=2, `MANAGER`=3, `SENIOR_MANAGER`=4, `PARTNER`=5.

| Endpoint | Min role | Extra conditions |
|---|---|---|
| `POST /certificates`, `DELETE /certificates/{id}` | PARTNER | own certificates only |
| `GET /certificates` | any authenticated | own certificates only |
| `POST /requests` | MANAGER | signer must be an active PARTNER of the same firm |
| `GET /requests/pending` | any authenticated | only rows where `signer_id == caller` |
| `GET /requests`, `GET /requests/{id}` | any authenticated | below MANAGER you only see rows where you are the signer; nonce is included only for the assigned signer on a `PENDING` row via `GET /requests/{id}` |
| `POST /requests/{id}/complete`, `.../reject` | PARTNER | caller must equal `signer_id` (else 403) |

The signer app only ever calls: `GET /requests/pending`, `GET /requests/{id}` (optional refresh), `POST /requests/{id}/complete`, `POST /requests/{id}/reject`, and (setup wizard) `POST /certificates`, `GET /certificates`.

### 4.2 Certificate registration (setup, once per DSC)

```http
POST /api/v1/signing/certificates
Content-Type: application/json

{ "certificate_pem": "-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----" }
```

`certificate_pem`: 100–20000 chars, PEM X.509, **public certificate only**.

`201 Created`
```json
{
  "id": "5b0e3f0e-6a1d-4c8e-a1d3-0d1f4a2b9c11",
  "fingerprint_sha256": "9f2c…(64 hex)…",
  "subject": "CN=CA Test Partner",
  "not_after": "2027-10-31T06:30:00+00:00"
}
```

Errors: `403` caller not PARTNER; `409` fingerprint already registered (global unique); `422` certificate invalid (message from `CertificateError`, e.g. *"RSA key too small (1024 bits); minimum is 2048."*, *"Certificate is outside its validity period."*, *"A CA certificate cannot be registered as a signer DSC."*, *"Certificate was not issued by a trusted certifying authority."*).

The fingerprint is `SHA-256(DER(certificate))`, lower-case hex. The signer computes the same value locally and shows it to the user during setup for out-of-band confirmation.

### 4.3 The canonical message (`CAFOS-DSC-V1`)

The bytes signed are the UTF-8 encoding of these **eight lines joined by a single `\n` (LF), with no trailing newline and no BOM**:

```
CAFOS-DSC-V1
request:<request id, lower-case UUID>
entity:<entity_type>:<entity_id>
gate:<gate_id>
sha256:<document_hash, 64 lower-case hex>
nonce:<nonce, 64 lower-case hex>
signer:<signer_id, lower-case UUID>
expires:<expires_at in UTC, formatted YYYY-MM-DDTHH:MM:SSZ>
```

Rules (`canonical_signing_message()` in `dsc_signing.py`):

* `expires` is `expires_at` converted to UTC and formatted with `%Y-%m-%dT%H:%M:%SZ` — **seconds precision, literal `Z`**, regardless of how the API renders `expires_at` (`+00:00`, microseconds, …). Implementations must drop sub-second precision and re-format; do not echo the API string.
* If the server value has no timezone it is treated as UTC.
* No field is trimmed, re-cased or escaped; the server builds the message from stored values.

**Worked example**

Inputs:

| field | value |
|---|---|
| request id | `7d9a2c64-3f10-4b57-9a0e-52c1e6a8b0f3` |
| entity | `GST_RETURN` / `3a1f0c88-0c4e-4f6e-bb21-9d7b6a5c2e10` |
| gate | `G7` |
| document_hash | `b1f4…` (64 hex, abbreviated here: `b1f4e9d0c2a7835f6e1b0d94a3c7f2e8d5b6a1c09e3f47d2850b6c1a9e8d7f34`) |
| nonce | `0f3c…` (e.g. `0f3c5a7e91b2d4c6e8a0b1d3f5a79c2e4b6d8f01a3c5e7092b4d6f8a1c3e5b79`) |
| signer | `e2b7d6c1-8a4f-4d3b-9c55-1f0a7e6d2b48` |
| expires_at (API) | `2026-11-01T06:35:00.123456+00:00` |

Message (shown with `⏎` marking LF; there is no final `⏎`):

```
CAFOS-DSC-V1⏎
request:7d9a2c64-3f10-4b57-9a0e-52c1e6a8b0f3⏎
entity:GST_RETURN:3a1f0c88-0c4e-4f6e-bb21-9d7b6a5c2e10⏎
gate:G7⏎
sha256:b1f4e9d0c2a7835f6e1b0d94a3c7f2e8d5b6a1c09e3f47d2850b6c1a9e8d7f34⏎
nonce:0f3c5a7e91b2d4c6e8a0b1d3f5a79c2e4b6d8f01a3c5e7092b4d6f8a1c3e5b79⏎
signer:e2b7d6c1-8a4f-4d3b-9c55-1f0a7e6d2b48⏎
expires:2026-11-01T06:35:00Z
```

Reference pseudocode (matches the Python):

```
msg = "\n".join([
  "CAFOS-DSC-V1",
  f"request:{id}",
  f"entity:{entity_type}:{entity_id}",
  f"gate:{gate_id}",
  f"sha256:{document_hash}",
  f"nonce:{nonce}",
  f"signer:{signer_id}",
  f"expires:{utc(expires_at).strftime('%Y-%m-%dT%H:%M:%SZ')}",
]).encode("utf-8")
```

### 4.4 Signature algorithm

The server verifies the raw signature directly over the canonical message bytes (it hashes with SHA-256 internally):

| Key type | Scheme | Wire format of `signature_b64` |
|---|---|---|
| RSA ≥ 2048 | RSASSA-PKCS1-v1_5 with SHA-256 | the raw big-endian signature (modulus-length bytes), standard base64 |
| ECDSA P-256 / P-384 | ECDSA with SHA-256 | **ASN.1 DER** `SEQUENCE{r,s}`, standard base64 |

Not accepted: RSA-PSS, Ed25519, SHA-1/SHA-384 digests, CMS/PKCS#7 envelopes. Important PKCS#11 caveat: `CKM_ECDSA` / `CKM_ECDSA_SHA256` return **raw `r‖s`**, which the signer **must** convert to DER before encoding, otherwise the server will report "Signature verification failed." `signature_b64` must be 64–4096 chars of valid standard base64 (`validate=True`: no whitespace or URL-safe alphabet).

### 4.5 Fetch pending challenge(s)

```http
GET /api/v1/signing/requests/pending
Authorization: Bearer <JWT>
```

`200 OK` (oldest first; expired rows are flipped to `EXPIRED` and omitted)
```json
[
  {
    "id": "7d9a2c64-3f10-4b57-9a0e-52c1e6a8b0f3",
    "entity_type": "GST_RETURN",
    "entity_id": "3a1f0c88-0c4e-4f6e-bb21-9d7b6a5c2e10",
    "gate_id": "G7",
    "document_hash": "b1f4e9d0c2a7835f6e1b0d94a3c7f2e8d5b6a1c09e3f47d2850b6c1a9e8d7f34",
    "document_label": "GSTR-3B Oct 2026",
    "signer_id": "e2b7d6c1-8a4f-4d3b-9c55-1f0a7e6d2b48",
    "requested_by": "c0a8f3d2-1b6e-4a77-8d90-3e5f7a2b1c64",
    "status": "PENDING",
    "expires_at": "2026-11-01T06:35:00.123456+00:00",
    "signed_at": null,
    "cert_fingerprint": null,
    "failure_reason": null,
    "nonce": "0f3c5a7e91b2d4c6e8a0b1d3f5a79c2e4b6d8f01a3c5e7092b4d6f8a1c3e5b79",
    "message_b64": "Q0FGT1MtRFNDLVYx…"
  }
]
```

`GET /requests/{id}` returns the same shape (with `nonce` + `message_b64`) when the caller is the assigned signer and the row is `PENDING`; otherwise the public shape. Unknown/foreign ids → `404`.

**Local validation before display (all mandatory; on failure show an error, do not offer signing, optionally `reject` with a reason):**

1. `signer_id` equals the logged-in user's id (from `/auth/me`).
2. `status == "PENDING"` and `expires_at` is in the future (with skew tolerance, §4.7).
3. `document_hash` matches `^[0-9a-f]{64}$`; `nonce` matches `^[0-9a-f]{64}$`; `gate_id` matches `^G\d{1,2}$`.
4. Rebuilding the canonical message from the fields (§4.3) yields **exactly** `base64_decode(message_b64)`.
5. `entity_type ∈ {GST_RETURN, ITR, TDS_RETURN, MCA_FORM, OTHER}` (otherwise warn prominently).

### 4.6 Polling & backoff

There is no push channel **[NOT IMPLEMENTED]** (no WebSocket/SSE). The signer polls `GET /requests/pending`:

* Window **focused / user waiting**: every 3 s ± 1 s jitter.
* Window idle in tray: every 15 s ± 5 s; when a request is seen, raise a native notification and switch to the 3 s cadence until the list is empty.
* On `5xx`/network error: exponential backoff 2 s → 4 → 8 → … capped at 60 s, with full jitter; reset on success.
* On `401`: stop polling, refresh token (§5); if refresh fails show "Sign in again".
* On `429` **[NOT IMPLEMENTED server-side]**: honour `Retry-After` if present, otherwise double the interval.
* One in-flight poll at a time. Stop polling while a signing dialog is open (the displayed challenge is pinned by `id`).

### 4.7 Clock skew

The server clock is authoritative: expiry is enforced server-side (`expires_at <= now` → status `EXPIRED`, 409 on `/complete`). Default TTL is `SIGNING_REQUEST_TTL_SECONDS = 300`. The signer should:

* Estimate skew from the HTTP `Date` response header on each poll (`skew = server_date − local_now`, median of last 5) and compute the countdown as `expires_at − (local_now + skew)`.
* Refuse to start the PIN ceremony if the remaining time is < 20 s (PIN entry + signing + upload must fit) and show "request about to expire".
* Never extend, edit or ignore `expires_at`; it is inside the signed message, so an altered value invalidates the signature anyway.
* Warn the user if |skew| > 120 s (misconfigured OS clock; also breaks token/TLS validation).

### 4.8 Complete

```http
POST /api/v1/signing/requests/7d9a2c64-3f10-4b57-9a0e-52c1e6a8b0f3/complete
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "signature_b64": "MEUCIQ…",
  "certificate_pem": "-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----",
  "signer_device": "WIN11-ACCT-04 / ePass2003 / signer 1.0.3"
}
```

`signer_device` is optional, ≤ 120 chars, stored and sealed in the audit block; it must contain **no** personal data, token serial or PIN-related data (use a stable pseudonymous device label).

`200 OK`
```json
{
  "id": "7d9a2c64-3f10-4b57-9a0e-52c1e6a8b0f3",
  "entity_type": "GST_RETURN",
  "entity_id": "3a1f0c88-0c4e-4f6e-bb21-9d7b6a5c2e10",
  "gate_id": "G7",
  "document_hash": "b1f4…",
  "document_label": "GSTR-3B Oct 2026",
  "signer_id": "e2b7d6c1-8a4f-4d3b-9c55-1f0a7e6d2b48",
  "requested_by": "c0a8f3d2-1b6e-4a77-8d90-3e5f7a2b1c64",
  "status": "SIGNED",
  "expires_at": "2026-11-01T06:35:00.123456+00:00",
  "signed_at": "2026-11-01T06:31:42.518+00:00",
  "cert_fingerprint": "9f2c…",
  "failure_reason": null
}
```

Server-side order of checks (so the app can predict responses): load row in caller's tenant (404) → lazily expire → caller is `signer_id` (403) → status is `PENDING` (409 `Signing request is <STATUS>.`) → parse + validate certificate (422, counts an attempt) → certificate fingerprint registered, `ACTIVE`, same user and tenant (403, counts an attempt) → base64 decode (422, counts an attempt) → verify signature over the recomputed canonical message (422 `Signature verification failed.`, counts an attempt) → success.

### 4.9 Reject

```http
POST /api/v1/signing/requests/{id}/reject
Content-Type: application/json

{ "reason": "Figures disputed with client; do not file." }
```

`reason`: 3–300 chars. `200` → public shape with `status: "REJECTED"`, `failure_reason` = reason. Errors: `403` not the assigned signer, `409` not pending, `404`.

### 4.10 Status & error handling table

| HTTP | Where | Meaning | Signer behaviour |
|---|---|---|---|
| 200 | complete / reject / pending | success | Show success; discard challenge; zeroize (already done). |
| 401 | any | missing/invalid/expired JWT (`Invalid session token.`, `Session expired…`, `Authentication required…`) | Stop; re-authenticate (§5). Do **not** retry `/complete` blindly — re-fetch the request first. |
| 403 | complete | not the assigned signer, **or** certificate not registered to this partner / revoked | Show "This certificate is not registered for your account." Offer registration wizard. Counts an attempt on the server for the cert case. |
| 403 | reject / certificates | role below PARTNER | Show "Partner role required." |
| 404 | request/cert | not found in your tenant | Remove from local list. |
| 409 | complete / reject | request is `SIGNED`/`REJECTED`/`EXPIRED`/`FAILED` | Refresh; show terminal state; for `FAILED`/`EXPIRED` tell the user to ask the manager to create a new request. Never retry. |
| 409 | certificates | already registered | Treat as success if fingerprint belongs to me (`GET /certificates`). |
| 422 | complete | invalid certificate, bad base64, or "Signature verification failed." (**each consumes 1 of 3 attempts**) | Do **not** auto-retry. Run local self-check (§12) first: verify own signature locally against the cert; re-check DER/raw ECDSA conversion; only then allow one manual retry. After the 2nd failure warn "one attempt left". |
| 422 | certificates | certificate unacceptable | Show server message verbatim (sanitised). |
| 429 | any | **[NOT IMPLEMENTED]** | See §4.6. |
| 5xx / network | any | transient | Backoff. For `/complete` with unknown outcome (timeout), **re-GET the request**: if `SIGNED` → success; if still `PENDING` and not expired → the signature may be re-submitted (same signature is valid; it does not need re-signing, so no second PIN entry). |

### 4.11 Idempotency note

`/complete` is not idempotent by contract: a second successful-looking POST returns `409` because the row is already `SIGNED`. The signer therefore resolves unknown outcomes by reading state (`GET /requests/{id}`), never by blind retry loops.

---

## 5. Authenticating the signer app to the platform

### 5.1 Current state **[IMPLEMENTED]**

The only credential in the system is the JWT issued by OTP login (`/auth/otp/verify`, or Firebase phone verify), HS256, claims `sub`, `tenant_id`, `role`, `email`, … With `get_current_user` strict claim checking. `auth.py` currently issues these with a **7-day** lifetime. There is no refresh token, no device binding, no scoped tokens, no revocation list. Using this for the signer would mean a long-lived bearer secret on disk.

### 5.2 Required design **[NOT IMPLEMENTED — server requirement]**

Adopt **OAuth 2.0 Device Authorization Grant (RFC 8628)** layered over the existing OTP login:

1. Signer calls `POST /auth/device/code` with `client_id=cafos-desktop-signer` and `device_label`. Server returns `device_code`, `user_code` (8 chars, ambiguity-free alphabet), `verification_uri`, `expires_in` (≤ 600 s), `interval` (5 s).
2. Signer displays the `user_code` and opens `verification_uri` in the **system browser**.
3. The partner signs in with the normal OTP flow in the web app, sees "Authorise *<device_label>* to sign as *<name>* (Partner)", compares the `user_code`, and approves.
4. Signer polls `POST /auth/device/token` (RFC 8628 §3.4 error codes: `authorization_pending`, `slow_down`, `access_denied`, `expired_token`).
5. On approval the server issues:
   * **access token**: JWT, **≤ 15 minutes**, with `scope=signing:read signing:complete`, claim `device_id`, and `cnf` (confirmation) bound to the device key (see 5.4). Must be rejected on every endpoint outside `/signing/*` and `/auth/me`.
   * **refresh token**: opaque, rotating (one-time use with reuse detection → revoke family), ≤ 30 days idle / 90 days absolute, stored server-side hashed.

### 5.3 Storage on the device **[RECOMMENDED]**

* Refresh token (and device private key handle) in the OS credential store: **Windows Credential Manager / DPAPI (user scope, `CRYPTPROTECT_UI_FORBIDDEN` off, entropy = app-specific)**, **macOS Keychain** (item `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, access group restricted to the signed app), **Linux Secret Service/libsecret** (Linux is best-effort).
* Access token held in memory only; never written to disk, logs, crash dumps, or environment variables.
* Never reuse the web app's cookie/session; the signer has its own grant and can be revoked independently.

### 5.4 Device binding **[NOT IMPLEMENTED — server]; [RECOMMENDED — app]**

At enrolment the signer generates a non-exportable key pair in the OS key store (Windows CNG/TPM-backed where available; macOS Secure Enclave; fallback software key in Keychain). The public key is registered during the device-grant approval. Subsequent token requests and refreshes are authenticated with **DPoP (RFC 9449)** proofs signed by that key, so a copied refresh/access token is useless on another machine. This bounds threat T4.

### 5.5 Revocation & session hygiene

* Partner can list/revoke authorised devices in the web UI **[NOT IMPLEMENTED]**.
* Deactivating the user (`users.is_active = false`) or demoting from PARTNER must invalidate device grants (`require_role("PARTNER")` already enforces role on `/complete`/`/reject` per request, but token lifetime is the only invalidator today).
* Signer logout deletes the refresh token locally and calls the revocation endpoint.

### 5.6 Interim guidance until §5.2 ships

Do **not** ship a production signer using the 7-day JWT. For the pilot: require re-login via OTP at each app start, keep the JWT in memory only, and treat the build as "beta — not for production filings".

---

## 6. PKCS#11 integration

### 6.1 Supported hardware

Target Indian Class-3 DSC tokens (all expose a standard Cryptoki module):

| Token | Typical vendor module (Windows) | macOS / Linux |
|---|---|---|
| **ePass2003** (Feitian) | `eps2003csp11v2.dll` / `ep2003-csp11.dll` (System32/SysWOW64) | `/usr/local/lib/libcastle_v2.1.0.0.dylib`, `/usr/lib/libcastle.so.1.0.0` |
| **Watchdata ProxKey** | `SignatureP11.dll` / `WDPKCS.dll` | `/usr/local/lib/libwdpkcs.dylib`, `/usr/lib/WatchData/ProxKey/lib/libwdpkcs_SignatureP11.so` |
| **SafeNet / Aladdin eToken** (Thales) | `eTPKCS11.dll` | `/Library/Frameworks/eToken.framework/Versions/A/libeToken.dylib`, `/usr/lib/libeToken.so` |
| Others (Trust Key, mToken, Longmai) | per vendor | per vendor |

Exact file names vary by driver version; treat the table as discovery seeds, not guarantees, and verify with pilot hardware (see §15).

### 6.2 Module discovery & loading

* Ordered discovery: (1) user-configured absolute path (settings, admin-lockable), (2) allow-list of default paths above, (3) Windows registry vendor keys (e.g. `HKLM\SOFTWARE\Feitian…`) read-only.
* Only absolute paths in system-protected directories; refuse paths writable by non-admin users, reparse points/symlinks leaving the directory, and relative names (prevents DLL planting — threat T11).
* On Windows verify the module's Authenticode signature chains to a trusted publisher before `LoadLibrary`, using `LOAD_LIBRARY_SEARCH_SYSTEM32 | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS`; on macOS check `codesign` team id; on Linux check root-owned, not group/world-writable.
* Call `C_Initialize` with `CKF_OS_LOCKING_OK`; `C_GetInfo`/`C_GetSlotList(tokenPresent=true)`; subscribe to slot events (`C_WaitForSlotEvent` on a worker thread) to detect token removal mid-ceremony.
* One module loaded at a time; if several tokens are present, the user picks the token by label and the **certificate fingerprint must match a registered certificate** (`GET /certificates`) before signing is enabled.

### 6.3 Object & mechanism selection

1. Find the certificate: `C_FindObjects` with `CKA_CLASS=CKO_CERTIFICATE`, `CKA_CERTIFICATE_TYPE=CKC_X_509`; read `CKA_VALUE` (DER), compute SHA-256 fingerprint, match against the registered set.
2. Find the paired private key: `CKO_PRIVATE_KEY` with the same `CKA_ID` as the certificate; require `CKA_SIGN=true`, `CKA_SENSITIVE=true`, `CKA_EXTRACTABLE=false` (if the token reports an extractable key, warn and refuse in strict mode).
3. Mechanisms:

| Key | Preferred mechanism | Fallback | Notes |
|---|---|---|---|
| RSA | `CKM_SHA256_RSA_PKCS` (token hashes + pads) | `CKM_RSA_PKCS` over a locally constructed `DigestInfo(SHA-256, H(msg))` (PKCS#1 v1.5 prefix `3031300d060960864801650304020105000420` ‖ digest) | Output is the raw signature → base64. Never use `CKM_RSA_X_509`. |
| ECDSA P-256/P-384 | `CKM_ECDSA_SHA256` if present | `CKM_ECDSA` over the locally computed SHA-256 digest | Output is **raw `r‖s`** → convert to ASN.1 DER before base64 (§4.4). |

   Choose the mechanism from `C_GetMechanismList`; do not guess by token model. If neither is supported, show "This token does not support SHA-256 signing" and abort.
4. Sign exactly the bytes of the canonical message (§4.3) — never a re-encoded string.

### 6.4 Session handling & PIN

* Open a **read-only user session** (`CKF_SERIAL_SESSION`, no `CKF_RW_SESSION`) per ceremony; never keep a logged-in session between requests.
* `C_Login(CKU_USER, pin)` only after the user has confirmed the displayed document and the local validation (§4.5) passed. Use `CKF_PROTECTED_AUTHENTICATION_PATH` flag detection: if the token/reader has a hardware PIN pad (`CKF_PROTECTED_AUTHENTICATION_PATH`), call `C_Login` with `NULL` PIN and let the user enter it on the device — **preferred**, it keeps the PIN out of host memory entirely.
* PIN buffer lifecycle (software entry): allocate in locked memory (§8.1) → receive from the secure dialog → `C_Login` → **zeroize immediately after `C_Login` returns** (not after signing) → `C_Sign` → `C_Logout` → `C_CloseSession`. Total PIN-in-RAM time must be < 30 s (architecture requirement) and in the normal path is < 1 s; enforce a hard 30 s watchdog from dialog open that zeroizes and cancels.
* Never: store the PIN, cache it, put it in a `String` that cannot be wiped (use byte arrays / `SecureString`-equivalents with explicit zeroing), copy it into the clipboard/UI model, include it in exceptions, logs, telemetry or crash reports.
* Wrong PIN: map `CKR_PIN_INCORRECT` → show "Incorrect PIN"; `CKR_PIN_LOCKED` → show lockout guidance (contact CA/vendor; do not suggest workarounds); `CKR_PIN_LEN_RANGE`, `CKR_PIN_EXPIRED` accordingly.
* **Retry counter awareness:** read `CK_TOKEN_INFO.flags` — `CKF_USER_PIN_COUNT_LOW`, `CKF_USER_PIN_FINAL_TRY`, `CKF_USER_PIN_LOCKED`. When `COUNT_LOW` is set show a warning *before* the PIN dialog; when `FINAL_TRY` is set require a second explicit confirmation ("One attempt left. A wrong PIN will lock your DSC token."). The signer must **never** auto-retry a PIN, and never loop `C_Login` on failure. After any `CKR_PIN_INCORRECT`, require the user to re-enter manually.
* Remove-token events (`CKR_TOKEN_NOT_PRESENT`, `CKR_DEVICE_REMOVED`, `CKR_SESSION_HANDLE_INVALID`) abort the ceremony, zeroize, and return the user to the request screen (the platform request remains `PENDING` until it expires).

### 6.5 Error mapping (non-exhaustive)

| Cryptoki | User message | Action |
|---|---|---|
| `CKR_TOKEN_NOT_PRESENT` | "Insert your DSC token." | wait for slot event |
| `CKR_PIN_INCORRECT` | "Incorrect PIN." (+ remaining tries if known) | manual retry only |
| `CKR_PIN_LOCKED` | "Token is locked." | abort; no retry |
| `CKR_USER_NOT_LOGGED_IN` / `CKR_SESSION_CLOSED` | "Token session ended." | restart ceremony |
| `CKR_FUNCTION_CANCELED` | "Cancelled." | zeroize |
| `CKR_MECHANISM_INVALID` | "Token does not support required signing algorithm." | abort |
| anything else | "Token error (code 0x…)" without sensitive details | log code only |

### 6.6 Post-sign self-check

Before upload, verify the produced signature locally with the certificate public key over the same canonical bytes (RSA PKCS#1 v1.5 / ECDSA, SHA-256). A failure here means a wrong mechanism, DER-conversion bug or wrong key; **do not upload** (uploads that fail verification burn one of the server's three attempts).

---

## 7. UX & human factors

### 7.1 Principles

* **WYSIWYS.** The user must see, from the validated data that produced the signed bytes, everything that matters before the PIN dialog is reachable.
* **Deliberate friction.** Signing is a legal act (personal liability). No single-click signing, no defaults on the confirmation control.
* **Calm under time pressure.** The 300-second window is short; show it clearly without creating panic.

### 7.2 Signing screen content (all mandatory)

1. **What:** `document_label` (e.g. "GSTR-3B Oct 2026"), `entity_type`, `entity_id`, `gate_id`.
2. **Fingerprint of content:** full `document_hash` (SHA-256, grouped in blocks of 8 for comparison, copyable) with the hint "Compare with the hash shown on the return's evidence pack in the web app."
3. **Who requested:** `requested_by` (resolved to a name via `/auth/me`-style lookup **[NOT IMPLEMENTED: a user directory lookup endpoint for non-admins does not exist today; fall back to showing the UUID]**), and the signer identity (the logged-in partner, their ICAI membership number if available).
4. **Which certificate:** subject DN, issuer, validity, fingerprint (of the token certificate that will sign).
5. **Expiry countdown:** from `expires_at` with skew correction (§4.7); turns amber < 60 s, disables signing < 20 s.
6. **Liability acknowledgement** (checkbox, unchecked by default, must be ticked each time): "I have reviewed this document. By signing with my Class-3 DSC I accept personal responsibility for its accuracy under the Information Technology Act, 2000."
7. Buttons: **Reject…** (secondary, always available) and **Continue to PIN entry** (enabled only when the acknowledgement is ticked, the token is present, certificate fingerprint matches a registered certificate, and local validation §4.5 passed).

### 7.3 PIN entry

* Separate **native modal** window owned by the signer process (not a web view, not an overlay), always-on-top, title "Enter DSC token PIN — never share this PIN".
* Masked input, no paste, no autocomplete/IME suggestions, disable clipboard history, disable screen-capture where the OS supports it (`SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on Windows; `NSWindow.sharingType = .none` on macOS).
* Hardware PIN-pad path (§6.4) replaces this dialog with "Enter the PIN on your token reader".
* The dialog shows only the document label and countdown; the PIN field is the single input.
* 30-second watchdog from first keystroke/dialog open; on expiry: zeroize, close, return to the request.

### 7.4 Things the signer must never do

No auto-sign, no "remember PIN", no batch/multi-request signing, no headless/CLI signing mode, no signing triggered by deep links (`cafos://`) or notifications, no signing while the screen is locked or the session is remote (detect RDP/VDI where feasible and block — the token is a local physical custody device).

### 7.5 Reject flow

"Reject…" opens a reason box (3–300 characters, mirrors server validation), confirms, then `POST /requests/{id}/reject`. Show the resulting `REJECTED` state. Rejection requires no token or PIN. The web app shows the partner's reason to the requester (`failure_reason`).

### 7.6 States to design

No token · token present, no registered cert · no pending requests · request pending (normal) · request expiring · expired · already signed elsewhere · signed (success with `cert_fingerprint`, `signed_at`) · failed/locked (three failed attempts) · offline / server error · token removed mid-ceremony.

### 7.7 Accessibility & i18n

WCAG 2.2 AA: full keyboard operation, visible focus, screen-reader names for every control (UIA on Windows, NSAccessibility on macOS), minimum 4.5:1 contrast, no colour-only status, countdown announced via polite live region at 60/30/10 s (not every second). Respect OS text scaling and reduced-motion. The PIN dialog must work with screen readers without ever announcing the characters typed. UI strings externalised (English first; Hindi/Telugu next). Document labels and DNs rendered with full Unicode support and bidirectional-safe isolation (prevent homoglyph/RTL spoofing in `document_label`: show the raw hash always, and flag labels containing control or mixed-script confusables).

---

## 8. Local security hardening

### 8.1 Memory

* Hold PIN and any key-adjacent buffers in pages locked with `VirtualLock` (Windows) / `mlock` (macOS/Linux) and excluded from core dumps (`MADV_DONTDUMP`, `RLIMIT_CORE=0`, `PR_SET_DUMPABLE=0`; Windows: opt out of WER dump collection for the PIN region, `SetErrorMode`/WER `LocalDumps` policy documented for IT).
* Zeroize with non-optimisable primitives: `SecureZeroMemory` / `RtlSecureZeroMemory`, `memset_s`, Rust `zeroize` crate with `Zeroizing<Vec<u8>>`, .NET `CryptographicOperations.ZeroMemory` on pinned `byte[]`.
* Avoid immutable string types for PIN; avoid logging frameworks capturing arguments; disable debug/trace of PKCS#11 calls in release builds (PIN is an argument to `C_Login`).
* Disable hibernation/swap exposure where possible: advise BitLocker/FileVault full-disk encryption as a **deployment prerequisite**; the signer warns if it detects unencrypted system drive (best effort).

### 8.2 Process

* **Single instance** per user session (named mutex / `flock` on a per-user runtime file); second launch focuses the first.
* Run as the standard user — no administrator, no service, no setuid. Windows: Hardened token (drop privileges), `PROCESS_MITIGATION_*` (ASLR/CFG/DEP, block non-Microsoft-signed binaries where compatible with vendor PKCS#11 modules — evaluate, since vendor DLLs may not be MS-signed), disallow child-process creation after startup. macOS: hardened runtime, library validation (with the narrowest `disable-library-validation` exception only if vendor dylibs require it, documented), sandboxed entitlements limited to USB/smartcard + network client.
* Anti-debug is not a goal; do refuse to proceed with a PIN ceremony if a debugger is attached in release builds (cheap check, defence in depth only).

### 8.3 IPC and network surface

* **No listening sockets.** The signer is a pure client: no HTTP server, no named pipe, no localhost port, no custom URL handler that can trigger signing. This removes the "web page talks to a local signer" class of attack (cf. past localhost-DSC-service vulnerabilities).
* If a single-instance hand-off channel is needed it is a per-user, ACL'd local pipe/UNIX socket carrying only "focus window" — never request data.
* Outbound TLS only to the configured platform host: TLS ≥ 1.2, certificate validation with the OS trust store, **certificate pinning on SPKI of the platform leaf/intermediate with a backup pin** (pin set shipped in the signed config; rotation procedure documented), HSTS-like refusal of downgrade, no proxy credential prompts handled outside OS APIs. Reject redirects to other hosts. Strict timeouts (connect 5 s, total 15 s).

### 8.4 Files & data at rest

* Persisted: refresh token/device key reference (OS credential store), non-sensitive settings (platform URL, selected PKCS#11 module path, locale), redacted logs. Nothing else.
* Not persisted: PIN, access tokens, nonces, `message_b64`, signature, certificate PEM, document labels/hashes (hash and label are visible only in memory and UI; logs carry the request id only).
* Config is read from per-user config dir with 0600/ACL equivalents; admin-provided policy (managed devices) via Windows registry policy/ macOS configuration profile can lock the platform URL and PKCS#11 path.

### 8.5 Code signing, updates and supply chain

* All binaries Authenticode-signed (EV certificate, timestamped) and macOS Developer ID-signed + notarised with hardened runtime.
* **Auto-update** only from the vendor-controlled HTTPS endpoint; the update manifest and each artifact are signed with an offline **update-signing key (Ed25519 or ECDSA P-256)**; the signer ships **two pinned public keys** (current + backup) and refuses unsigned, wrongly signed, downgraded (anti-rollback version check) or hash-mismatched payloads. Updates are staged, verified, then applied on next start; never silently while a ceremony is open. Provide an admin switch for managed deployments (disable auto-update; MSI push).
* Dependencies pinned (lockfiles), vendored where practical, scanned (`cargo audit`/`cargo deny` or `dotnet list package --vulnerable`), builds in locked-down CI with provenance (SLSA level ≥ 2 target), SBOM (CycloneDX) published per release (§10).
* No third-party analytics SDKs, no remote code/config fetch that can alter signing behaviour.

### 8.6 Telemetry policy

No telemetry that includes document content, hashes, labels, entity ids, certificate subjects, PIN-related data or token serial numbers. Optional, opt-in crash/diagnostic reports contain: app version, OS version, PKCS#11 error codes, request-id UUIDs, timing. Crash dumps are disabled around the PIN buffer (§8.1) and are never auto-uploaded.

---

## 9. Recommended technology stack

### 9.1 Options

| Option | Core | UI shell | PKCS#11 | Pros | Cons |
|---|---|---|---|---|---|
| **A (recommended)** | **Rust** | **Tauri 2** (native webview for rendering only; PIN dialog is a separate **native** window via `windows`/`objc2`, never the webview) | `cryptoki` crate | Memory safety, small attack surface, `zeroize`/`secrecy` crates, cross-platform, single static binary | Webview presence needs strict CSP/IPC allow-list; native PIN dialog needs per-OS code |
| B | **.NET 8** | **WinUI 3** (Windows-first) / Avalonia | `Pkcs11Interop` | Excellent Windows integration (Credential Manager, UIA accessibility, MSIX), faster for a Windows-only India deployment | Managed memory/GC makes PIN hygiene harder (pinned `byte[]`, explicit zeroing); macOS weaker |
| C | Electron | — | node-pkcs11 | Fast UI | Large attack surface, JS strings cannot be wiped — **not recommended** for PIN handling |

**Recommendation:** Option A for the cryptographic/protocol core in all cases (a Rust crate `cafos-signer-core`), with Option B's WinUI shell acceptable if the pilot is Windows-only and the team prefers .NET; in that case keep PIN handling and PKCS#11 in the Rust core exposed over FFI so the shell never touches the PIN.

Rationale: the signer's value is a small, auditable trusted computing base; Indian CA practices are overwhelmingly Windows, so Windows is tier-1 (Windows 10 22H2+/11), macOS tier-2, Linux best-effort.

### 9.2 Module breakdown

| Module | Responsibility | Notes |
|---|---|---|
| `core::message` | Canonical message builder + parser/validator (§4.3, §4.5) | Pure functions, `#![forbid(unsafe_code)]`, 100% unit/property-tested; shares test vectors with the backend |
| `core::protocol` | HTTP client (reqwest + rustls, pinned), DTOs for §4 endpoints, retry/backoff/skew (§4.6–4.7) | No logging of bodies |
| `core::auth` | Device grant, DPoP, token store (§5) | OS credential store adapters behind a trait |
| `core::pkcs11` | Module discovery, slot events, object lookup, mechanism selection, ECDSA raw→DER, PIN lifecycle (§6) | Only module with `unsafe` (FFI), reviewed |
| `core::secret` | Locked, zeroising PIN buffer (`mlock`/`VirtualLock`, `zeroize`) | Fuzzed/leak-tested |
| `core::crypto_check` | Local verification of produced signature (RSA/ECDSA) and certificate checks mirroring `validate_certificate` | Uses `rsa`/`p256`/`p384`/`x509-cert` crates |
| `ui::signing_screen` | WYSIWYS view (§7.2) | Renders only validated structs |
| `ui::pin_dialog` | Native secure PIN entry (§7.3) | Per-OS implementation |
| `ui::setup_wizard` | Device grant, token detection, certificate registration (`POST /certificates`) | Shows fingerprint for confirmation |
| `platform::updater` | Signed update verification (§8.5) | Pinned keys |
| `platform::logging` | Redacting structured logger (§11.2) | Allow-list of fields |

---

## 10. Packaging, distribution & updates

* **Windows:** MSIX (preferred, clean uninstall, per-user, auto-update capable) with an **MSI** fallback for enterprise GPO/Intune deployment. Authenticode (EV) signature + timestamp on every EXE/DLL/installer. Include documented silent-install flags and a policy template (ADMX) for the platform URL, PKCS#11 path, auto-update on/off, minimum version.
* **macOS:** universal (arm64+x86_64) `.app` in a signed, **notarised** `.pkg`/`.dmg`, hardened runtime, stapled ticket.
* **Linux (best-effort):** signed `.deb`/AppImage; documented udev rules for tokens.
* **Reproducible builds:** pinned toolchain (`rust-toolchain.toml`), `--locked`, `SOURCE_DATE_EPOCH`, containerised CI; publish build hashes so third parties can verify the artifact.
* **SBOM & provenance:** CycloneDX SBOM + SLSA provenance attestation attached to each release; vulnerability scan gating the release.
* **Distribution:** downloads from the platform's authenticated settings page and a vendor release page over HTTPS; SHA-256 and signature published out-of-band (separate domain/channel).
* **Versioning:** SemVer; the signer sends `User-Agent: cafos-signer/<ver> (<os>)`. Server may enforce a minimum supported version **[NOT IMPLEMENTED]** (return `426 Upgrade Required` from `/signing/*`).
* **Update channels:** `stable` (default), `beta` (opt-in pilot partners). Rollback: updater keeps previous version; anti-rollback only against versions below `min_supported`.
* **Uninstall:** removes binaries and the credential-store entries; leaves the token untouched.

---

## 11. Observability & audit

### 11.1 Server-side audit chain **[IMPLEMENTED]**

Each action appends a block to the firm's SHA-256 hash chain (`append_audit_block`; verifiable with `verify_firm_audit_chain`, advertised standard "ICAI SQC 1 / Digital Evidence Standard Section 65B"). Blocks relevant to the signer:

| Action | Written when | Payload highlights |
|---|---|---|
| `DSC_CERTIFICATE_REGISTERED` | `POST /certificates` | `fingerprint`, `serial` |
| `DSC_CERTIFICATE_REVOKED` | `DELETE /certificates/{id}` | `fingerprint` |
| `SIGNING_REQUESTED` | `POST /requests` | `entity`, `document_hash`, `signer_id` (actor = requester) |
| `SIGNING_REJECTED_BY_SERVER` | any failed `/complete` verification | `reason`, `attempts` |
| `DSC_SIGNED` | successful `/complete` | `entity`, `document_hash`, `cert_fingerprint`, `signer_device`, `gate_id` |
| `SIGNING_REJECTED_BY_PARTNER` | `/reject` | `reason` |
| `GATE_APPROVED` (etc.) | gates API | gate id, entity, notes |

`SigningRequest.audit_block_hash` stores the `DSC_SIGNED` block hash, giving a row → block pointer. `signature_b64`, `cert_fingerprint`, `signed_at`, `signer_device`, `attempts`, `failure_reason` are stored on the request row for evidence.

Honest notes: (1) the failed-attempt audit write happens after the DB commit that increments `attempts`; (2) there is no external anchoring (e.g. RFC 3161 timestamp or publishing the head hash) of the chain **[NOT IMPLEMENTED]** — see §13.

### 11.2 Local logging rules

* Structured logs with an **allow-list** of fields: timestamp, level, component, app version, request id (UUID), HTTP method/path template, status code, duration, PKCS#11 function name + `CKR_*` code, state-machine transitions.
* **Never log:** PIN or any `C_Login` argument, tokens (access/refresh/DPoP), `nonce`, `message_b64`, `signature_b64`, certificate PEM, `document_hash`, `document_label`, `entity_id`, user names/emails, token serial numbers, response bodies.
* Log files per-user, size-rotated (≤ 5 × 2 MB), ACL'd to the user, no network shipping by default.
* A "Copy diagnostics" button generates a redacted bundle (version, OS, token vendor + module version, last 200 log lines already redacted).
* Unit tests assert that known secret patterns (a sentinel PIN `424242`, `Bearer ` tokens) never appear in captured log output across all failure paths.

### 11.3 Metrics (server-side, **[NOT IMPLEMENTED]** beyond audit)

Recommended counters: requests created/signed/rejected/expired/failed, median time-to-sign, failed-verification rate per partner (anomaly signal for T4/T9), poll rate per device.

---

## 12. Test plan

### 12.1 Unit tests (core, no hardware)

* Canonical message: golden vectors incl. the worked example; microsecond/offset/naive `expires_at` normalisation; non-lower-case UUID input rejected; field-injection attempts (embedded `\n`) rejected by the parser.
* Validation: every rule of §4.5.
* ECDSA raw `r‖s` → DER conversion (including leading-zero and high-bit `r`/`s`, P-256 and P-384).
* Backoff/jitter/skew calculators with a fake clock.
* PIN buffer: zeroised after `C_Login`, after error, after panic/unwind, after the 30 s watchdog (inspect memory in test via a debug allocator hook).
* Log redaction (§11.2).

### 12.2 Protocol conformance suite

A language-neutral vector file (`signer-conformance.json`) generated from the backend test helpers: for RSA-2048, ECDSA P-256 and P-384 it contains a certificate (public) + private key (test-only), a challenge (all fields), the expected `message_b64`, and the expected `signature_b64` shape. The suite drives the signer core against a **mock server** and, in CI, against a real running backend (`uvicorn` + SQLite as in `backend/tests/test_api_security_gates.py`), executing: register certificate → create request (as MANAGER) → poll → sign → complete → assert `SIGNED`, return status `SIGNED`, audit chain valid.

The Python helpers are the reference:

```python
key, pem = make_cert()                     # RSA-2048 self-signed, KeyUsage digitalSignature
sig_b64 = base64.b64encode(
    key.sign(base64.b64decode(message_b64), padding.PKCS1v15(), hashes.SHA256())
).decode()
```

### 12.3 Negative tests (mirror the backend suite)

| Scenario | Expected server result | Signer must |
|---|---|---|
| Wrong-key signature from an unregistered cert | 403 (`Certificate is not registered…`), consumes an attempt | never produce it (cert fingerprint pre-check) |
| Registered key, wrong bytes signed | 422 `Signature verification failed.` ×N → after 3 total failures `FAILED`, then 409 | pre-upload self-check blocks upload |
| Replay after `SIGNED` | 409 | resolve via GET, show success |
| Expired request | 409 `Signing request is EXPIRED.` | disable signing < 20 s; show expired |
| Another partner completes | 403 | n/a (challenge not delivered to others) |
| Challenge for another signer / tampered `message_b64` | — | local validation fails; refuse; offer reject |
| Weak (1024-bit) / expired / CA certificate | 422 at registration | setup wizard pre-validates |
| Missing/forged/expired JWT | 401 | re-auth, no retry storm |
| Token removed mid-ceremony | request stays `PENDING` | zeroize, abort, no upload |
| Final PIN try warning | — | second confirmation shown |
| Server returns a different `document_hash` than the previously displayed one | — | hash is pinned at display time; mismatch aborts |

### 12.4 Hardware-in-the-loop (HIL)

Rig with ePass2003, Watchdata ProxKey and SafeNet eToken (each with RSA-2048 and, where issued, ECDSA certs), Windows 10/11 and macOS 13+. Cases: normal sign; wrong PIN; `COUNT_LOW`/`FINAL_TRY` flags (use sacrificial tokens); hot-unplug during `C_Sign`; two tokens present; reader with PIN pad; very slow token; vendor-module version matrix. Verify the signature server-side against a real running backend each time. Record mechanism availability per model to update §6.1.

### 12.5 Fuzzing & security testing

* Fuzz (`cargo-fuzz`/libFuzzer) the JSON DTO parsers, base64 handling, canonical-message parser and DER conversion; property tests (`proptest`) that `build(parse(m)) == m`.
* Fuzz the PKCS#11 adapter with a mock Cryptoki module returning malformed lengths, wrong attribute sizes, and unexpected `CKR_*` codes.
* TLS pinning tests (wrong SPKI, expired cert, downgrade attempt, redirect to other host).
* Memory forensics test: scan a process dump taken immediately after signing for the sentinel PIN (must not be present).
* Update tests: tampered manifest, wrong key, rollback, truncated download.
* Independent penetration test and code review before the first production release (scope: signer, device-grant endpoints, `/signing/*`).

### 12.6 Accessibility tests

Axe-style audit of the webview parts, NVDA/JAWS/VoiceOver walkthroughs of the full ceremony, keyboard-only run, high-contrast and 200% scaling checks.

---

## 13. Server-side gaps / backlog the signer depends on

Everything below is **[NOT IMPLEMENTED]** (or only partially) as of this spec.

1. **Device Authorization Grant, scoped short-lived tokens, refresh rotation, DPoP, device registry/revocation** (§5). Today: OTP → 7-day HS256 JWT usable on every endpoint. **Blocker for production use of the signer.**
2. **Trust-anchor validation.** `validate_certificate` supports an optional `trusted_issuer`, loaded from the environment variable `DSC_TRUSTED_CA_PEM_PATH` (a *single* PEM file), and checks only `cert.verify_directly_issued_by(trusted_issuer)`: one direct issuer, no intermediates/path building, no policy OIDs (e.g. Class-3 policy, India CCA hierarchy: CCA India → licensed CA → subscriber). Without the env var set, **any self-signed certificate that passes basic checks can be registered** (that is what the tests use). Needed: configurable trust store of the CCA India root + licensed CA intermediates, full path validation, Class-3 policy OID check, name constraints, and an environment guard that makes the trust store mandatory when `DEBUG=false`.
3. **Revocation checking.** No CRL or OCSP check at registration or at sign time; revocation exists only as the platform's own `DSCCertStatus.REVOKED` flag set by the partner. Needed: OCSP/CRL checking at `/certificates` and `/complete` (with soft-fail policy and caching), plus alerting when a registered certificate nears `not_after` (expiry is checked only at registration and at each `/complete`).
4. **CMS/PKCS#7 portal artefact.** The platform verifies a raw signature over the `CAFOS-DSC-V1` message; that is *evidence of partner approval inside the platform*. It is **not** the signature accepted by GSTN/Income-Tax/MCA, which expect portal-specific signing (e.g. CMS/PKCS#7 detached signatures over portal-defined content, or a signing step performed inside the portal's own emSigner/DSC utility). Generating that artefact on the desktop is possible with the same token but the server-side contract (how the artefact is uploaded, verified, stored, attached to the filing step) is **not specified or implemented**. Define separately and do not conflate with G7 approval.
5. **Rate limiting & network controls.** No per-user/IP rate limits on `/signing/*` or `/auth/*`; no IP allow-listing; no lockout telemetry. Combined with the 3-attempt budget this is a DoS lever for anyone holding a partner JWT. Needed: rate limits (poll ≤ 1/2 s per device), anomaly alerts, optional firm-level IP/device allow-list.
6. **Multi-signer flows.** `SigningRequest` has exactly one `signer_id` and one signature. MCA forms (AOC-4, MGT-7, DPT-3, CHG-1) need **director DSC + practising CA/CS DSC** (matrix rows 38–46); GSTR-9C/3CA-3CB need CA DSC + UDIN (Gate G8). Needed: a request-set model (ordered or parallel signers, quorum), per-signer role/qualification (e.g. ICAI membership validation), and linkage with UDIN.
7. **Directory lookup** for rendering `requested_by` names to non-admins; an endpoint to list firm partners to populate the manager's signer picker.
8. **Push channel** (WebSocket/SSE) to replace polling; optional.
9. **Minimum supported version enforcement** (`426`) and signer version telemetry.
10. **Audit chain anchoring** (periodic RFC 3161 timestamp of the head hash or external publication) and an evidence export endpoint producing a Section 65B-style certificate for a signing event.
11. **Consistency/atomicity hardening** in `signing.py`: the success path performs `commit()` for the request state, then writes the audit block, then commits `audit_block_hash` — a crash between steps leaves a `SIGNED` request without an `audit_block_hash` (the chain entry may or may not exist). Move to a single transaction or an outbox with reconciliation.
12. **Token expiry config.** `Settings.ACCESS_TOKEN_EXPIRE_MINUTES` exists but is not used by the OTP login (hard-coded 7 days).
13. **Pending-request uniqueness** is enforced by a query, not a database constraint; concurrent creates could both succeed. Add a partial unique index on (`tenant_id`, `entity_type`, `entity_id`, `document_hash`) where `status='PENDING'`.

---

## 14. Acceptance criteria / definition of done

**Functional**

* [ ] Partner can enrol the device (device grant), register their DSC certificate, see it in `GET /certificates`.
* [ ] A request created by a MANAGER for a reviewed GST return appears on the signer within one polling interval; the signer validates the challenge (§4.5) and displays every item in §7.2.
* [ ] Completing the ceremony yields `status=SIGNED`, return `status=SIGNED`, `signing_partner_id` set, a valid audit chain (`chain_valid: true`), and the web G7 gate becomes approvable.
* [ ] Reject flow works with reason and is reflected server-side and in the web UI.
* [ ] RSA-2048 and ECDSA P-256/P-384 certificates sign correctly on ePass2003, Watchdata ProxKey and SafeNet eToken (HIL matrix §12.4).
* [ ] All negative scenarios in §12.3 behave as specified, and the signer never causes a server attempt to be consumed in the normal path (pre-upload self-check).

**Security**

* [ ] PIN never leaves the process: verified by network capture, process-dump scan, log grep, and code review of the `core::secret` / `core::pkcs11` boundary; PIN-in-RAM < 30 s enforced by watchdog.
* [ ] No listening sockets or URL handlers (verified by port scan and manifest review).
* [ ] Access tokens ≤ 15 min, device-bound, scoped; refresh tokens in the OS credential store only (§5; depends on §13.1).
* [ ] TLS pinning with backup pin; update signature verification with pinned keys, anti-rollback proven by tests.
* [ ] Installers signed (Authenticode / notarised); SBOM and provenance published; zero known high/critical dependency vulnerabilities at release.
* [ ] Independent penetration test with no unresolved high/critical findings.
* [ ] Server production posture verified: legacy `/firm-os/dsc/sign` returns 410; `DEBUG=false` requires a strong `SECRET_KEY` and `OTP_SANDBOX_MODE=false`; trust-anchor store configured (§13.2).

**Quality**

* [ ] ≥ 90% line coverage on `core::message`, `core::protocol`, `core::secret`; conformance suite green against the real backend in CI.
* [ ] WCAG 2.2 AA audit passed; screen-reader walkthrough documented.
* [ ] Operational runbook: token lockout recovery, certificate renewal, device revocation, key rotation for update signing, incident response for a suspected stolen JWT (revoke grants, list recent `DSC_SIGNED` blocks).

---

## 15. Open questions

1. **Exact vendor PKCS#11 paths/versions** for the three token families in the target firms' environments (and whether firms use proprietary middleware such as eMudhra emSigner/"DSC Manager" that must coexist). Needs pilot hardware.
2. **Is the signature over the `CAFOS-DSC-V1` message legally sufficient** as the partner's approval of the platform's internal record, or must the platform also retain the portal-valid CMS signature (§13.4) as the evidentiary artefact? Needs legal review (IT Act s.3/s.5, Evidence Act s.65B).
3. **Windows-first or cross-platform from v1?** Affects the stack choice (§9.1) and HIL scope.
4. **Hardware PIN-pad requirement:** mandate PIN-pad readers for partners above a threshold (e.g. high-value returns), or allow software PIN entry for all?
5. **Signing window:** is 300 s right for partners who must locate a token and review a large return? Consider a per-gate TTL or a two-phase "review window" + "PIN window" (the 30 s PIN-in-RAM limit applies to the latter only).
6. **Dual-signature ordering** for MCA (director first or CA first?) and whether the platform or the portal enforces it (§13.6).
7. **Managed-device assumptions:** can we require BitLocker/FileVault, OS patch level and endpoint protection via device-posture checks at device-grant time?
8. **RDP/VDI policy:** token redirection is common in CA offices; do we ban it outright (recommended) or allow with explicit firm-level risk acceptance?
9. **Attempt budget semantics:** should failures caused by a *certificate* problem (not a signature problem) consume the 3 attempts, given this makes accidental lockout easier? (Current server behaviour: yes.)
10. **Data residency/retention** of `signature_b64` and `signer_device` under DPDP Act 2023 and the firm's SQC-1 retention period.

---

## 16. Implementation status update (server side)

The following items from §13 are now **implemented** and covered by `backend/tests/test_signer_devices_and_revocation.py`. Where this section and an earlier "NOT IMPLEMENTED" label disagree, this section wins.

| Item | Status | Where |
|---|---|---|
| Device Authorization Grant (RFC 8628) | Implemented. Endpoints live under `/api/v1/signing/device/*` (not `/auth/device/*`): `POST /device/code`, `POST /device/token`, `POST /device/refresh`, `POST /device/approve` (Partner browser session). `user_code` = 8 chars from a vowel-free alphabet, shown `XXXX-XXXX`; only a SHA-256 of `device_code` is stored; TTL `DEVICE_CODE_TTL_SECONDS` (600 s); poll interval 5 s with `slow_down`; per-IP / per-user rate limits (per-process — add a gateway limit for a hard global cap). | `api/v1/signer_devices.py` |
| Scoped short-lived tokens | Implemented. Access token `scope=signer`, claim `did`, TTL `SIGNER_ACCESS_TOKEN_MINUTES` (15). Accepted **only** on `GET /signing/requests/pending`, `GET /signing/requests/{id}`, `POST /signing/requests/{id}/complete|reject`; every other route returns 403. The device row, user `is_active` and the user's **current** role are re-read on each request, so revoking a device, deactivating or demoting the partner takes effect immediately. | `api/deps.py` |
| Refresh rotation + reuse detection | Implemented. Each refresh issues a new opaque token (`SIGNER_REFRESH_DAYS`, 30); presenting an already-rotated token revokes the device and is sealed in the audit chain (`SIGNER_DEVICE_REVOKED_TOKEN_REUSE`). | `api/v1/signer_devices.py` |
| Device registry / revocation UI | Implemented: `GET /signing/devices`, `DELETE /signing/devices/{id}`; web page `/device` (approve a code, list, revoke). | `frontend/src/app/device/page.tsx` |
| Revocation (CRL) at registration and at `/complete` | Implemented. `DSC_REVOCATION_MODE` = `off` / `soft` (default: refuse revoked, allow *unknown* with a log line) / `strict` (refuse unknown). CRLs are believed only if signed by the configured trust anchor (`DSC_TRUSTED_CA_PEM_PATH`), not past `nextUpdate`; fetched with SSRF guards (http/https, public addresses only, 5 MB / 5 s limits) and cached `DSC_CRL_CACHE_SECONDS`. **Not implemented: OCSP, delta CRLs, multi-level path building.** Recommended rollout: `soft` → configure the CCA/CA trust anchor → `strict`. | `deterministic_core/dsc_revocation.py` |
| Atomic audit | Implemented. State change and its audit block commit in **one transaction** (`append_audit_block(..., commit=False)`); the firm row is locked (`FOR UPDATE` on PostgreSQL) so concurrent writers serialise, and `(firm_id, sequence)` is unique (migration 0004 skips the constraint, with a warning, if a legacy DB already holds duplicate pairs). Tested by forcing the audit write to fail: the request stays `PENDING`, the return stays `SIGNING_PENDING`, no signature is stored. | `deterministic_core/audit_chain.py`, `api/v1/signing.py` |

Still open: DPoP / key-bound tokens (§5.4), mandatory trust anchor when `DEBUG=false`, OCSP, CMS/PKCS#7 artefact generation, multi-signer flows, a hard global rate limit.
