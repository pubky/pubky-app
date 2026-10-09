import type { Capabilities, Session } from '@synonymdev/pubky';
import { validateCapabilities } from '@synonymdev/pubky';
import type { PersistStorage } from 'zustand/middleware';
import { AuthApplication } from '@/application/auth/auth';
import type { TKeypairParams } from '@/application/auth/auth.types';
import { BootstrapApplication, type BootstrapProgressCallback } from '@/application/bootstrap/bootstrap';
import { SettingsApplication } from '@/application/settings/settings';
import { postStreamQueue } from '@/application/stream/posts/muting/post-stream-queue';
import { UserApplication } from '@/application/user/user';
import { APP_CAPABILITIES, LOCKS_CAPABILITIES } from '@/config/auth';
import { getModerationId } from '@/config/moderation';
import { getDeployEnv, getHomeserver, HOMESERVER_CAPABILITIES } from '@/config/network';
import type {
  TLoginWithEncryptedFileParams,
  TLoginWithMnemonicParams,
  TSignUpParams,
} from '@/controllers/auth/auth.types';
import { LocksController } from '@/controllers/locks/locks';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { NotificationCoordinator } from '@/coordinators/notifications/notifications';
import { StreamCoordinator } from '@/coordinators/streams/stream';
import { clearDatabase } from '@/database/franky/franky.helpers';
import { hasCapabilities } from '@/libs/auth/capabilities';
import {
  type ActiveSessionFailure,
  pendingRetirements,
  type PersistedAuth,
  type SessionReference,
} from '@/libs/auth/session.types';
import {
  createAuthApprovalMismatchError,
  createCanceledError,
  isAuthApprovalMismatchError,
  isAuthFlowCanceledError,
} from '@/libs/error/auth-flow-canceled';
import { AuthErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, isNotFound, isWrongEnvironmentHomeserverError, toAppError } from '@/libs/error/error.utils';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import { clearMuteSyncCursorSessionStorage } from '@/libs/mute-sync/clear-cursor-session-storage';
import { clearAllQueryClients } from '@/libs/query-client/query-client.factory';
import { sleep } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import type { GrantFlowRequest } from '@/services/homeserver/grant-flow';
import type {
  TGenerateAuthUrlResult,
  TGeneratePassportAuthUrlParams,
  THomeserverSessionResult,
} from '@/services/homeserver/homeserver.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { useHotStore } from '@/stores/hot/hot.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { useMigrationStore } from '@/stores/migration/migration.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import { useSearchStore } from '@/stores/search/search.store';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { SettingsState } from '@/stores/settings/settings.types';
import { useSignInStore } from '@/stores/signIn/signIn.store';

/**
 * How long logout waits for the homeserver to end the session. The SDK's `session.signout()`
 * accepts no timeout or AbortSignal, so a homeserver that connects but never replies would
 * otherwise hold logout open for the OS-level TCP timeout. Local cleanup runs either way.
 */
const LOGOUT_TIMEOUT_MS = 5_000;

/** Reset this tab without overwriting the new account's shared persisted stores. */
function resetTabStore<T>(
  store: {
    getState(): { reset(): void };
    persist: {
      getOptions(): { storage?: PersistStorage<T> };
      setOptions(options: { storage?: PersistStorage<T> }): void;
    };
  },
  persist = false,
): void {
  if (persist) {
    try {
      store.getState().reset();
      return;
    } catch {
      // Persistence can fail during logout; this tab must still drop its live state.
    }
  }
  const { storage } = store.persist.getOptions();
  if (!storage) {
    store.getState().reset();
    return;
  }
  store.persist.setOptions({ storage: { ...storage, setItem: () => {}, removeItem: () => {} } });
  try {
    store.getState().reset();
  } finally {
    store.persist.setOptions({ storage });
  }
}

export class AuthController {
  private constructor() {} // Prevent instantiation

  private static activeAuthFlow: {
    key: string;
    token: symbol;
    result: Promise<TGenerateAuthUrlResult>;
    cancel: (() => void) | null;
  } | null = null;
  // Passport stops popup timers after approval, before it asks us to persist/bootstrap the session.
  // Keep the original flow ownership until that second step so a stale popup cannot adopt a session.
  private static pendingSessionAdoptions = new WeakMap<Session, () => Promise<void>>();
  private static epoch = 0;
  private static restoreVersion = 0;
  private static logoutOwner: symbol | null = null;
  private static restorePromise: Promise<boolean> | null = null;
  private static signupPromise: Promise<void> | null = null;
  private static legacyRevocation: { task: Promise<void>; wait: Promise<void> } | null = null;
  private static retirementTasks = new Map<string, Promise<void>>();
  private static profileBootstrap: { generation: string; session: Session; task: Promise<void> } | null = null;
  private static sessionRestore: {
    key: string;
    task: ReturnType<typeof AuthApplication.restorePersistedSession>;
  } | null = null;
  private static accountPreparation: { generation: string; task: Promise<void>; cancel: () => void } | null = null;

  private static async bounded<T>(
    task: Promise<T>,
    operation: string,
    milliseconds = 12_000,
    service = ErrorService.Homeserver,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Err.timeout(
                  TimeoutErrorCode.REQUEST_TIMEOUT,
                  operation === 'bootstrapProfile'
                    ? 'Your session is saved, but account data is still loading. Try again.'
                    : service === ErrorService.Local
                      ? 'Could not finish saving account data. Try again.'
                      : 'Could not reach the homeserver. Try again.',
                  {
                    service,
                    operation,
                  },
                ),
              ),
            milliseconds,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  static async retireLegacyCookieSessions(): Promise<void> {
    if (this.legacyRevocation) return this.legacyRevocation.wait;
    const task = AuthApplication.revokeLegacyCookieSessions();
    const wait = this.bounded(task, 'revokeLegacyCookieSessions', LOGOUT_TIMEOUT_MS).catch(() => {});
    this.legacyRevocation = { task, wait };
    // One deadline per shared task; a UI timeout does not release ownership of the request.
    void task
      .finally(() => {
        if (this.legacyRevocation?.task === task) this.legacyRevocation = null;
      })
      .catch(() => {});
    await wait;
  }

