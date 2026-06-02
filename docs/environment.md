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

A small set of **environment-specific network values** are configured at **runtime**, not build time, so a single Docker image can be promoted across staging / prod / testnet without rebuilding. See [ADR 0017](adr/0017-runtime-config-injection.md).

Runtime-configurable values: `nexusUrl`, `cdnUrl`, `homeserver`, `homegateUrl`, `defaultHttpRelay`, `pkarrRelays`, `testnet`.

### Why a separate mechanism

Next.js inlines every literal `process.env.NEXT_PUBLIC_*` reference at **build time** (even in server code). A value baked into the image cannot change per environment. To make these values runtime-configurable we read **non-`NEXT_PUBLIC_` env names** (`PUBKY_RUNTIME_*`) on the server at request time and inject them into the HTML.

### How it works

- The server reads `PUBKY_RUNTIME_*` at request time, validates them, and memoizes the result (`src/libs/runtime-config/runtime-config.ts`).
- The validated config is serialized into an inline `<script>` (`window.__PUBKY_CONFIG__`) in the dynamic root layout, available synchronously before any app code runs.
- App code reads values through lazy getters — `getNexusUrl()`, `getCdnUrl()`, `getHomeserver()`, `getHomegateUrl()`, `getDefaultHttpRelay()`, `getPkarrRelays()`, `getTestnet()` — re-exported from `@/config/nexus` and `@/config/network`.
- Schema and defaults live in `src/libs/runtime-config/network-config.schema.ts` (shared with `env.ts` so validation cannot drift).

```typescript
import { getNexusUrl } from '@/config/nexus';
import { getHomeserver, getTestnet } from '@/config/network';

const url = getNexusUrl(); // resolved at call time
```

> Do NOT read these values from `Env.NEXT_PUBLIC_*` or `process.env.NEXT_PUBLIC_*` directly — an ESLint rule blocks it. Use the getters.

### Required vs fallback (fail loud)

- **Deployed (`NODE_ENV=production`, including staging), or `PUBKY_RUNTIME_CONFIG_REQUIRED=true`**: `PUBKY_RUNTIME_*` are **required**. Missing/invalid config throws (no silent fallback to staging). If any one `PUBKY_RUNTIME_*` is set, **all** are required (catches partial deploy config).
- **Local dev / tests**: falls back to the `NEXT_PUBLIC_*` defaults (honoring `.env.local` and `src/config/test.ts`).

> Contract shift: staging runs `NODE_ENV=production`, so staging must now set `PUBKY_RUNTIME_*`. The `NEXT_PUBLIC_*` network values are now **local dev/test defaults only** — no deployed environment may rely on them.

### These are PUBLIC values

`PUBKY_RUNTIME_*` are public (URLs, the homeserver public key, relay lists) — they are exposed to the browser by design. They are **not secrets**; deployment tooling should not treat them as sensitive.

### Known limitation: Sentry testnet gate

`shouldEnableSentry()` in `src/libs/observability/sentry.ts` still reads `Env.NEXT_PUBLIC_TESTNET` (build-time), because Sentry initializes across server/client/edge runtimes before the injected config is available. A testnet deploy of a prod-built image would therefore still enable Sentry. See [ADR 0017](adr/0017-runtime-config-injection.md).

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
