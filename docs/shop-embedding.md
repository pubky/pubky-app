# Shop inside Pubky App

App Shop navigation always opens `/shop`, which embeds a separately deployed Shop. There is no enable flag or external fallback. Both apps must appear on the **same scheme, hostname and port** so the SDK can restore App's exact saved grant record. The iframe uses the relative `/shop-embed` prefix; do not configure a cross-origin iframe or redirect this prefix to Shop's public hostname. [ADR 0025](adr/0025-same-origin-shop-session.md) defines the protocol and session ownership.

## Configuration

Deploy compatible App and Shop builds, the proxy, and Shop's BFF together. Shop validates embedded BFF configuration at startup, and deployment verification must check its readiness endpoint before promotion. `PUBKY_RUNTIME_AUTH_CLIENT_ID` remains the App identity; do not relabel saved grants as Shop grants.

The paired App and Shop releases pin `@synonymdev/pubky` to `0.16.1`. Coordinate future SDK upgrades across both releases and repeat exact-record restore, pending-flow cleanup and logout verification before promoting the updated pair on a shared origin.

Shop: build with `NEXT_PUBLIC_BASE_PATH=/shop-embed`, set `PUBKY_RUNTIME_EMBEDDED=true` and `PUBKY_RUNTIME_STORAGE_ADOPT_LEGACY=false`, and set runtime framing to `PUBKY_RUNTIME_FRAME_ANCESTORS=self` (the parser also accepts the quoted CSP keyword `'self'`). Use `NEXT_PUBLIC_DB_NAME=shop-franky` so the shared immediate-cleanup namespace matches App; this is the current Shop source default, including non-Docker builds. Leave embedded `NEXT_PUBLIC_SOCIAL_HOST` unset to avoid recursively loading App inside the iframe. Set `PUBKY_RUNTIME_DEFAULT_URL`, `SHOP_PUBLIC_ORIGIN` and `SHOP_GRANT_ASSERTION_ISSUER` to the App origin, and include that origin in the JSON-array `SHOP_ALLOWED_ORIGINS`. Use the same homeserver network as App. Set `PUBKY_RUNTIME_SHOP_PUBLIC_PATH=/shop` for public share/canonical URLs. Shop disables its own service-worker registration under the mount. BFF/assets and the Shop Passport popup return use `/shop-embed`; service-generated payment returns use the public wrapper (`PUBLIC_APP_ORIGIN=https://staging.pubky.app/shop` on staging).

For a non-Docker Shop build served with `npm run start` (`next start`), keep `NEXT_PUBLIC_BASE_PATH`, `NEXT_PUBLIC_DB_NAME` and `NEXT_PUBLIC_DB_VERSION` identical in the build and start environments. Next reloads `next.config.ts` at startup, so omitting the base path can break `/shop-embed/_next/*` asset routing. The DB values are read by Shop's environment module; retaining them also prevents a server fallback from differing from the built client. This example matches the current Shop `.env.example`; export the values before both commands:

```bash
export NEXT_PUBLIC_BASE_PATH=/shop-embed
export NEXT_PUBLIC_DB_NAME=shop-franky
export NEXT_PUBLIC_DB_VERSION=8
npm run build
npm run start
```

Supply the required Shop `PUBKY_RUNTIME_*` network values, the embedded settings above, and BFF configuration in the process environment or an untracked `.env.production.local`. Preserve the DB version selected by the Shop release across build and start. Shop's supported 4 → 5 → 6 → 7 → 8 upgrade chain migrates in place; other version mismatches can recreate the database, so follow that release's migration policy. Changing any of these build values requires rebuilding the Shop artifact. Docker's standalone server uses its generated configuration instead of reloading `next.config.ts`.

The BFF (backend for frontend) is the Shop deployment's existing Next.js server route layer. It manages marketplace approval and the HttpOnly session/flow cookies. Configure `PUBKY_RUNTIME_MARKETPLACE_GRANT_FLOW_ENABLED=true` and `SHOP_BFF_GRANT_FLOW_ENABLED=true`, plus its PostgreSQL schema, signing and encryption keys, and matching marketplace service trust before deploying the pair. See the [Shop BFF prerequisites](https://github.com/pubky/pubky-marketplace/blob/53fb9f0d4a65c8d9252a519d021d367688c7c59f/docs/launch/shop-embedding.md#shop-bff-prerequisites) for the required settings; these secrets belong to the Shop server.

Production proxy routes **all** `/shop-embed` and `/shop-embed/*` requests to the Shop server with the prefix preserved; `/shop` and `/shop/*` go to App. Example nginx route (adapt upstream/TLS configuration):

```nginx
location = /shop-embed {
    proxy_pass http://shop_upstream;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location ^~ /shop-embed/ {
    proxy_pass http://shop_upstream; # no URI suffix: preserve /shop-embed
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache off;
}
location / {
    proxy_pass http://app_upstream;
}
```

