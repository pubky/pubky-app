import type { MigrationReport } from 'pubky-social-migrator';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SocialMigrationApplication } from '@/application/social-migration/social-migration';
import { Logger } from '@/libs/logger/logger';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { asOpaque } from '@/test-utils/type-assertions';

const runReturns = (report: Partial<MigrationReport>) =>
  vi.spyOn(HomeserverService, 'migrateToSocialV1').mockResolvedValue(asOpaque<MigrationReport>(report));

describe('SocialMigrationApplication.migrate', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['done', 'already_migrated'] as const)('logs a %s run as finished', async (status) => {
    runReturns({ status });
    const info = vi.spyOn(Logger, 'info');

    await SocialMigrationApplication.migrate(new AbortController().signal);

    expect(info).toHaveBeenCalledWith('[SocialMigration] Finished', expect.objectContaining({ status }));
  });

  it.each(['ABORTED', 'ALREADY_RUNNING'] as const)('keeps a run stopped by %s out of the warnings', async (code) => {
    runReturns({ status: 'aborted', error: { code, message: '' } });
    const warn = vi.spyOn(Logger, 'warn');

    await SocialMigrationApplication.migrate(new AbortController().signal);

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns about a run that did not finish', async () => {
    runReturns({ status: 'incomplete' });
    const warn = vi.spyOn(Logger, 'warn');

    await SocialMigrationApplication.migrate(new AbortController().signal);

    expect(warn).toHaveBeenCalledWith(
      '[SocialMigration] Not finished, the next visit runs it again',
      expect.objectContaining({ status: 'incomplete' }),
    );
  });

  it('passes the signal to the run', async () => {
    const run = runReturns({ status: 'done' });
    const { signal } = new AbortController();

    await SocialMigrationApplication.migrate(signal);

    expect(run).toHaveBeenCalledWith({ signal });
  });
});
