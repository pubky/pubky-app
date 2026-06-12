import { describe, expect, it } from 'vitest';
import {
  NETWORK_RUNTIME_DEFAULTS,
  runtimeConfigValueSchema,
  runtimeEnvInputSchema,
  runtimeEnvInputSchemaWithDefaults,
} from './network-config.schema';

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
});

describe('runtimeConfigValueSchema', () => {
  it('accepts an already-parsed config object', () => {
    expect(() => runtimeConfigValueSchema.parse(NETWORK_RUNTIME_DEFAULTS)).not.toThrow();
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
    expect(parsed).toEqual(NETWORK_RUNTIME_DEFAULTS);
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
