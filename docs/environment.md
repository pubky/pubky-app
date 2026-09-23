# Environment Variables

Configuration is split into two surfaces with different lifetimes:

- **Build-time (`src/libs/env/env.ts`)**: build-intrinsic public values and server-only variables, validated with Zod at module load.
- **Runtime (`src/libs/runtime-config/`)**: everything environment-specific or deployer-facing, read from `PUBKY_RUNTIME_*` env vars at request time so a single Docker image works everywhere.

## Build-time environment (`Env`)

All build-time variables are validated in `src/libs/env/env.ts` using Zod schemas. This provides:

- **Type safety**: All env vars are properly typed
- **Validation**: Invalid values cause startup errors
- **Defaults**: Sensible defaults where applicable
- **Documentation**: Clear indication of what each variable does

The schema is intentionally small:

- **Build-intrinsic public values** (baked into the artifact by design): `NEXT_PUBLIC_DB_NAME`, `NEXT_PUBLIC_DB_VERSION`, `NEXT_PUBLIC_DEBUG_MODE`, `NEXT_PUBLIC_APP_VERSION`.
- **Server-only variables** (never exposed to the browser): `HOMESERVER_ADMIN_URL` / `HOMESERVER_ADMIN_PASSWORD` (dev/test signup tokens) and the Chatwoot support credentials (`BASE_URL_SUPPORT`, `SUPPORT_API_ACCESS_TOKEN`, `SUPPORT_ACCOUNT_ID`).
- `NODE_ENV` / `VITEST`.

### Adding or Modifying Variables

First decide which surface the value belongs to:

- **Environment-specific or deployer-facing (public)** → it is runtime config. Add it to `src/libs/runtime-config/runtime-config.schema.ts` (schema + default + `PUBKY_RUNTIME_*` name) and expose a lazy getter from `src/libs/runtime-config/runtime-config.ts`. Do NOT add a `NEXT_PUBLIC_*` name for it.
- **Build-intrinsic or server-only** → it belongs in `env.ts`. You MUST update **two places**:

#### 1. Add to `envSchema`

```typescript
const envSchema = z.object({
  // ... existing variables ...
  MY_SERVER_ONLY_VAR: z.string().min(1).optional(),
});
```

#### 2. Add to `parseEnv()`

```typescript
function parseEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse({
    // ... existing variables ...
    MY_SERVER_ONLY_VAR: process.env.MY_SERVER_ONLY_VAR,
  });
}
```

#### Checklist

- [ ] Added to `envSchema` with Zod validation
- [ ] Added to `parseEnv()` safeParse object
- [ ] Added to `.env.example` with documentation
- [ ] Added to `.env` (local development)
- [ ] Added tests if the variable has special parsing logic

### Usage

Import the validated environment instead of using `process.env` directly:

```typescript
import { Env } from '@/libs/env/env';

const dbVersion = Env.NEXT_PUBLIC_DB_VERSION; // number
const debugMode = Env.NEXT_PUBLIC_DEBUG_MODE; // boolean
```

## Runtime configuration (`PUBKY_RUNTIME_*`)

All **environment-specific and deployer-facing public values** are configured at **runtime**, not build time, so a single Docker image can be promoted across staging / prod / testnet — and deployed by third parties against their own infrastructure — without rebuilding. See [ADR 0017](adr/0017-runtime-config-injection.md) and [ADR 0018](adr/0018-runtime-sentry-and-decoupled-source-maps.md).

The contract has these tiers:

