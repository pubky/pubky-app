# Offline bundle

The offline bundle is the whole web client as static files plus a small local web server. Someone unzips it, runs
one command, and uses the app at `http://127.0.0.1:8473/` with no Pubky App server anywhere: the page talks only
to homeservers and relays. It is the static export of the app, built with `NEXT_PUBLIC_STATIC_EXPORT=true`, on the
local index (`PUBKY_RUNTIME_INDEXER_SOURCES=local`, ADR-0031). The decisions are in ADR-0032.

## Building it

CI builds it: `.github/workflows/offline-bundle.yml` exports the app, checks the export and uploads the bundle as
the `pubky-app-offline` artifact (kept 7 days), which holds `pubky-app-offline.zip`: the zip is made in the job
because an artifact upload drops the executable bit of the launchers. Download it from the run's page, or with
`gh run download <run id> --repo pubky/pubky-app -n pubky-app-offline`.

By hand, from a checkout with dependencies installed:

```bash
NEXT_PUBLIC_STATIC_EXPORT=true \
PUBKY_RUNTIME_ENV=staging PUBKY_RUNTIME_TESTNET=false \
PUBKY_RUNTIME_HOMESERVER=ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy \
PUBKY_RUNTIME_HOMESERVER_URL=https://homeserver.staging.pubky.app \
PUBKY_RUNTIME_INDEXER_SOURCES=local \
PUBKY_RUNTIME_HOMEGATE_URL=https://homegate.staging.pubky.app \
PUBKY_RUNTIME_PKARR_RELAYS='["https://pkarr.pubky.app","https://pkarr.pubky.org"]' \
PUBKY_RUNTIME_DEFAULT_HTTP_RELAY=https://httprelay.staging.pubky.app/inbox \
PUBKY_RUNTIME_THIRD_PARTY_EMBEDS=false \
npm run build
mkdir -p pubky-app-offline && cp -r out pubky-app-offline/app
cp offline-bundle/{serve.py,serve.mjs,routes.json,README.txt} pubky-app-offline/
(cd offline-bundle/launcher && go build -o ../../pubky-app-offline/pubky-app .)
```

The launchers are not signed: macOS Gatekeeper and Windows SmartScreen warn on first open, and `README.txt` says
how to get past that. Signing needs the company's Apple Developer and code-signing certificates.

The export writes `out/`. Its runtime config is read once, at build time, and written into every page, so the
build parses `PUBKY_RUNTIME_*` strictly: a missing required value fails the build instead of falling back to the
staging defaults a dev build uses (`docs/environment.md`). A bundle for another network is another build. Every
optional service (Sentry, Pulse, Plausible, Prelude, Locks, Passport, the marketplace) stays off by leaving its
variable unset. `PUBKY_RUNTIME_DEFAULT_URL` sets the public web app that shared links point at (below).

## What is in it

| Path                    | What                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `app/`                  | The export: one HTML file and one set of payload files per route, `_next/static`, `sw.js` |
| `pubky-app-*`           | The launcher as one static executable each for macOS (Apple chip, Intel), Windows, Linux  |
| `serve.py`, `serve.mjs` | The same launcher in Python 3 and in Node; standard library only                          |
| `routes.json`           | The launchers' route table, shared by all three                                           |
| `README.txt`            | How to start it, for someone who is not a developer                                       |

The export has no source maps. Each dynamic route (`/post/[userId]/[postId]`, `/collections/[userId]/[postId]`,
`/profile/[pubky]` and its tabs, `/feed/[id]`, `/invite/[inviteCode]`) is exported once under the placeholder `_`.

## The launcher

The executable (`offline-bundle/launcher/main.go`, built for each OS in CI), `python3 serve.py` or
`node serve.mjs` serves `app/` on `127.0.0.1:8473` and opens the browser (`--no-browser`
skips that, `--port N` picks another port). It:

- serves `/x` from `x.html` (or `x/index.html`), and any other file as is, with its MIME type;
- serves every id of a dynamic route the placeholder's files: `/post/A/B` gets `post/_/_.html`, and the client
  router's payload requests under it (`/post/A/B/__next._tree.txt`, `/post/A/B.txt`) get the files under
  `post/_/_`. A real file always wins, so `/profile/followers` is the own-profile page;
