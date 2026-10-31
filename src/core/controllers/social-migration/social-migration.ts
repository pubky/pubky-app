import type { Session } from '@synonymdev/pubky';
import type { MigrationReport, ProgressEvent } from 'pubky-social-migrator';
import { SocialMigrationApplication } from '@/application/social-migration/social-migration';
import {
  SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS,
  SOCIAL_MIGRATION_PROGRESS_THROTTLE_MS,
  SOCIAL_MIGRATION_TRANSFORM_REV,
} from '@/config/social-migration';
import { hasSocialV1Capabilities } from '@/libs/capabilities/capabilities';
import {
  acknowledgeSocialMigrationProfileNotice,
  admitSocialMigrationGrant,
  isSocialMigrationGrantAdmitted,
  isSocialMigrationRecordTrusted,
  markSocialMigrated,
  readPendingSocialMigrationProfileNotice,
  readSocialMigrationRecord,
  type SocialMigrationProfileNotice,
  type SocialMigrationRecord,
  updateSocialMigrationRecord,
} from '@/libs/social-migration/record';
import {
  logSocialMigrationFinished,
  reportSocialMigrationBlocked,
  reportSocialMigrationCapsMissing,
  reportSocialMigrationFailure,
} from '@/libs/social-migration/report-telemetry';
import {
  clearSocialMigrationSignedOutNotice,
  writeSocialMigrationSignedOutNotice,
} from '@/libs/social-migration/signed-out-notice';
import { socialMigrationSummaryIsEmpty, summarizeSocialMigrationReport } from '@/libs/social-migration/summary';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useSocialMigrationStore } from '@/stores/socialMigration/socialMigration.store';
import type {
  SocialMigrationBlockedReason,
  SocialMigrationReauthReason,
} from '@/stores/socialMigration/socialMigration.types';

/** How the account reached the gate; a signup runs inline on its empty tree and never shows the screen unless blocked. */
export type SocialMigrationEntry = 'restore' | 'signin' | 'signup' | 'upgrade';

/** `reauth-required` leaves `restoreStatus` at `social-migration` for the screen to sign the account out. */
type SocialMigrationOutcome = 'passed' | 'reauth-required' | 'canceled';

type Wake = 'retry' | 'continue' | 'cancel';

/** One gate in flight: the run's abort, and the wait of a blocked or summary stage. */
type Gate = {
  pubky: string;
  generation: string;
  abort: AbortController;
  wake: ((action: Wake) => void) | null;
  unsubscribe: () => void;
};

/** A timer that ends early when `signal` fires. */
const abortableSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });

/**
 * The social v1 migration gate (ADR-0026): decides whether an account may run the 1.x app and
 * runs `pubky-social-migrator` when it has to, before `AuthController` places the session in the
 * store. Owns `useSocialMigrationStore`, the localStorage record and the signed-out notice;
 * flips `restoreStatus` to `social-migration` only when the screen is needed, so a migrated
 * account with a trusted record never sees it. One gate at a time: a new one cancels the last.
 */
export class SocialMigrationController {
  private constructor() {}

  private static gate: Gate | null = null;

  /**
   * Restore: scopes, then the local record (no network), then the flag, then resume for a grant
   * this build admitted or sign out for one it did not (D2). Fresh sign-in: admit the grant and
   * run the engine, whose own HEAD finds a finished migration. Upgrade: the local record only;
   * without one, like a sign-in. Never hand-writes the flag.
   */
  static async ensureMigrated({
    session,
    generation,
    entry,
    isCurrent,
  }: {
    session: Session;
    generation: string;
    entry: SocialMigrationEntry;
    isCurrent: () => boolean;
  }): Promise<SocialMigrationOutcome> {
    const pubky = session.info.publicKey.z32();
    const record = readSocialMigrationRecord(pubky);
    if (entry === 'upgrade' && isSocialMigrationRecordTrusted(record)) return 'passed';
    if (!hasSocialV1Capabilities(session)) return this.requireReauth({ generation, isCurrent }, 'missing-scopes');
    if (entry === 'restore') {
      if (isSocialMigrationRecordTrusted(record)) return 'passed';
      const rev = await SocialMigrationApplication.readFlag({ session, pubky });
      if (!isCurrent()) return 'canceled';
      if (rev !== null && rev >= SOCIAL_MIGRATION_TRANSFORM_REV) {
        markSocialMigrated(pubky, rev);
        return 'passed';
      }
      if (!isSocialMigrationGrantAdmitted(record, this.activeGrantId()))
        return this.requireReauth({ generation, isCurrent }, 'pre-migration-grant');
    } else {
      const grantId = this.activeGrantId();
      if (grantId) admitSocialMigrationGrant(pubky, grantId);
    }
    return this.migrate({ session, pubky, generation, isCurrent, inline: entry === 'signup', record });
  }

