import { type LogEvent, Pulse } from '@synonymdev/pubky-pulse-web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INLINE_IMAGE_UPLOAD_REJECTION_NAME } from '@/hooks/useInlineImageUpload/useInlineImageUpload.types';
import { Env } from '@/libs/env/env';
import { ClientErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { resetRuntimeConfigForTests, RUNTIME_CONFIG_WINDOW_KEY } from '@/libs/runtime-config/runtime-config';
import { NETWORK_RUNTIME_DEFAULTS } from '@/libs/runtime-config/runtime-config.schema';
import { PUBKY_52_STAGING_FIXTURE as PUBLIC_KEY } from '@/test-utils/pubky';
import { beforeSendPulse, initPulse, pulseScreenName } from './pulse';
import { PULSE_CONSENT_KEY } from './pulse-consent';

// Fresh module registry so the SDK mock below reaches error.factories, already imported by env.ts.
vi.hoisted(() => vi.resetModules());
vi.mock('@/libs/env/env', () => ({ Env: { NODE_ENV: 'production', NEXT_PUBLIC_APP_VERSION: 'test' } }));
vi.mock('@synonymdev/pubky-pulse-web', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@synonymdev/pubky-pulse-web')>()),
  Pulse: { init: vi.fn(), captureException: vi.fn() },
}));

const LOCAL_ENDPOINT = 'http://127.0.0.1:4007';

function inject(overrides: Record<string, unknown> = {}) {
  window[RUNTIME_CONFIG_WINDOW_KEY] = {
    ...NETWORK_RUNTIME_DEFAULTS,
    pulseClientKey: 'pulse_client_local_test_only',
    pulseEndpoint: LOCAL_ENDPOINT,
    ...overrides,
  };
}

function event(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    client_event_id: '00000000-0000-4000-8000-000000000001',
    session_id: '00000000-0000-4000-8000-000000000002',
    user_id: 'anonymous-browser-id',
    level: 'error',
    message: 'Unexpected failure',
    environment: 'web',
    sdk_name: 'pubky-pulse-web',
    sdk_version: '0.8.0',
    is_dev: true,
    timestamp: '2026-09-08T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRuntimeConfigForTests();
  inject();
  localStorage.setItem(PULSE_CONSENT_KEY, 'accepted');
});

afterEach(() => {
  Env.NODE_ENV = 'production';
  delete window[RUNTIME_CONFIG_WINDOW_KEY];
  resetRuntimeConfigForTests();
  localStorage.removeItem(PULSE_CONSENT_KEY);
});

