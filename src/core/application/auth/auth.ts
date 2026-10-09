import type { Session } from '@synonymdev/pubky';
import { userUriBuilder } from 'pubky-app-specs';
import type { TKeypairParams, TRestoreSessionParams, TRestoreSessionResult } from '@/application/auth/auth.types';
import { getAuthClientId } from '@/config/auth';
import type { ActiveSessionFailure, PersistedAuth, SessionReference } from '@/libs/auth/session.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import {
  isAppError,
  isAuthError,
  isNotFound,
  isRetryable,
  isValidationError,
  isWrongEnvironmentHomeserverError,
  toAppError,
} from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { sleep } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import type { GrantFlowRequest } from '@/services/homeserver/grant-flow';
import { HomeserverService } from '@/services/homeserver/homeserver';
import type {
  THomeserverPublicKeyParams,
  THomeserverSessionResult,
  THomeserverSignUpParams,
} from '@/services/homeserver/homeserver.types';
import { LocalAuthService } from '@/services/local/auth/auth';

export class AuthApplication {
  private constructor() {} // Prevent instantiation

  private static readonly PROFILE_CHECK_MAX_ATTEMPTS = 3;
  private static readonly PROFILE_CHECK_RETRY_DELAY_MS = 3000;

  /** A failed exchange is not proof that a saved grant should be deleted. */
  static async restorePersistedSession(params: TRestoreSessionParams): TRestoreSessionResult {
    for (let attempt = 0; ; attempt++) {
      const result = await this.restoreSessionOnce(params);
      if (result.status !== 'temporary-error' || !result.error || !isRetryable(result.error) || attempt === 2)
        return result;
      await sleep(400);
    }
  }

  private static async restoreSessionOnce({ reference, expectedPubky }: TRestoreSessionParams): TRestoreSessionResult {
    if (!reference) return { status: expectedPubky ? 'reauth-required' : 'none' };
    if (reference.clientId !== getAuthClientId() || reference.grantExpiresAt <= Date.now() / 1000) {
      return { status: 'reauth-required' };
    }
    try {
      const session = await HomeserverService.restoreReference(reference);
      if (session.info.publicKey.z32() !== expectedPubky) {
        return { status: 'reauth-required' };
      }
      await HomeserverService.assertUserHomeserverAllowed({ publicKey: session.info.publicKey });
      const info = await session.grant?.sessionInfo();
      if (!info || info.clientId !== getAuthClientId() || info.grantId !== reference.grantId)
        return { status: 'reauth-required' };
      return { status: 'restored', session };
    } catch (error) {
      const appError = toAppError(error, ErrorService.Homeserver, 'restorePersistedSession');
      if (isWrongEnvironmentHomeserverError(appError)) throw appError;
      // 401 can also mean an invalid proof or a displaced bearer. Preserve the record for retry/reauthorization.
      return {
        status: isAuthError(appError) || isValidationError(appError) ? 'reauth-required' : 'temporary-error',
        error: appError,
      };
    }
  }

  static subscribeSessionFailures(listener: (failure: ActiveSessionFailure) => void): () => void {
    return HomeserverService.subscribeSessionFailures(listener);
  }

  static startGrantFlow(request: GrantFlowRequest) {
    return HomeserverService.startGrantFlow(request);
  }
  static clearPendingAuthFlow() {
    HomeserverService.clearPendingAuthFlow();
  }

