import {
  AuthFlowKind,
  type Capabilities,
  type GrantAuthFlow,
  type Pubky,
  PublicKey,
  type Session,
  type XCallbackParams,
} from '@synonymdev/pubky';
import { z } from 'zod';
import { getAuthClientId } from '@/config/auth';
import { getDefaultHttpRelay, getDeployEnv, getHomeserver, getTestnet } from '@/config/network';
import { createCanceledError } from '@/libs/error/auth-flow-canceled';
import { isIosDevice } from '@/libs/pwa/platform';
import { isPubkyErrorLike } from './error.utils';
import type { TGenerateAuthUrlResult } from './homeserver.types';
import { createCancelableAuthApproval } from './homeserver.utils';
import { PENDING_GRANT_RESUME_WINDOW_MS, type PendingGrantLease, PendingGrantStore } from './pending-grant-store';
import { watchRelayAcks } from './relay-ack-watch';

const PENDING_KEY = 'pubky-app-pending-grant-v1';
// App resume policy, separate from grant expiry and server bearer lifetime.
const RESUME_WINDOW_MS = PENDING_GRANT_RESUME_WINDOW_MS;
const pendingSchema = z.object({
  id: z.string(),
  context: z.string(),
  createdAt: z.number(),
  mode: z.enum(['local', 'delegated']),
  saved: z.string(),
});

export interface GrantFlowRequest {
  purpose: 'signin' | 'signup' | 'upgrade';
  capabilities: Capabilities;
  generation: string;
  expectedPubky?: string;
  inviteCode?: string;
  fresh?: boolean;
  xCallback?: XCallbackParams;
}

type PendingRecord = z.infer<typeof pendingSchema>;
type FlowOwner = { id: string; context: string; lease?: PendingGrantLease; cancel?: () => void };

function canResume(record: PendingRecord | null, context: string): record is PendingRecord {
  return (
    !!record &&
    record.context === context &&
    Date.now() >= record.createdAt &&
    Date.now() - record.createdAt < RESUME_WINDOW_MS
  );
}

