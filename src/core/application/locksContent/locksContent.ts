import { LocksContentService } from '@/services/locksContent/locksContent';
import type {
  TCreateContentLockParams,
  TCreateContentLockResult,
  TRegisterGuardedResourceParams,
  TRegisterGuardedResourceResult,
} from '@/services/locksContent/locksContent.types';

/**
 * Application layer for publishing locked content. Mirrors `LocksAuthApplication`.
 */
export class LocksContentApplication {
  private constructor() {} // Prevent instantiation

  static registerGuardedResource(params: TRegisterGuardedResourceParams): Promise<TRegisterGuardedResourceResult> {
    return LocksContentService.registerGuardedResource(params);
  }

  static createContentLock(params: TCreateContentLockParams): Promise<TCreateContentLockResult> {
    return LocksContentService.createContentLock(params);
  }
}
