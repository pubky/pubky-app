import { describe, expect, it } from 'vitest';
import {
  NETWORK_RUNTIME_DEFAULTS,
  runtimeConfigValueSchema,
  runtimeEnvInputSchema,
  runtimeEnvInputSchemaWithDefaults,
  SENTRY_RUNTIME_DEFAULTS,
} from './runtime-config.schema';

const VALID_ENV_INPUT = {
  nexusUrl: 'https://nexus.example.com',
  cdnUrl: 'https://nexus.example.com/static',
  homeserver: 'some-homeserver-key',
  homeserverUrl: 'https://homeserver.example.com',
  homegateUrl: 'https://homegate.example.com',
  defaultHttpRelay: 'https://relay.example.com/inbox',
  pkarrRelays: '["https://pkarr.example.com"]',
  testnet: 'true',
};

const SENTRY_ENV_INPUT = {
  sentryDsn: 'https://abc123@o123.ingest.example.com/456',
  sentryEnvironment: 'staging',
  sentryTracesSampleRate: '0.5',
  sentryReplaysSessionSampleRate: '0.25',
  sentryReplaysOnErrorSampleRate: '1',
};

describe('runtimeEnvInputSchema', () => {
  it('parses string PKARR_RELAYS and TESTNET into parsed shapes', () => {
    const parsed = runtimeEnvInputSchema.parse(VALID_ENV_INPUT);

    expect(parsed.pkarrRelays).toEqual(['https://pkarr.example.com']);
    expect(parsed.testnet).toBe(true);
    // Output must satisfy the parsed value schema.
    expect(() => runtimeConfigValueSchema.parse(parsed)).not.toThrow();
  });

  it('throws on partial config (missing a required value)', () => {
    const { testnet: _testnet, ...partial } = VALID_ENV_INPUT;
    expect(() => runtimeEnvInputSchema.parse(partial)).toThrow();
  });

  it('throws on malformed PKARR_RELAYS JSON', () => {
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, pkarrRelays: 'not-json' })).toThrow();
  });

  it('parses WITHOUT the optional Sentry tier (disabled DSN, defaulted rates)', () => {
    const parsed = runtimeEnvInputSchema.parse(VALID_ENV_INPUT);

    expect(parsed.sentryDsn).toBeUndefined();
    expect(parsed.sentryEnvironment).toBeUndefined();
    expect(parsed.sentryTracesSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryTracesSampleRate);
    expect(parsed.sentryReplaysSessionSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryReplaysSessionSampleRate);
    expect(parsed.sentryReplaysOnErrorSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryReplaysOnErrorSampleRate);
  });

  it('parses the Sentry tier when provided (string rates become numbers)', () => {
    const parsed = runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, ...SENTRY_ENV_INPUT });

    expect(parsed.sentryDsn).toBe('https://abc123@o123.ingest.example.com/456');
    expect(parsed.sentryEnvironment).toBe('staging');
    expect(parsed.sentryTracesSampleRate).toBe(0.5);
    expect(parsed.sentryReplaysSessionSampleRate).toBe(0.25);
    expect(parsed.sentryReplaysOnErrorSampleRate).toBe(1);
  });

  it('treats an empty/whitespace DSN as unset (Sentry disabled)', () => {
    expect(runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryDsn: '' }).sentryDsn).toBeUndefined();
    expect(runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryDsn: '   ' }).sentryDsn).toBeUndefined();
  });

  it('throws on a malformed DSN (fail loud instead of silently disabling)', () => {
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryDsn: 'not-a-url' })).toThrow();
  });

  it('throws on out-of-range sample rates', () => {
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryTracesSampleRate: '1.5' })).toThrow();
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryTracesSampleRate: 'abc' })).toThrow();
  });
});

describe('runtimeConfigValueSchema', () => {
  it('accepts an already-parsed config object (Sentry tier optional, rates defaulted)', () => {
    const parsed = runtimeConfigValueSchema.parse(NETWORK_RUNTIME_DEFAULTS);
    expect(parsed.sentryDsn).toBeUndefined();
    expect(parsed.sentryTracesSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryTracesSampleRate);
  });

  it('accepts an already-parsed config object with the Sentry tier present', () => {
    const parsed = runtimeConfigValueSchema.parse({
      ...NETWORK_RUNTIME_DEFAULTS,
      sentryDsn: 'https://abc123@o123.ingest.example.com/456',
      sentryEnvironment: 'production',
      sentryTracesSampleRate: 0.2,
    });
    expect(parsed.sentryDsn).toBe('https://abc123@o123.ingest.example.com/456');
    expect(parsed.sentryEnvironment).toBe('production');
    expect(parsed.sentryTracesSampleRate).toBe(0.2);
  });

  it('rejects raw string inputs (proves the env/value schema split is necessary)', () => {
    // testnet as a string and pkarrRelays as a JSON string must NOT validate here.
    expect(() => runtimeConfigValueSchema.parse(VALID_ENV_INPUT)).toThrow();
  });
});

describe('runtimeEnvInputSchemaWithDefaults', () => {
  it('produces parsed defaults from fully undefined input', () => {
    const parsed = runtimeEnvInputSchemaWithDefaults.parse({});

    // Defaults must come out PARSED, not as strings.
    expect(parsed).toEqual({ ...NETWORK_RUNTIME_DEFAULTS, ...SENTRY_RUNTIME_DEFAULTS });
    expect(Array.isArray(parsed.pkarrRelays)).toBe(true);
    expect(typeof parsed.testnet).toBe('boolean');
  });

  it('honors provided values over defaults', () => {
    const parsed = runtimeEnvInputSchemaWithDefaults.parse({
      nexusUrl: 'https://override.example.com',
      pkarrRelays: '["https://relay.override.com"]',
      testnet: 'true',
    });

    expect(parsed.nexusUrl).toBe('https://override.example.com');
    expect(parsed.pkarrRelays).toEqual(['https://relay.override.com']);
    expect(parsed.testnet).toBe(true);
    // Unset fields fall back to defaults.
    expect(parsed.cdnUrl).toBe(NETWORK_RUNTIME_DEFAULTS.cdnUrl);
  });
});