- answers `/profile/<pubky>/posts` and `/privacy` with the same 308 redirects the server build has;
- answers `/api/*`, `/_pubky/*` and `/shop-embed/*` with a 404, never the HTML fallback, so a `fetch` sees a
  clean failure and local media falls back as it does on a page the service worker does not control;
- sends `no-cache` on everything but `/_next/static/`, so a new bundle is picked up;
- binds `127.0.0.1` only and refuses to start when the port is taken, rather than move to another one.

The port is fixed because the origin includes it: the session, the local index, the service worker and its media
cache all belong to `http://127.0.0.1:8473`. `http://localhost:8473` is another origin with its own storage.
`file://` cannot work (no service worker, an opaque origin, absolute asset paths).

## How pages get their ids

The export prerenders each dynamic page once, for the placeholder, so `params` in a server component and
`useParams()` in a client component report `_`. Pages read their ids from the URL path instead:
`usePathname()` and the matchers in `src/app/routes.ts` (`matchPostRoute`, `matchSingleCollectionRoute`,
`matchDynamicProfileRoute`, `matchCustomFeedRoute`, `matchInviteRoute`). This holds in every build, and a new
dynamic route follows it: its server page renders a client component that reads the path, and the route exports
`const generateStaticParams = placeholderParams(...)` from a server module. That is `undefined` outside the
export on purpose: in a server build, any `generateStaticParams` function, even one returning `[]`, makes Next
generate unlisted params statically on demand, and the root layout's `connection()` then answers every request
with a 500 (`DYNAMIC_SERVER_USAGE`). Next ignores
`generateStaticParams` in a module whose default export is a client component, so that module needs a server
default of its own.

Server-only route files are named `*.server.ts(x)` (`route.server.ts`, `opengraph-image.server.tsx`, the
intercepted `(.)post` page, the Shop pages, the Sentry test page). `next.config.ts` adds those extensions to
`pageExtensions` in every build except the export, so the export leaves them out and the server build serves
the same routes as before.

## What it contacts

Signed out, opening a post or a profile contacts only the page's own origin, the homeserver of each user it shows
(`homeserver.staging.pubky.app` in the staging bundle) and the PKARR relays that resolve those homeservers.
Beyond that, as the app is used:

- the HTTP relay, for signing in with Pubky Ring;
- Homegate, only while signing up;
- an image an article hotlinks from another site.

The bundle is built with `PUBKY_RUNTIME_THIRD_PARTY_EMBEDS=false`, so a linked YouTube or Vimeo video or tweet
stays a plain link and loads nothing from that site.

Nothing is loaded from a CDN, and the font is part of the build.

## What does not work

| Feature                                | In the bundle                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Feedback                               | Hidden (it posts to the app server)                                                                     |
| Report post                            | Opens an email to the support address with the post link                                                |
| Copyright takedown form                | The page shows the support address instead of the form                                                  |
| Link previews for web pages            | Not shown; links render as plain links                                                                  |
| YouTube, Vimeo and X embeds            | Plain links (`PUBKY_RUNTIME_THIRD_PARTY_EMBEDS=false`)                                                  |
| The Shop                               | Hidden                                                                                                  |
| Locks (paid posts)                     | Off: no Lock server or Paykit configured, and both need app server routes                               |
| Continue with Google (Passport)        | Off: unset, and it needs an HTTPS origin                                                                |
| Shared links                           | Point at the public web app (`PUBKY_RUNTIME_DEFAULT_URL`), since `127.0.0.1` opens on one computer only |
| OpenGraph images                       | None (they are server routes)                                                                           |
| A post opened from a feed              | Opens as a full page instead of the overlay (the intercepted route is server-only)                      |
| Images on the very first open          | Missing until one reload, while the service worker takes control (`docs/pwa.md`)                        |
| Opening the bundle from another device | Not possible: only `127.0.0.1` is a secure context and is served                                        |

Sign-in uses grants (ADR-0024): the session is a bearer credential in the SDK's IndexedDB store, and nothing in
the flow depends on the page's origin. On a computer, sign in by scanning the QR code with Pubky Ring; the request
travels through the HTTP relay.
