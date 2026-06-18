# Environment Variables

This project uses Zod for environment variable validation to ensure type safety and provide sensible defaults.

## Configuration

All environment variables are validated in `src/libs/env/env.ts` using Zod schemas. This provides:

- **Type safety**: All env vars are properly typed
- **Validation**: Invalid values cause startup errors
- **Defaults**: Sensible defaults for all variables
- **Documentation**: Clear indication of what each variable does

## Adding or Modifying Variables

You MUST update **two places** in `src/libs/env/env.ts`:

### 1. Add to `envSchema`

```typescript
const envSchema = z.object({
  // ... existing variables ...
  NEXT_PUBLIC_MY_NEW_VAR: z.string().url().default('https://example.com'),
});
```

### 2. Add to `parseEnv()`

```typescript
function parseEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse({
    // ... existing variables ...
    NEXT_PUBLIC_MY_NEW_VAR: process.env.NEXT_PUBLIC_MY_NEW_VAR,
  });
}
```

### Checklist

- [ ] Added to `envSchema` with Zod validation
- [ ] Added to `parseEnv()` safeParse object
- [ ] Added to `.env.example` with documentation
- [ ] Added to `.env` (local development)
- [ ] Added tests if the variable has special parsing logic

## Usage

Import the validated environment instead of using `process.env` directly:

```typescript
import { Env } from '@/libs/env/env';

const dbVersion = Env.NEXT_PUBLIC_DB_VERSION; // number
const debugMode = Env.NEXT_PUBLIC_DEBUG_MODE; // boolean
const nexusUrl = Env.NEXT_PUBLIC_NEXUS_URL; // string (validated URL)
const cdnUrl = Env.NEXT_PUBLIC_CDN_URL; // string (validated URL)
```

## Runtime configuration (`PUBKY_RUNTIME_*`)

A set of **environment-specific and deployer-facing public values** are configured at **runtime**, not build time, so a single Docker image can be promoted across staging / prod / testnet — and deployed by third parties against their own infrastructure — without rebuilding. See [ADR 0017](adr/0017-runtime-config-injection.md) and [ADR 0018](adr/0018-runtime-sentry-and-decoupled-source-maps.md).

The contract has three tiers:

