import {
  getDefaultHttpRelay,
  getDeployEnv,
  getExchangeRateApi,
  getHomegateUrl,
  getHomeserver,
  getHomeserverUrl,
  getLockServer,
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
  getPaykitServerUrl,
  getPkarrRelays,
  getTestnet,
};

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
// - /pub/pubky.app/:rw   — the app's public data
// - /priv/social/:rw     — where unlocked lock content is copied (reader replication)
// - /priv/locks.app/:r   — read-only: a creator reads their OWN guarded original here (Ring sessions)
export const HOMESERVER_CAPABILITIES = '/pub/pubky.app/:rw,/priv/social/:rw,/priv/locks.app/:r';
