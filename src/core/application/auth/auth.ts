import * as Core from '@/core';
import {
  HttpMethod,
  Logger,
  Err,
  ValidationErrorCode,
  ErrorService,
  toAppError,
  isAppError,
  isNotFound,
  isRetryable,
  sleep,
} from '@/libs';
import { userUriBuilder } from 'pubky-app-specs';

export class AuthApplication {
  private constructor() {} // Prevent instantiation

  private static restoreSessionPromise: Core.TRestoreSessionResult | null = null;

  /** Max attempts before falling back to sign-out (~30 s with a 3 s delay between each) */
  private static readonly RESTORE_MAX_ATTEMPTS = 10;
  /** Fixed delay between retry attempts */
  private static readonly RESTORE_RETRY_DELAY_MS = 3000;

  /**
   * Restores a session from a persisted session export.
   * Prevents concurrent restoration attempts by managing a singleton promise.
   *
   * Retries on transient errors (network, timeout, server) to handle scenarios
   * like ERR_NETWORK_CHANGED when the browser tab is resumed or the device
   * reconnects. Non-retryable errors (e.g. genuinely expired session) bail out
   * immediately. After all attempts are exhausted the session is cleared so the
   * user is signed out rather than left on a loading spinner.
   *
   * @param authStore - The auth store object containing state and actions needed for restoration
   * @returns The restored session, or null if restoration failed
   */
  static async restorePersistedSession({ authStore }: Core.TRestoreSessionParams): Core.TRestoreSessionResult {
    // If a restoration is already in progress, return the existing promise
    if (this.restoreSessionPromise) {
      return await this.restoreSessionPromise;
    }

    // Safety check: if sessionExport is missing, return null
    if (!authStore.sessionExport) {
      if (authStore.isRestoringSession) authStore.setIsRestoringSession(false);
      return null;
    }

    // Start restoration and store the promise so concurrent calls can await the same one
    this.restoreSessionPromise = (async () => {
      authStore.setIsRestoringSession(true);

      try {
        for (let attempt = 1; attempt <= this.RESTORE_MAX_ATTEMPTS; attempt++) {
          try {
            const session = await Core.HomeserverService.restoreSession({
              sessionExport: authStore.sessionExport!,
            });
            Logger.info('Session restored successfully');
            return { session };
          } catch (error) {
            const canRetry = isAppError(error) && isRetryable(error) && attempt < this.RESTORE_MAX_ATTEMPTS;
            if (!canRetry) {
              Logger.error('Failed to restore session from persisted export', error);
              break;
            }

            Logger.warn(
              `Session restore attempt ${attempt}/${this.RESTORE_MAX_ATTEMPTS} failed with transient error, retrying in ${this.RESTORE_RETRY_DELAY_MS}ms`,
              { error },
            );
            await sleep(this.RESTORE_RETRY_DELAY_MS);
          }
        }
        return null;
      } finally {
        authStore.setIsRestoringSession(false);
        this.restoreSessionPromise = null;
      }
    })();

    return await this.restoreSessionPromise;
  }

  /**
   * Signs up a new user in the homeserver with the provided keypair and authentication credentials.
   *
   * @param params - The authentication parameters containing user credentials
   * @param params.keypair - The cryptographic keypair for the user
   * @param params.signupToken - Invitation code for user registration
   * @param params.secretKey - Secret key for homeserver service
   * @returns Session and pubky of the signed up user
   */
  static async signUp({ keypair, signupToken }: Core.THomeserverSignUpParams): Promise<Core.THomeserverSessionResult> {
    return await Core.HomeserverService.signUp({ keypair, signupToken });
  }

  /**
   * Authenticates the user against the homeserver using their cryptographic keypair.
   *
   * @param params - The authentication parameters
   * @param params.keypair - The cryptographic keypair for the user authentication
   * @param params.secretKey - Secret key for homeserver service
   * @returns Session and pubky of the authenticated user
   */
  static async signIn({ keypair }: Core.TKeypairParams): Promise<Core.THomeserverSessionResult | undefined> {
    if (!keypair) {
      throw Err.validation(
        ValidationErrorCode.INVALID_INPUT,
        'Keypair not found in onboarding store. Please regenerate your keys and try again.',
        {
          service: ErrorService.Local,
          operation: 'signIn',
        },
      );
    }
    return await Core.HomeserverService.signIn({ keypair });
  }

  /**
   * Generates an authentication URL for Pubky Ring App
   *
   * @returns Authentication URL and approval promise
   */
  static async generateAuthUrl(): Promise<Core.TGenerateAuthUrlResult> {
    return await Core.HomeserverService.generateAuthUrl();
  }

  /**
   * Generates a signup authentication URL for Pubky Ring App.
   * Decorates a standard auth URL with homeserver address and invite code metadata.
   *
   * @param inviteCode - The invite code for signup
   * @returns Authentication URL and approval promise
   */
  static async generateSignupAuthUrl(inviteCode: string): Promise<Core.TGenerateAuthUrlResult> {
    return await Core.HomeserverService.generateSignupAuthUrl({ inviteCode });
  }

  /**
   * Logs out a user from the system.
   *
   * @param params - The logout parameters
   * @param params.session - The authenticated Session
   * @returns Void
   */
  static async logout(data: Core.THomeserverSessionResult) {
    await Core.HomeserverService.logout(data);
  }

  /**
   * Generates a signup token for user registration.
   * @returns Promise resolving to the generated signup token
   */
  static async generateSignupToken() {
    return await Core.HomeserverService.generateSignupToken();
  }

  /**
   * In the application, there are two signups to do.
   * 1. First the user has to register the user key in the homeserver, throw the inviation code
   * 2. Then the user has to create a profile.json file in the homeserver. That file acts as a proof that the user has signed up.
   * This is a critical step because after that it will start indexing all user related data
   *
   * @param params - Parameters containing the user's public key
   * @param params.pubky - The user's public key identifier
   * @returns Promise resolving to the user profile or undefined if not found
   */
  static async userIsSignedUp({ pubky }: Core.TPubkyParams): Promise<boolean> {
    try {
      await Core.HomeserverService.request({ method: HttpMethod.GET, url: userUriBuilder(pubky) });
      return true;
    } catch (error) {
      const appError = isAppError(error) ? error : toAppError(error, ErrorService.Homeserver, 'userIsSignedUp');
      if (isNotFound(appError)) return false;
      throw appError;
    }
  }
}
