import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escapeForInlineScript,
  getRuntimeConfig,
  getSentryDsn,
  getSentryEnvironment,
  getSentryReplaysOnErrorSampleRate,
  getSentryReplaysSessionSampleRate,
  getSentryTracesSampleRate,
  readClientConfig,
  readServerConfig,
  resetRuntimeConfigForTests,
  RUNTIME_CONFIG_WINDOW_KEY,
  serializeRuntimeConfig,
  warnIfModerationDisabled,
} from './runtime-config';
import {
  NETWORK_RUNTIME_DEFAULTS,
  PUBKY_RUNTIME_ENV_NAMES,
  type RuntimeConfig,
  SENTRY_RUNTIME_DEFAULTS,
} from './runtime-config.schema';

const RUNTIME_ENV_VALUES: Partial<Record<keyof RuntimeConfig, string>> = {
  nexusUrl: 'https://nexus.runtime.example.com',
  cdnUrl: 'https://nexus.runtime.example.com/static',
  homeserver: 'runtime-homeserver-key',
  homeserverUrl: 'https://homeserver.runtime.example.com',
  homegateUrl: 'https://homegate.runtime.example.com',
  defaultHttpRelay: 'https://relay.runtime.example.com/inbox',
  pkarrRelays: '["https://pkarr.runtime.example.com"]',
  testnet: 'false',
  deployEnv: 'production',
  sentryDsn: 'https://abc123@o123.ingest.runtime.example.com/456',
  sentryEnvironment: 'staging',
  sentryTracesSampleRate: '0.5',
  sentryReplaysSessionSampleRate: '0.25',
  sentryReplaysOnErrorSampleRate: '1',
};

function setAllRuntimeEnv(): void {
  for (const key of Object.keys(RUNTIME_ENV_VALUES) as (keyof RuntimeConfig)[]) {
    process.env[PUBKY_RUNTIME_ENV_NAMES[key]] = RUNTIME_ENV_VALUES[key];
  }
}

