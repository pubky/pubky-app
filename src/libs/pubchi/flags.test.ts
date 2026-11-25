import { afterEach, describe, expect, it } from 'vitest';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { getPubchiQueryUrl, getPubchiUrlFor, isPubchiEnabled, isPubchiPanelEnabled, pubchiEndpointFor } from './flags';
import { PHASE0_PURPOSES } from './schemas/request';

function setPubchiEnv(enabled?: string, apiUrl?: string) {
  if (enabled === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = enabled;
  if (apiUrl === undefined) delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
  else process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = apiUrl;
  resetRuntimeConfigForTests();
}

describe('pubchi flags', () => {
  afterEach(() => {
    setPubchiEnv();
  });

  it('defaults to disabled with the panel hidden', () => {
    setPubchiEnv();
    expect(isPubchiEnabled()).toBe(false);
    expect(isPubchiPanelEnabled()).toBe(false);
  });

  it('hides the panel when the flag is on but the API URL is empty', () => {
    setPubchiEnv('true', '');
    expect(isPubchiEnabled()).toBe(true);
    expect(isPubchiPanelEnabled()).toBe(false);
  });

  it('shows the panel only when the flag and API URL are set', () => {
    setPubchiEnv('true', 'https://pubchi.example.com');
    expect(isPubchiEnabled()).toBe(true);
    expect(isPubchiPanelEnabled()).toBe(true);
    expect(getPubchiQueryUrl()).toBe('https://pubchi.example.com/v1/query');
    expect(getPubchiUrlFor('who-tagged-me')).toBe('https://pubchi.example.com/v1/query');
    expect(getPubchiUrlFor('build-feed')).toBe('https://pubchi.example.com/v1/feed');
    expect(getPubchiUrlFor('what-i-missed')).toBeUndefined();
    expect(getPubchiUrlFor('summarize')).toBeUndefined();
  });
});

describe('pubchiEndpointFor', () => {
  it('maps who-tagged-me to /v1/query', () => {
    expect(pubchiEndpointFor('who-tagged-me')).toBe('/v1/query');
  });

  it('maps build-feed to /v1/feed', () => {
    expect(pubchiEndpointFor('build-feed')).toBe('/v1/feed');
  });

  it('refuses Phase 0 purposes the service does not serve', () => {
    expect(pubchiEndpointFor('what-i-missed')).toBeUndefined();
    expect(pubchiEndpointFor('summarize')).toBeUndefined();
  });

  it('covers every PHASE0_PURPOSE', () => {
    const mapped = PHASE0_PURPOSES.map((purpose) => [purpose, pubchiEndpointFor(purpose)] as const);
    expect(mapped).toEqual([
      ['ask', '/v1/query'],
      ['who-tagged-me', '/v1/query'],
      ['build-feed', '/v1/feed'],
      ['what-i-missed', undefined],
      ['summarize', undefined],
    ]);
  });
});
