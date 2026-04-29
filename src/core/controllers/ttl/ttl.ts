import { TtlApplication } from '@/application/ttl/ttl';
import type { Pubky } from '@/models/models.types';
export class TtlController {
  private constructor() {}

  static async findStalePostsByIds(params: { postIds: string[]; ttlMs: number }): Promise<string[]> {
    return await TtlApplication.findStalePostsByIds(params);
  }

  static async findStaleUsersByIds(params: { userIds: Pubky[]; ttlMs: number }): Promise<Pubky[]> {
    return await TtlApplication.findStaleUsersByIds(params);
  }

  static async forceRefreshPostsByIds(params: { postIds: string[]; viewerId: Pubky }): Promise<void> {
    return await TtlApplication.forceRefreshPostsByIds(params);
  }

  static async forceRefreshUsersByIds(params: { userIds: Pubky[]; viewerId?: Pubky }): Promise<void> {
    return await TtlApplication.forceRefreshUsersByIds(params);
  }
}