Do not cache Shop HTML or auth/API responses at the CDN/proxy. Preserve `Set-Cookie`, request bodies, query strings, and backend cache headers; cache immutable Shop assets only according to their headers. The Shop BFF uses `__Host-` cookies with `Secure`, `HttpOnly`, `SameSite=Strict` and `Path=/`; keep their names distinct and do not clear another application's cookies. Permit self framing at every proxy layer (no conflicting `X-Frame-Options: DENY` or CSP). Deploy updated App service worker and activate it before testing mounted offline behavior.

Configure the App origin in marketplace CORS/trusted issuers, Shop BFF/service trust, Paykit setup, Locks return origins, Nexus and fiat verifier as applicable. Initial shared homeserver approval does not replace marketplace service approval or seller Locks connection. Ring/Bitkit and Passport request the App/Locks/Shop scope union, including Chat's public/private paths. Recovery-key sign-in and browser signup obtain root storage grants. Existing grants need only Shop's core storage scopes to open Shop. The replacement Chat consumer and permission upgrades are separate work in Shop #209; the App's scopes and cleanup entries provide compatibility preparation, not verification that Chat works.

## Outages and logout

App checks the no-store `GET /shop-embed/api/marketplace/health` endpoint. Before the iframe loads, a failed check shows the temporary unavailable state immediately. A loaded iframe remains mounted through transient failures and is replaced only after three consecutive failed checks, at least 10 seconds apart. Success resets that count. Polling pauses while offline or hidden, and resumes with a fresh count on reconnect or visibility return; failures from an interrupted interval are ignored. Recovery reloads Shop automatically at the current URL without clearing the App session. This is outage recovery, not a substitute for deployment verification. Roll back to a compatible App/Shop pair if a release fails verification.

Logout uses App’s normal recovery-key backup gate. Successfully persisted logout rotates the durable public `shopCleanupEpoch` and starts bounded, best-effort cleanup of the agreed Shop service credentials/private database tables even when no iframe is mounted. Unavailable storage, Web Locks or BFF connectivity can leave cleanup pending. Shop cleans remaining state before restoring a grant and acknowledges the epoch only after success; same-account return also invalidates old service approvals. App retries signed-out cleanup on startup and network return. Both releases must implement the shared lock, epoch and namespace contract in [ADR 0025](adr/0025-same-origin-shop-session.md). Shop cleanup preserves device-local delivery addresses and grant retirement queues; App's auth controller separately retires its outgoing grant.

## Local pair

Use Node 24 in both checkouts. Run Shop on port 3001 with `/shop-embed` as its build-time base path and its embedded host-session mode enabled. In the App checkout:

```bash
SHOP_EMBED_PROXY_ORIGIN=http://localhost:3001 npm run dev
```

Open `http://localhost:3000/shop`. The browser must request Shop only at `localhost:3000/shop-embed/...`, never port 3001. `SHOP_EMBED_PROXY_ORIGIN` is a development-only Next rewrite setting, validated as an HTTP(S) origin; restart dev after changing it. Production deliberately uses the deployment reverse proxy instead of a build-bound rewrite. Use a local HTTPS proxy and matching public-origin settings for real Passport/mobile flows.

## Deployment verification

Before promoting a deployment, check `GET /shop-embed/api/marketplace/health` through the public same-origin proxy. Require HTTP 200 with `{"service":"pubky-shop-bff","status":"ready"}`; HTTP 503 reports `status: "unavailable"`. This no-store endpoint checks BFF configuration and database schema readiness without creating a session or challenge. Missing Shop/BFF configuration fails the Shop startup check; a missing migration or unreachable database fails this deployment readiness check. Verify the mounted HTML and asset paths as well; a healthy BFF alone does not prove the whole integration. Keep these checks in deployment verification rather than adding a network dependency to App startup. For example, run `curl --fail-with-body https://staging.pubky.app/shop-embed/api/marketplace/health` with the staging authentication used by the deployer, and verify the response marker. The infra deployment must run this check before promotion; this App PR does not modify that pipeline.

Check desktop/mobile Shop navigation and direct `/shop` deep links with no App Shop environment variables. Verify that one failed readiness check, offline time and a hidden tab preserve the loaded iframe and its form state. Simulate three consecutive online failures and verify that the unavailable state recovers automatically without a user action. Check logout with an unbacked-up onboarding key, logout while the iframe is absent or unmounts, same-account return after logout, blocked cleanup and retry, and active Shop service memory invalidation. Check guest browsing, explicit login (no automatic popup), new scoped signer approval and root recovery grants, old-grant scope upgrade and rejection through Ring and the Passport/recovery alternative, return to the same checkout deep link after App sign-in, exact-reference restore after reload, two App tabs plus iframe, account switch, temporary storage/network failure, expired/revoked record, logout while approval is pending, and no cleanup of an unrelated App record. Include a missing SDK record while App still has a ready handle: the explicit reauthorization must remain on sign-in until new approval. Verify outer deep links, browser back/forward, query/hash preservation, refresh, and top-level signer/PayPal return routes. Exercise real Safari/mobile storage and signer gestures. The source tests establish bridge/state boundaries, not live signer/payment completion.

Protocol and session ownership: [ADR 0025](adr/0025-same-origin-shop-session.md).