describe('optional Pulse initialization', () => {
  it('never initializes without a configured client key', () => {
    inject({ pulseClientKey: undefined, pulseEndpoint: undefined });
    initPulse();
    expect(Pulse.init).not.toHaveBeenCalled();
  });
  it('wires app configuration, privacy hooks and the existing ignore policy', () => {
    initPulse();
    expect(Pulse.init).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'pulse_client_local_test_only',
      endpoint: LOCAL_ENDPOINT,
      enabled: true,
      appVersion: 'test',
      isDev: true,
      consoleLogging: false,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Failed to fetch',
        /Loading chunk \d+ failed/,
        'AbortError',
        'Non-Error promise rejection captured',
        INLINE_IMAGE_UPLOAD_REJECTION_NAME,
        /window\.webkit\.messageHandlers/,
        /Java object is gone/,
        /Java exception was raised during method invocation/,
        /Failed to connect to MetaMask/,
      ],
      networkTracking: { urlMode: 'origin', sampleRate: 0 },
      screenNameForPath: pulseScreenName,
      beforeSend: beforeSendPulse,
    });
  });
  it('marks production deploys as non-development', () => {
    inject({ deployEnv: 'production' });
    initPulse();
    expect(Pulse.init).toHaveBeenCalledWith(expect.objectContaining({ isDev: false }));
  });
  it('cannot break the app when runtime-config getters fail before SDK init', () => {
    inject({ pulseEndpoint: 'invalid' });
    expect(initPulse).not.toThrow();
    expect(Pulse.init).not.toHaveBeenCalled();
  });
  it('disables collectors in app test environments', () => {
    Env.NODE_ENV = 'test';
    initPulse();
    expect(Pulse.init).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe('route privacy', () => {
  it.each([
    ['/', '/'],
    ['/home/', '/home'],
    ['/feed', '/unknown'],
    ['/profile/tags', '/profile/tags'],
    ['/search?q=private#secret', '/search'],
    ['/settings/privacy-safety', '/settings/privacy-safety'],
    [`/profile/${PUBLIC_KEY}`, '/profile/[pubky]'],
    [`/profile/${PUBLIC_KEY}/followers`, '/profile/[pubky]/followers'],
    [`/post/${PUBLIC_KEY}/private-post`, '/post/[userId]/[postId]'],
    [`/collections/${PUBLIC_KEY}/private-post`, '/collections/[userId]/[postId]'],
    ['/collections/bookmarks', '/collections/bookmarks'],
    ['/feed/private-feed', '/feed/[id]'],
    ['/invite/private-code', '/invite/[inviteCode]'],
    ['/unknown/private-path', '/unknown'],
    ['/profile/user/private-tab', '/unknown'],
    ['/settings/private-setting', '/unknown'],
  ])('maps %s to %s', (path, expected) => {
    expect(pulseScreenName(path)).toBe(expected);
  });
});

describe('shared capture and privacy policy', () => {
  it('scrubs messages, stacks and attributes but preserves anonymous SDK attribution', () => {
    const input = event({
      message: `Failed for ${PUBLIC_KEY}`,
      custom_attributes: { _error_stack: 'Error: person@example.com', email: 'person@example.com', service: 'Nexus' },
    });
    const result = beforeSendPulse(input, {})!;
    expect(JSON.stringify(result)).not.toContain(PUBLIC_KEY);
    expect(JSON.stringify(result)).not.toContain('person@example.com');
    expect(result.user_id).toBe('anonymous-browser-id');
    expect(result.session_id).toBe(input.session_id);
    expect(result.custom_attributes?.service).toBe('Nexus');
  });
  it('wires factory capture and allows only reviewed operational metadata', () => {
    const error = Err.server(ServerErrorCode.INTERNAL_ERROR, 'Read failed', {
      service: ErrorService.Nexus,
      operation: 'fetchNexus',
      context: { email: 'private@example.com' },
    });
    expect(Pulse.captureException).toHaveBeenCalledExactlyOnceWith(error);
    const result = beforeSendPulse(event(), { originalException: error });
    expect(result?.custom_attributes).toEqual({
      category: ErrorCategory.Server,
      code: ServerErrorCode.INTERNAL_ERROR,
      service: ErrorService.Nexus,
      operation: 'fetchNexus',
    });
  });
  it('captures only the root AppError and drops wrappers reaching the SDK hook', () => {
    const params = { service: ErrorService.Nexus, operation: 'fetchNexus' };
    const root = Err.server(ServerErrorCode.INTERNAL_ERROR, 'Read failed', params);
    const wrapper = Err.server(ServerErrorCode.INTERNAL_ERROR, 'Wrapped failure', { ...params, cause: root });
    expect(Pulse.captureException).toHaveBeenCalledExactlyOnceWith(root);
    expect(beforeSendPulse(event(), { originalException: root })).not.toBeNull();
    expect(beforeSendPulse(event(), { originalException: wrapper })).toBeNull();
  });
  it('retains the app-specific drop policy using the original exception hint', () => {
    const error = Err.client(ClientErrorCode.NOT_FOUND, 'Not found', {
      service: ErrorService.Nexus,
      operation: 'fetchNexus',
      context: { statusCode: 404, endpoint: 'https://example.com/v0/post/user/post/tags' },
    });
    expect(beforeSendPulse(event(), { originalException: error })).toBeNull();
  });
});
