# Pubchi in Pubky App

Pubchi adds a personal assistant to Pubky App: questions with sources, feed proposals,
tag suggestions, and draft posts. The App owns the user's identity, approvals, and writes.
The separately deployed Pubchi service answers signed requests and returns proposals;
it does not receive the user's Pubky session, recovery phrase, or private key.

This integration ports the Pubchi frontend from
[`BitcoinErrorLog/pubky-app` at `30b7763bf7c456d8523e8996f1804d68fabcc8a9`](https://github.com/BitcoinErrorLog/pubky-app/tree/30b7763bf7c456d8523e8996f1804d68fabcc8a9)
onto official App `dev` at `27891747ae0fc17b0b32b04b3ac3181480acfb3a`.
It retains the current App's grant authentication, Shop integration, local-first data
paths, runtime configuration, and test conventions. The source fork's historical
Phase 0 proof documents describe earlier contracts and are not the operational guide
for this port. The architecture decision is [ADR 0026](adr/0026-pubchi-assisted-integration.md).

## Enablement and deployment

The feature ships disabled, with no default service URL in any environment.

| Runtime variable               | Default | Behavior                                                    |
| ------------------------------ | ------- | ----------------------------------------------------------- |
| `PUBKY_RUNTIME_PUBCHI_ENABLED` | `false` | Enables Pubchi settings, routes, and local feature state.   |
| `PUBKY_RUNTIME_PUBCHI_API_URL` | empty   | Enables assistant requests when the master flag is also on. |

Use the public runtime config getters, `getPubchiEnabled()` and `getPubchiApiUrl()`,
through `src/libs/pubchi/flags.ts`. With the flag off, feature entry points and
coordinators stay inactive. Turning it off does not erase an existing local database;
auth cleanup still removes the outgoing owner's local state.

For an explicitly enabled deployment, add the two values to its existing App runtime
configuration:

```dotenv
PUBKY_RUNTIME_PUBCHI_ENABLED=true
PUBKY_RUNTIME_PUBCHI_API_URL=https://pubchi.example.com
```

The deployed runtime parser requires HTTPS. The lenient development/test parser also
accepts HTTP on `localhost` or `127.0.0.1`. A local production build uses the deployed
parser and still needs all nine required App network values; see [environment
configuration](environment.md). Both Pubchi values are public. Model/provider secrets
belong to the separately configured service and must not be added to App runtime config.

Deploy a compatible service from [`BitcoinErrorLog/pubky-ai-bot`](https://github.com/BitcoinErrorLog/pubky-ai-bot),
with the App origin allowed by its CORS policy. Frontend and service must agree on the
vendored document schemas and signed request v2 contract, including the configured
audience. This frontend port does not attest which service revision is running at a
public URL. Record the backend revision with deployment evidence before enabling it.

The current feed builder requires `PUBCHI_FEED_PROPOSAL_V2=1` on the **service** as
well as the App's request-level `proposal_version: 2`. Without that service flag,
`/v1/feed` can return a v1 proposal, which this builder cannot use. Also configure
the service's `PUBCHI_AUDIENCE_ORIGINS` to include the App's configured API origin;
this is separate from `PUBCHI_ALLOWED_ORIGINS`, which contains the browser App
origins permitted by CORS. For local HTTP service testing, the service additionally
requires `PUBCHI_ALLOW_LOOPBACK_AUDIENCE=1`.

| User action                         | Endpoint         | App handling                                                            |
| ----------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| Ask, including contextual questions | `POST /v1/query` | Parse the answer/query result and show its sources and execution scope. |
| Build a feed                        | `POST /v1/feed`  | Validate the proposal and let the user review and apply it.             |
| App-open proactive suggestions      | `POST /v1/query` | Optional foreground request with quiet hours and daily limits.          |

The proactive path is disabled by default and runs while the App is open. It is not a
hosted scheduler. Unsupported purpose/endpoint pairs are rejected before a request.

## User flows and write approvals

The feature includes `/pubchi`, `/pubchi/brain`, and `/settings/pubchi`, a flyout from
App navigation, and contextual entry points in post/profile menus. Settings cover
creation or enrollment, backup confirmation, preferences, model configuration, device
delegations, and export/import. Brain context is stored under the owner's private
Pubchi namespace and is included in signed requests when the user configures it.
Public graph/web context settings are visible in configuration; web context is off
by default.

The current service accepts self-hosted OpenAI-compatible and Ollama model endpoints
only on its exact loopback hosts. A URL such as `http://localhost:11434` is resolved
from the **Pubchi service host**, not the user's browser or laptop. To use a locally
hosted model, run/configure a Pubchi service that can reach it on that host and point
the App at that service. Arbitrary remote model hosts, URL credentials, query strings,
and fragments are not supported by this backend's endpoint policy; provider secrets
stay in the service's configuration.

The available execution ceiling is **assisted**. The contracts can describe an
`autonomous` tier, but this port does not enable unattended publishing. Feed creation,
tag application, and draft publishing require an explicit user action. The App uses
its existing feed, tag, and post write paths, with Pubchi records tracking provenance
and outcomes.

Tag receipts store a hash of the exact canonical tag document. Undo rereads and
checks that document before every delete attempt, including retries. Older receipts
without this proof cannot Undo through Pubchi. Draft Undo requires the post ID
returned by that publishing operation and `publication_confirmed`; matching content
does not establish which post the operation created. An unknown publication outcome
stays pending to avoid duplicate creation, and legacy records without publication
proof cannot delete a post through Pubchi. Users can inspect and manage the actual
post or tag through the App's ordinary controls.

## Authentication and custody

An existing session may lack access to `/pub/app.pubchi/v1/` and
`/priv/app.pubchi/v1/`. Pubchi requests an upgrade through
`AuthController.requestCapabilities(...)` and the App's existing signer approval
flow. It does not silently broaden ordinary sign-in grants. The flow preserves the
current grant until approval, requires the same identity, and uses the existing auth
generation fence to reject stale results. App social writes additionally need their
existing `/pub/pubky.app/` capability. See [grant authentication](adr/0024-grant-authentication.md).

Bot identity creation and backup happen locally. Device request signers are separate,
non-extractable Ed25519 `CryptoKey`s in this browser's IndexedDB. A published delegation
binds a device signer to the owner; it expires within seven days and can be revoked.
Requests use a signed v2 envelope with audience, body digest, nonce, and expiry. These
device signatures authorize service requests, not arbitrary homeserver writes.

Losing browser storage loses its device signer; the user must establish a new one.
An old delegation can be deleted only with the matching owner's live session, so
failed or deferred revocations are retained for retry and also bounded by expiry.
Pubchi recovery phrases, keys, auth material, and private context must not enter
telemetry; the shared observability redaction policy covers custody fields and
mnemonic text.

## Durable local state

The isolated `pubchi` IndexedDB contains owner-scoped bindings, device keys, tag
application records, and draft post records. It is **durable local feature state**,
not part of the disposable App cache. An App `DB_VERSION` mismatch can recreate the
main cache without destroying an offline device key or an unfinished write receipt.
Pubchi keeps its own additive version history and does not change `NEXT_PUBLIC_DB_VERSION`.

Durability is bounded by the user's account lifecycle. Logout and account replacement
clear the outgoing owner's records, local cursors, and proactive state; they must not
delete another account's rows or a newly adopted account's state. Delegation cleanup
is attempted while the outgoing session is still usable, with pending revocations
recorded before keys are removed. A routine main-cache reset is not a logout and must
preserve Pubchi state. Disabling the feature is also not a data deletion operation.

Homeserver records provide portable configuration, bindings, provenance, and private
receipts. Export/import validates those documents and owner relationships. It does
not export device private keys or turn a browser-local signer into portable custody.
See [ADR 0026](adr/0026-pubchi-assisted-integration.md) for storage and layer boundaries.

## Scope and verification

The migration includes feature modules, current-contract fixtures, unit coverage, and
Pubchi VRT cases. It excludes the source fork's unrelated preview CI changes,
repository-wide lint/TypeScript exceptions, obsolete component snapshots, and local
proof artifacts. The separate [legal PR #188](https://github.com/BitcoinErrorLog/pubky-app/pull/188)
remains unmerged and is not incorporated by this integration. VRT baselines are CI-owned; source screenshots and locally
generated baselines are not acceptance evidence for this App revision.

Run the affected unit suites, lint, typecheck, the full unit suite, and a production
build for the combined change. Review the Pubchi visual cases through the existing
VRT workflow. Before enabling a deployment, exercise signer capability approval,
enrollment/backup, query/feed responses, approved tag and post writes, revert and
reconciliation, logout/account switching across tabs, and export/import against the
chosen backend. A unit test pass alone does not prove that deployment contract.
