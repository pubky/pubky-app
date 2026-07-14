import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { LocksAuthService } from '@/services/locksAuth/locksAuth';
import type {
  TExchangeSessionCodeParams,
  TGenerateConnectUrlParams,
  TLocksSessionResult,
  TRestoreLocksSessionParams,
} from '@/services/locksAuth/locksAuth.types';

/**
 * Application layer for Lock Server auth. Mirrors `AuthApplication`.
 */
export class LocksAuthApplication {
  private constructor() {} // Prevent instantiation

  static generateConnectUrl(params: TGenerateConnectUrlParams): Promise<string> {
    return LocksAuthService.generateConnectUrl(params);
  }

  static exchangeSessionCode(params: TExchangeSessionCodeParams): Promise<TLocksSessionResult> {
    return LocksAuthService.exchangeSessionCode(params);
  }

  static restoreSession(params: TRestoreLocksSessionParams): Promise<LocksSdkSession> {
    return LocksAuthService.restoreSession(params);
  }

  static signout(session: LocksSdkSession): Promise<void> {
    return LocksAuthService.signout(session);
  }

  static setLockServiceConfig(session: LocksSdkSession, defaultLockServer: string): Promise<void> {
    return LocksAuthService.setLockServiceConfig(session, defaultLockServer);
  }
}
