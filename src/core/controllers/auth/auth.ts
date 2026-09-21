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
import { getDeployEnv, getHomeserver } from '@/config/network';
import type {
  TLoginWithEncryptedFileParams,
  TLoginWithMnemonicParams,
  TSignUpParams,
} from '@/controllers/auth/auth.types';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { NotificationCoordinator } from '@/coordinators/notifications/notifications';
import { StreamCoordinator } from '@/coordinators/streams/stream';
import { clearDatabase } from '@/database/franky/franky.helpers';
import { createCanceledError } from '@/libs/auth/cancellation';
import { hasCapabilities } from '@/libs/auth/capabilities';
import type { PersistedAuth } from '@/libs/auth/session.types';
import { AuthErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, isNotFound, isWrongEnvironmentHomeserverError } from '@/libs/error/error.utils';
import { Identity } from '@/libs/identity/identity';
import { Logger } from '@/libs/logger/logger';
import { clearMuteSyncCursorSessionStorage } from '@/libs/mute-sync/clear-cursor-session-storage';
import { clearAllQueryClients } from '@/libs/query-client/query-client.factory';
import { clearCookies, sleep } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import type { GrantFlowRequest } from '@/services/homeserver/grant-flow';
import type { TGenerateAuthUrlResult, THomeserverSessionResult } from '@/services/homeserver/homeserver.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useHomeStore } from '@/stores/home/home.store';
import { useHotStore } from '@/stores/hot/hot.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
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
function resetTabStore<T>(store: {
  getState(): { reset(): void };
  persist: {
    getOptions(): { storage?: PersistStorage<T> };
    setOptions(options: { storage?: PersistStorage<T> }): void;
  };
}): void {
  const { storage } = store.persist.getOptions();
  if (!storage) return;
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
  private static epoch = 0;
  private static restorePromise: Promise<boolean> | null = null;
  private static signupPromise: Promise<void> | null = null;

  private static async bounded<T>(task: Promise<T>, operation: string, milliseconds = 12_000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Could not reach the homeserver. Try again.', {
                  service: ErrorService.Homeserver,
                  operation,
                }),
              ),
            milliseconds,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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

  private static moderationFollowAbortController: AbortController | null = null;

  /** Permission preflight shared by feature hooks; cookie and grant sessions use the same scopes. */
  static hasCapabilities(required: readonly string[]): boolean {
    const state = useAuthStore.getState();
    if (
      state.retiringSession ||
      state.isRestoringSession ||
      state.restoreStatus === 'temporary-error' ||
      state.restoreStatus === 'reauth-required'
    )
      return false;
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
    if (!useAuthStore.getState().sessionReference && useAuthStore.getState().restoreStatus === 'temporary-error') {
      await useAuthStore.persist.rehydrate();
      if (!useAuthStore.getState().sessionReference) return false;
    }
    const epoch = this.epoch;
    const snapshot = useAuthStore.getState();
    const generation = snapshot.generation;
    const isCurrent = () => this.epoch === epoch && this.isCurrentGeneration(generation);
    const task = (async () => {
      snapshot.setRestoreStatus('restoring');
      try {
        const result = snapshot.session
          ? { status: 'restored' as const, session: snapshot.session }
          : await this.bounded(
              AuthApplication.restorePersistedSession({
                reference: snapshot.sessionReference,
                expectedPubky: snapshot.currentUserPubky,
              }),
              'restoreSession',
            );
        if (!isCurrent()) return false;
        if (result.status !== 'restored') {
          useAuthStore.getState().setRestoreStatus(result.status === 'none' ? 'idle' : result.status);
          return false;
        }
        const current = useAuthStore.getState();
        current.init({
          session: result.session,
          currentUserPubky: snapshot.currentUserPubky,
          hasProfile: current.hasProfile,
          sessionReference: snapshot.sessionReference,
          generation,
          retiringSession: current.retiringSession,
        });
        useAuthStore.getState().setRestoreStatus('restoring');
        await this.retrySessionRetirement();
        if (!isCurrent()) return false;
        if (useAuthStore.getState().hasProfile === null || useAuthStore.getState().needsAccountSync)
          await this.bounded(this.finishProfileBootstrap(result.session, generation), 'restoreProfile');
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
      if (this.epoch === epoch && useAuthStore.getState().generation === generation) {
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

  static async syncSessionFromStorage(): Promise<void> {
    const incoming = AuthApplication.readPersistedAuth();
    const previous = useAuthStore.getState();
    if (incoming?.generation === previous.generation) {
      await useAuthStore.persist.rehydrate();
      if (previous.retiringSession && !incoming.retiringSession && previous.session) {
        await this.restorePersistedSession();
      }
      return;
    }
    this.cancelActiveAuthFlow();
    this.cancelModerationFollow();
    const epoch = this.epoch;
    const previousRestore = this.restorePromise;
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
      current.setNeedsAccountSync(current.currentUserPubky !== null);
      // Another tab may have just signed up and still need its recovery backup.
      await useOnboardingStore.persist.rehydrate();
      if (epoch !== this.epoch) return;
      const onboarding = useOnboardingStore.getState();
      let onboardingPubky = onboarding.signupAttempt?.pubky;
      if (!onboardingPubky && onboarding.secretKey) {
        try {
          onboardingPubky = Identity.keypairFromSecretKey(onboarding.secretKey).publicKey.z32();
        } catch {
          // Corrupt legacy recovery material must not become another account's backup.
        }
      }
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
    await this.retrySessionRetirement();
    const result = await AuthApplication.signIn({ keypair });
    if (epoch !== this.epoch) throw createCanceledError();
    if (!result) return false;
    const state = useAuthStore.getState();
    await this.completeAuthenticatedSession(result, {
      epoch,
      expectedPubky: state.restoreStatus === 'reauth-required' ? (state.currentUserPubky ?? undefined) : undefined,
    });
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
      throw Err.auth(AuthErrorCode.FORBIDDEN, 'The approved account or permissions do not match this request.', {
        service: ErrorService.Homeserver,
        operation: 'adoptGrant',
      });
    }
    const reference = await AuthApplication.saveSession(session);
    const discardUnusedRecord = async () => {
      const current = AuthApplication.readPersistedAuth()?.sessionReference;
      if (
        reference.kind === 'grant' &&
        !(current?.kind === 'grant' && current.sessionStoreId === reference.sessionStoreId)
      ) {
        await AuthApplication.removeUnusedSessionRecord(reference).catch(() => {});
      }
    };
    if (epoch !== this.epoch || !this.isCurrentGeneration(previous.generation)) {
      await discardUnusedRecord();
      throw createCanceledError();
    }
    const sameAccount = previous.currentUserPubky === pubky;
    const generation = crypto.randomUUID();
    const retiringSession =
      previous.sessionReference &&
      !(
        previous.sessionReference.kind === 'grant' &&
        reference.kind === 'grant' &&
        previous.sessionReference.grantId === reference.grantId
      )
        ? previous.sessionReference
        : previous.retiringSession;
    const record: PersistedAuth = {
      currentUserPubky: pubky,
      sessionReference: reference,
      hasProfile: sameAccount ? previous.hasProfile : null,
      generation,
      retiringSession,
    };
    try {
      await AuthApplication.commitPersistedAuth(record, previous.generation, () => epoch === this.epoch);
    } catch (error) {
      await discardUnusedRecord();
      throw error;
    }
    if (AuthApplication.readPersistedAuth()?.generation !== generation) {
      await this.syncSessionFromStorage();
      throw createCanceledError();
    }
    // Once the reference is durable, this tab must adopt it even if UI cancellation arrives late.
    previous.init({ ...record, session });
    useAuthStore.getState().setRestoreStatus('restoring');
    try {
      if (!sameAccount) {
        this.cancelModerationFollow();
        clearAllQueryClients();
        await clearDatabase();
        useMigrationStore.getState().reset();
        useSettingsStore.getState().reset();
      }
      await this.retrySessionRetirement(previous.sessionReference === retiringSession ? previous.session : null);
      if ((!preserveContext && (!sameAccount || previous.hasProfile === null)) || previous.needsAccountSync)
        await this.bounded(this.finishProfileBootstrap(session, generation), 'bootstrapProfile');
      if (this.isCurrentGeneration(generation)) useAuthStore.getState().setRestoreStatus('ready');
    } catch (error) {
      // The replacement is already durable. Never resurrect the old cookie or erase this grant.
      if (useAuthStore.getState().generation === generation)
        useAuthStore.getState().setRestoreStatus('temporary-error');
      throw error;
    }
  }

  private static async finishProfileBootstrap(session: Session, generation: string): Promise<void> {
    const signInStore = useSignInStore.getState();
    signInStore.reset();
    signInStore.setAuthUrlResolved(true);
    const pubky = Identity.z32FromSession({ session });
    const isSignedUp = await AuthApplication.userIsSignedUp({ pubky });
    if (!this.isCurrentGeneration(generation)) throw createCanceledError();
    signInStore.setProfileChecked(true);
    if (isSignedUp) await this.hydrateMeImAlive({ pubky });
    if (!this.isCurrentGeneration(generation)) throw createCanceledError();
    useAuthStore.getState().setHasProfile(isSignedUp);
    useAuthStore.getState().setNeedsAccountSync(false);
  }

  static async retrySessionRetirement(livePrevious?: Session | null): Promise<void> {
    const snapshot = useAuthStore.getState();
    const reference = snapshot.retiringSession;
    if (!reference) return;
    let previous = livePrevious;
    if (!previous) {
      try {
        previous = await this.bounded(AuthApplication.restoreReference(reference), 'restoreRetiringSession');
      } catch (error) {
        // A rejected grant must not block adoption of its valid replacement.
        const gone = isAppError(error) && error.code === AuthErrorCode.SESSION_EXPIRED;
        const expired = reference.kind === 'grant' && reference.grantExpiresAt <= Date.now() / 1000;
        const missingMaterial = isAppError(error) && error.context?.reason === 'missing_local_grant';
        if (!gone && !expired && !missingMaterial) throw error;
        if (missingMaterial || (gone && reference.kind === 'grant'))
          Logger.warn('Previous grant credentials are unavailable; remote revocation could not be confirmed.');
      }
    }
    if (previous) {
      try {
        await this.bounded(AuthApplication.logout({ session: previous }), 'retireSession');
      } catch (error) {
        if (reference.kind !== 'grant' || !isAppError(error) || error.code !== AuthErrorCode.SESSION_EXPIRED)
          throw error;
        // This may be a revoked grant or a rejected proof. Do not claim remote revocation succeeded.
        Logger.warn('Previous grant was rejected; remote revocation could not be confirmed.');
      }
    }
    if (!this.isCurrentGeneration(snapshot.generation)) throw createCanceledError();
    await AuthApplication.removeSessionRecord(reference);
    if (!this.isCurrentGeneration(snapshot.generation)) throw createCanceledError();
    useAuthStore.getState().setRetiringSession(null);
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
      await this.retrySessionRetirement();
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
          if (attempt.phase === 'created' || !isAppError(error) || !isNotFound(error)) throw error;
        }
      }
      if (!result) {
        onboarding.setSignupAttempt({ ...context, phase: 'creating' });
        await AuthApplication.createAccount({ keypair, signupToken });
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
  private static async wrapAuthFlow(request: GrantFlowRequest): Promise<TGenerateAuthUrlResult> {
    const key = JSON.stringify({ ...request, fresh: false });
    if (!request.fresh && this.activeAuthFlow?.key === key) return this.activeAuthFlow.result;
    // Preserve the pending serialization when resuming after page reload.
    this.activeAuthFlow?.cancel?.();
    const epoch = ++this.epoch;
    const token = Symbol('grant-flow');
    const result = (async () => {
      const flow = await AuthApplication.startGrantFlow(request);
      if (epoch !== this.epoch) {
        void flow.awaitApproval.catch(() => {});
        flow.cancelAuthFlow();
        throw createCanceledError();
      }
      if (this.activeAuthFlow?.token === token) this.activeAuthFlow.cancel = flow.cancelAuthFlow;
      const awaitApproval = flow.awaitApproval
        .then(async (session) => {
          if (epoch !== this.epoch) throw createCanceledError();
          await AuthApplication.assertUserHomeserverAllowed({ publicKey: session.info.publicKey });
          if (epoch !== this.epoch) throw createCanceledError();
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
          } finally {
            if (useAuthStore.getState().session === session) flow.completeAuthFlow?.();
          }
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
   * Centralizes all local state cleanup: resets every Zustand store, clears cookies,
   * IndexedDB, query cache, singletons, in-memory stream pagination queues, persisted localStorage keys,
   * and mute-sync `sessionStorage` cursors.
   * Used after explicit logout. Failed restoration never clears account data.
   */
  private static async cleanupLocalState() {
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

    // Cancel active auth flows
    this.cancelActiveAuthFlow();

    // Cancel and clear all query clients (nexus, homegate, exchangerate, and any future ones)
    clearAllQueryClients();

    // Reset all Zustand stores.
    useOnboardingStore.getState().reset();
    useAuthStore.getState().reset();
    useSignInStore.getState().reset();
    useLocalFilesStore.getState().reset();
    useHomeStore.getState().reset();
    useHotStore.getState().reset();
    useSearchStore.getState().reset();
    useNotificationStore.getState().reset();
    useSettingsStore.getState().reset();

    // Clear cookies (also drops any stale `locale` cookie from the removed language selection)
    clearCookies();

    await clearDatabase();
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
      capabilities: APP_CAPABILITIES,
      generation: state.generation,
      fresh,
      expectedPubky: state.restoreStatus === 'reauth-required' ? (state.currentUserPubky ?? undefined) : undefined,
    });
  }

  static async getSignupAuthUrl(inviteCode: string, fresh = false): Promise<TGenerateAuthUrlResult> {
    return this.wrapAuthFlow({
      purpose: 'signup',
      capabilities: APP_CAPABILITIES,
      generation: useAuthStore.getState().generation,
      inviteCode,
      fresh,
    });
  }

  /** Feature UI displays the returned QR/deeplink and awaits approval before resuming its action. */
  static async requestCapabilities(
    required: readonly string[] = LOCKS_CAPABILITIES,
  ): Promise<TGenerateAuthUrlResult | null> {
    await this.retrySessionRetirement();
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
      generation: state.generation,
      expectedPubky: state.currentUserPubky,
    });
  }

  /**
   * Logs out the current user from both the homeserver and local application state.
   */
  static async logout(): Promise<void> {
    this.cancelActiveAuthFlow();
    this.cancelModerationFollow();
    const snapshot = useAuthStore.getState();
    snapshot.setIsLoggingOut(true);
    const generation = crypto.randomUUID();
    const record: PersistedAuth = {
      currentUserPubky: null,
      hasProfile: null,
      sessionReference: null,
      retiringSession: null,
      generation,
    };
    await AuthApplication.commitPersistedAuth(record, snapshot.generation);
    snapshot.init({ ...record, session: null });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const remote = async () => {
        const session =
          snapshot.session ??
          (snapshot.sessionReference ? await AuthApplication.restoreReference(snapshot.sessionReference) : null);
        if (session) await AuthApplication.logout({ session });
        if (snapshot.retiringSession) {
          const retired = await AuthApplication.restoreReference(snapshot.retiringSession);
          await AuthApplication.logout({ session: retired });
        }
      };
      await Promise.race([
        remote(),
        new Promise<void>((_, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'Remote sign-out could not be confirmed.', {
                  service: ErrorService.Homeserver,
                  operation: 'logout',
                }),
              ),
            LOGOUT_TIMEOUT_MS,
          );
        }),
      ]).catch(() => {
        Logger.warn('Local sign-out completed; remote revocation could not be confirmed.');
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      // No global SDK clearAll: another tab may have saved a new grant during the remote request.
      for (const reference of [snapshot.sessionReference, snapshot.retiringSession]) {
        const current = AuthApplication.readPersistedAuth()?.sessionReference;
        if (
          reference &&
          !(
            reference.kind === 'grant' &&
            current?.kind === 'grant' &&
            current.sessionStoreId === reference.sessionStoreId
          )
        )
          await AuthApplication.removeSessionRecord(reference).catch(() => {});
      }
      if (this.isCurrentGeneration(generation)) await this.cleanupLocalState();
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
