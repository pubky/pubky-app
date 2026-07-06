import {
  getDefaultHttpRelay,
  getExchangeRateApi,
  getHomegateUrl,
  getHomeserver,
  getHomeserverUrl,
  getPkarrRelays,
  getTestnet,
} from '@/libs/runtime-config/runtime-config';

// Runtime-configurable: read via getters at call time (values come from PUBKY_RUNTIME_* in
// deployed environments, NEXT_PUBLIC_* defaults locally). See @/libs/runtime-config.
export {
  getDefaultHttpRelay,
  getExchangeRateApi,
  getHomegateUrl,
  getHomeserver,
  getHomeserverUrl,
  getPkarrRelays,
  getTestnet,
};
