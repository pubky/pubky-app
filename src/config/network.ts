import {
  getDefaultHttpRelay,
  getExchangeRateApi,
  getHomegateUrl,
  getHomeserver,
  getHomeserverUrl,
  getPkarrRelays,
  getTestnet,
} from '@/libs/runtime-config/runtime-config';

// Runtime-configurable: read via getters at call time (PUBKY_RUNTIME_* in deployed environments,
// staging defaults in dev/test). See @/libs/runtime-config.
export {
  getDefaultHttpRelay,
  getExchangeRateApi,
  getHomegateUrl,
  getHomeserver,
  getHomeserverUrl,
  getPkarrRelays,
  getTestnet,
};
