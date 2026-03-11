import * as Core from '@/core';
import * as Libs from '@/libs';

export class AuthController {
  private constructor() {} // Prevent instantiation

  private static activeAuthFlow: { token: symbol; cancel: (() => void) | null } | null = null;

  static cancelActiveAuthFlow() {
    const cancel = this.activeAuthFlow?.cancel;
    this.activeAuthFlow = null;
    cancel?.();
  }

  /**
   * Restores a persisted session from the auth store.
   * @returns Promise resolving to true if the session was restored successfully, false otherwise
   */
  static async restorePersistedSession(): Promise<boolean> {
    const authStore = Core.useAuthStore.getState();
    const result = await Core.AuthApplication.restorePersistedSession({ authStore });
    if (!result) {
      await this.cleanupLocalState();
      return false;
    }
    const { session } = result;
    const initialState = {
      session,
      currentUserPubky: Libs.Identity.z32FromSession({ session }),
      hasProfile: authStore.hasProfile,
    };
    authStore.init(initialState);
    return true;
  }

  /**
   * Gets a homeserver service instance using the secret key from the onboarding store.
   * @param params - The authentication parameters
   * @param params.keypair - The cryptographic keypair for the user
   * @returns Configured homeserver service instance
   */
  private static async signIn({ keypair }: Core.TKeypairParams): Promise<boolean> {
    // Clear database before sign in to ensure clean state
    await Core.clearDatabase();
    const session = await Core.AuthApplication.signIn({ keypair });
    if (!session) {
      Libs.Logger.error('Failed to sign in. Please try again.', { keypair });
      return false;
    }
    await this.initializeAuthenticatedSession(session);
    return true;
  }

