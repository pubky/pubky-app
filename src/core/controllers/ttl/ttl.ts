import { TtlApplication } from '@/application/ttl/ttl';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import type { Pubky } from '@/models/models.types';
import type { TagEntity } from '@/services/local/tag/tag-cache';

export class TtlController {
  private constructor() {}

  static async findStalePostsByIds(params: { postIds: string[]; ttlMs: number }): Promise<string[]> {
    return await TtlApplication.findStalePostsByIds(params);
  }

  static async findStaleUsersByIds(params: { userIds: Pubky[]; ttlMs: number }): Promise<Pubky[]> {
    return await TtlApplication.findStaleUsersByIds(params);
  }

  static async refreshStaleTags(params: {
    kind: TagEntity['kind'];
    ids: string[];
    ttlMs: number;
    viewerId?: Pubky;
  }): Promise<void> {
    await TtlApplication.refreshStaleTags({ ...params, isCurrent: captureViewerSession() });
  }

  static async forceRefreshPostsByIds(params: { postIds: string[]; viewerId?: Pubky }): Promise<void> {
    return await TtlApplication.forceRefreshPostsByIds({ ...params, isCurrent: captureViewerSession() });
  }

  static async forceRefreshUsersByIds(params: { userIds: Pubky[]; viewerId?: Pubky }): Promise<Pubky[]> {
    return await TtlApplication.forceRefreshUsersByIds({ ...params, isCurrent: captureViewerSession() });
  }
}