  /** Whether this browser saw the done flag at this build's revision for `pubky`: no network, no chunk. */
  static hasPassedLocally(pubky: string): boolean {
    return isSocialMigrationRecordTrusted(readSocialMigrationRecord(pubky));
  }

  /** Retry from the blocked screen. */
  static retry(): void {
    if (useSocialMigrationStore.getState().stage === 'blocked') this.gate?.wake?.('retry');
  }

  /** Retry when the network or the tab comes back, only for a run the homeserver could not be reached for. */
  static retryAfterReconnect(): void {
    const { stage, reason } = useSocialMigrationStore.getState();
    if (stage === 'blocked' && reason === 'incomplete') this.gate?.wake?.('retry');
  }

  /** Continue from the summary screen. */
  static acknowledge(): void {
    if (useSocialMigrationStore.getState().stage === 'summary') this.gate?.wake?.('continue');
  }

  /** The profile values the run dropped, until the profile edit page's note is dismissed or the profile saved: no network. */
  static getPendingProfileNotice(pubky: string): SocialMigrationProfileNotice | null {
    return readPendingSocialMigrationProfileNotice(pubky);
  }

  /** The profile edit page's note was dismissed or the profile saved: it does not show again. */
  static acknowledgeProfileNotice(pubky: string): void {
    acknowledgeSocialMigrationProfileNotice(pubky);
  }

  /** Stops the run and clears the screen state; logout and session loss call it first. */
  static cancel(): void {
    if (this.gate) this.cancelGate(this.gate);
    useSocialMigrationStore.getState().reset();
  }

  private static activeGrantId(): string | null {
    return useAuthStore.getState().sessionReference?.sessionStoreId ?? null;
  }

  private static requireReauth(
    { generation, isCurrent }: { generation: string; isCurrent: () => boolean },
    reason: SocialMigrationReauthReason,
  ): SocialMigrationOutcome {
    if (!isCurrent()) return 'canceled';
    writeSocialMigrationSignedOutNotice({ reason });
    const store = useSocialMigrationStore.getState();
    store.reset();
    store.setStage('reauth-required', reason);
    this.showGate(generation);
    return 'reauth-required';
  }

  /** The screen takes over: the route guard sends every page to `/migration`. */
  private static showGate(generation: string): void {
    const auth = useAuthStore.getState();
    if (auth.generation === generation && !auth.isLoggingOut && auth.restoreStatus !== 'social-migration')
      auth.setRestoreStatus('social-migration');
  }

  private static cancelGate(gate: Gate): void {
    gate.abort.abort();
    gate.wake?.('cancel');
    useSocialMigrationStore.getState().reset();
  }

  private static async migrate({
    session,
    pubky,
    generation,
    isCurrent,
    inline,
    record,
  }: {
    session: Session;
    pubky: string;
    generation: string;
    isCurrent: () => boolean;
    inline: boolean;
    record: SocialMigrationRecord | null;
  }): Promise<SocialMigrationOutcome> {
    if (this.gate) this.cancelGate(this.gate);
    const gate: Gate = { pubky, generation, abort: new AbortController(), wake: null, unsubscribe: () => {} };
    // Logout and a new generation abort the run; the session object itself never enters the store.
    gate.unsubscribe = useAuthStore.subscribe((state) => {
      if (state.isLoggingOut || state.generation !== generation) this.cancelGate(gate);
    });
    this.gate = gate;
    const { signal } = gate.abort;
    const store = useSocialMigrationStore.getState();
    store.reset();
    const lastRun = record?.lastRun;
    store.setResumedFrom(lastRun ? { done: lastRun.done, total: lastRun.total } : undefined);
    const show = () => {
      if (!signal.aborted) this.showGate(generation);
    };
    if (!inline) show();
    try {
      let attempt = 0;
      let autoRetries = 0;
      for (;;) {
        if (signal.aborted) return 'canceled';
        attempt += 1;
        store.setAttempt(attempt);
        store.setStage('running');
        let report: MigrationReport;
        try {
          report = await SocialMigrationApplication.run({
            session,
            signal,
            onProgress: this.progressWriter(gate),
            onLockWait: () => {
              if (signal.aborted) return;
              store.setStage('waiting-for-tab');
              show();
            },
          });
        } catch (error) {
          if (signal.aborted || !isCurrent()) return 'canceled';
          reportSocialMigrationFailure({ pubky, error, attempt });
          if ((await this.block(gate, 'unexpected')) !== 'retry') return 'canceled';
          autoRetries = 0;
          continue;
        }
        if (signal.aborted || !isCurrent()) return 'canceled';
        this.saveLastRun(pubky, report);
        const code = report.error?.code;
        if (report.status === 'done' || report.status === 'already_migrated') return await this.finish(gate, report);
        if (report.status === 'incomplete' || code === 'IO_ERROR' || code === 'ALREADY_RUNNING') {
          if (autoRetries < SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS.length) {
            await abortableSleep(SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS[autoRetries], signal);
            autoRetries += 1;
            continue;
          }
          reportSocialMigrationBlocked({ pubky, report, attempt });
          if ((await this.block(gate, 'incomplete')) !== 'retry') return 'canceled';
          autoRetries = 0;
          continue;
        }
        if (code === 'ABORTED') return 'canceled';
        if (code === 'SESSION_EXPIRED') return this.requireReauth({ generation, isCurrent }, 'session-expired');
        if (code === 'CAPS_MISSING') {
          reportSocialMigrationCapsMissing({ pubky, report });
          return this.requireReauth({ generation, isCurrent }, 'missing-scopes');
        }
        reportSocialMigrationBlocked({ pubky, report, attempt });
        const reason: SocialMigrationBlockedReason =
          code === 'QUOTA' ? 'quota' : code === 'PRIV_UNSUPPORTED' ? 'homeserver-unsupported' : 'unexpected';
        if ((await this.block(gate, reason, report.error?.needBytes)) !== 'retry') return 'canceled';
        autoRetries = 0;
      }
    } finally {
      gate.unsubscribe();
      if (this.gate === gate) this.gate = null;
    }
  }