/** Set only the REQUIRED network tier, leaving the optional Sentry tier unset. */
function setNetworkRuntimeEnv(): void {
  for (const key of Object.keys(NETWORK_RUNTIME_DEFAULTS) as (keyof RuntimeConfig)[]) {
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
      expect(config.sentryDsn).toBe('https://abc123@o123.ingest.runtime.example.com/456');
      expect(config.sentryEnvironment).toBe('staging');
      expect(config.sentryTracesSampleRate).toBe(0.5);
    });

    it('parses without the optional Sentry tier (disabled DSN, defaulted rates)', () => {
      setNetworkRuntimeEnv();
      const config = readServerConfig();
      expect(config.sentryDsn).toBeUndefined();
      expect(config.sentryEnvironment).toBeUndefined();
      expect(config.sentryTracesSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryTracesSampleRate);
      expect(config.sentryReplaysSessionSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryReplaysSessionSampleRate);
      expect(config.sentryReplaysOnErrorSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryReplaysOnErrorSampleRate);
    });

    it('strict-parses PUBKY_RUNTIME_* in deployed/required mode', () => {
      simulateDeployedEnv();
      setAllRuntimeEnv();
      const config = readServerConfig();
      expect(config.nexusUrl).toBe('https://nexus.runtime.example.com');
      expect(config.sentryEnvironment).toBe('staging');
    });

    it('throws on partial PUBKY_RUNTIME_* config in deployed/required mode', () => {
      simulateDeployedEnv();
      setAllRuntimeEnv();
      delete process.env[PUBKY_RUNTIME_ENV_NAMES.testnet];
      expect(() => readServerConfig()).toThrow(/Runtime config is incomplete or invalid/);
      expect(() => readServerConfig()).toThrow(/required PUBKY_RUNTIME_\* network variables/);
    });

    it('allows optional runtime tiers without forcing the required network tier in dev/test', () => {
      process.env[PUBKY_RUNTIME_ENV_NAMES.sentryDsn] = RUNTIME_ENV_VALUES.sentryDsn;
      process.env[PUBKY_RUNTIME_ENV_NAMES.siteName] = 'Runtime Site';
      const config = readServerConfig();

      expect(config.nexusUrl).toBe(NETWORK_RUNTIME_DEFAULTS.nexusUrl);
      expect(config.sentryDsn).toBe(RUNTIME_ENV_VALUES.sentryDsn);
      expect(config.siteName).toBe('Runtime Site');
    });

    it('resolves staging defaults when nothing is set in dev/test', () => {
      // No PUBKY_RUNTIME_* set (cleared in beforeEach); not required under Vitest -> staging defaults.
      const config = readServerConfig();
      expect(config.nexusUrl).toBe(NETWORK_RUNTIME_DEFAULTS.nexusUrl);
      // The staging default, spelled out:
      expect(config.nexusUrl).toBe('https://nexus.staging.pubky.app');
      expect(config.testnet).toBe(NETWORK_RUNTIME_DEFAULTS.testnet);
    });

    it('layers partial PUBKY_RUNTIME_* over staging defaults in dev/test', () => {
      // Partial overrides (e.g. `.env.local` pointing only nexus at localhost) never throw
      // outside deployed/required mode; unset values keep their staging defaults.
      process.env[PUBKY_RUNTIME_ENV_NAMES.nexusUrl] = 'http://localhost:8080';
      const config = readServerConfig();
      expect(config.nexusUrl).toBe('http://localhost:8080');
      expect(config.cdnUrl).toBe(NETWORK_RUNTIME_DEFAULTS.cdnUrl);
      expect(config.testnet).toBe(NETWORK_RUNTIME_DEFAULTS.testnet);
    });

    it('throws when required and no PUBKY_RUNTIME_* present', () => {
      simulateDeployedEnv();
      expect(() => readServerConfig()).toThrow(/Runtime config is incomplete or invalid/);
    });

    it('does not throw during the production build phase', () => {
      simulateDeployedEnv();
      vi.stubEnv('NEXT_PHASE', 'phase-production-build');
      expect(() => readServerConfig()).not.toThrow();
    });

    it('warns once when deployed configuration leaves moderation disabled', () => {
      simulateDeployedEnv();
      setNetworkRuntimeEnv();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = readServerConfig();

      expect(config.moderationId).toBeUndefined();
      warnIfModerationDisabled(config);
      warnIfModerationDisabled(config);

      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        '[runtime-config] PUBKY_RUNTIME_MODERATION_ID is unset; moderation matching and the default follow are disabled.',
      );
    });

    it('does not warn for a configured deployed moderation identity', () => {
      simulateDeployedEnv();
      setNetworkRuntimeEnv();
      process.env[PUBKY_RUNTIME_ENV_NAMES.moderationId] = 'nto4u7kkagk5hfjk4wgueemzy61nssic811hid1ty9u81uatmqzy';
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      warnIfModerationDisabled(readServerConfig());

      expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn when lenient parsing supplies the staging moderation identity', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      warnIfModerationDisabled(readServerConfig());

      expect(warn).not.toHaveBeenCalled();
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

    it('resolves staging defaults when not injected (no RootContainer needed)', () => {
      const config = readClientConfig();
      // The staging default, spelled out:
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

    it('omits unset optional Sentry values from the injected script (JSON drops undefined)', () => {
      window[RUNTIME_CONFIG_WINDOW_KEY] = { ...NETWORK_RUNTIME_DEFAULTS };
      const serialized = serializeRuntimeConfig();
      expect(serialized).not.toContain('sentryDsn');
      expect(serialized).not.toContain('sentryEnvironment');
      // Defaulted rates are always present so the client never re-derives them.
      expect(serialized).toContain('sentryTracesSampleRate');
    });
  });

  describe('Sentry getters', () => {
    it('expose the injected optional tier', () => {
      window[RUNTIME_CONFIG_WINDOW_KEY] = {
        ...NETWORK_RUNTIME_DEFAULTS,
        sentryDsn: 'https://abc123@o123.ingest.injected.example.com/456',
        sentryEnvironment: 'preview',
        sentryTracesSampleRate: 0.5,
        sentryReplaysSessionSampleRate: 0.25,
        sentryReplaysOnErrorSampleRate: 0.75,
      };

      expect(getSentryDsn()).toBe('https://abc123@o123.ingest.injected.example.com/456');
      expect(getSentryEnvironment()).toBe('preview');
      expect(getSentryTracesSampleRate()).toBe(0.5);
      expect(getSentryReplaysSessionSampleRate()).toBe(0.25);
      expect(getSentryReplaysOnErrorSampleRate()).toBe(0.75);
    });

    it('return undefined DSN/environment and defaulted rates when the tier is unset', () => {
      window[RUNTIME_CONFIG_WINDOW_KEY] = { ...NETWORK_RUNTIME_DEFAULTS };

      expect(getSentryDsn()).toBeUndefined();
      expect(getSentryEnvironment()).toBeUndefined();
      expect(getSentryTracesSampleRate()).toBe(SENTRY_RUNTIME_DEFAULTS.sentryTracesSampleRate);
      expect(getSentryReplaysSessionSampleRate()).toBe(SENTRY_RUNTIME_DEFAULTS.sentryReplaysSessionSampleRate);
      expect(getSentryReplaysOnErrorSampleRate()).toBe(SENTRY_RUNTIME_DEFAULTS.sentryReplaysOnErrorSampleRate);
    });
  });
});
