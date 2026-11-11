# Playwright end-to-end proof of concept

A small Playwright suite that runs beside Cypress. Cypress specs, the Cypress workflow and the Vitest visual-regression setup are unchanged. This suite is not a required pull-request check. Run it by hand with `workflow_dispatch`.

## Layout

| Path                                                  | Role                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `e2e/shared/`                                         | Homeserver seeding, signup tokens and Nexus polling. Cypress and Playwright both call this. |
| `cypress/plugins/seed.ts`, `cypress/plugins/nexus.ts` | Cypress task entry points. They re-export `e2e/shared` and do nothing else.                 |
| `playwright.config.ts`                                | Five projects, traces, video and screenshots.                                               |
| `playwright/e2e/`                                     | The ported specs.                                                                           |
| `playwright/support/`                                 | Sign-in, feed and profile helpers, and the seed fixture.                                    |
| `.github/workflows/playwright-e2e.yml`                | Manual workflow.                                                                            |
| `.github/scripts/playwright-remote-stack.sh`          | Ubuntu stack tunnel for the macOS WebKit job.                                               |
| `.github/scripts/playwright-ipv6-loopback.mjs`        | Forwards `::1` to `127.0.0.1` on the macOS runner.                                          |

`e2e/shared` does not read `process.env` itself. `cypress.config.ts` and the Playwright fixture pass an env record into `e2eStackConfigFromEnv`. The defaults are the same addresses Cypress used before the split: homeserver admin `http://localhost:6288/generate_signup_token` (password `admin`), Nexus `http://localhost:8080`, testnet homeserver public key `8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo`.

## Projects

| Project    | Engine   | Device          | Runner                                              |
| ---------- | -------- | --------------- | --------------------------------------------------- |
| `chromium` | Chromium | Desktop Chrome  | Ubuntu, stack and app in Docker on the same runner  |
| `firefox`  | Firefox  | Desktop Firefox | Ubuntu, same as Chromium                            |
| `pixel`    | Chromium | Pixel 7         | Ubuntu, same as Chromium                            |
| `webkit`   | WebKit   | Desktop Safari  | macOS, stack on a paired Ubuntu runner              |
| `iphone`   | WebKit   | iPhone 14       | macOS, same stack and app as `webkit`, run after it |

Chromium, Firefox and Pixel each get their own pubky-stack, the same way a Cypress spec job does. WebKit and iPhone share one macOS runner and one Ubuntu stack so the scarce macOS minutes are spent once. Reports are still uploaded per project.

## What the specs cover

About three to five tests from each Cypress file. Titles that match Cypress are the same sentence, so a failure can be compared with the Cypress run.

- `playwright/e2e/onboarding.spec.ts` from `cypress/e2e/onboarding.cy.ts`: Explore without an account, an invite code the homeserver rejects, `/invite/<code>` when verification returns 404, signup with an encrypted-file backup then sign-in with that file, and signup, sign-out, signup again.
- `playwright/e2e/posts.spec.ts` from `cypress/e2e/posts.cy.ts`: quick post, delete, `@` mention autocomplete, and a second browser context where Bob sees a post Alice published.
- `playwright/e2e/profile.spec.ts` from `cypress/e2e/profile.cy.ts`: edit name and bio, cancel an edit, tag your own profile, and a second browser context where Bob sees that Alice followed him.

Posts and profile sign in with a recovery file the shared seed writes (the same passcode Cypress uses, `123456`). Onboarding signs up through the UI. The production image has no `window.Cypress` and is not a development build, so the invite step uses `[data-cy="invite-code-link"]` rather than the dev-only button.

Two tests (`user B sees a post…`, `user A follows user B…`) open a second browser context in the same browser and device. Each context signs in on its own. `storageState` is not used: the account keys in IndexedDB are not extractable, so a saved storage state cannot sign a later context in.

## Run it locally

The suite needs the pubky-stack on the same ports as Cypress (homeserver, its admin port, Nexus). From the repo root, with the app already on port 3000:

```bash
npm run test:e2e:playwright
node ./node_modules/@playwright/test/cli.js test --project=chromium
```

The npm script calls `@playwright/test` by path so it does not replace the `playwright` binary the visual-regression setup uses. Install browsers the same way the workflow does, without going through that binary:

```bash
node ./node_modules/playwright/cli.js install --with-deps chromium firefox webkit
```

`@playwright/test` is pinned to the same version as the `playwright` devDependency (the visual-regression runner). Do not bump one of them on its own.

## Run it in GitHub Actions

Actions → **playwright-e2e** → **Run workflow**, on the branch you want. The workflow file is `.github/workflows/playwright-e2e.yml`. It does not run on push, and it is not a required check.

The Ubuntu browser jobs rebuild the app image the same way `e2e-test.yml` does (`tag_mode: content`) and start pubky-stack beside it. Playwright itself runs on the host against `http://localhost:3000`.

WebKit cannot run that stack: GitHub macOS runners have no Docker. The pair of jobs is the same shape as the WebKit half of the Cypress draft (cloudflared quick tunnel, SSH local forwards, public key and endpoint passed as artefacts while the run is still in progress):

1. macOS creates an SSH key and uploads the public half.
2. Ubuntu starts the stack, an sshd that accepts only that key and only the stack ports, and a quick tunnel, then uploads the tunnel host and the app's `PUBKY_RUNTIME_*` values.
3. macOS forwards each stack port to `127.0.0.1` on the same port, builds the app with the same `NEXT_PUBLIC_*` arguments as the Docker image, and starts it with `next start -H 127.0.0.1 -p 3000`.
4. Ubuntu holds the stack until the macOS job finishes, and fails when that job fails, so "Re-run failed jobs" reruns the pair together.

Playwright does not use Cypress's proxy, so this workflow does not use the loopback demux or the port offset from that draft. macOS still resolves `localhost` to `::1`, and the SSH forwards bind `127.0.0.1` only, so `playwright-ipv6-loopback.mjs` listens on `::1` and pipes those sockets to `127.0.0.1`.

## Evidence

Every project records a trace, a video and a screenshot for every test, including passing ones, and writes the HTML report. The macOS job runs `webkit` and `iphone` one after the other and gives each its own output directory, so they do not overwrite each other. A second browser context attaches its own trace, video and screenshot on the test.

The workflow uploads two artefacts per project, kept for 14 days:

| Artefact                        | Contents                                            |
| ------------------------------- | --------------------------------------------------- |
| `playwright-report-<project>`   | HTML report (`npx playwright show-report <folder>`) |
| `playwright-evidence-<project>` | `test-results`: traces, videos, screenshots         |

`<project>` is `chromium`, `firefox`, `pixel`, `webkit` or `iphone`.

## Gotchas the suite already handles

- **Video and `load` (#3105).** The landing video can stall `window.load` in WebKit. Navigation uses `waitUntil: 'domcontentloaded'`, and the context aborts `/pubky.mp4` once service workers are blocked.
- **Service worker.** Serwist hides requests from `page.route`. Every context sets `serviceWorkers: 'block'`.
- **`storageState`.** Do not add it for signed-in tests. Sign in through the UI or the recovery file.
