import type { Capabilities } from '@synonymdev/pubky';
import { APP_CAPABILITIES, LOCKS_CAPABILITIES, SHOP_CAPABILITIES } from '@/config/auth';
import {
  getDefaultHttpRelay,
  getDeployEnv,
  getExchangeRateApi,
  getHomegateUrl,
  getHomeserver,
  getHomeserverUrl,
  getLockServer,
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
 * True when this deploy declares itself a staging-homeserver environment
 * (`PUBKY_RUNTIME_ENV=staging`: the staging deploy, PR previews, and — via the
 * lenient dev default — plain local dev).
 *
 * Declared identity, deliberately NOT inferred from network values: equality
 * with the canonical staging defaults must never be load-bearing, because any
 * config drift (URL rotation, trailing slash) would silently disable the
 * staging sign-in guard and re-enable the force-republish path it exists to
 * prevent. `PUBKY_RUNTIME_HOMESERVER_URL` is also temporary until
 * pubky-core#410 resolves transport URLs via PKARR.
 */
export function isStagingHomeserverDeploy(): boolean {
  return getDeployEnv() === 'staging';
}

// Requested from Pubky Ring at sign-in and fixed for the life of that session; keypair sign-in mints a
// root (`/:rw`) session instead. A session from before an entry was added lacks it until the user
// approves a new one (`docs/locks.md`, _Sessions from before locks_).
// - /pub/pubky.app/:rw         — the app's public data
// - /priv/social/:rw           — where unlocked lock content is copied (reader replication)
// - /priv/app.locks/content/:r — read-only: a creator reads their OWN guarded original here (Ring sessions)
export const HOMESERVER_CAPABILITIES = [APP_CAPABILITIES, ...LOCKS_CAPABILITIES].join(',') as Capabilities;

/** One approval requests the App, Locks and embedded Shop storage scopes. */
export function getHomeserverCapabilities(): Capabilities {
  return [...new Set([APP_CAPABILITIES, ...LOCKS_CAPABILITIES, ...SHOP_CAPABILITIES])].join(',') as Capabilities;
}

// The grant a social v1 migration runs under, asked for through Ring when the user starts one;
// not part of `HOMESERVER_CAPABILITIES` yet, so no existing session is prompted before the
// migration ships. Spelled as the `pubky-social-specs` package spells `MIGRATION_CAPS`, which a
// test asserts once the package is a dependency.
// - /pub/social/v1/:rw      - the public v1 tree the migration writes
// - /priv/social/v1/:rw     - feeds, bookmarks, mutes and the migration flag
// - /priv/app.pubky/v1/:rw  - the app's own files (settings, last read) imported after a run
// - /pub/pubky.app/:rw      - the legacy tree, still reachable for deletions of migrated objects
export const SOCIAL_V1_CAPABILITIES =
  '/pub/social/v1/:rw,/priv/social/v1/:rw,/priv/app.pubky/v1/:rw,/pub/pubky.app/:rw';
