import { QueryObserver } from '@tanstack/react-query';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { NEXUS_RESOURCE_TAGS_OPERATION } from '@/libs/observability/sentry.constants';
import type { Pubky } from '@/models/models.types';
import { type TResourceViewerTag, withResourceViewerTag } from '@/pipes/tag/tag.resource';
import { nexusQueryClient } from '@/services/nexus/nexus.query-client';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { resourceApi } from '@/services/nexus/resource/resource.api';
import { RESOURCE_TAGS_LIMIT } from '@/services/nexus/resource/resource.constants';
import type { NexusResourceTags } from '@/services/nexus/resource/resource.types';

const OPERATION = NEXUS_RESOURCE_TAGS_OPERATION;

type TResourceTagsKey = { uri: string; viewerId?: Pubky | null };

function queryKey({ uri, viewerId }: TResourceTagsKey) {
  return ['nexus', 'resource', 'by-uri', uri, viewerId ?? null] as const;
}

/**
 * Nexus reads of external resources: the tags people put on a web link (or any other URI that is
 * no Pubky object), matched by the raw URI.
 *
 * Reads go through `nexusQueryClient`, keyed by URI and viewer, so the card in a post and the
 * resource page share one request and one cached answer, and `subscribeTags` keeps every reader of
 * that answer on its latest state.
 */
export class NexusResourceService {
  private constructor() {}

  /**
   * The tags on a link (`GET /v0/resource/by-uri`).
   *
   * A 404 is an answer, not a failure: nobody tagged the link yet, so the read returns `[]`
   * without creating an AppError (an untagged link is the common case, and its link would
   * otherwise reach error telemetry).
   *
   * @param params.uri - The link exactly as written
   * @param params.viewerId - Marks the viewer's own tags; omit for a signed-out viewer
   * @returns The link's tags, `[]` when nobody tagged it
   * @throws AppError when Nexus fails or answers with anything else
   */
  static async fetchTagsByUri({ uri, viewerId }: TResourceTagsKey): Promise<NexusTag[]> {
    const url = resourceApi.byUri({ uri, viewer_id: viewerId ?? undefined, limit_tags: RESOURCE_TAGS_LIMIT });
    return nexusQueryClient.fetchQuery({
      queryKey: queryKey({ uri, viewerId }),
      queryFn: () => fetchResourceTagsOrEmpty(url),
    });
  }

  /**
   * Calls `listener` with the link's cached tags each time they change after this call: another
   * reader's answer, a refetch, or a tag write applied by `applyViewerTag`. Never fetches; while
   * subscribed the cached answer stays in the cache. Returns the unsubscribe.
   */
  static subscribeTags(key: TResourceTagsKey, listener: (tags: NexusTag[]) => void): () => void {
    const observer = new QueryObserver<NexusTag[]>(nexusQueryClient, { queryKey: queryKey(key), enabled: false });
    let last = observer.getCurrentResult().data;
    return observer.subscribe(({ data }) => {
      if (data === undefined || data === last) return;
      last = data;
      listener(data);
    });
  }

  /**
   * Applies the viewer's tag write to the cached answer for the link, so every reader of the
   * shared query sees it before Nexus indexes the write. Nothing cached means nothing to apply:
   * the next read asks Nexus.
   */
  static applyViewerTag({ uri, ...viewerTag }: TResourceViewerTag & { uri: string }, isAdded: boolean): void {
    nexusQueryClient.setQueryData<NexusTag[]>(queryKey({ uri, viewerId: viewerTag.viewerId }), (cached) =>
      cached ? withResourceViewerTag(cached, viewerTag, isAdded) : cached,
    );
  }
}

/**
 * One GET; retries come from `nexusQueryClient`. `endpoint` (error context of an HTTP error) is
 * the request without its query string, which carries a link from someone's post. A connection
 * failure or timeout is built by `safeFetch` with the full request as `context.url`; the
 * `nexus-resource-tags-transport` Sentry drop rule keeps it out of telemetry.
 */
async function fetchResourceTagsOrEmpty(url: string): Promise<NexusTag[]> {
  const endpoint = resourceApi.byUriEndpoint();
  const response = await safeFetch(url, { method: HttpMethod.GET }, ErrorService.Nexus, OPERATION);
  if (response.status === HttpStatusCode.NOT_FOUND) {
    response.body?.cancel().catch(() => {});
    return [];
  }
  if (!response.ok) {
    throw httpResponseToError(response, ErrorService.Nexus, OPERATION, endpoint);
  }
  const body = await parseResponseOrThrow<NexusResourceTags>(response, ErrorService.Nexus, OPERATION, endpoint);
  return body.tags ?? [];
}