  private static isCurrentGeneration(generation: string): boolean {
    try {
      return (
        useAuthStore.getState().generation === generation &&
        (AuthApplication.readPersistedAuth()?.generation ?? '') === generation
      );
    } catch {
      return false;
    }
  }

  private static async prepareAccount(generation: string): Promise<void> {
    if (!AuthApplication.readPersistedAuth()?.needsAccountPreparation) return;
    if (!this.isCurrentGeneration(generation)) throw createCanceledError();
    useAuthStore.getState().setNeedsAccountSync(true);
    if (this.accountPreparation?.generation !== generation) {
      let active = true;
      const task = AuthApplication.prepareAccount(
        generation,
        () => active && this.isCurrentGeneration(generation) && useAuthStore.getState().currentUserPubky !== null,
      );
      this.accountPreparation = {
        generation,
        task,
        cancel: () => {
          active = false;
        },
      };
      // A timeout only stops the UI wait. Keep the shared cleanup alive and reuse it on retry.
      void task
        .finally(() => {
          if (this.accountPreparation?.task === task) this.accountPreparation = null;
        })
        .catch(() => {});
    }
    await this.bounded(this.accountPreparation.task, 'prepareAccount', 12_000, ErrorService.Local);
    if (!this.isCurrentGeneration(generation)) throw createCanceledError();
    useMigrationStore.getState().reset();
  }

  /** An unreadable reference is retryable; only proven supersession can terminate a pending adoption. */
  private static isCurrentAdoption(epoch: number, generation: string): boolean {
    return (
      epoch === this.epoch &&
      useAuthStore.getState().generation === generation &&
      (AuthApplication.readPersistedAuth()?.generation ?? '') === generation
    );
  }

  private static moderationFollowAbortController: AbortController | null = null;

  /** Controller preflight for capability upgrades; feature UI uses the same pure scope matcher. */
  static hasCapabilities(required: readonly string[]): boolean {
    const state = useAuthStore.getState();
    if (state.restoreStatus !== 'ready' || state.isRestoringSession) return false;
    const session = state.selectSession();
    return session !== null && hasCapabilities(session.info.capabilities, required);
  }

  static cancelActiveAuthFlow() {
    this.epoch++;
    const cancel = this.activeAuthFlow?.cancel;
    this.activeAuthFlow = null;
    cancel?.();
    AuthApplication.clearPendingAuthFlow();
  }

  /** Cancel detached moderation-follow work before account-local state changes ownership. */
  static cancelModerationFollow(): void {
    this.moderationFollowAbortController?.abort();
    this.moderationFollowAbortController = null;
  }

  private static clearModerationFollowController(controller: AbortController): void {
    if (this.moderationFollowAbortController === controller) {
      this.moderationFollowAbortController = null;
    }
  }

  /** Start settings-aware moderation follow work without extending the authentication critical path. */
  private static startModerationFollow(pubky: Pubky): void {
    this.cancelModerationFollow();
    const controller = new AbortController();
    this.moderationFollowAbortController = controller;
    void this.ensureModerationFollow(pubky, controller);
  }

  private static async ensureModerationFollow(pubky: Pubky, controller: AbortController): Promise<void> {
    try {
      const moderationId = await UserApplication.ensureModerationFollow({
        follower: pubky,
        moderationId: getModerationId(),
        moderationBot: useSettingsStore.getState().privacy.moderationBot,
        signal: controller.signal,
      });

      // The settings store is account-local; never record processed state against a different session.
      if (!moderationId || controller.signal.aborted || useAuthStore.getState().currentUserPubky !== pubky) return;

      useSettingsStore.getState().setModerationBot(moderationId);
      const settings = SettingsNormalizer.extractState(useSettingsStore.getState());
      await SettingsApplication.commitUpdate(settings, pubky, controller.signal);
    } catch (error) {
      // AppError factories already report at their origin. Only unexpected raw failures need a warning.
      if (!controller.signal.aborted && !isAppError(error)) {
        Logger.warn('Unexpected moderation-follow authentication failure', { error });
      }
    } finally {
      this.clearModerationFollowController(controller);
    }
  }

