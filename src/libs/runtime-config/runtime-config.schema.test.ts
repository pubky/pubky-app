import { describe, expect, it } from 'vitest';
import {
  APP_RUNTIME_DEFAULTS,
  NETWORK_RUNTIME_DEFAULTS,
  runtimeConfigValueSchema,
  runtimeEnvInputSchema,
  runtimeEnvInputSchemaWithDefaults,
  SENTRY_RUNTIME_DEFAULTS,
} from './runtime-config.schema';

const VALID_MODERATION_ID = 'euwmq57zefw5ynnkhh37b3gcmhs7g3cptdbw1doaxj1pbmzp3wro';

const VALID_ENV_INPUT = {
  nexusUrl: 'https://nexus.example.com',
  cdnUrl: 'https://nexus.example.com/static',
  homeserver: 'some-homeserver-key',
  homeserverUrl: 'https://homeserver.example.com',
  homegateUrl: 'https://homegate.example.com',
  defaultHttpRelay: 'https://relay.example.com/inbox',
  pkarrRelays: '["https://pkarr.example.com"]',
  testnet: 'true',
  deployEnv: 'production',
};

const SENTRY_ENV_INPUT = {
  sentryDsn: 'https://abc123@o123.ingest.example.com/456',
  sentryEnvironment: 'staging',
  sentryTracesSampleRate: '0.5',
  sentryReplaysSessionSampleRate: '0.25',
  sentryReplaysOnErrorSampleRate: '1',
};

const APP_ENV_INPUT = {
  notificationPollIntervalMs: '1234',
  notificationPollOnStart: 'false',
  streamFetchLimit: '25',
  maxStreamTags: '7',
  ttlPostMs: '45000',
  moderationId: VALID_MODERATION_ID,
  moderatedTags: '["spam","nudity"]',
  exchangeRateApi: 'https://rates.example.com/btc',
  plausibleDomain: 'example.com',
  plausibleScriptUrl: 'https://analytics.example.com/script.js',
  siteName: 'Example App',
  defaultUrl: 'https://app.example.com',
  pubkyRingUrl: 'https://ring.example.com',
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

  it('throws when PUBKY_RUNTIME_ENV is missing (deploy identity is required)', () => {
    const { deployEnv: _deployEnv, ...partial } = VALID_ENV_INPUT;
    expect(() => runtimeEnvInputSchema.parse(partial)).toThrow();
  });

  it('throws on an invalid PUBKY_RUNTIME_ENV value', () => {
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, deployEnv: 'prod' })).toThrow();
  });

  it('parses both deploy identities', () => {
    expect(runtimeEnvInputSchema.parse(VALID_ENV_INPUT).deployEnv).toBe('production');
    expect(runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, deployEnv: 'staging' }).deployEnv).toBe('staging');
  });

  it('throws on malformed PKARR_RELAYS JSON', () => {
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, pkarrRelays: 'not-json' })).toThrow();
  });

  it('throws on invalid TESTNET value', () => {
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, testnet: 'tru' })).toThrow();
  });

  it('parses WITHOUT the optional Sentry tier (disabled DSN, defaulted rates)', () => {
    const parsed = runtimeEnvInputSchema.parse(VALID_ENV_INPUT);

    expect(parsed.sentryDsn).toBeUndefined();
    expect(parsed.sentryEnvironment).toBeUndefined();
    expect(parsed.sentryTracesSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryTracesSampleRate);
    expect(parsed.sentryReplaysSessionSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryReplaysSessionSampleRate);
    expect(parsed.sentryReplaysOnErrorSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryReplaysOnErrorSampleRate);
    expect(parsed.moderationId).toBeUndefined();
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
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryTracesSampleRate: '0.5abc' })).toThrow();
  });

  it('accepts valid sample-rate boundaries', () => {
    expect(
      runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryTracesSampleRate: '0' }).sentryTracesSampleRate,
    ).toBe(0);
    expect(
      runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryTracesSampleRate: '0.5' }).sentryTracesSampleRate,
    ).toBe(0.5);
    expect(
      runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryTracesSampleRate: '1' }).sentryTracesSampleRate,
    ).toBe(1);
    expect(
      runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, sentryTracesSampleRate: '1.0' }).sentryTracesSampleRate,
    ).toBe(1);
  });

  it('parses defaulted app/deployer values when provided', () => {
    const parsed = runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, ...APP_ENV_INPUT });

    expect(parsed.notificationPollIntervalMs).toBe(1234);
    expect(parsed.notificationPollOnStart).toBe(false);
    expect(parsed.streamFetchLimit).toBe(25);
    expect(parsed.maxStreamTags).toBe(7);
    expect(parsed.moderationId).toBe(VALID_MODERATION_ID);
    expect(parsed.moderatedTags).toEqual(['spam', 'nudity']);
    expect(parsed.exchangeRateApi).toBe('https://rates.example.com/btc');
    expect(parsed.siteName).toBe('Example App');
    expect(parsed.defaultUrl).toBe('https://app.example.com');
  });

  it('accepts an empty MODERATED_TAGS JSON array as no moderated tags', () => {
    const parsed = runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, moderatedTags: '[]' });

    expect(parsed.moderatedTags).toEqual([]);
  });

  it('falls back to default moderatedTags when unset or blank', () => {
    expect(runtimeEnvInputSchema.parse(VALID_ENV_INPUT).moderatedTags).toEqual(APP_RUNTIME_DEFAULTS.moderatedTags);
    expect(runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, moderatedTags: '' }).moderatedTags).toEqual(
      APP_RUNTIME_DEFAULTS.moderatedTags,
    );
    expect(runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, moderatedTags: '   ' }).moderatedTags).toEqual(
      APP_RUNTIME_DEFAULTS.moderatedTags,
    );
  });

  it('throws on invalid optional boolean values', () => {
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, notificationPollOnStart: 'tru' })).toThrow();
    expect(() => runtimeEnvInputSchemaWithDefaults.parse({ streamPollOnStart: 'yes' })).toThrow();
  });

  it('throws on invalid optional integer values', () => {
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, ttlPostMs: '123abc' })).toThrow();
    expect(() => runtimeEnvInputSchemaWithDefaults.parse({ maxStreamTags: '0' })).toThrow();
  });

  it('rejects an invalid configured moderation Pubky', () => {
    expect(() => runtimeEnvInputSchema.parse({ ...VALID_ENV_INPUT, moderationId: 'moderation-key' })).toThrow(
      'Expected a 52-character z-base-32 Pubky',
    );
  });

  it('trims a padded valid moderation Pubky before validation', () => {
    const parsed = runtimeEnvInputSchema.parse({
      ...VALID_ENV_INPUT,
      moderationId: `  ${VALID_MODERATION_ID}\n`,
    });

    expect(parsed.moderationId).toBe(VALID_MODERATION_ID);
  });
});

