import type { Capabilities } from '@synonymdev/pubky';
import { APP_CAPABILITIES, LOCKS_CAPABILITIES, SHOP_CAPABILITIES, SOCIAL_V1_APP_CAPABILITIES } from '@/config/auth';
import {
  getDefaultHttpRelay,
  getDeployEnv,
  getE2eLocksStubUrl,
  getExchangeRateApi,
  getHomegateUrl,
  getHomeserver,
  getHomeserverUrl,
  getLockServer,
  getPassportApple,
  getPassportUrl,
  getPaykitServerUrl,
  getPkarrRelays,
  getTestnet,
} from '@/libs/runtime-config/runtime-config';

// Runtime-configurable: read via getters at call time (PUBKY_RUNTIME_* in deployed environments,
// staging defaults in dev/test). See @/libs/runtime-config.
export {
  getDefaultHttpRelay,
  getDeployEnv,
  getE2eLocksStubUrl,
  getExchangeRateApi,
  getHomegateUrl,
  getHomeserver,
  getHomeserverUrl,
  getLockServer,
  getPassportUrl,
  getPaykitServerUrl,
  getPkarrRelays,
  getTestnet,
};

/**
 * True when a Pubky Passport origin is configured (`PUBKY_RUNTIME_PASSPORT_URL`).
 *
 * Pure and server-safe: this only says the deploy points at a Passport. Whether the current
 * browser page can actually complete a Passport hand-off (HTTPS origin) is resolved after mount
 * by `usePassportEligibility`, never here.
 */
export function isPassportConfigured(): boolean {
  return Boolean(getPassportUrl());
}

/**
 * True when the Passport button shows Google and Apple provider marks
 * as the accounts behind it: a Passport origin is configured and
 * `PUBKY_RUNTIME_PASSPORT_APPLE=true`. Presentation only; the person picks the provider in Passport. Off by
 * default, because Passport keeps Apple login off until its Apple setup is done for that deploy. Same
 * purity as {@link isPassportConfigured}: the HTTPS check still comes from `usePassportEligibility`.
 */
export function isPassportAppleEnabled(): boolean {
  return isPassportConfigured() && getPassportApple();
}

/**
 * True when this deploy declares itself a staging-homeserver environment
 * (`PUBKY_RUNTIME_ENV=staging`: the staging deploy, PR previews, and — via the
 * lenient dev default — plain local dev).
 *
 * Declared identity, deliberately NOT inferred from network values: equality
 * with the canonical staging defaults must never be load-bearing, because any
 * config drift (URL rotation, trailing slash) would silently disable the
 * staging sign-in guard and re-enable the force-republish path it exists to
 * prevent. `PUBKY_RUNTIME_HOMESERVER_URL` is also temporary until
 * pubky-homeserver#410 resolves transport URLs via PKARR.
 */
export function isStagingHomeserverDeploy(): boolean {
  return getDeployEnv() === 'staging';
}

// Requested from Pubky Ring at sign-in and fixed for the life of that session; keypair sign-in mints a
// root (`/:rw`) session instead. A session from before an entry was added lacks it until the user
// approves a new one (`docs/locks.md`, _Sessions from before locks_).
// - /pub/pubky.app/:rw         — the 0.x public tree: legacy reads, and deletes of migrated objects
// - /pub/social/v1/:rw         — the app's public social data (`pubky-social-specs` 1.x)
// - /priv/social/v1/:rw        — the private social tree: bookmarks, mutes, feeds
// - /priv/app.pubky/v1/:rw     — the app's own files: settings, notification read cursor
// - /priv/social/:rw           — where unlocked lock content is copied (reader replication)
// - /priv/app.locks/content/:r — read-only: a creator reads their OWN guarded original here (Ring sessions)
// The order is the order Ring shows the scopes in; `src/config/auth.test.ts` pins the string.
export const HOMESERVER_CAPABILITIES = [APP_CAPABILITIES, ...SOCIAL_V1_APP_CAPABILITIES, ...LOCKS_CAPABILITIES].join(
  ',',
) as Capabilities;

/** One approval requests the App, social v1, Locks and embedded Shop storage scopes. */
export function getHomeserverCapabilities(): Capabilities {
  return [
    ...new Set([APP_CAPABILITIES, ...SOCIAL_V1_APP_CAPABILITIES, ...LOCKS_CAPABILITIES, ...SHOP_CAPABILITIES]),
  ].join(',') as Capabilities;
}

/**
 * How long one homeserver read held under a per-user sync lock may stay pending before `awaitBounded`
 * (`src/core/utils/bounded-read.ts`) stops waiting for it: the whole paginated LIST of the mute, bookmark or feed
 * fetch (every page shares the one bound), a bookmark GET batch, a feed GET. A bound on how long a read that never
 * answers can hold the lock, and the writes of every tab behind it; not a product limit.
 * Fixed (not configurable via env); see `docs/environment.md`.
 */
export const HOMESERVER_SYNC_READ_TIMEOUT_MS = 30_000;