  /**
   * Restores a persisted session from the auth store.
   * @returns true on success, false on failure
   * @throws Wrong-environment homeserver errors while preserving the saved account for recovery
   */
  static async restorePersistedSession(): Promise<boolean> {
    if (this.restorePromise) return this.restorePromise;
    void this.retireLegacyCookieSessions();
    void this.retrySessionRetirement();
    if (!useAuthStore.getState().sessionReference && useAuthStore.getState().restoreStatus === 'temporary-error') {
      await useAuthStore.persist.rehydrate();
      if (!useAuthStore.getState().sessionReference) {
        try {
          const saved = AuthApplication.readPersistedAuth();
          useAuthStore.getState().setRestoreStatus(saved?.currentUserPubky ? 'reauth-required' : 'idle');
        } catch {
          // Still unreadable; retain recovery and the user's backup material.
        }
        return false;
      }
    }
    // A second caller may have completed hydration while this one was awaiting it.
    if (this.restorePromise) return this.restorePromise;
    const snapshot = useAuthStore.getState();
    const generation = snapshot.generation;
    const version = this.restoreVersion;
    const isCurrent = () => version === this.restoreVersion && this.isCurrentGeneration(generation);
    const task = (async () => {
      snapshot.setRestoreStatus('restoring');
      try {
        let result;
        if (snapshot.session) result = { status: 'restored' as const, session: snapshot.session };
        else {
          const key = JSON.stringify([
            generation,
            version,
            snapshot.sessionReference?.sessionStoreId,
            snapshot.currentUserPubky,
          ]);
          if (this.sessionRestore?.key !== key) {
            const exchange = AuthApplication.restorePersistedSession({
              reference: snapshot.sessionReference,
              expectedPubky: snapshot.currentUserPubky,
            });
            this.sessionRestore = { key, task: exchange };
            // Keep a late success for the next retry; a failed exchange may be retried anew.
            void exchange.then(
              (outcome) => {
                if (outcome.status !== 'restored' && this.sessionRestore?.task === exchange) this.sessionRestore = null;
              },
              () => {
                if (this.sessionRestore?.task === exchange) this.sessionRestore = null;
              },
            );
          }
          const exchange = this.sessionRestore.task;
          result = await this.bounded(exchange, 'restoreSession');
          if (this.sessionRestore?.task === exchange) this.sessionRestore = null;
        }
        if (!isCurrent()) return false;
        if (result.status !== 'restored') {
          useAuthStore.getState().setRestoreStatus(result.status === 'none' ? 'idle' : result.status);
          return false;
        }
        await this.prepareAccount(generation);
        if (!isCurrent()) return false;
        const current = useAuthStore.getState();
        current.init({
          session: result.session,
          currentUserPubky: snapshot.currentUserPubky,
          hasProfile: current.hasProfile,
          sessionReference: snapshot.sessionReference,
          generation,
          retiringSession: current.retiringSession,
          pendingRetirements: current.pendingRetirements,
          restoreStatus: 'restoring',
        });
        useAuthStore.getState().setRestoreStatus('restoring');
        void this.retrySessionRetirement();
        if (!isCurrent()) return false;
        if (useAuthStore.getState().hasProfile === null || useAuthStore.getState().needsAccountSync)
          await this.bootstrapProfile(result.session, generation, true);
        if (isCurrent()) useAuthStore.getState().setRestoreStatus('ready');
        return isCurrent();
      } catch (error) {
        if (isCurrent())
          useAuthStore
            .getState()
            .setRestoreStatus(isWrongEnvironmentHomeserverError(error) ? 'reauth-required' : 'temporary-error');
        if (isWrongEnvironmentHomeserverError(error)) throw error;
        return false;
      }
    })();
    this.restorePromise = task;
    try {
      return await task;
    } finally {
      if (this.restorePromise === task) this.restorePromise = null;
      // A storage event may have happened before this tab installed its listener.
      if (useAuthStore.getState().generation === generation) {
        try {
          if ((AuthApplication.readPersistedAuth()?.generation ?? '') !== generation) {
            await this.syncSessionFromStorage();
          }
        } catch {
          useAuthStore.getState().setRestoreStatus('temporary-error');
        }
      }
    }
  }

  static subscribeSessionFailures(listener: (failure: ActiveSessionFailure) => void): () => void {
    return AuthApplication.subscribeSessionFailures(listener);
  }

  /** Drop an unusable live handle without deleting account data or canceling a newer sign-in. */
  static requireSessionReauthentication({ generation, session }: { generation: string; session?: Session }): boolean {
    const snapshot = useAuthStore.getState();
    if (
      !snapshot.session ||
      snapshot.isLoggingOut ||
      snapshot.generation !== generation ||
      (session && snapshot.session !== session) ||
      !this.isCurrentGeneration(generation)
    )
      return false;
    ++this.restoreVersion;
    this.sessionRestore = null;
    this.cancelModerationFollow();
    // Set the status first so clearing the handle cannot trigger automatic startup restoration.
    snapshot.setRestoreStatus('reauth-required');
    snapshot.setSession(null);
    return true;
  }

  /** SDK notifications also cover removal outside this app's localStorage transitions. */
  static async syncRemovedSession(id: string | null): Promise<void> {
    await this.syncSessionFromStorage();
    const snapshot = useAuthStore.getState();
    if (!snapshot.sessionReference || (id !== null && snapshot.sessionReference.sessionStoreId !== id)) return;
    this.cancelActiveAuthFlow();
    const version = ++this.restoreVersion;
    this.sessionRestore = null;
    const previousRestore = this.restorePromise;
    snapshot.setSession(null);
    snapshot.setRestoreStatus('restoring');
    await previousRestore;
    if (this.restoreVersion !== version || !this.isCurrentGeneration(snapshot.generation)) return;
    // Recheck the SDK record: a delayed notification may refer to an earlier removal.
    await this.restorePersistedSession();
  }

  static async syncSessionFromStorage(): Promise<void> {
    const incoming = AuthApplication.readPersistedAuth();
    const previous = useAuthStore.getState();
    if (incoming?.generation === previous.generation) {
      await useAuthStore.persist.rehydrate();
      return;
    }
    this.cancelActiveAuthFlow();
    this.cancelModerationFollow();
    const epoch = this.epoch;
    const previousRestore = this.restorePromise;
    this.sessionRestore = null;
    await useAuthStore.persist.rehydrate();
    if (epoch !== this.epoch) return;
    if (!incoming) {
      useAuthStore.getState().init({
        session: null,
        currentUserPubky: null,
        hasProfile: null,
        sessionReference: null,
        generation: crypto.randomUUID(),
        retiringSession: null,
      });
    }
    const current = useAuthStore.getState();
    if (previous.currentUserPubky !== current.currentUserPubky) {
      clearAllQueryClients();
      postStreamQueue.clear();
      clearMuteSyncCursorSessionStorage();
      useLocalFilesStore.getState().reset();
      useSignInStore.getState().reset();
      resetTabStore(useSettingsStore);
      resetTabStore(useNotificationStore);
      resetTabStore(useOnboardingStore);
      resetTabStore(useHomeStore);
      resetTabStore(useHotStore);
      resetTabStore(useSearchStore);
      LocksController.clearLocalSession();
      current.setNeedsAccountSync(current.currentUserPubky !== null);
      if (current.currentUserPubky) await useLocksAuthStore.persist.rehydrate();
      if (epoch !== this.epoch) return;
      // Another tab may have just signed up and still need its recovery backup.
      await useOnboardingStore.persist.rehydrate();
      if (epoch !== this.epoch) return;
      const onboarding = useOnboardingStore.getState();
      let onboardingPubky = onboarding.signupAttempt?.pubky;
      if (!onboardingPubky && onboarding.secretKey)
        onboardingPubky = Identity.tryZ32FromSecret(onboarding.secretKey) ?? undefined;
      if (!current.currentUserPubky || onboardingPubky !== current.currentUserPubky) resetTabStore(useOnboardingStore);
    }
    if (previousRestore) await previousRestore.catch(() => false);
    if (epoch !== this.epoch) return;
    if (useAuthStore.getState().sessionReference) await this.restorePersistedSession();
  }