export class GrantFlowService {
  private static version = 0;
  private static owner: FlowOwner | null = null;
  private static cleanups = new Map<PendingGrantLease, Promise<void>>();
  private static read() {
    try {
      return pendingSchema.parse(JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null'));
    } catch {
      return null;
    }
  }

  /** Only this realm's owned attempt is canceled; another tab's recovery record is independent. */
  static clear(): void {
    this.version++;
    const owner = this.owner;
    owner?.cancel?.();
    if (owner) this.discard(owner);
    sessionStorage.removeItem(PENDING_KEY);
  }

  private static discard(owner: FlowOwner): void {
    if (this.owner !== owner) return;
    this.owner = null;
    if (owner.lease) {
      const lease = owner.lease;
      // remove writes an id-only cancellation marker synchronously. Keep ownership until its IDB delete settles.
      this.removeLease(lease);
    }
    // The durable invalidation must already be scheduled if Safari rejects tab-storage access.
    if (this.read()?.id === owner.id) sessionStorage.removeItem(PENDING_KEY);
  }

  private static removeLease(lease: PendingGrantLease): Promise<void> {
    const cleanup = lease.remove().finally(() => lease.release());
    this.cleanups.set(lease, cleanup);
    void cleanup.then(
      () => this.cleanups.delete(lease),
      () => {
        if (!lease.active) this.cleanups.delete(lease);
      },
    );
    return cleanup;
  }

  private static async finishCleanup(): Promise<void> {
    for (const [lease, cleanup] of this.cleanups) {
      try {
        await cleanup;
      } catch {
        // A committed tombstone makes recovery impossible even if IDB deletion failed. Otherwise retain
        // ownership and retry deletion before another attempt can expose a link.
        if (lease.active) {
          this.removeLease(lease);
          await this.cleanups.get(lease);
        }
      }
    }
  }

  static async start(
    sdk: Pubky,
    request: GrantFlowRequest,
    onCanceledSession?: (session: Session) => Promise<void>,
  ): Promise<TGenerateAuthUrlResult> {
    const version = ++this.version;
    // A service retry may replace its listener while retaining the same resumable attempt.
    const superseded = this.owner;
    superseded?.cancel?.();
    // Transfer cancellation responsibility synchronously; callbacks from the old flow must not
    // invalidate this retry while it is awaiting storage or context validation.
    const previous: FlowOwner | null = superseded
      ? { id: superseded.id, context: superseded.context, lease: superseded.lease }
      : null;
    this.owner = previous;
    await this.finishCleanup();
    const inviteBytes = new TextEncoder().encode(request.inviteCode ?? '');
    const inviteHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', inviteBytes)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    const context = JSON.stringify({
      purpose: request.purpose,
      xCallback: request.xCallback,
      capabilities: request.capabilities,
      expectedPubky: request.expectedPubky,
      generation: request.generation,
      clientId: getAuthClientId(),
      homeserver: getHomeserver(),
      environment: getDeployEnv(),
      testnet: getTestnet(),
      relay: getDefaultHttpRelay(),
      inviteHash,
    });
    if (version !== this.version) throw createCanceledError();
    if (previous && this.owner === previous && (request.fresh || previous.context !== context)) {
      this.owner = null;
      if (previous.lease) await this.removeLease(previous.lease);
      if (version !== this.version) throw createCanceledError();
    }
    // WebKit on iOS suspends hidden pages and aborts their in-flight work; other browsers keep polling in the
    // background so an approval made there completes at once. The ACK watch starts before the flow so it sees a
    // resumed flow's listener collect an approval the relay already holds.
    const releaseWhileHidden = isIosDevice() && !request.xCallback;
    const acks = releaseWhileHidden ? watchRelayAcks(getDefaultHttpRelay()) : null;
    let owner: FlowOwner | null = null;
    let flow: GrantAuthFlow | undefined;
    const assertCurrent = () => {
      if (version !== this.version) throw createCanceledError();
    };
    try {
      const tabRecord = this.read();
      // Only delegated sign-in can recover across a process restart. Local keys and popup/signup/upgrade
      // attempts retain their existing tab-scoped lifetime and binding.
      const durable = request.purpose === 'signin' && !request.xCallback;
      let saved = !request.fresh && canResume(tabRecord, context) ? tabRecord : null;
      if (durable) {
        const candidates = await PendingGrantStore.getCandidates(context, previous?.id ?? tabRecord?.id);
        assertCurrent();
        if (tabRecord && (request.fresh || !canResume(tabRecord, context))) {
          if (this.owner?.id === tabRecord.id) {
            this.discard(this.owner);
            await this.finishCleanup();
          } else {
            const obsolete = await PendingGrantStore.claim(tabRecord.id);
            if (obsolete) await this.removeLease(obsolete);
          }
          assertCurrent();
        }
        if (request.fresh) {
          // Fresh means discarding recoverable orphan attempts, even when Safari lost the tab hint.
          // A live tab keeps its own attempt because its lock cannot be claimed here.
          for (const candidate of candidates) {
            const obsolete = await PendingGrantStore.claim(candidate.id);
            if (obsolete) await this.removeLease(obsolete);
            assertCurrent();
          }
        }
        if (saved?.mode !== 'local' && !request.fresh) {
          // Import a still-valid pre-upgrade tab record. A tombstone or active owner prevents its resurrection.
          const choices = saved ? [saved, ...candidates.filter((record) => record.id !== saved?.id)] : candidates;
          saved = null;
          for (const candidate of choices) {
            // Keep cancellation responsibility during same-context retry discovery, and reuse its lock.
            const lease =
              this.owner === previous && previous?.id === candidate.id && previous.lease?.active
                ? previous.lease
                : await PendingGrantStore.claim(candidate.id);
            if (!lease) continue;
            try {
              assertCurrent();
              if (previous && this.owner === previous && previous.lease !== lease) {
                this.discard(previous);
                await this.finishCleanup();
                assertCurrent();
              }
              owner = { id: candidate.id, context, lease };
              this.owner = owner;
              const legacy =
                candidate.id === tabRecord?.id && candidate.mode === 'delegated'
                  ? { ...candidate, mode: 'delegated' as const }
                  : undefined;
              const record = await lease.read(legacy);
              assertCurrent();
              if (!canResume(record, context)) {
                lease.release();
                if (this.owner === owner) this.owner = null;
                owner = null;
                continue;
              }
              await lease.save({ ...record, mode: 'delegated' });
              assertCurrent();
              saved = record;
              break;
            } catch (error) {
              if (this.owner?.lease !== lease) lease.release();
              throw error;
            }
          }
        }
      }
      if (previous && this.owner === previous) {
        // An expired or unavailable previous attempt was not selected. Retire it before replacing its owner.
        this.discard(previous);
        await this.finishCleanup();
        assertCurrent();
      }
      let id = saved?.id ?? crypto.randomUUID();
      let mode = saved?.mode ?? 'local';
      let serialized = saved?.saved ?? '';
      if (saved) {
        owner ??= { id, context };
        this.owner = owner;
        try {
          flow =
            saved.mode === 'delegated'
              ? await sdk.resumeDelegatedGrantAuthFlow(saved.saved)
              : sdk.resumeGrantAuthFlow(saved.saved);
        } catch (error) {
          // Invalid serialization and a proven missing key cannot be resumed; storage failures can.
          const cannotResume =
            isPubkyErrorLike(error) &&
            (error.name === 'InvalidInput' ||
              (error.name === 'ClientStateError' && /^Delegated grant key not found: .+$/.test(error.message)));
          if (!cannotResume) throw error;
          assertCurrent();
          this.discard(owner);
          await this.finishCleanup();
          assertCurrent();
          owner = null;
        }
      }
      if (!flow) {
        sessionStorage.removeItem(PENDING_KEY);
        id = crypto.randomUUID();
        const lease = durable ? await PendingGrantStore.claim(id) : null;
        owner = { id, context, ...(lease ? { lease } : {}) };
        if (version !== this.version) {
          lease?.release();
          throw createCanceledError();
        }
        this.owner = owner;
        const kind =
          request.purpose === 'signup'
            ? AuthFlowKind.signup(PublicKey.from(getHomeserver()), request.inviteCode)
            : AuthFlowKind.signin();
        flow = await sdk.startGrantAuthFlow(request.capabilities, kind, {
          clientId: getAuthClientId(),
          relay: getDefaultHttpRelay(),
          xCallback: request.xCallback,
        });
        assertCurrent();
        try {
          serialized = flow.saveDelegated();
          mode = 'delegated';
        } catch {
          serialized = flow.saveLocal();
          mode = 'local';
        }
        const record = { id, context, mode, saved: serialized, createdAt: Date.now() };
        if (owner.lease && mode === 'delegated') await owner.lease.save({ ...record, mode: 'delegated' });
        else {
          owner.lease?.release();
          owner.lease = undefined;
        }
        assertCurrent();
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(record));
      } else {
        assertCurrent();
        // Preserve original age across process recovery; sessionStorage is only the tab's preferred record.
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(saved));
      }
      assertCurrent();
      const approval = createCancelableAuthApproval(flow, {
        onCanceledSession,
        // Ring can suspend this page while approving. Resume the same relay and PoP key,
        // using the serialization already saved before the link was displayed.
        resume: request.xCallback
          ? undefined
          : async () => {
              if (version !== this.version) throw createCanceledError();
              const resumed =
                mode === 'delegated'
                  ? await sdk.resumeDelegatedGrantAuthFlow(serialized)
                  : sdk.resumeGrantAuthFlow(serialized);
              if (version !== this.version) {
                resumed.free();
                throw createCanceledError();
              }
              return resumed;
            },
        releaseWhileHidden,
        ackSent: acks?.sent,
      });
      const owned = owner!;
      owned.cancel = approval.cancel;
      const awaitApproval = approval.awaitApproval.finally(() => acks?.stop());
      // Keep ownership until adoption or explicit cancellation, including after a retryable exchange failure.
      // A retry releases it at start; a terminated page releases it through the browser's Web Locks lifecycle.
      void awaitApproval.catch(() => {});
      return {
        authorizationUrl: flow.authorizationUrl,
        awaitApproval,
        cancelAuthFlow: () => {
          approval.cancel();
          this.discard(owned);
        },
        completeAuthFlow: () => this.discard(owned),
      };
    } catch (error) {
      flow?.free();
      // Keep a retryable pending record owned so an explicit cancel after this failure can still remove it.
      // Superseded starts must not keep a lease that the current owner no longer knows about.
      if (owner?.lease && this.owner?.lease !== owner.lease) owner.lease.release();
      acks?.stop();
      throw error;
    }
  }
}