  /** Waits for Retry (or a cancel); the screen shows the reason meanwhile. */
  private static block(gate: Gate, reason: SocialMigrationBlockedReason, needBytes?: number): Promise<Wake> {
    const store = useSocialMigrationStore.getState();
    store.setNeedBytes(needBytes);
    store.setStage('blocked', reason);
    this.showGate(gate.generation);
    return this.wait(gate);
  }

  private static wait(gate: Gate): Promise<Wake> {
    return new Promise<Wake>((resolve) => {
      gate.wake = (action) => {
        gate.wake = null;
        resolve(action);
      };
      if (gate.abort.signal.aborted) gate.wake('cancel');
    });
  }

  private static async finish(gate: Gate, report: MigrationReport): Promise<SocialMigrationOutcome> {
    const { pubky } = gate;
    markSocialMigrated(pubky, SOCIAL_MIGRATION_TRANSFORM_REV);
    logSocialMigrationFinished({ pubky, report });
    const summary = summarizeSocialMigrationReport(report);
    if (!socialMigrationSummaryIsEmpty(summary)) {
      // The profile edit page shows the dropped values once (PR-D2); the screen shows the counts now.
      updateSocialMigrationRecord(pubky, (current) => ({
        ...current,
        notice: { skipped: summary.skipped, ...summary.dropped, pending: true },
      }));
      const store = useSocialMigrationStore.getState();
      store.setSummary(summary);
      store.setStage('summary');
      this.showGate(gate.generation);
      if ((await this.wait(gate)) !== 'continue') return 'canceled';
    }
    clearSocialMigrationSignedOutNotice();
    useSocialMigrationStore.getState().reset();
    return 'passed';
  }

  /** Store writes coalesced to phase changes plus one per throttle window; the record follows the same cadence. */
  private static progressWriter(gate: Gate): (event: ProgressEvent) => void {
    let lastWrite = 0;
    let lastPhase: ProgressEvent['phase'] | undefined;
    let lastPass: ProgressEvent['pass'];
    return (event) => {
      if (gate.abort.signal.aborted) return;
      const now = Date.now();
      const changed = event.phase !== lastPhase || event.pass !== lastPass;
      if (!changed && now - lastWrite < SOCIAL_MIGRATION_PROGRESS_THROTTLE_MS) return;
      lastWrite = now;
      lastPhase = event.phase;
      lastPass = event.pass;
      const store = useSocialMigrationStore.getState();
      store.setProgress({
        phase: event.phase,
        pass: event.pass,
        done: event.done,
        total: event.total,
        counts: event.counts,
        dropped: event.dropped,
      });
      // The listing of this run replaces the earlier run's position once the walk starts
      if (changed && event.phase === 'migrating') store.setResumedFrom(undefined);
      // The first event of a run that waited for another tab's lock ends the waiting stage
      if (changed) store.setStage('running');
      this.saveLastRun(gate.pubky, { status: 'running', ...event });
    };
  }

  private static saveLastRun(
    pubky: string,
    run: Pick<ProgressEvent, 'done' | 'total' | 'counts' | 'dropped' | 'error' | 'pass'> & {
      status: string;
      phase?: ProgressEvent['phase'];
    },
  ): void {
    updateSocialMigrationRecord(pubky, (record) => ({
      ...record,
      lastRun: {
        at: Date.now(),
        status: run.status,
        phase: run.phase,
        pass: run.pass,
        done: run.done,
        total: run.total,
        counts: run.counts,
        dropped: run.dropped,
        error: run.error && { code: run.error.code, needBytes: run.error.needBytes },
      },
    }));
  }
}