  /**
   * Gets a homeserver service instance using the secret key from the onboarding store.
   * @param params - The authentication parameters
   * @param params.keypair - The cryptographic keypair for the user
   * @returns Configured homeserver service instance
   */
  private static async signIn({ keypair }: TKeypairParams): Promise<boolean> {
    this.cancelActiveAuthFlow();
    const epoch = this.epoch;
    void this.retrySessionRetirement();
    const result = await AuthApplication.signIn({ keypair });
    if (epoch !== this.epoch) throw createCanceledError();
    if (!result) return false;
    await this.completeAuthenticatedSession(result, { epoch });
    return true;
  }

  /**
   * Bootstrap data to initialize the application snapshot.
   * @param params - Object containing session and pubky data from authentication
   * @param params.session - The user session data
   * @param params.pubky - The user's public key identifier
   */
  private static async hydrateMeImAlive({ pubky }: { pubky: Pubky }) {
    const isCurrent = captureViewerSession();
    const signInStore = useSignInStore.getState();
    const {
      meta: { url },
    } = NotificationNormalizer.to(pubky);

    // Progress callback to update signInStore from Controller layer (respecting architecture rules)
    const onProgress: BootstrapProgressCallback = (step) => {
      if (!isCurrent()) return;
      switch (step) {
        case 'bootstrapFetched':
          signInStore.setBootstrapFetched(true); // Step 3 complete (60%)
          break;
        case 'dataPersisted':
          signInStore.setDataPersisted(true); // Step 4 complete (80%)
          break;
        case 'homeserverSynced':
          signInStore.setHomeserverSynced(true); // Step 5 complete (100%)
          break;
      }
    };

    const localSettings = SettingsNormalizer.extractState(useSettingsStore.getState());

    // Sync settings before bootstrap; failures fall back locally and suppress default-follow work for this session.
    const { remoteSettings, succeeded: settingsSyncSucceeded } = await this.syncSettings(pubky, localSettings);

    // Resolve final preferences: remote settings win if available, otherwise use local
    const preferences = (remoteSettings ?? localSettings).notifications;
    const allowedTypes = NotificationNormalizer.toEnabledTypes(preferences);

    if (!isCurrent()) return;
    const notification = await BootstrapApplication.initialize(
      { pubky, lastReadUrl: url, allowedTypes, isCurrent },
      onProgress,
    );
    if (!isCurrent()) return;
    useNotificationStore.getState().setState(notification);

    // Apply remote settings to store (store mutation stays in Controller layer)
    if (remoteSettings) {
      useSettingsStore.getState().loadFromHomeserver(remoteSettings);
      Logger.info('Settings loaded from homeserver', { pubky });
    }

    if (settingsSyncSucceeded) {
      this.startModerationFollow(pubky);
    }
  }

  /**
   * Session initialization shared by all sign-in flows; assumes the environment
   * guard already passed for this session.
   */
  private static async completeAuthenticatedSession(
    { session }: THomeserverSessionResult,
    {
      epoch = this.epoch,
      expectedPubky,
      required = [APP_CAPABILITIES],
      preserveContext = false,
    }: {
      epoch?: number;
      expectedPubky?: string;
      required?: readonly string[];
      preserveContext?: boolean;
    } = {},
  ) {
    const previous = useAuthStore.getState();
    const pubky = Identity.z32FromSession({ session });
    if (
      (expectedPubky && pubky !== expectedPubky) ||
      !hasCapabilities(session.info.capabilities, required) ||
      !session.grant
    ) {
      await AuthApplication.retainUnusedSession(session);
      throw createAuthApprovalMismatchError();
    }
    const persistence = AuthApplication.saveSession(session);
    let reference;
    try {
      reference = await persistence;
    } catch (error) {
      if (!this.isCurrentAdoption(epoch, previous.generation)) {
        await AuthApplication.retainUnusedSession(session, persistence);
        throw createCanceledError();
      }
      await AuthApplication.retainUnusedSession(session, persistence);
      throw error;
    }
    if (!this.isCurrentAdoption(epoch, previous.generation)) {
      await AuthApplication.retainUnusedSession(session, persistence);
      throw createCanceledError();
    }
    const persisted = AuthApplication.readPersistedAuth();
    // The onboarding key generator sets currentUserPubky before the account is authenticated.
    const sameAccount =
      previous.currentUserPubky === pubky &&
      (previous.session !== null || previous.sessionReference !== null || persisted?.currentUserPubky === pubky);
    const needsAccountPreparation =
      !sameAccount || AuthApplication.readPersistedAuth()?.needsAccountPreparation === true;
    const generation = crypto.randomUUID();
    const record: PersistedAuth = {
      currentUserPubky: pubky,
      sessionReference: reference,
      hasProfile: sameAccount ? previous.hasProfile : null,
      generation,
      retiringSession: null,
      needsAccountPreparation,
    };
    try {
      await AuthApplication.commitPersistedAuth(record, previous.generation, () => epoch === this.epoch);
    } catch (error) {
      if (isAuthFlowCanceledError(error) || !this.isCurrentAdoption(epoch, previous.generation)) {
        await AuthApplication.retainUnusedSession(session, persistence);
        throw createCanceledError();
      }
      await AuthApplication.retainUnusedSession(session, persistence);
      throw error;
    }
    const committed = AuthApplication.readPersistedAuth();
    if (!committed || committed.generation !== generation) {
      await AuthApplication.retainUnusedSession(session, persistence);
      await this.syncSessionFromStorage();
      throw createCanceledError();
    }
    // Once the reference is durable, this tab must adopt it even if UI cancellation arrives late.
    this.sessionRestore = null;
    previous.init({
      ...committed,
      session,
      restoreStatus: preserveContext && !needsAccountPreparation ? 'ready' : 'restoring',
    });
    void this.retireLegacyCookieSessions();
    if (needsAccountPreparation) useAuthStore.getState().setNeedsAccountSync(true);
    if (!preserveContext || needsAccountPreparation) useAuthStore.getState().setRestoreStatus('restoring');
    try {
      if (!sameAccount) {
        this.cancelModerationFollow();
        clearAllQueryClients();
        resetTabStore(useSettingsStore, true);
        resetTabStore(useNotificationStore, true);
        LocksController.clearLocalSession();
      }
      await this.prepareAccount(generation);
      if (!this.isCurrentGeneration(generation)) throw createCanceledError();
      void this.retrySessionRetirement(previous.session);
      if (!this.isCurrentGeneration(generation)) throw createCanceledError();
      if (
        needsAccountPreparation ||
        (!preserveContext && (!sameAccount || previous.hasProfile === null)) ||
        previous.needsAccountSync
      )
        await this.bootstrapProfile(session, generation);
      if (this.isCurrentGeneration(generation) && useAuthStore.getState().session === session)
        useAuthStore.getState().setRestoreStatus('ready');
    } catch (error) {
      // The replacement is already durable. Never resurrect the previous session or erase this grant.
      if (useAuthStore.getState().generation === generation && useAuthStore.getState().session === session)
        useAuthStore.getState().setRestoreStatus('temporary-error');
      throw error;
    }
  }

