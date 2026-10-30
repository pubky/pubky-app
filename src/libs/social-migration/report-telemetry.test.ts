import type { MigrationReport } from 'pubky-social-migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { asOpaque } from '@/test-utils/type-assertions';
import {
  logSocialMigrationFinished,
  reportSocialMigrationBlocked,
  reportSocialMigrationCapsMissing,
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

  it('captures a thrown engine error once with its cause', () => {
    const server = vi.spyOn(Err, 'server');
    const cause = new Error('fault');
    reportSocialMigrationFailure({ pubky: 'a', error: cause, attempt: 2 });
    reportSocialMigrationFailure({ pubky: 'a', error: new Error('again'), attempt: 3 });
    expect(server).toHaveBeenCalledExactlyOnceWith(
      ServerErrorCode.UNKNOWN_ERROR,
      'Social migration failed',
      expect.objectContaining({ cause, context: { attempt: 2 } }),
    );
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
