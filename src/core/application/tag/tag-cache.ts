import { POST_TAGS_PER_PAGE, TAG_REFRESH_RETRY_MS, USER_TAGS_PER_PAGE } from '@/config/tags';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { getTagCursor } from '@/models/shared/tag/tag.utils';
import { LocalTagCacheService, type TagEntity } from '@/services/local/tag/tag-cache';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { getNexusResponseStartedAt } from '@/services/nexus/nexus.utils';
import { NexusPostService } from '@/services/nexus/post/post';
import { NexusUserService } from '@/services/nexus/user/user';

export type TagRequest = TagEntity & { viewerId?: string; isCurrent?: () => boolean };

/** Owns loading policy; hooks only observe IndexedDB and request missing pages. */
export class TagCacheApplication {
  private static pending = new Map<
    string,
    { task: Promise<void>; mode: 'missing' | 'next' | 'refresh'; isCurrent?: () => boolean }
  >();

  static get(entity: TagEntity) {
    return LocalTagCacheService.read(entity);
  }

  static async getOrFetch(request: TagRequest): Promise<void> {
    return this.run(request, 'missing');
  }

  static async fetchNext(request: TagRequest): Promise<void> {
    return this.run(request, 'next');
  }

  static forceRefresh(request: TagRequest): Promise<void> {
    return this.run(request, 'refresh');
  }

  static async refreshExpanded(request: TagRequest, previewSize: number) {
    const cached = await this.get(request);
    if (getTagCursor(cached) <= previewSize || (cached?.cache?.retryAt ?? 0) > Date.now()) return;
    await this.forceRefresh(request);
  }

  static async refreshStale(request: TagRequest, ttlMs: number) {
    const cached = await this.get(request);
    if (!cached?.cache || Date.now() - cached.cache.fetchedAt <= ttlMs || (cached.cache.retryAt ?? 0) > Date.now())
      return;
    await this.forceRefresh(request);
  }

  private static run(request: TagRequest, mode: 'missing' | 'next' | 'refresh'): Promise<void> {
    if (request.isCurrent && !request.isCurrent()) return Promise.resolve();
    const key = `${request.kind}:${request.id}:${request.viewerId ?? ''}`;
    const existing = this.pending.get(key);
    if (existing && (!existing.isCurrent || existing.isCurrent())) {
      if (mode !== 'missing' && existing.mode !== mode) {
        return existing.task.catch(() => {}).then(() => this.run(request, mode));
      }
      return existing.task;
    }
    const task = this.load(request, mode).finally(() => {
      if (this.pending.get(key)?.task === task) this.pending.delete(key);
    });
    this.pending.set(key, { task, mode, isCurrent: request.isCurrent });
    return task;
  }

  private static async load(request: TagRequest, mode: 'missing' | 'next' | 'refresh', attempt = 0): Promise<void> {
    const existing = await this.get(request);
    if (request.isCurrent && !request.isCurrent()) return;
    const viewerChanged = !!existing && (existing.cache?.viewerId ?? null) !== (request.viewerId ?? null);
    if (viewerChanged) mode = 'refresh';
    if (
      existing &&
      existing.cache?.initialized !== false &&
      (mode === 'missing' || (mode === 'next' && existing.cache?.exhausted))
    )
      return;
    const cursor = getTagCursor(existing);
    const skip = mode === 'next' ? cursor : 0;
    const pageSize = request.kind === 'post' ? POST_TAGS_PER_PAGE : USER_TAGS_PER_PAGE;
    const limit = mode === 'refresh' ? Math.max(pageSize, cursor) : pageSize;
    try {
      const tags: NexusTag[] = [];
      let validatedAt = Infinity;
      // Nexus limits each request to 100 tags. Refresh the loaded prefix atomically.
      while (tags.length < limit) {
        const size = Math.min(100, limit - tags.length);
        if (request.isCurrent && !request.isCurrent()) return;
        const page = await this.fetchPage(request, skip + tags.length, size, mode === 'refresh' || attempt > 0);
        validatedAt = Math.min(validatedAt, getNexusResponseStartedAt(page) ?? 0);
        tags.push(...page);
        if (page.length < size) break;
      }
      if (request.isCurrent && !request.isCurrent()) return;
      const saved = await LocalTagCacheService.savePage(request, tags, {
        skip,
        limit,
        validatedAt: validatedAt > 0 && Number.isFinite(validatedAt) ? validatedAt : undefined,
        revision: existing ? (existing.cache?.revision ?? 0) : null,
        viewerId: request.viewerId,
        isCurrent: request.isCurrent,
      });
      if (!saved && (!request.isCurrent || request.isCurrent())) {
        // Re-read the cursor/revision after a batch, mutation, or notification wins.
        if (attempt < 2) await this.load(request, mode, attempt + 1);
        else
          throw Err.client(ClientErrorCode.CONFLICT, 'Tag cache changed during pagination', {
            service: ErrorService.Local,
            operation: 'loadTagPage',
            context: { kind: request.kind, id: request.id },
          });
      }
    } catch (error) {
      if (mode === 'refresh') {
        // Capture the revision used by this attempt, after any queued pagination.
        // A later accepted write must not be marked stale by this failure.
        await LocalTagCacheService.deferRefresh(request, {
          revision: existing ? (existing.cache?.revision ?? 0) : null,
          retryAt: Date.now() + TAG_REFRESH_RETRY_MS,
          isCurrent: request.isCurrent,
        });
      }
      throw error;
    }
  }

  private static async fetchPage(request: TagRequest, skip: number, limit: number, force: boolean) {
    return request.kind === 'post'
      ? await NexusPostService.getPostTags({
          compositeId: request.id,
          viewerId: request.viewerId,
          skip,
          limit,
          ...(force ? { force: true } : {}),
        })
      : await NexusUserService.tags({
          user_id: request.id,
          viewer_id: request.viewerId,
          skip_tags: skip,
          limit_tags: limit,
          ...(force ? { force: true } : {}),
        });
  }
}
