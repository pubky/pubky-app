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

- **Build-intrinsic public values** (baked into the artifact by design): `NEXT_PUBLIC_DB_NAME`, `NEXT_PUBLIC_DB_VERSION`, `NEXT_PUBLIC_DEBUG_MODE`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS` (CSP `frame-ancestors` for `/session-bridge` is emitted from `next.config.ts` at build time).
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
const sessionBridgeOrigins = Env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS; // string[]
```

## Runtime configuration (`PUBKY_RUNTIME_*`)

All **environment-specific and deployer-facing public values** are configured at **runtime**, not build time, so a single Docker image can be promoted across staging / prod / testnet — and deployed by third parties against their own infrastructure — without rebuilding. See [ADR 0017](adr/0017-runtime-config-injection.md) and [ADR 0018](adr/0018-runtime-sentry-and-decoupled-source-maps.md).

The contract has three tiers:

- **Required (9 network values)**: `nexusUrl`, `cdnUrl`, `homeserver`, `homeserverUrl`, `homegateUrl`, `defaultHttpRelay`, `pkarrRelays`, `testnet`, `deployEnv`. (`deployEnv` — `PUBKY_RUNTIME_ENV`, `"production"` or `"staging"` — is the deploy's declared identity; it drives the staging homeserver sign-in guard (`isStagingHomeserverDeploy` in `@/config/network`), which is declared explicitly instead of inferred from network values so config drift can never silently disable it.) (`homeserverUrl` is the homeserver's HTTP base URL, used for invite-code verification — the homeserver pubkey has no resolvable HTTPS endpoint, see [pubky-core#410](https://github.com/pubky/pubky-core/issues/410).)
- **Optional (5 Sentry values)**: `sentryDsn` (absent/empty disables Sentry entirely), `sentryEnvironment` (absent falls back to `NODE_ENV`), `sentryTracesSampleRate` / `sentryReplaysSessionSampleRate` / `sentryReplaysOnErrorSampleRate` (defaults `0.1` / `0.0` / `1.0`). A malformed value (bad DSN URL, rate outside `[0,1]`) fails loudly.
- **Optional moderation identity**: `moderationId` must be a raw 52-character z-base-32 Pubky when set. In deployed environments, leaving it unset disables moderation-tag matching and the one-time default follow.
- **Optional/defaulted public values**: operational polling and TTL settings, moderated tags, exchange-rate API, Prelude, Plausible, metadata/branding defaults, and external links. Missing values use the defaults in `src/libs/runtime-config/runtime-config.schema.ts`; malformed provided values still fail loudly.

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

`PUBKY_RUNTIME_*` are public (URLs, the homeserver public key, relay lists, the Sentry DSN) — they are exposed to the browser by design. They are **not secrets**; deployment tooling should not treat them as sensitive.

### Running the public image (`docker run`)

Copy-paste starting point for any deployer — nine required values plus the optional Sentry tier:

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
  pubky-app
```

Omit the `PUBKY_RUNTIME_SENTRY_*` lines to run without Sentry. Other public runtime values are optional/defaulted; set them only when you need to tune polling/TTL behavior, branding/metadata, analytics, moderation, Prelude, exchange rates, or external links. Note for Sentry users: the image ships without browser source maps (Debug IDs only) — see the source-maps section of [docs/sentry.md](sentry.md).

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

## Session bridge allowlist

See [ADR 0020](adr/0020-session-bridge.md).

`NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS` is a comma-separated list consumed by both the `/session-bridge` page (postMessage origin checks) and `next.config.ts` (`Content-Security-Policy: frame-ancestors` for that route only). Parsing lives in `src/libs/session-bridge/allowlist.ts` so those two readers stay aligned.

Default when the variable is unset, empty, or whitespace-only:

- Production (`NODE_ENV=production`): `https://vibes.pubky.app`, `https://*.vibes.pubky.app`, `https://shop.pubky.app`
- Non-production: the production entries plus `https://vibes.staging.pubky.app`, `https://*.vibes.staging.pubky.app`, and `http://localhost:3000`

First-party team-operated hosts (for example `https://shop.pubky.app`) are added to the default by exact origin via PR, never by a `*.pubky.app` wildcard.

Staging deployments of pubky.app run with `NODE_ENV=production` builds, so they must set `NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS` explicitly to the staging board origins (`https://vibes.staging.pubky.app`, `https://*.vibes.staging.pubky.app`, and any other hosts that embedding should allow). The non-production default is only for local/test `NODE_ENV`.

Loopback in production requires an explicit env value. Invalid entries (`*`, paths, wildcard+port, wildcard+userinfo, non-loopback `http`) fail the build in both Zod (`src/libs/env/env.ts`) and `next.config.ts` `headers()`.

Wildcards match exactly one DNS label (`https://foo.vibes.pubky.app`, not nested hosts or the apex). `http://` is rejected except loopback origins (`localhost`, `127.0.0.1`, `[::1]`) that appear explicitly in the list.

`/session-bridge` is a second App Router root layout (`src/app/(bridge)/`) so it does not mount the main app providers, fonts, or analytics. The rest of the app lives under `src/app/(main)/`. There is no global `X-Frame-Options` or `frame-ancestors`; only this route sets CSP framing.
