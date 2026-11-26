# ADR 0032: A Static Export of the App, Served From 127.0.0.1

## Status

Proposed - 2026-11-26

## Context

With the local index (ADR-0031) the browser reads social data from homeservers, media goes through the service
worker (ADR-0016), and sign-in is a bearer grant with no tie to the page's origin (ADR-0024). What still needs a
server is the Next.js layer: the root layout was `force-dynamic` so it could write the runtime config into each
response (ADR-0017), eight route handlers under `src/app/api`, the OpenGraph image routes, the intercepted
`(.)post` route, and the Shop proxy.

A copy of the app that someone can run on their own computer, with no Pubky App server at all, needs a build
without those pieces: plain files any local web server can serve. Homeservers, the PKARR relays and the HTTP relay
accept a `http://127.0.0.1:<port>` origin (stock homeservers mirror any origin).

The server build and the Docker image must not change behaviour for it.

## Decision

One build switch, `NEXT_PUBLIC_STATIC_EXPORT=true`, produces a static export (`output: 'export'`). It is a
build-intrinsic value on `Env`, like the database name: the artifact either has an app server or it does not.

1. **Server-only route files are named `*.server.ts(x)`.** `next.config.ts` adds `server.tsx` and `server.ts` to
   `pageExtensions` in every build except the export. The export never sees the route handlers, the OpenGraph and
   Twitter images, the intercepted post page and its catch-all, the Shop pages or the Sentry test page; the server
   build sees the same routes as before.
2. **The config is baked at build time and parsed strictly.** The root layout calls `connection()` unless it is
   the export, so a server still renders every request with the config of that moment. The export prerenders the
   layout once, and its build parses `PUBKY_RUNTIME_*` with the strict schema: a missing value fails the build
   instead of becoming a staging default.
3. **One placeholder page per dynamic route.** Each dynamic route exports
   `generateStaticParams = placeholderParams(...)`: a function returning one `_` set in the export, and
   `undefined` in a server build. The server build must have no function at all: Next statically generates a
   route that has one on demand for unlisted params, even when it returns `[]`, and the root layout's
   `connection()` then fails every request with `DYNAMIC_SERVER_USAGE`. A local launcher serves the placeholder
   page, and the client router's payload files under it, for every real id.
4. **Pages read ids from the URL path.** In the export, `params` and `useParams()` report the placeholder, and
   `usePathname()` reports the real URL (the router reads its canonical URL from `location`). Every page reads its
   ids through `usePathname()` and the route matchers in `src/app/routes.ts`, in both builds, so there is one way
   to read a route. `/invite/<code>` becomes a client redirect for the same reason.
5. **Features that need the server degrade on `HAS_APP_SERVER`.** Feedback, the Shop and link previews are hidden;
   a post report and a copyright notice go to the support address by email; shared links use the public web app
   (`getDefaultUrl()`), since `127.0.0.1` opens on one computer only.
6. **A dependency-free launcher.** `serve.py` and `serve.mjs` share one route table (`routes.json`): the
   placeholder mapping, the two legacy redirects, 404 for `/api`, `/_pubky` and `/shop-embed`, MIME types,
   `no-cache` outside `/_next/static`, `127.0.0.1` only, on a fixed port that it refuses to change.

`docs/offline-bundle.md` has the build, the contents, what the bundle contacts and what does not work in it.

## Consequences

### Positive ✅

- The app runs with no Pubky App server: one zip, one command, and the page talks only to homeservers and relays.
- The server build keeps its routes and per-request config; the export is a different set of files from the
  same source, not a second app.
- Reading ids from the path removes a whole class of server and client param mismatches; it is the same in both
  builds.

### Negative ❌

- A bundle is built for one network; changing its homeserver or relays means another build.
- A post opens as a full page from a feed, never as the overlay: interception needs a server.
- The first open shows media fallbacks until the service worker controls the page.
- A dynamic route's server component can no longer pass a route param to the client; it renders a client
  component that reads the path.

### Neutral ⚠️

- Next ignores `generateStaticParams` in a module whose default export is a client component, so the profile
  layout and the custom feed page have server defaults that render their client components.
- The launcher's route table has to list each new dynamic route.

## Alternatives Considered

### Query-string routes in the export

`/post?u=..&p=..` needs no placeholder and no launcher route table. It would mean a second URL scheme for every
link builder, the route guards, the share URLs and the feeds shell. Kept as the fallback had the placeholder pages
failed to hydrate; they hydrate.

### One client catch-all route

`app/[[...slug]]` with a router of its own drops the App Router's layouts, groups and parallel slots for the whole
app. Not this app any more.

### An editable `config.js` next to the bundle

It would let a user change the network without a build, but an external script in `<body>` can run after Next's
async chunks, which read the config at module scope (`ContainerRoot.tsx` explains the ordering). If the need comes
up, the launcher can rewrite the inline config in the HTML it serves, without an app change.

### Deleting server files in a throwaway checkout before the export

Works, but the export would only be reproducible in CI. The `*.server` naming keeps both builds in the source.

## Implementation Notes

- Switch and flag: `next.config.ts`, `src/libs/env/env.ts` (`NEXT_PUBLIC_STATIC_EXPORT`),
  `src/libs/static-export/` (`placeholderParams`, `HAS_APP_SERVER`, `getShareOrigin`).
- Strict build-time parse: `readServerConfig` in `src/libs/runtime-config/runtime-config.ts`.
- Launcher and route table: `offline-bundle/`. CI: `.github/workflows/offline-bundle.yml`.

## Related Decisions

- Depends on: [ADR-0031: The Local Index as a Read Source](./0031-local-index-read-source.md)
- Related: [ADR-0016: Service Worker Local File Cache](./0016-service-worker-local-file-cache.md),
  [ADR-0017: Runtime Config Injection](./0017-runtime-config-injection.md),
  [ADR-0024: Grant Authentication](./0024-grant-authentication.md)

---

See [ADR Guidelines](../adr-guidelines.md) for when and how to write ADRs.