describe('runtimeConfigValueSchema', () => {
  it('accepts an already-parsed config object (Sentry tier optional, rates defaulted)', () => {
    const parsed = runtimeConfigValueSchema.parse(NETWORK_RUNTIME_DEFAULTS);
    expect(parsed.sentryDsn).toBeUndefined();
    expect(parsed.sentryTracesSampleRate).toBe(SENTRY_RUNTIME_DEFAULTS.sentryTracesSampleRate);
    expect(parsed.notificationPollIntervalMs).toBe(APP_RUNTIME_DEFAULTS.notificationPollIntervalMs);
    expect(parsed.moderatedTags).toEqual(APP_RUNTIME_DEFAULTS.moderatedTags);
    expect(parsed.moderationId).toBeUndefined();
  });

  it('accepts an empty moderatedTags array (no moderated tags)', () => {
    const parsed = runtimeConfigValueSchema.parse({
      ...NETWORK_RUNTIME_DEFAULTS,
      moderatedTags: [],
    });

    expect(parsed.moderatedTags).toEqual([]);
  });

  it('accepts a valid non-default moderation Pubky', () => {
    const moderationId = 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';
    const parsed = runtimeConfigValueSchema.parse({
      ...NETWORK_RUNTIME_DEFAULTS,
      moderationId,
    });

    expect(parsed.moderationId).toBe(moderationId);
  });

  it('trims a padded valid moderation Pubky in parsed runtime values', () => {
    const parsed = runtimeConfigValueSchema.parse({
      ...NETWORK_RUNTIME_DEFAULTS,
      moderationId: `\t${VALID_MODERATION_ID} `,
    });

    expect(parsed.moderationId).toBe(VALID_MODERATION_ID);
  });

  it('rejects invalid moderation Pubkys', () => {
    expect(() =>
      runtimeConfigValueSchema.parse({ ...NETWORK_RUNTIME_DEFAULTS, moderationId: 'moderation-key' }),
    ).toThrow('Expected a 52-character z-base-32 Pubky');
    expect(() =>
      runtimeConfigValueSchema.parse({ ...NETWORK_RUNTIME_DEFAULTS, moderationId: `${VALID_MODERATION_ID}a` }),
    ).toThrow('Expected a 52-character z-base-32 Pubky');
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
    expect(parsed).toEqual({ ...NETWORK_RUNTIME_DEFAULTS, ...SENTRY_RUNTIME_DEFAULTS, ...APP_RUNTIME_DEFAULTS });
    expect(Array.isArray(parsed.pkarrRelays)).toBe(true);
    expect(typeof parsed.testnet).toBe('boolean');
    expect(parsed.moderationId).toBe(APP_RUNTIME_DEFAULTS.moderationId);
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

  it('defaults the deploy identity to staging and honors an explicit production override', () => {
    expect(runtimeEnvInputSchemaWithDefaults.parse({}).deployEnv).toBe('staging');
    expect(runtimeEnvInputSchemaWithDefaults.parse({ deployEnv: 'production' }).deployEnv).toBe('production');
  });

  it('uses the validated staging moderation identity when the lenient input is blank', () => {
    const parsed = runtimeEnvInputSchemaWithDefaults.parse({ moderationId: '   ' });

    expect(parsed.moderationId).toBe(APP_RUNTIME_DEFAULTS.moderationId);
  });

  it('rejects an invalid moderation identity provided to the lenient parser', () => {
    expect(() => runtimeEnvInputSchemaWithDefaults.parse({ moderationId: 'moderation-key' })).toThrow(
      'Expected a 52-character z-base-32 Pubky',
    );
  });
});
