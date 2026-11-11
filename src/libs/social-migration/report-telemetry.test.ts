import type { MigrationReport } from 'pubky-social-migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/libs/error/error';
import { AuthErrorCode, NetworkErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { SENSITIVE_VALUE_REDACTED } from '@/libs/observability/sentry.constants';
import { sanitizeForSentry } from '@/libs/observability/sentry.utils';
import { asOpaque } from '@/test-utils/type-assertions';
import {
  logSocialMigrationFinished,
  reportSocialMigrationBlocked,
  reportSocialMigrationCapsMissing,
  reportSocialMigrationEngineUnavailable,
  reportSocialMigrationFailure,
  resetSocialMigrationReports,
} from './report-telemetry';

const report = (partial: Partial<MigrationReport>): MigrationReport =>
  asOpaque<MigrationReport>({
    status: 'incomplete',
    done: 3,
    total: 9,
    counts: { written: 2, io_error: 1 },
    dropped: 0,
    skipped: { io_error: ['/pub/pubky.app/posts/private-path'] },
    notes: [{ path: '/pub/pubky.app/posts/private-path', message: 'detail' }],
    droppedValues: { 'pub/pubky.app/profile.json': ['profile_image'] },
    ...partial,
  });

describe('social migration telemetry', () => {
  beforeEach(() => resetSocialMigrationReports());
  afterEach(() => vi.restoreAllMocks());

  it('captures a blocked run once per account and code, with counts only', () => {
    const server = vi.spyOn(Err, 'server');
    reportSocialMigrationBlocked({ pubky: 'a', report: report({}), attempt: 4 });
    reportSocialMigrationBlocked({ pubky: 'a', report: report({}), attempt: 5 });
    reportSocialMigrationBlocked({ pubky: 'b', report: report({}), attempt: 1 });
    reportSocialMigrationBlocked({
      pubky: 'a',
      report: report({ status: 'paused', error: { code: 'QUOTA', message: '', needBytes: 10 } }),
      attempt: 6,
    });

    expect(server).toHaveBeenCalledTimes(3);
    const [, , params] = server.mock.calls[0];
    expect(params).toEqual({
      service: ErrorService.Homeserver,
      operation: 'socialMigration',
      context: {
        status: 'incomplete',
        code: undefined,
        done: 3,
        total: 9,
        dropped: 0,
        counts: { written: 2, io_error: 1 },
        attempt: 4,
      },
    });
    expect(server.mock.calls[2][2].context).toMatchObject({ code: 'QUOTA', needBytes: 10 });
    expect(JSON.stringify(server.mock.calls)).not.toContain('private-path');
    expect(JSON.stringify(server.mock.calls)).not.toContain('profile_image');
  });

  it('files an unreachable homeserver as unavailable and an unknown stop as unknown', () => {
    const server = vi.spyOn(Err, 'server');
    reportSocialMigrationBlocked({ pubky: 'a', report: report({ status: 'incomplete' }), attempt: 1 });
    reportSocialMigrationBlocked({
      pubky: 'a',
      report: report({ status: 'aborted', error: { code: 'PRIV_UNSUPPORTED', message: '' } }),
      attempt: 1,
    });
    reportSocialMigrationBlocked({
      pubky: 'a',
      report: report({ status: 'aborted', error: { code: 'UNSUPPORTED_EPOCH', message: '' } }),
      attempt: 1,
    });
    expect(server.mock.calls.map(([code]) => code)).toEqual([
      ServerErrorCode.SERVICE_UNAVAILABLE,
      ServerErrorCode.SERVICE_UNAVAILABLE,
      ServerErrorCode.UNKNOWN_ERROR,
    ]);
  });

  it('captures a scope refusal as forbidden with the scopes asked for', () => {
    const auth = vi.spyOn(Err, 'auth');
    reportSocialMigrationCapsMissing({
      pubky: 'a',
      report: report({ status: 'aborted', error: { code: 'CAPS_MISSING', message: '', caps: '/pub/social/v1/:rw' } }),
    });
    reportSocialMigrationCapsMissing({ pubky: 'a', report: report({}) });
    expect(auth).toHaveBeenCalledExactlyOnceWith(
      AuthErrorCode.FORBIDDEN,
      expect.any(String),
      expect.objectContaining({
        operation: 'socialMigration',
        context: expect.objectContaining({ caps: '/pub/social/v1/:rw' }),
      }),
    );
  });

  it('captures a thrown engine error once, by its shape and never its message or cause', () => {
    const server = vi.spyOn(Err, 'server');
    reportSocialMigrationFailure({
      pubky: 'a',
      error: new TypeError('fetch failed for /pub/pubky.app/posts/private-path'),
      attempt: 2,
    });
    reportSocialMigrationFailure({ pubky: 'a', error: new Error('again'), attempt: 3 });
    expect(server).toHaveBeenCalledExactlyOnceWith(ServerErrorCode.UNKNOWN_ERROR, 'Social migration failed', {
      service: ErrorService.Homeserver,
      operation: 'socialMigration',
      context: { attempt: 2, errorName: 'TypeError', kind: undefined, status: undefined },
    });
    const [, , params] = server.mock.calls[0];
    expect(params).not.toHaveProperty('cause');
    expect(JSON.stringify(server.mock.calls)).not.toContain('private-path');

    // The type survives the Sentry scrubber, which redacts every value under a `name` key
    const scrubbed = sanitizeForSentry(params.context);
    expect(scrubbed).toMatchObject({ attempt: 2, errorName: 'TypeError' });
    expect(JSON.stringify(scrubbed)).not.toContain('private-path');
    expect(sanitizeForSentry({ name: 'TypeError' })).toEqual({ name: SENSITIVE_VALUE_REDACTED });
  });

  it('reports an unavailable engine once per account, with the import rejection as the cause', () => {
    const network = vi.spyOn(Err, 'network');
    const loadFailure = () =>
      new AppError({
        category: ErrorCategory.Network,
        code: NetworkErrorCode.CONNECTION_FAILED,
        message: 'Could not load the migration engine',
        service: ErrorService.Homeserver,
        operation: 'migrateToSocialV1',
        cause: new TypeError('Failed to fetch dynamically imported module'),
      });
    reportSocialMigrationEngineUnavailable({ pubky: 'a', error: loadFailure(), attempt: 1 });
    reportSocialMigrationEngineUnavailable({ pubky: 'a', error: loadFailure(), attempt: 2 });
    reportSocialMigrationEngineUnavailable({ pubky: 'b', error: loadFailure(), attempt: 1 });
    expect(network).toHaveBeenCalledTimes(2);
    const [code, , params] = network.mock.calls[0];
    expect(code).toBe(NetworkErrorCode.CONNECTION_FAILED);
    // The import's own rejection, not the service's AppError: an AppError in the chain reads as already captured
    expect(params.cause).toBeInstanceOf(TypeError);
    expect(params.context).toEqual({ attempt: 1, errorName: 'TypeError', kind: undefined, status: undefined });
  });

  it('describes a thrown AppError by its category and HTTP status only', () => {
    const server = vi.spyOn(Err, 'server');
    reportSocialMigrationFailure({
      pubky: 'b',
      error: new AppError({
        category: ErrorCategory.Network,
        code: NetworkErrorCode.CONNECTION_FAILED,
        message: 'Could not load /pub/pubky.app/posts/private-path',
        service: ErrorService.Homeserver,
        operation: 'migrateToSocialV1',
        context: { statusCode: 502, url: 'pubky://owner/pub/pubky.app/posts/private-path' },
      }),
      attempt: 1,
    });
    reportSocialMigrationFailure({ pubky: 'c', error: 'not an error', attempt: 1 });
    expect(server.mock.calls.map(([, , params]) => params.context)).toEqual([
      { attempt: 1, errorName: 'AppError', kind: ErrorCategory.Network, status: 502 },
      { attempt: 1, errorName: 'string', kind: undefined, status: undefined },
    ]);
    expect(JSON.stringify(server.mock.calls)).not.toContain('private-path');
  });

  it('logs a finished run as information only', () => {
    const info = vi.spyOn(Logger, 'info');
    const server = vi.spyOn(Err, 'server');
    logSocialMigrationFinished({ pubky: 'a', report: report({ status: 'done' }) });
    expect(info).toHaveBeenCalledWith('[SocialMigration] Finished', expect.objectContaining({ status: 'done' }));
    expect(JSON.stringify(info.mock.calls)).not.toContain('private-path');
    expect(server).not.toHaveBeenCalled();
  });
});