  /**
   * Bootstrap data to initialize the application snapshot.
   * @param params - Object containing session and pubky data from authentication
   * @param params.session - The user session data
   * @param params.pubky - The user's public key identifier
   */
  private static async hydrateMeImAlive({ pubky }: Core.TPubkyParams) {
    const signInStore = Core.useSignInStore.getState();
    const {
      meta: { url },
    } = Core.NotificationNormalizer.to(pubky);

    // Progress callback to update signInStore from Controller layer (respecting architecture rules)
    const onProgress: Core.BootstrapProgressCallback = (step) => {
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

    const { notification } = await Core.BootstrapApplication.initialize({ pubky, lastReadUrl: url }, onProgress);
    Core.useNotificationStore.getState().setState(notification);
  }

  /**
   * Initializes the authenticated session and checks if the user is signed up (profile.json in homeserver).
   * @param params - Object containing session data from authentication
   * @param params.session - The user session data
   */
  static async initializeAuthenticatedSession({ session }: Core.THomeserverSessionResult) {
    const signInStore = Core.useSignInStore.getState();
    signInStore.reset(); // Reset for fresh sign-in
    signInStore.setAuthUrlResolved(true); // Step 1 complete (20%)

    const authStore = Core.useAuthStore.getState();

    try {
      this.cancelActiveAuthFlow();
      const pubky = Libs.Identity.z32FromSession({ session });

      authStore.init({ session, currentUserPubky: pubky, hasProfile: null });

      const isSignedUp = await Core.AuthApplication.userIsSignedUp({ pubky });
      signInStore.setProfileChecked(true); // Step 2 complete (40%)

      if (isSignedUp) {
        await this.hydrateMeImAlive({ pubky });
      }

      // Update hasProfile after bootstrap completes - triggers redirect via useAuthStatus
      authStore.setHasProfile(isSignedUp);
    } catch (error) {
      // Clean up early-stored session to prevent dangling state
      authStore.reset();
      signInStore.setError(error as Libs.AppError);
      throw error;
    }
  }

  /**
   * Signs up a new user with the homeserver using the provided secret key and signup token.
   * @param params - Object containing secret key and signup token for registration
   * @param params.secretKey - The secret key for the user
   * @param params.signupToken - Invitation code for user registration
   */
  static async signUp({ secretKey, signupToken }: Core.TSignUpParams) {
    // Clear database before sign up to ensure clean state
    await Core.clearDatabase();
    const keypair = Libs.Identity.keypairFromSecretKey(secretKey);
    const { session } = await Core.AuthApplication.signUp({ keypair, signupToken });
    const authStore = Core.useAuthStore.getState();
    const initialState = { session, currentUserPubky: Libs.Identity.z32FromSession({ session }), hasProfile: false };
    authStore.init(initialState);
  }

  /**
   * Authenticates the keypair with the homeserver and saves the authenticated data if successful.
   * @param params - Object containing the mnemonic phrase for key derivation
   * @param params.mnemonic - The mnemonic phrase for key derivation
   * @returns Promise resolving to true if authentication succeeded, false otherwise
   */
  static async loginWithMnemonic({ mnemonic }: Core.TLoginWithMnemonicParams): Promise<boolean> {
    const keypair = Libs.Identity.keypairFromMnemonic(mnemonic);
    return await this.signIn({ keypair });
  }

  /**
   * Decrypts the file to obtain the keypair, authenticates with the homeserver, and saves authenticated data if successful.
   * @param params - Object containing the encrypted file and password for decryption
   * @param params.encryptedFile - The encrypted recovery file
   * @param params.password - The password to decrypt the recovery file
   * @returns Promise resolving to true if authentication succeeded, false otherwise
   */
  static async loginWithEncryptedFile({
    encryptedFile,
    password,
  }: Core.TLoginWithEncryptedFileParams): Promise<boolean> {
    const keypair = await Libs.Identity.decryptRecoveryFile({ encryptedFile, passphrase: password });
    return await this.signIn({ keypair });
  }

  /**
   * Wraps auth URL generation with flow tracking so useAuthUrl can cancel on unmount
   * and we detect stale requests (e.g. React StrictMode double-mount).
   * @param generateFn - Async function that returns the auth URL result
   * @returns Promise resolving to the generated authentication URL with wrapped approval
   */
  private static async wrapAuthFlow(
    generateFn: () => Promise<Core.TGenerateAuthUrlResult>,
  ): Promise<Core.TGenerateAuthUrlResult> {
    await Core.clearDatabase();
    const token = Symbol('auth-flow');
    this.cancelActiveAuthFlow();
    this.activeAuthFlow = { token, cancel: null };
    const { authorizationUrl, awaitApproval, cancelAuthFlow } = await generateFn();

    if (!this.activeAuthFlow || this.activeAuthFlow.token !== token) {
      cancelAuthFlow();
      return { authorizationUrl, awaitApproval, cancelAuthFlow };
    }

    this.activeAuthFlow.cancel = cancelAuthFlow;

    const wrappedAwaitApproval = awaitApproval.finally(() => {
      if (this.activeAuthFlow?.token === token) {
        this.activeAuthFlow = null;
      }
      cancelAuthFlow();
    });

    return { authorizationUrl, awaitApproval: wrappedAwaitApproval, cancelAuthFlow };
  }

  /**
   * Centralizes all local state cleanup: resets every Zustand store, clears cookies,
   * IndexedDB, query cache, singletons, and persisted localStorage keys.
   * Used by both logout() and restorePersistedSession() on failure.
   */
  private static async cleanupLocalState() {
    // Reset singletons
    Core.PubkySpecsSingleton.reset();
    Core.TtlCoordinator.resetInstance();
    Core.StreamCoordinator.resetInstance();
    Core.NotificationCoordinator.resetInstance();

    // Cancel active auth flows
    this.cancelActiveAuthFlow();

    // Cancel all pending queries to prevent retries after sign-out
    // TODO: Centralise query client cleanup via a registry in createQueryClient
    // so new query clients are automatically cancelled/cleared here.
    Core.nexusQueryClient.cancelQueries();
    Core.nexusQueryClient.clear();

    // Reset ALL Zustand stores
    Core.useOnboardingStore.getState().reset();
    Core.useAuthStore.getState().reset();
    Core.useSignInStore.getState().reset();
    Core.useLocalFilesStore.getState().reset();
    Core.useHomeStore.getState().reset();
    Core.useHotStore.getState().reset();
    Core.useSearchStore.getState().reset();
    Core.useNotificationStore.getState().reset();
    Core.useSettingsStore.getState().reset();

    // Clear cookies, database, and persisted localStorage keys
    Libs.clearCookies();
    await Core.clearDatabase();

    Core.PERSISTED_STORE_KEYS.forEach((key) => localStorage.removeItem(key));
  }

  /**
   * Generates an authentication URL for external authentication flows.
   * @returns Promise resolving to the generated authentication URL
   */
  static async getAuthUrl(): Promise<Core.TGenerateAuthUrlResult> {
    return this.wrapAuthFlow(() => Core.AuthApplication.generateAuthUrl());
  }

  /**
   * Generates a signup authentication URL for Pubky Ring authorization.
   * Decorates a standard auth URL with homeserver address and invite code metadata.
   * @param inviteCode - The invite code for signup
   * @returns Promise resolving to the generated signup authentication URL
   */
  static async getSignupAuthUrl(inviteCode: string): Promise<Core.TGenerateAuthUrlResult> {
    return this.wrapAuthFlow(() => Core.AuthApplication.generateSignupAuthUrl(inviteCode));
  }

  /**
   * Logs out the current user from both the homeserver and local application state.
   */
  static async logout() {
    const authStore = Core.useAuthStore.getState();

    // Set logging out flag immediately to prevent flash of weird states in UI
    authStore.setIsLoggingOut(true);

    if (authStore.session) {
      try {
        await Core.AuthApplication.logout({ session: authStore.session });
      } catch (error) {
        Libs.Logger.warn('Homeserver logout failed, clearing local state anyway', { error });
      }
    }

    await this.cleanupLocalState();
  }

  /**
   * Initializes the application bootstrap after profile creation.
   * Waits for Nexus to index the user's profile.json, then bootstraps notifications and data.
   */
  static async bootstrapWithDelay() {
    const authStore = Core.useAuthStore.getState();
    const pubky = authStore.selectCurrentUserPubky();
    // Wait 5 seconds before bootstrap to let Nexus index the user
    Libs.Logger.info(`Waiting 5 seconds to index ${pubky} profile.json in Nexus before bootstrap...`);
    await Libs.sleep(5000);
    await this.hydrateMeImAlive({ pubky });
    authStore.setHasProfile(true);
  }

  /**
   * Generates a signup token for user registration. This is just for testing environments
   * @returns Promise resolving to the generated signup token
   */
  static async generateSignupToken() {
    return await Core.AuthApplication.generateSignupToken();
  }
}