- **Required (9 network values)**: `nexusUrl`, `cdnUrl`, `homeserver`, `homeserverUrl`, `homegateUrl`, `defaultHttpRelay`, `pkarrRelays`, `testnet`, `deployEnv`. (`deployEnv` — `PUBKY_RUNTIME_ENV`, `"production"` or `"staging"` — is the deploy's declared identity; it drives the staging homeserver sign-in guard (`isStagingHomeserverDeploy` in `@/config/network`), which is declared explicitly instead of inferred from network values so config drift can never silently disable it.) (`homeserverUrl` is the homeserver's HTTP base URL, used for invite-code verification — the homeserver pubkey has no resolvable HTTPS endpoint, see [pubky-core#410](https://github.com/pubky/pubky-core/issues/410).)
- **Optional (5 Sentry values)**: `sentryDsn` (absent/empty disables Sentry entirely), `sentryEnvironment` (absent falls back to `NODE_ENV`), `sentryTracesSampleRate` / `sentryReplaysSessionSampleRate` / `sentryReplaysOnErrorSampleRate` (defaults `0.1` / `0.0` / `1.0`). A malformed value (bad DSN URL, rate outside `[0,1]`) fails loudly.
- **Optional (2 Pulse values)**: `pulseClientKey` (absent/empty disables Pulse entirely; a provided value must start with `pulse_client_`) and `pulseEndpoint` (absent uses the SDK's hosted ingest host). See the Pulse paragraph below.
- **Optional moderation identity**: `moderationId` must be a raw 52-character z-base-32 Pubky when set. In deployed environments, leaving it unset disables moderation-tag matching and the one-time default follow.
- **Optional/defaulted public values**: operational polling and TTL settings, moderated tags, exchange-rate API, Prelude, Plausible, metadata/branding defaults, and external links. Missing values use the defaults in `src/libs/runtime-config/runtime-config.schema.ts`; malformed provided values still fail loudly.
- **Optional Pubky Passport origin**: `passportUrl` (`PUBKY_RUNTIME_PASSPORT_URL`) is the Passport signer used by every "Continue with Google" entry point (landing hero, `/sign-in`, `/onboarding/join`). In deployed mode it has **no default**: unset disables the feature, so production stays off until a real Google sign-up and sign-in have been verified against the intended Passport + Homegate deployment. Local dev defaults to `https://passport.staging.pubky.app`; an explicit blank value disables it. Passport only accepts HTTPS callbacks, so the buttons are shown only when the page itself is served over HTTPS (`isPassportConfigured()` in `@/config/network` is the pure server-safe check; `usePassportEligibility` resolves the browser-side HTTPS check after mount). Plain `npm run dev` (HTTP) hides the buttons, redirects `/onboarding/join` to `/onboarding/human`, and logs a one-time warning; use `npm run dev:https` to exercise Passport locally. Passport's fallback callback is the static `public/passport/return.html` (path in `src/config/passport.ts`), not a Next route: a route under the root layout would boot the session restore inside the popup (same rule as the offline page, see `docs/pwa.md`).

Pulse browser telemetry is opt-in: set the public, write-only `PUBKY_RUNTIME_PULSE_CLIENT_KEY`
(`pulse_client_…`, never an admin key); omit it for zero Pulse tracking. `PUBKY_RUNTIME_PULSE_ENDPOINT`
optionally overrides the SDK's hosted ingest host (`https://ingest.pubkypulse.com`); that fallback is silent,
so a deployer running their own Pulse must set it or their users' events go to Pubky's host.
Pulse collects anonymous sessions, route templates, the
browser and operating-system versions the SDK parses from the user agent, and errors scrubbed by the same
redaction/drop policy as Sentry; never the browser language (`deviceInfo.language` is off), bodies, replay, raw error context, request timings or identified users. Network failures arrive as application errors through that same
policy — the SDK's fetch-level network tracking is off, because its events bypass the drop rules.

With a client key configured, an analytics banner asks each browser for consent before Pulse
initializes or stores an identifier. Accept/decline is stored separately as `pubky-pulse-consent-v1`,
and accepting also stores the acceptance time as `pubky-pulse-consent-v1-granted-at`, which each tab
mirrors in a `sessionStorage` marker naming the consent its own Pulse state started under. Neither is
an identifier and neither is sent; they only let a tab that was suspended or away during a withdrawal
notice it on its next run and clean up then. A withdrawal deletes the browser-wide state, so accepting
again starts a new anonymous browser in every tab; the stale tab deletes its own client and session
alone, because the anonymous ID and queued events it finds now belong to the current consent and other
tabs are still using them. One limit sits in the SDK: it cannot tell whose events are in the shared
queue, and replayed events are not filtered again. So an event a suspended tab re-queues after another
tab's withdrawal already ran (a failed retry, or an unload) can still be sent by whichever tab flushes
next. Users can withdraw in **Settings → Privacy and Safety** or the **Pulse analytics** button (also
available to guests). Withdrawal stops collection without flushing and deletes the anonymous ID,
session and any queued events from this browser; it does not delete data the server already received.
Without a key — or on a testnet deploy (`PUBKY_RUNTIME_TESTNET=true`), which disables Pulse exactly as it
disables Sentry — neither the banner nor analytics controls appear, and nothing is collected.
Only consented visits are measured, so analytics are a partial, self-selected view of usage.
This consent covers Pulse only, which is why the banner scopes its promise to Pubky Pulse rather than to
analytics in general: the optional Plausible script (`PUBKY_RUNTIME_PLAUSIBLE_DOMAIN` /
`PUBKY_RUNTIME_PLAUSIBLE_SCRIPT_URL`) is cookieless, stores no identifier, and is configured and served
independently of it.

### Why a separate mechanism

Next.js inlines every literal `process.env.NEXT_PUBLIC_*` reference at **build time** (even in server code). A value baked into the image cannot change per environment. To make these values runtime-configurable we read **non-`NEXT_PUBLIC_` env names** (`PUBKY_RUNTIME_*`) on the server at request time and inject them into the HTML.

### How it works

- The server reads `PUBKY_RUNTIME_*` at boot (fail-fast in `src/instrumentation.ts`) and at request time, validates them, and memoizes the result (`src/libs/runtime-config/runtime-config.ts`).
- The validated config is serialized into a **raw inline `<script>`** (`window.__PUBKY_CONFIG__`) rendered first in `<body>` by `ContainerRoot`, so it executes during HTML parsing — before any app bundle (including `instrumentation-client.ts`) evaluates. It must stay a raw `<script>` element: App Router's `next/script` defers inline `beforeInteractive` content until after the main bundle's module scope runs.
- App code reads values through lazy getters from `@/libs/runtime-config/runtime-config`, usually re-exported through concrete config modules such as `@/config/nexus`, `@/config/network`, `@/config/sync`, `@/config/moderation`, `@/config/metadata`, and `@/config/externalLinks`.
- Schema, tiers, and defaults live in `src/libs/runtime-config/runtime-config.schema.ts`.

```typescript
import { getNexusUrl } from '@/config/nexus';
import { getHomeserver, getTestnet } from '@/config/network';

const url = getNexusUrl(); // resolved at call time
```

> Do NOT read `process.env.PUBKY_RUNTIME_*` directly, and do NOT invent new `NEXT_PUBLIC_*` names for runtime-configurable values — ESLint rules block both. Use the getters.

### Strict (deployed) vs lenient (dev/test)

- **Deployed (`NODE_ENV=production`, including staging), or `PUBKY_RUNTIME_CONFIG_REQUIRED=true`**: the nine required network `PUBKY_RUNTIME_*` values must ALL be set. Missing/invalid config throws **at boot** (no silent fallback to staging defaults).
- **Local dev / tests**: the SAME `PUBKY_RUNTIME_*` names are read leniently — unset values resolve to the staging defaults in `runtime-config.schema.ts` (including `deployEnv: staging`, so the staging sign-in guard is active in plain local dev; set `PUBKY_RUNTIME_ENV=production` in `.env.local` to turn it off), including the staging moderation identity. Partial overrides (e.g. only `PUBKY_RUNTIME_NEXUS_URL=http://localhost:8080` in `.env.local`) layer over those defaults.
- **Optional/defaulted tiers**: `PUBKY_RUNTIME_SENTRY_*` and the other deployer-facing public values can be set independently in any mode; malformed provided values fail loudly.

`PUBKY_RUNTIME_MODERATION_ID` is intentionally different from the other app defaults in deployed mode: unset resolves to `undefined`, while a configured value must be a valid Pubky. This prevents a missing production setting from silently targeting the staging moderation account. Deployed startup emits a warning when it is unset so operators can distinguish an intentional disabled state from missing configuration.

> Running a production build locally (`npm run build && npm run start`) runs as `NODE_ENV=production`, so it **requires** all nine network `PUBKY_RUNTIME_*` values. `npm run dev` does not — unset values use staging defaults. See the `PUBKY_RUNTIME_*` block in `.env.example`.

### These are PUBLIC values

`PUBKY_RUNTIME_*` are public (URLs, the homeserver public key, relay lists, the Sentry DSN, the write-only Pulse client key) — they are exposed to the browser by design. They are **not secrets**; deployment tooling should not treat them as sensitive.

### Running the public image (`docker run`)

Copy-paste starting point for any deployer — nine required values plus the optional Sentry and Pulse tiers:

```bash
docker run -p 3000:3000 \
  -e PUBKY_RUNTIME_NEXUS_URL=https://nexus.example.com \
  -e PUBKY_RUNTIME_CDN_URL=https://nexus.example.com/static \
  -e PUBKY_RUNTIME_HOMESERVER=<homeserver-pubkey> \
  -e PUBKY_RUNTIME_HOMESERVER_URL=https://homeserver.example.com \
  -e PUBKY_RUNTIME_HOMEGATE_URL=https://homegate.example.com \
  -e PUBKY_RUNTIME_DEFAULT_HTTP_RELAY=https://httprelay.example.com/inbox \
  -e PUBKY_RUNTIME_PKARR_RELAYS='["https://pkarr.example.com"]' \
  -e PUBKY_RUNTIME_TESTNET=false \
  -e PUBKY_RUNTIME_ENV=production \
  -e PUBKY_RUNTIME_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project> \
  -e PUBKY_RUNTIME_SENTRY_ENVIRONMENT=production \
  -e PUBKY_RUNTIME_PULSE_CLIENT_KEY=pulse_client_<your-client-key> \
  -e PUBKY_RUNTIME_PULSE_ENDPOINT=https://ingest.example.com \
  pubky-app
```

Omit the `PUBKY_RUNTIME_SENTRY_*` lines to run without Sentry, and the `PUBKY_RUNTIME_PULSE_*` lines to run without Pulse (no consent banner, no analytics controls). Set both Pulse values together: a client key with no endpoint sends to Pubky's hosted ingest host. Other public runtime values are optional/defaulted; set them only when you need to tune polling/TTL behavior, branding/metadata, analytics, moderation, Prelude, exchange rates, or external links. Note for Sentry users: the image ships without browser source maps (Debug IDs only) — see the source-maps section of [docs/sentry.md](sentry.md).

### Homeserver mute list sync

Cross-session mute alignment uses the `@synonymdev/pubky` homeserver **event stream** (SSE). Debouncing uses a fixed delay in [`src/config/mute-sync.ts`](src/config/mute-sync.ts) (`MUTE_SYNC_DEBOUNCE_MS`), not an environment variable.

## Setting Variables

1. **Development**: Create a `.env.local` file in the project root (both `Env` and `PUBKY_RUNTIME_*` values are honored)
2. **Production**: Set environment variables in your deployment platform
3. **Testing**: Variables are set in `src/config/test.ts`

## Validation Errors

If build-time environment validation fails, you'll see detailed error messages:

```
❌ Environment validation failed:
  - NEXT_PUBLIC_DB_VERSION: Expected number, received string
```

If deployed runtime config is missing or invalid, the server exits at boot with the full list of required `PUBKY_RUNTIME_*` network variables.