  static restoreReference(reference: SessionReference) {
    return HomeserverService.restoreReference(reference);
  }
  static saveSession(session: Session) {
    return HomeserverService.saveSession(session);
  }
  static retainUnusedSession(session: Session, persistence?: Promise<SessionReference>) {
    return HomeserverService.retainUnusedSession(session, persistence);
  }
  static removeSessionRecord(reference: SessionReference) {
    return HomeserverService.removeSessionRecord(reference);
  }
  static async revokeLegacyCookieSessions(): Promise<void> {
    const outcomes = await Promise.allSettled(
      LocalAuthService.readLegacyCookieRecords().map(async (record) => {
        await Promise.all(record.exports.map((exported) => HomeserverService.revokeLegacyCookieSession(exported)));
        await LocalAuthService.clearLegacyCookieRecord(record);
      }),
    );
    const failed = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
  static readPersistedAuth() {
    return LocalAuthService.read();
  }
  static suppressLocalAuthRestore(generation: string): void {
    LocalAuthService.suppressRestore(generation);
  }
  static commitPersistedAuth(record: PersistedAuth, expectedGeneration: string, isCurrent?: () => boolean) {
    return LocalAuthService.commit(record, expectedGeneration, isCurrent);
  }
  static prepareAccount(generation: string, isCurrent: () => boolean) {
    return LocalAuthService.prepareAccount(generation, isCurrent);
  }
  static finishRetirement(sessionStoreId: string) {
    return LocalAuthService.finishRetirement(sessionStoreId);
  }
  static createAccount(params: THomeserverSignUpParams) {
    return HomeserverService.createAccount(params);
  }
  static signInCreatedAccount(params: TKeypairParams) {
    return HomeserverService.signInCreatedAccount(params);
  }

  /**
   * Verifies a signup token (invite code) against the homeserver.
   *
   * @param signupToken - The signup token / invite code to verify
   * @returns `'valid'`, `'used'`, or `'invalid'` depending on the homeserver response
   */
  static async verifySignupToken(signupToken: string) {
    return await HomeserverService.verifySignupToken(signupToken);
  }

  /**
   * Authenticates the user against the homeserver using their cryptographic keypair.
   *
   * @param params - The authentication parameters
   * @param params.keypair - The cryptographic keypair for the user authentication
   * @param params.secretKey - Secret key for homeserver service
   * @returns Session and pubky of the authenticated user
   */
  static async signIn({ keypair }: TKeypairParams): Promise<THomeserverSessionResult | undefined> {
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
    return await HomeserverService.signIn({ keypair });
  }

  /**
   * Logs out a user from the system.
   *
   * @param params - The logout parameters
   * @param params.session - The authenticated Session
   * @returns Void
   */
  static async logout(data: THomeserverSessionResult) {
    await HomeserverService.logout(data);
  }

  static async logoutLegacyCookie(pubky: string): Promise<void> {
    await HomeserverService.logoutLegacyCookie(pubky);
  }

  /**
   * Generates a signup token for user registration.
   * @returns Promise resolving to the generated signup token
   */
  static async generateSignupToken() {
    return await HomeserverService.generateSignupToken();
  }

  /** Staging guard: reject keys whose PKARR homeserver does not match this deploy. */
  static async assertUserHomeserverAllowed({ publicKey }: THomeserverPublicKeyParams): Promise<void> {
    await HomeserverService.assertUserHomeserverAllowed({ publicKey });
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
  static async userIsSignedUp({ pubky }: { pubky: Pubky }): Promise<boolean> {
    try {
      await HomeserverService.request({ method: HttpMethod.GET, url: userUriBuilder(pubky) });
      return true;
    } catch (error) {
      const appError = isAppError(error) ? error : toAppError(error, ErrorService.Homeserver, 'userIsSignedUp');
      if (isNotFound(appError)) return false;
      throw appError;
    }
  }

  /**
   * Resolves whether a restored session's profile.json exists, retrying transient homeserver
   * failures so a temporary outage is never mistaken for a missing profile (issue #2070).
   *
   * @param params - Parameters containing the user's public key
   * @param params.pubky - The user's public key identifier
   * @returns true when the profile exists, false when the homeserver confirmed it does not, and
   * null when the state could not be determined after the retries
   */
  static async resolveUserIsSignedUp({ pubky }: { pubky: Pubky }): Promise<boolean | null> {
    for (let attempt = 1; attempt <= this.PROFILE_CHECK_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.userIsSignedUp({ pubky });
      } catch (error) {
        const appError = isAppError(error)
          ? error
          : toAppError(error, ErrorService.Homeserver, 'resolveUserIsSignedUp');
        const canRetry = isRetryable(appError) && attempt < this.PROFILE_CHECK_MAX_ATTEMPTS;
        if (!canRetry) {
          return null;
        }
        Logger.warn(
          `Profile check attempt ${attempt}/${this.PROFILE_CHECK_MAX_ATTEMPTS} failed with a transient error, retrying in ${this.PROFILE_CHECK_RETRY_DELAY_MS}ms`,
          { error: appError },
        );
        await sleep(this.PROFILE_CHECK_RETRY_DELAY_MS);
      }
    }
    return null;
  }
}
