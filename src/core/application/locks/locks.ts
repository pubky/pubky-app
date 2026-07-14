import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import type { LockFile, TFetchLockFileParams } from '@/services/locks/locks.types';

/**
 * Lock workflows.
 */
export class LocksApplication {
  private constructor() {}

  /**
   * Validate the lock URL, then read the lock file. Throws `Err.validation` (logged +
   * sent to Sentry by the factory) for a malformed `lock` URL — this is the single
   * origin for the failure; the controller only delegates.
   *
   * TODO:[Locks] #2028 — the read is a TEMPORARY UI-only stub: returns `null` (no lock
   * file) until #2028 wires the real `HomeserverService.request<LockFile>` read of the
   * creator's public `lock.json` at `lockUrl` (+ parse). Homeserver IO belongs in the
   * application layer by convention — no dedicated lock service.
   */
  static async fetchLockFile({ lockUrl }: TFetchLockFileParams): Promise<LockFile | null> {
    if (!LockContentParser.isValidLockUrl(lockUrl)) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'post lock URL is not a valid pubky homeserver URL', {
        service: ErrorService.Locks,
        operation: 'fetchLockFile',
        context: { lockUrl },
      });
    }

    return null;
  }
}
