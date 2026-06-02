import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_RUNTIME_DEFAULTS, PUBKY_RUNTIME_ENV_NAMES, type RuntimeConfig } from './network-config.schema';
import {
  escapeForInlineScript,
  getRuntimeConfig,
  readClientConfig,
  readServerConfig,
  resetRuntimeConfigForTests,
  RUNTIME_CONFIG_WINDOW_KEY,
  serializeRuntimeConfig,
} from './runtime-config';

const RUNTIME_ENV_VALUES: Record<keyof RuntimeConfig, string> = {
  nexusUrl: 'https://nexus.runtime.example.com',
  cdnUrl: 'https://nexus.runtime.example.com/static',
  homeserver: 'runtime-homeserver-key',
  homegateUrl: 'https://homegate.runtime.example.com',
  defaultHttpRelay: 'https://relay.runtime.example.com/inbox',
  pkarrRelays: '["https://pkarr.runtime.example.com"]',
  testnet: 'false',
};

function setAllRuntimeEnv(): void {
  for (const key of Object.keys(PUBKY_RUNTIME_ENV_NAMES) as (keyof RuntimeConfig)[]) {
    process.env[PUBKY_RUNTIME_ENV_NAMES[key]] = RUNTIME_ENV_VALUES[key];
  }
}

function clearAllRuntimeEnv(): void {
  for (const name of Object.values(PUBKY_RUNTIME_ENV_NAMES)) {
    delete process.env[name];
  }
}

describe('escapeForInlineScript', () => {
  it('escapes < (covers </script>) and the JS line separators', () => {
    const input = JSON.stringify({ a: '</script><b>', sep: '\u2028\u2029' });
    const output = escapeForInlineScript(input);

    expect(output).not.toContain('</script>');
    expect(output).not.toContain('<');
    expect(output).toContain('\\u003c');
    expect(output).toContain('\\u2028');
    expect(output).toContain('\\u2029');
  });

  it('preserves quotes, ampersands, and arrays', () => {
    const input = JSON.stringify({ url: 'https://x.example.com/?a=1&b=2', list: ['one', 'two'] });
    const output = escapeForInlineScript(input);

    // No < to escape; & and quotes are left intact and remain valid JSON/JS.
    expect(output).toBe(input);
    expect(JSON.parse(output)).toEqual({ url: 'https://x.example.com/?a=1&b=2', list: ['one', 'two'] });
  });
});

describe('runtime-config resolver', () => {
  beforeEach(() => {
    resetRuntimeConfigForTests();
    clearAllRuntimeEnv();
    delete window[RUNTIME_CONFIG_WINDOW_KEY];
  });

  afterEach(() => {
    resetRuntimeConfigForTests();
    clearAllRuntimeEnv();
    delete window[RUNTIME_CONFIG_WINDOW_KEY];
    vi.unstubAllEnvs();
  });

  /** Simulate a deployed (required) runtime: NODE_ENV=production and not under Vitest. */
  function simulateDeployedEnv(): void {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
  }

  describe('server', () => {
    it('parses PUBKY_RUNTIME_* when present', () => {
      setAllRuntimeEnv();
      const config = readServerConfig();
      expect(config.nexusUrl).toBe('https://nexus.runtime.example.com');
      expect(config.pkarrRelays).toEqual(['https://pkarr.runtime.example.com']);
      expect(config.testnet).toBe(false);
    });

    it('throws on partial PUBKY_RUNTIME_* config', () => {
      setAllRuntimeEnv();
      delete process.env[PUBKY_RUNTIME_ENV_NAMES.testnet];
      expect(() => readServerConfig()).toThrow();
    });

    it('falls back to NEXT_PUBLIC_* defaults in dev/test', () => {
      // No PUBKY_RUNTIME_* set; running under Vitest -> not required -> fallback.
      const config = readServerConfig();
      // Comes from src/config/test.ts (NEXT_PUBLIC_NEXUS_URL).
      expect(config.nexusUrl).toBe('https://nexus.staging.pubky.app');
      expect(config.testnet).toBe(true);
    });

    it('throws when required and no PUBKY_RUNTIME_* present', () => {
      simulateDeployedEnv();
      expect(() => readServerConfig()).toThrow(/Runtime config is required/);
    });

    it('does not throw during the production build phase', () => {
      simulateDeployedEnv();
      vi.stubEnv('NEXT_PHASE', 'phase-production-build');
      expect(() => readServerConfig()).not.toThrow();
    });
  });

  describe('client', () => {
    it('reads and validates window.__PUBKY_CONFIG__', () => {
      window[RUNTIME_CONFIG_WINDOW_KEY] = {
        ...NETWORK_RUNTIME_DEFAULTS,
        nexusUrl: 'https://nexus.injected.example.com',
      };
      const config = readClientConfig();
      expect(config.nexusUrl).toBe('https://nexus.injected.example.com');
    });

    it('throws when the injected config is invalid', () => {
      window[RUNTIME_CONFIG_WINDOW_KEY] = { nexusUrl: 'not-a-url' };
      expect(() => readClientConfig()).toThrow();
    });

    it('falls back to NEXT_PUBLIC_* defaults when not injected (no RootContainer needed)', () => {
      const config = readClientConfig();
      expect(config.nexusUrl).toBe('https://nexus.staging.pubky.app');
    });

    it('throws when required and not injected', () => {
      simulateDeployedEnv();
      expect(() => readClientConfig()).toThrow(/window.__PUBKY_CONFIG__/);
    });
  });

  describe('getRuntimeConfig + serializeRuntimeConfig', () => {
    it('memoizes and serializes a freeze-wrapped assignment', () => {
      window[RUNTIME_CONFIG_WINDOW_KEY] = { ...NETWORK_RUNTIME_DEFAULTS };
      const first = getRuntimeConfig();
      const second = getRuntimeConfig();
      expect(first).toBe(second);

      const serialized = serializeRuntimeConfig();
      expect(serialized.startsWith(`window.${RUNTIME_CONFIG_WINDOW_KEY}=Object.freeze(`)).toBe(true);
      expect(serialized).toContain(NETWORK_RUNTIME_DEFAULTS.nexusUrl);
    });
  });
});
