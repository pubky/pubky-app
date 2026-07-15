import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { LocksService } from '@/services/locks/locks';
import type {
  TCreateContentLockParams,
  TCreateContentLockResult,
  TExchangeSessionCodeParams,
  TGenerateConnectUrlParams,
  TLocksSessionResult,
  TRegisterGuardedResourceParams,
  TRegisterGuardedResourceResult,
} from '@/services/locks/locks.types';

/**
 * Application layer for the Lock Server: auth (mirrors `AuthApplication`) and publishing
 * locked content.
 */
export class LocksApplication {
  private constructor() {} // Prevent instantiation

  static generateConnectUrl(params: TGenerateConnectUrlParams): Promise<string> {
    return LocksService.generateConnectUrl(params);
  }

  static exchangeSessionCode(params: TExchangeSessionCodeParams): Promise<TLocksSessionResult> {
    return LocksService.exchangeSessionCode(params);
  }

  static restoreSession(): Promise<LocksSdkSession> {
    return LocksService.restoreSession();
  }

  static signout(): Promise<void> {
    return LocksService.signout();
  }

  static setLockServiceConfig(): Promise<void> {
    return LocksService.setLockServiceConfig();
  }

  static registerGuardedResource(params: TRegisterGuardedResourceParams): Promise<TRegisterGuardedResourceResult> {
    return LocksService.registerGuardedResource(params);
  }

  static createContentLock(params: TCreateContentLockParams): Promise<TCreateContentLockResult> {
    return LocksService.createContentLock(params);
  }
}
