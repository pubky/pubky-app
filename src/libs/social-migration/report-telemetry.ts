import type { MigrationReport } from 'pubky-social-migrator';
import { AuthErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';

/**
 * Telemetry for a social v1 migration that did not pass (ADR-0026, `docs/sentry.md`): one capture
 * per (account, code) per page, counts only. The report's `skipped`, `notes`, `droppedValues` and
 * `current` name the user's own files and never leave the browser.
 */
const SOCIAL_MIGRATION_OPERATION = 'socialMigration';

const reported = new Set<string>();

const counts = (report: Pick<MigrationReport, 'status' | 'done' | 'total' | 'counts' | 'dropped' | 'error'>) => ({
  status: report.status,
  code: report.error?.code,
  done: report.done,
  total: report.total,
  dropped: report.dropped,
  counts: report.counts,
  ...(report.error?.needBytes !== undefined && { needBytes: report.error.needBytes }),
});

function once(pubky: string, code: string, capture: () => void): void {
  const key = `${pubky}:${code}`;
  if (reported.has(key)) return;
  reported.add(key);
  capture();
}

/** A run that ended blocked: `incomplete`, `paused` or `aborted` for a reason the user cannot fix by signing in. */
export function reportSocialMigrationBlocked({
  pubky,
  report,
  attempt,
}: {
  pubky: string;
  report: MigrationReport;
  attempt: number;
}): void {
  const code = report.error?.code ?? report.status;
  once(pubky, code, () => {
    const retryable = code === 'incomplete' || code === 'IO_ERROR' || code === 'QUOTA' || code === 'PRIV_UNSUPPORTED';
    Err.server(
      retryable ? ServerErrorCode.SERVICE_UNAVAILABLE : ServerErrorCode.UNKNOWN_ERROR,
      'Social migration did not finish',
      {
        service: ErrorService.Homeserver,
        operation: SOCIAL_MIGRATION_OPERATION,
        context: { ...counts(report), attempt },
      },
    );
  });
}

/** The engine refused the session's scopes after adoption accepted them: a contract drift, not a user error. */
export function reportSocialMigrationCapsMissing({ pubky, report }: { pubky: string; report: MigrationReport }): void {
  once(pubky, 'CAPS_MISSING', () => {
    Err.auth(AuthErrorCode.FORBIDDEN, 'Social migration refused the session scopes', {
      service: ErrorService.Homeserver,
      operation: SOCIAL_MIGRATION_OPERATION,
      context: { ...counts(report), caps: report.error?.caps },
    });
  });
}

/** The engine rejected (a programming error, or the lock wait) instead of resolving with a report. */
export function reportSocialMigrationFailure({
  pubky,
  error,
  attempt,
}: {
  pubky: string;
  error: unknown;
  attempt: number;
}): void {
  once(pubky, 'thrown', () => {
    Err.server(ServerErrorCode.UNKNOWN_ERROR, 'Social migration failed', {
      service: ErrorService.Homeserver,
      operation: SOCIAL_MIGRATION_OPERATION,
      cause: error,
      context: { attempt },
    });
  });
}

/** A finished run with something left behind is information, not an error. */
export function logSocialMigrationFinished({ pubky, report }: { pubky: string; report: MigrationReport }): void {
  Logger.info('[SocialMigration] Finished', { pubky, ...counts(report) });
}

/** Test isolation only. */
export function resetSocialMigrationReports(): void {
  reported.clear();
}