  private static async finishProfileBootstrap(session: Session, generation: string, restoring = false): Promise<void> {
    if (!this.isCurrentGeneration(generation) || useAuthStore.getState().session !== session)
      throw createCanceledError();
    const signInStore = useSignInStore.getState();
    signInStore.reset();
    signInStore.setAuthUrlResolved(true);
    const pubky = Identity.z32FromSession({ session });
    const isSignedUp = restoring
      ? await AuthApplication.resolveUserIsSignedUp({ pubky })
      : await AuthApplication.userIsSignedUp({ pubky });
    if (isSignedUp === null) {
      throw Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Could not determine the account profile. Try again.', {
        service: ErrorService.Homeserver,
        operation: 'restoreProfile',
      });
    }
    if (!this.isCurrentGeneration(generation) || useAuthStore.getState().session !== session)
      throw createCanceledError();
    signInStore.setProfileChecked(true);
    if (isSignedUp) await this.hydrateMeImAlive({ pubky });
    if (!this.isCurrentGeneration(generation) || useAuthStore.getState().session !== session)
      throw createCanceledError();
    useAuthStore.getState().setHasProfile(isSignedUp);
    useAuthStore.getState().setNeedsAccountSync(false);
  }

  /** Share bootstrap across UI deadlines and retries, retaining ownership until it really settles. */
  private static async bootstrapProfile(session: Session, generation: string, restoring = false): Promise<void> {
    if (this.profileBootstrap?.generation !== generation || this.profileBootstrap.session !== session) {
      const task = this.finishProfileBootstrap(session, generation, restoring).then(() => {
        if (this.isCurrentGeneration(generation) && useAuthStore.getState().session === session)
          useAuthStore.getState().setRestoreStatus('ready');
      });
      this.profileBootstrap = { generation, session, task };
      void task
        .finally(() => {
          if (this.profileBootstrap?.task === task) this.profileBootstrap = null;
        })
        .catch(() => {});
    }
    await this.bounded(this.profileBootstrap.task, 'bootstrapProfile');
  }

  /** Best-effort revocation never gates an otherwise usable grant. Failed credentials remain durable. */
  static async retrySessionRetirement(livePrevious?: Session | null): Promise<void> {
    let snapshot: PersistedAuth | null;
    try {
      snapshot = AuthApplication.readPersistedAuth();
    } catch {
      return;
    }
    const references = pendingRetirements(snapshot ?? useAuthStore.getState());
    if (references.length === 0) return;
    await Promise.allSettled(references.map((reference) => this.retireSession(reference, livePrevious)));
    let latest: PersistedAuth | null;
    try {
      latest = AuthApplication.readPersistedAuth();
    } catch {
      return;
    }
    if (latest && this.isCurrentGeneration(latest.generation)) {
      useAuthStore.setState({ retiringSession: latest.retiringSession, pendingRetirements: latest.pendingRetirements });
    }
  }

  private static retireSession(reference: SessionReference, livePrevious?: Session | null): Promise<void> {
    const existing = this.retirementTasks.get(reference.sessionStoreId);
    if (existing) return existing;
    const task = (async () => {
      if (AuthApplication.readPersistedAuth()?.sessionReference?.sessionStoreId === reference.sessionStoreId) return;
      let session: Session | null = null;
      try {
        // A live predecessor is only reusable when it belongs to this exact grant.
        const info = await livePrevious?.grant?.sessionInfo();
        session =
          info?.grantId === reference.grantId
            ? (livePrevious ?? null)
            : await AuthApplication.restoreReference(reference);
        if (AuthApplication.readPersistedAuth()?.sessionReference?.sessionStoreId === reference.sessionStoreId) return;
        if (session) await AuthApplication.logout({ session });
      } catch (error) {
        const terminal =
          isAppError(error) &&
          (error.context?.reason === 'missing_local_grant' || error.context?.reason === 'remote_logout_completed');
        if (!terminal && reference.grantExpiresAt > Date.now() / 1000) throw error;
      }
      if (AuthApplication.readPersistedAuth()?.sessionReference?.sessionStoreId === reference.sessionStoreId) return;
      await AuthApplication.removeSessionRecord(reference);
      await AuthApplication.finishRetirement(reference.sessionStoreId);
    })();
    this.retirementTasks.set(reference.sessionStoreId, task);
    void task
      .finally(() => {
        if (this.retirementTasks.get(reference.sessionStoreId) === task)
          this.retirementTasks.delete(reference.sessionStoreId);
      })
      .catch(() => {});
    return task;
  }

  /**
   * Signs up a new user with the homeserver using the provided secret key and signup token.
   * @param params - Object containing secret key and signup token for registration
   * @param params.secretKey - The secret key for the user
   * @param params.signupToken - Invitation code for user registration
   */
  static async signUp({ secretKey, signupToken }: TSignUpParams): Promise<void> {
    if (this.signupPromise) return this.signupPromise;
    this.cancelActiveAuthFlow();
    const epoch = this.epoch;
    const task = (async () => {
      void this.retrySessionRetirement();
      const keypair = Identity.keypairFromSecretKey(secretKey);
      const pubky = keypair.publicKey.z32();
      const onboarding = useOnboardingStore.getState();
      const context = { pubky, homeserver: getHomeserver(), environment: getDeployEnv() };
      const attempt = onboarding.signupAttempt;
      const continuing =
        attempt?.pubky === pubky &&
        attempt.homeserver === context.homeserver &&
        attempt.environment === context.environment;
      let result: THomeserverSessionResult | undefined;
      if (continuing) {
        // The previous create response may have been lost after the invite was consumed.
        try {
          result = await AuthApplication.signInCreatedAccount({ keypair });
        } catch (error) {
          if (epoch !== this.epoch) throw createCanceledError();
          if (attempt.phase === 'created' || !isAppError(error) || !isNotFound(error)) throw error;
        }
      }
      if (!result) {
        onboarding.setSignupAttempt({ ...context, phase: 'creating' });
        try {
          await AuthApplication.createAccount({ keypair, signupToken });
        } catch (error) {
          // A definitive invite rejection did not create the account. Keep its recovery keys,
          // but let the user correct the invite instead of treating it as an uncertain creation.
          if (
            epoch === this.epoch &&
            isAppError(error) &&
            (error.code === AuthErrorCode.UNAUTHORIZED ||
              error.code === AuthErrorCode.FORBIDDEN ||
              error.code === AuthErrorCode.SESSION_EXPIRED)
          )
            onboarding.setSignupAttempt(null);
          throw error;
        }
        if (epoch !== this.epoch) throw createCanceledError();
        onboarding.setSignupAttempt({ ...context, phase: 'created' });
        result = await AuthApplication.signInCreatedAccount({ keypair });
      }
      if (epoch !== this.epoch) throw createCanceledError();
      await this.completeAuthenticatedSession(result, { epoch });
    })();
    this.signupPromise = task;
    try {
      await task;
    } finally {
      if (this.signupPromise === task) this.signupPromise = null;
    }
  }

  /**
   * Authenticates the keypair with the homeserver and saves the authenticated data if successful.
   * @param params - Object containing the mnemonic phrase for key derivation
   * @param params.mnemonic - The mnemonic phrase for key derivation
   * @returns Promise resolving to true if authentication succeeded, false otherwise
   */
  static async loginWithMnemonic({ mnemonic }: TLoginWithMnemonicParams): Promise<boolean> {
    const keypair = Identity.keypairFromMnemonic(mnemonic);
    return await this.signIn({ keypair });
  }

  /**
   * Decrypts the file to obtain the keypair, authenticates with the homeserver, and saves authenticated data if successful.
   * @param params - Object containing the encrypted file and password for decryption
   * @param params.encryptedFile - The encrypted recovery file
   * @param params.password - The password to decrypt the recovery file
   * @returns Promise resolving to true if authentication succeeded, false otherwise
   */
  static async loginWithEncryptedFile({ encryptedFile, password }: TLoginWithEncryptedFileParams): Promise<boolean> {
    const keypair = await Identity.decryptRecoveryFile({ encryptedFile, passphrase: password });
    return await this.signIn({ keypair });
  }

  /**
   * Owns a Ring flow across UI unmounts and shares it across Strict Mode subscribers.
   * @param request - The bound authorization purpose, identity and scopes
   * @returns Promise resolving to the generated authentication URL with wrapped approval
   */
  private static async wrapAuthFlow(request: GrantFlowRequest, deferAdoption = false): Promise<TGenerateAuthUrlResult> {
    const key = JSON.stringify({ ...request, fresh: false });
    if (!request.fresh && this.activeAuthFlow?.key === key) return this.activeAuthFlow.result;
    // Preserve the pending serialization when resuming after page reload.
    this.activeAuthFlow?.cancel?.();
    const epoch = ++this.epoch;
    const token = Symbol('grant-flow');
    const result = (async () => {
      const flow = await AuthApplication.startGrantFlow(request);
      if (epoch !== this.epoch) {
        void flow.awaitApproval.then((session) => AuthApplication.retainUnusedSession(session)).catch(() => {});
        flow.cancelAuthFlow();
        throw createCanceledError();
      }
      if (this.activeAuthFlow?.token === token) this.activeAuthFlow.cancel = flow.cancelAuthFlow;
      const awaitApproval = flow.awaitApproval
        .then(async (session) => {
          const assertCurrent = async () => {
            if (!this.isCurrentAdoption(epoch, request.generation)) {
              await AuthApplication.retainUnusedSession(session);
              flow.completeAuthFlow?.();
              throw createCanceledError();
            }
          };
          await assertCurrent();
          const adopt = async () => {
            await assertCurrent();
            try {
              await AuthApplication.assertUserHomeserverAllowed({ publicKey: session.info.publicKey });
            } catch (error) {
              await assertCurrent();
              await AuthApplication.retainUnusedSession(session);
              flow.completeAuthFlow?.();
              throw error;
            }
            await assertCurrent();
            let completed = false;
            try {
              await this.completeAuthenticatedSession(
                { session },
                {
                  epoch,
                  expectedPubky: request.expectedPubky,
                  required: request.capabilities.split(','),
                  preserveContext: request.purpose === 'upgrade',
                },
              );
            } catch (error) {
              completed = isAuthFlowCanceledError(error) || isAuthApprovalMismatchError(error);
              throw error;
            } finally {
              if (completed || useAuthStore.getState().session === session) flow.completeAuthFlow?.();
            }
          };
          if (deferAdoption) this.pendingSessionAdoptions.set(session, adopt);
          else await adopt();
          return session;
        })
        .finally(() => {
          if (this.activeAuthFlow?.token === token) this.activeAuthFlow = null;
        });
      // Consumers may unmount during Ring handoff. Adoption still runs; prevent an unhandled rejection.
      void awaitApproval.catch(() => {});
      return {
        ...flow,
        awaitApproval,
        cancelAuthFlow: () => {
          if (this.activeAuthFlow?.token === token) this.cancelActiveAuthFlow();
          else flow.cancelAuthFlow();
        },
      };
    })();
    this.activeAuthFlow = { key, token, result, cancel: null };
    void result.catch(() => {
      if (this.activeAuthFlow?.token === token) this.activeAuthFlow = null;
    });
    return result;
  }

  /**
   * Centralizes all local state cleanup: resets every Zustand store,
   * IndexedDB, query cache, singletons, in-memory stream pagination queues, persisted localStorage keys,
   * and mute-sync `sessionStorage` cursors.
   * Used after explicit logout. Failed restoration never clears account data.
   */
  private static async cleanupLocalState(isCurrent: () => boolean, persist = true) {
    if (!isCurrent()) return;
    this.cancelModerationFollow();
    // Mute-list SSE cursors live in sessionStorage; clear before the next account might reuse the same tab.
    clearMuteSyncCursorSessionStorage();

    // Reset singletons
    PubkySpecsSingleton.reset();
    // CoordinatorManager owns TTL lifetime; its auth listener clears session work.
    StreamCoordinator.resetInstance();
    NotificationCoordinator.resetInstance();

    // Clear in-memory feed stream queues
    postStreamQueue.clear();

    // Cancel and clear all query clients (nexus, homegate, exchangerate, and any future ones)
    clearAllQueryClients();

    // Reset all Zustand stores.
    resetTabStore(useOnboardingStore, persist);
    resetTabStore(useAuthStore, persist);
    useSignInStore.getState().reset();
    useLocalFilesStore.getState().reset();
    resetTabStore(useHomeStore, persist);
    resetTabStore(useHotStore, persist);
    resetTabStore(useSearchStore, persist);
    resetTabStore(useNotificationStore, persist);
    resetTabStore(useSettingsStore, persist);

    // Unified logout: tear down the Locks session (Lock Server signout + local store) alongside the
    // homeserver session, so the user can never stay logged into Locks after leaving pubky.app.
    await LocksController.logout(persist);

    if (!persist || !isCurrent()) return;
    // Credential logout is already complete; cache cleanup cannot turn it into a failed sign-out.
    await this.bounded(clearDatabase(isCurrent), 'clearAccount', LOGOUT_TIMEOUT_MS, ErrorService.Local).catch(
      (error) => {
        if (!isAppError(error)) toAppError(error, ErrorService.Local, 'clearAccount');
      },
    );
    if (!isCurrent()) return;
    // Skip post-migration resync — full cleanup resets all state
    useMigrationStore.getState().reset();
  }

  /**
   * Generates an authentication URL for external authentication flows.
   * @returns Promise resolving to the generated authentication URL
   */
  static async getAuthUrl(fresh = false): Promise<TGenerateAuthUrlResult> {
    const state = useAuthStore.getState();
    return this.wrapAuthFlow({
      purpose: 'signin',
      capabilities: HOMESERVER_CAPABILITIES,
      generation: state.generation,
      fresh,
    });
  }

  static async getSignupAuthUrl(inviteCode: string, fresh = false): Promise<TGenerateAuthUrlResult> {
    return this.wrapAuthFlow({
      purpose: 'signup',
      capabilities: HOMESERVER_CAPABILITIES,
      generation: useAuthStore.getState().generation,
      inviteCode,
      fresh,
    });
  }

  /** Feature UI displays the returned QR/deeplink and awaits approval before resuming its action. */
  static async requestCapabilities(
    required: readonly string[] = LOCKS_CAPABILITIES,
    fresh = false,
  ): Promise<TGenerateAuthUrlResult | null> {
    void this.retrySessionRetirement();
    const state = useAuthStore.getState();
    if (this.hasCapabilities(required)) return null;
    if (!state.currentUserPubky)
      throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'Sign in before requesting permissions.', {
        service: ErrorService.Local,
        operation: 'requestCapabilities',
      });
    const capabilities = validateCapabilities(
      [APP_CAPABILITIES, ...(state.session?.info.capabilities ?? []), ...required].join(','),
    ) as Capabilities;
    return this.wrapAuthFlow({
      purpose: 'upgrade',
      capabilities,
      fresh,
      generation: state.generation,
      expectedPubky: state.currentUserPubky,
    });
  }

  /**
   * Generates the sign-in authentication URL handed to Pubky Passport ("Continue with Google").
   * Shares the single-active-flow tracking with the Pubky Ring flows, so starting Passport cancels
   * a pending Ring request and vice versa.
   * @param params - x-callback-url metadata (source label and same-origin callbacks)
   * @returns Promise resolving to the generated authentication URL with wrapped approval
   */
  static async getPassportAuthUrl(params: TGeneratePassportAuthUrlParams): Promise<TGenerateAuthUrlResult> {
    const state = useAuthStore.getState();
    return this.wrapAuthFlow(
      {
        purpose: 'signin',
        capabilities: params.caps || HOMESERVER_CAPABILITIES,
        generation: state.generation,
        xCallback: params.xCallback,
        fresh: true,
      },
      true,
    );
  }

  /** Completes the specific Passport approval after its hook has stopped the popup timers. */
  static async initializeAuthenticatedSession({ session }: THomeserverSessionResult): Promise<void> {
    const adopt = this.pendingSessionAdoptions.get(session);
    this.pendingSessionAdoptions.delete(session);
    if (!adopt) throw createCanceledError();
    await adopt();
  }

  /** Uses the grant upgrade while keeping the merged Locks UI's entry point. */
  static async getUpgradeAuthUrl(fresh = false): Promise<TGenerateAuthUrlResult | null> {
    return this.requestCapabilities(LOCKS_CAPABILITIES, fresh);
  }

  /**
   * Logs out the current user from both the homeserver and local application state.
   */
  static async logout(): Promise<void> {
    const owner = Symbol('logout');
    this.logoutOwner = owner;
    this.restoreVersion++;
    this.sessionRestore = null;
    this.accountPreparation?.cancel();
    this.accountPreparation = null;
    this.cancelActiveAuthFlow();
    this.cancelModerationFollow();
    const epoch = this.epoch;
    const snapshot = useAuthStore.getState();
    snapshot.setIsLoggingOut(true);
    const generation = crypto.randomUUID();
    let record: PersistedAuth = {
      currentUserPubky: null,
      hasProfile: null,
      sessionReference: null,
      retiringSession: null,
      pendingRetirements: pendingRetirements({
        retiringSession: snapshot.sessionReference,
        pendingRetirements: pendingRetirements(snapshot),
      }),
      generation,
    };
    let canCommit = true;
    let persisted = false;
    let localGeneration = generation;
    try {
      try {
        await this.bounded(
          AuthApplication.commitPersistedAuth(
            record,
            snapshot.generation,
            () => canCommit && this.epoch === epoch && useAuthStore.getState().generation === snapshot.generation,
          ),
          'persistLogout',
          LOGOUT_TIMEOUT_MS,
          ErrorService.Local,
        );
        persisted = true;
      } catch {
        canCommit = false;
        if (this.epoch !== epoch || useAuthStore.getState().generation !== snapshot.generation)
          throw createCanceledError();
        let current: PersistedAuth | null = null;
        try {
          current = AuthApplication.readPersistedAuth();
        } catch {
          // Unreadable storage must not prevent this tab from signing out.
        }
        if (current && current.generation !== snapshot.generation) {
          await this.syncSessionFromStorage();
          throw createCanceledError();
        }
        localGeneration = snapshot.generation;
        AuthApplication.suppressLocalAuthRestore(localGeneration);
        Logger.warn('Local sign-out could not be saved. This tab will not restore the discarded session.');
      } finally {
        canCommit = false;
      }
      if (persisted) {
        const committed = AuthApplication.readPersistedAuth();
        if (
          committed?.generation !== generation ||
          this.epoch !== epoch ||
          useAuthStore.getState().generation !== snapshot.generation
        ) {
          await this.syncSessionFromStorage();
          throw createCanceledError();
        }
        // The locked commit may have recovered revocation obligations hidden by a previous tab-only logout.
        record = committed;
      }
      // The tab-only fallback must never enqueue metadata over the retained durable credentials.
      const { storage } = useAuthStore.persist.getOptions();
      if (!persisted && storage)
        useAuthStore.persist.setOptions({ storage: { ...storage, setItem: () => {}, removeItem: () => {} } });
      try {
        snapshot.init({ ...record, generation: localGeneration, session: null });
      } finally {
        if (!persisted) useAuthStore.persist.setOptions({ storage });
      }
      const isCurrent = () =>
        this.epoch === epoch &&
        useAuthStore.getState().generation === localGeneration &&
        (!persisted || this.isCurrentGeneration(localGeneration));
      const remote = Promise.allSettled([
        ...pendingRetirements(record).map((ref) => this.retireSession(ref, snapshot.session)),
        this.retireLegacyCookieSessions(),
        snapshot.currentUserPubky ? AuthApplication.logoutLegacyCookie(snapshot.currentUserPubky) : Promise.resolve(),
      ]);
      if (persisted)
        await this.bounded(remote, 'logout', LOGOUT_TIMEOUT_MS)
          .then((outcomes) => {
            if (outcomes.some((outcome) => outcome.status === 'rejected'))
              Logger.warn('Local sign-out completed; remote revocation could not be confirmed.');
          })
          .catch(() => {});
      await this.cleanupLocalState(isCurrent, persisted);
      if (!isCurrent()) {
        await this.syncSessionFromStorage();
        throw createCanceledError();
      }
    } finally {
      if (this.logoutOwner === owner) {
        this.logoutOwner = null;
        useAuthStore.getState().setIsLoggingOut(false);
      }
    }
  }

  /**
   * Initializes the application bootstrap after profile creation.
   * Waits for Nexus to index the user's profile.json, then bootstraps notifications and data.
   */
  static async bootstrapWithDelay() {
    const authStore = useAuthStore.getState();
    const pubky = authStore.selectCurrentUserPubky();
    // Wait 5 seconds before bootstrap to let Nexus index the user
    Logger.info(`Waiting 5 seconds to index ${pubky} profile.json in Nexus before bootstrap...`);
    await sleep(5000);
    await this.hydrateMeImAlive({ pubky });
    authStore.setHasProfile(true);
  }

  /**
   * Syncs user settings with the homeserver.
   * Returns remote settings if newer, null otherwise, plus whether synchronization succeeded.
   * Failures are non-blocking but suppress moderation follow for this session because opt-out state is unknown.
   */
  private static async syncSettings(
    pubky: Pubky,
    localSettings: SettingsState,
  ): Promise<{ remoteSettings: SettingsState | null; succeeded: boolean }> {
    try {
      return {
        remoteSettings: await SettingsApplication.initializeSettings(pubky, localSettings),
        succeeded: true,
      };
    } catch (error) {
      Logger.error('Failed to initialize settings during bootstrap', { error, pubky });
      return { remoteSettings: null, succeeded: false };
    }
  }

  /**
   * Generates a signup token for user registration. This is just for testing environments
   * @returns Promise resolving to the generated signup token
   */
  static async generateSignupToken() {
    return await AuthApplication.generateSignupToken();
  }

  /**
   * Verifies an invite code (signup token) against the homeserver before applying it.
   * @param inviteCode - The invite code to verify
   * @returns `'valid'`, `'used'`, or `'invalid'` depending on the homeserver response
   */
  static async verifySignupToken(inviteCode: string) {
    return await AuthApplication.verifySignupToken(inviteCode);
  }
}
