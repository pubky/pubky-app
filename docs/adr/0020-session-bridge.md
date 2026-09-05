# ADR 0020: Session Bridge for Approved Vibes

## Status

Proposed — 2026-09-04

> **Note**: Update status when the decision changes. Include the date of status change.
>
> - **Proposed**: Under discussion, not yet implemented
> - **Accepted**: Approved and being/has been implemented
> - **Deprecated**: No longer recommended, but still in use (include deprecation date)
> - **Superseded**: Replaced by another ADR (link to replacement ADR)

## Context

A Pubky web session is a cookie the homeserver sets on its own host (`HttpOnly`, `Secure`, `SameSite=None`). The browser attaches that cookie to homeserver requests. pubky-app does not store the secret. It persists only `sessionExport` — `session.export()`, a base64 encoding of public `SessionInfo` (pubky + capabilities) — in the Zustand auth store under localStorage key `auth-store`. `restoreSession(sessionExport)` re-validates with the homeserver using the cookie the browser already holds.

The vibes board (`vibes.pubky.app`) and approved vibes served from `<id>.vibes.pubky.app` are same-site with the homeserver (`pubky.app`), so the cookie is already present. They need the public `sessionExport` to construct a session handle without asking the user to sign in again. First-party team-operated hosts on `pubky.app` (currently the Marketplace at `https://shop.pubky.app`) are the same class of same-site consumer.

Those hostnames are not self-service. Each approved vibe receives an explicit DNS record granted by us. There is no wildcard DNS and no user-generated `*.pubky.app` name. A vibe without that record is an ordinary off-site app with its own sign-in. First-party team-operated hosts are added to the default allowlist by exact origin via PR, never by a `*.pubky.app` wildcard.

Internal design write-up (title only): **Vibes: one sign-in across the board and every vibe**.

## Decision

pubky-app exposes a minimal App Router route at `/session-bridge`, isolated in its own root layout so it does not boot Dexie, coordinators, fonts, analytics, or store hydration. When embedded in an iframe, it reads `sessionExport` from the persisted auth store entry and answers `postMessage` from allowlisted origins.

### Message contract

- Consumer → bridge: `{ type: 'pubky-session-request', v: 1 }`
- Bridge → consumer, signed in: `{ type: 'pubky-session', v: 1, sessionExport: string }`
- Bridge → consumer, signed out: `{ type: 'pubky-session-none', v: 1 }`

The bridge replies only to `event.origin` values in the allowlist, and only via `event.source.postMessage(reply, event.origin)` (never `'*'`). Messages from non-allowlisted origins, from `event.source === null`, or with any other `type`/`v` are ignored with no reply and no payload logging.

If the page is not in an iframe (`window.top === window.self`), it only shows a short human-readable sentence.

While embedded, after a valid request, the bridge remembers the most recent `event.source` + `event.origin` pair and, on `storage` events for `auth-store`, pushes an unsolicited `pubky-session` or `pubky-session-none` to that pair only.

### Security invariants

- Reply only to allowlisted `event.origin` via `event.source`.
- `sessionExport` is public metadata; a forged export fails `restoreSession`.
- The HttpOnly homeserver cookie is never read or exposed by this page.
- `Content-Security-Policy: frame-ancestors` for `/session-bridge` is built from the same env allowlist (`NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS`). Also `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`. No global `X-Frame-Options` or `frame-ancestors` exists on other routes; this header set does not weaken them.

Allowlist entries are exact `https` origins or single-label wildcards (`https://*.vibes.pubky.app`). Matching uses `new URL()`, not a regex built from the entry. `http://` is rejected except loopback (`localhost`, `127.0.0.1`, `[::1]`) when those origins are listed explicitly.

This asymmetry is intentional and must not be "fixed" later: CSP `frame-ancestors` wildcards are multi-label (`*.vibes.pubky.app` may allow `a.b.vibes.pubky.app` to frame the page), while `isAllowedBridgeOrigin` is the authoritative single-label gate for data. Deep subdomains can load an inert frame but never receive `sessionExport`.