- **Required (8 network values)**: `nexusUrl`, `cdnUrl`, `homeserver`, `homeserverUrl`, `homegateUrl`, `defaultHttpRelay`, `pkarrRelays`, `testnet`. (`homeserverUrl` is the homeserver's HTTP base URL, used for invite-code verification — the homeserver pubkey has no resolvable HTTPS endpoint, see [pubky-core#410](https://github.com/pubky/pubky-core/issues/410).)
- **Optional (5 Sentry values)**: `sentryDsn` (absent/empty disables Sentry entirely), `sentryEnvironment` (absent falls back to `NODE_ENV`), `sentryTracesSampleRate` / `sentryReplaysSessionSampleRate` / `sentryReplaysOnErrorSampleRate` (defaults `0.1` / `0.0` / `1.0`). Optional values never trigger the all-or-nothing rule below, but a malformed value (bad DSN URL, rate outside `[0,1]`) still fails loudly.
- **Optional/defaulted public values**: operational polling and TTL settings, moderation config, exchange-rate API, Prelude, Plausible, metadata/branding defaults, and external links. Missing values use the defaults in `src/libs/runtime-config/runtime-config.schema.ts`; malformed provided values still fail loudly.

### Why a separate mechanism

Next.js inlines every literal `process.env.NEXT_PUBLIC_*` reference at **build time** (even in server code). A value baked into the image cannot change per environment. To make these values runtime-configurable we read **non-`NEXT_PUBLIC_` env names** (`PUBKY_RUNTIME_*`) on the server at request time and inject them into the HTML.

### How it works

- The server reads `PUBKY_RUNTIME_*` at boot (fail-fast in `src/instrumentation.ts`) and at request time, validates them, and memoizes the result (`src/libs/runtime-config/runtime-config.ts`).
- The validated config is serialized into an inline `<script>` (`window.__PUBKY_CONFIG__`) in the dynamic root layout, available synchronously before any app code runs.
- App code reads values through lazy getters from `@/libs/runtime-config/runtime-config`, usually re-exported through concrete config modules such as `@/config/nexus`, `@/config/network`, `@/config/sync`, `@/config/moderation`, `@/config/metadata`, and `@/config/externalLinks`.
- Schema, tiers, and defaults live in `src/libs/runtime-config/runtime-config.schema.ts` (shared with `env.ts` so validation cannot drift).

```typescript
import { getNexusUrl } from '@/config/nexus';
import { getHomeserver, getTestnet } from '@/config/network';

const url = getNexusUrl(); // resolved at call time
```

> Do NOT read these values from `Env.NEXT_PUBLIC_*` or `process.env.NEXT_PUBLIC_*` directly — an ESLint rule blocks it. Use the getters.

### Required vs fallback (fail loud)

- **Deployed (`NODE_ENV=production`, including staging), or `PUBKY_RUNTIME_CONFIG_REQUIRED=true`**: the eight required network `PUBKY_RUNTIME_*` values must all be set. Missing/invalid config throws **at boot** (no silent fallback to staging). If any one required network value is set, all required network values must be set (catches partial deploy config).
- **Optional/defaulted tiers**: `PUBKY_RUNTIME_SENTRY_*` and the other deployer-facing public `PUBKY_RUNTIME_*` values can be set independently. They never trigger the all-or-nothing network rule, but malformed provided values fail loudly.
- **Local dev / tests**: falls back to the `NEXT_PUBLIC_*` defaults (honoring `.env.local` and `src/config/test.ts`). This includes `NEXT_PUBLIC_SENTRY_*` and the local fallback names for operational, metadata, analytics, moderation, Prelude, and external-link values.

> Running a production build locally (`npm run build && npm run start`) runs as `NODE_ENV=production`, so it **requires** all eight required `PUBKY_RUNTIME_*` to be set (a partial set throws). `npm run dev` does not — it uses the `NEXT_PUBLIC_*` fallback. See the `PUBKY_RUNTIME_*` block in `.env.example`.

> Contract shift: staging runs `NODE_ENV=production`, so staging must now set `PUBKY_RUNTIME_*`. The `NEXT_PUBLIC_*` network values are now **local dev/test defaults only** — no deployed environment may rely on them.

### These are PUBLIC values

`PUBKY_RUNTIME_*` are public (URLs, the homeserver public key, relay lists, the Sentry DSN) — they are exposed to the browser by design. They are **not secrets**; deployment tooling should not treat them as sensitive.

### Running the public image (`docker run`)

Copy-paste starting point for any deployer — eight required values plus the optional Sentry tier:

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
  -e PUBKY_RUNTIME_SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project> \
  -e PUBKY_RUNTIME_SENTRY_ENVIRONMENT=production \
  pubky-app
```

Omit the `PUBKY_RUNTIME_SENTRY_*` lines to run without Sentry. Other public runtime values are optional/defaulted; set them only when you need to tune polling/TTL behavior, branding/metadata, analytics, moderation, Prelude, exchange rates, or external links. Note for Sentry users: the image ships without browser source maps (Debug IDs only) — see the source-maps section of [docs/sentry.md](sentry.md).

### Homeserver mute list sync

Cross-session mute alignment uses the `@synonymdev/pubky` homeserver **event stream** (SSE). Debouncing uses a fixed delay in [`src/config/mute-sync.ts`](src/config/mute-sync.ts) (`MUTE_SYNC_DEBOUNCE_MS`), not an environment variable.

## Setting Variables

1. **Development**: Create a `.env.local` file in the project root
2. **Production**: Set environment variables in your deployment platform
3. **Testing**: Variables are set in `src/config/test.ts`

## Validation Errors

If environment validation fails, you'll see detailed error messages:

```
❌ Environment validation failed:
  - NEXT_PUBLIC_DB_VERSION: Expected number, received string
  - NEXT_PUBLIC_NEXUS_URL: Invalid url
```