The default allowlist when `NODE_ENV=production` is `https://vibes.pubky.app`, `https://*.vibes.pubky.app`, and first-party team-operated hosts listed by exact origin (currently `https://shop.pubky.app`). First-party team-operated hosts are added to the default by exact origin via PR, never by a `*.pubky.app` wildcard. Staging board hosts (`https://vibes.staging.pubky.app`, `https://*.vibes.staging.pubky.app`) and `http://localhost:3000` are appended only outside production. Staging deployments of pubky.app use `NODE_ENV=production` builds, so they must set `NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS` explicitly to the staging board origins. Production loopback also requires an explicit env opt-in. Entries are validated at build; invalid values fail both Env parsing and `next.config.ts` `headers()`.

## Consequences

### Positive ✅

- A user already signed into pubky-app can be signed into the board and approved same-site vibes without a second grant flow.
- Cookie isolation stays with the browser; the bridge never handles session secrets.
- One allowlist drives both postMessage checks and CSP `frame-ancestors`.

### Negative ❌

- XSS on any allowlisted vibe can drive the shared session (authenticated homeserver calls), though it cannot read the HttpOnly cookie.
- Every approved `*.vibes.pubky.app` vibe can learn a visitor's pubky and capabilities silently on visit. This is bounded by per-vibe approval plus explicit DNS records (no wildcard DNS, no self-service hostnames).
- Framing and origin policy must be redeployed (build-time env) when the allowlist changes.

### Neutral ⚠️

- Staging board hostname is assumed to be `vibes.staging.pubky.app` to match other `*.staging.pubky.app` defaults; confirm with DevOps if the live staging board differs. Staging pubky.app deployments must set `NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS` explicitly because they are production builds.
- Off-site vibes remain on per-app sign-in until a bearer/JWT homeserver session exists.

## Alternatives Considered

### Alternative 1: Per-vibe pubkyauth (Ring grant)

**Description**: Each vibe runs its own pubkyauth grant, the same path third-party apps already use.

**Pros**:

- Correct least-privilege per app
- No hostname lending

**Cons**:

- Users will not complete a grant per vibe
- Does not fix Safari third-party cookie blocking for off-site hosts

**Why not chosen**: The board and internally approved vibes need silent reuse of an existing web session, not a new grant ceremony.

### Alternative 2: Browser extension

**Description**: An extension injects or shares session state across origins.

**Pros**:

- Works for arbitrary vibe hosts

**Cons**:

- Almost nobody installs it
- Does not help Safari/iOS users who cannot complete off-site web sign-in

**Why not chosen**: Adoption is too low to be the product path.

### Alternative 3: Bearer / JWT sessions on the homeserver

**Description**: Homeserver issues scoped bearer tokens (grants, PoP) so an app can authenticate without the cookie.

**Pros**:

- Fixes Safari for off-domain vibes
- Matches longer-term key-delegation design

**Cons**:

- Homeserver + SDK work; not a short-timeline item

**Why not chosen**: Deferred as a later option for external vibes. The bridge does not replace it.

## Implementation Notes

- Route: `src/app/(bridge)/session-bridge/`
- Pure lib: `src/libs/session-bridge/` (concrete files only; no aggregate `index.ts`)
- Env: `NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS` in `src/libs/env/env.ts` for the main app; the isolated bridge client reads the same var through `read-allowlist.ts` so it does not import the Env singleton
- Headers: `next.config.ts` `headers()` for `/session-bridge` only (same `parseSessionBridgeAllowlist` as Env)
- The bridge layout installs an inline `message` listener before React hydrates. It only queues events; `SessionBridgeClient` hands the queue to `createSessionBridgeHandler` (one handler, one storage subscriber, one reply per request). If that inline script is absent, requests that arrive before `useLayoutEffect` are dropped.
- Auth store persisted shape is not changed; this feature is read-only on `auth-store`

## Related Decisions

- Depends on: local persisted auth session export (Zustand persist in the auth store)
- Does not change: layering rules in [ADR-0004](./0004-layering-and-dependency-rules.md)

## References

- Internal design write-up: **Vibes: one sign-in across the board and every vibe**
- [Environment variables](../environment.md)

---

See [ADR Guidelines](../adr-guidelines.md) for when and how to write ADRs.
