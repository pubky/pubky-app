import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { NexusPostsKeyStream, NexusPostWithAttachmentMetadata } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { postStreamApi } from '@/services/nexus/stream/posts/postStream.api';
import {
  StreamSource,
  type TPostStreamFetchParams,
  type TStreamAuthorParams,
  type TStreamCollectionParams,
  type TStreamPostRepliesParams,
  type TStreamPostsByIdsParams,
} from '@/services/nexus/stream/posts/postStream.types';

/**
 * Nexus Post Stream Service
 *
 * Handles fetching post stream data from Nexus API.
 */
export class NexusPostStreamService {
  /**
   * Fetches posts by their IDs from Nexus API
   *
   * @param params - Parameters containing post IDs and optional viewer ID
   * @returns Array of posts
   */
  static async fetchByIds(params: TStreamPostsByIdsParams): Promise<NexusPostWithAttachmentMetadata[]> {
    const { url, body } = postStreamApi.postsByIds(params);
    return await queryNexus<NexusPostWithAttachmentMetadata[]>({
      url,
      method: HttpMethod.POST,
      body: JSON.stringify(body),
    });
  }

  /**
   * Fetches post stream data from Nexus API
   *
   * @param params - Parameters for fetching post stream data
   * @returns Post stream data
   */
  static async fetch({ params, invokeEndpoint, extraParams }: TPostStreamFetchParams): Promise<NexusPostsKeyStream> {
    let nexusEndpoint: string;
    switch (invokeEndpoint) {
      case StreamSource.ALL:
        nexusEndpoint = postStreamApi.all(params);
        break;
      case StreamSource.FOLLOWING:
      case StreamSource.FRIENDS:
      case StreamSource.WOT:
      case StreamSource.WOT_DOMAIN:
      case StreamSource.BOOKMARKS:
        // TODO: from now, always is going to be
        if (!params.viewer_id) {
          throw Err.validation(
            ValidationErrorCode.MISSING_FIELD,
            `Viewer ID is required for ${invokeEndpoint} stream`,
            {
              service: ErrorService.Nexus,
              operation: 'fetchPostStream',
              context: { invokeEndpoint },
            },
          );
        }
        nexusEndpoint = postStreamApi[invokeEndpoint]({ ...params, observer_id: params.viewer_id });
        break;
      case StreamSource.REPLIES:
        nexusEndpoint = postStreamApi[invokeEndpoint]({
          ...params,
          ...extraParams,
        } as TStreamPostRepliesParams);
        break;
      case StreamSource.AUTHOR:
      case StreamSource.AUTHOR_REPLIES:
        nexusEndpoint = postStreamApi[invokeEndpoint]({ ...params, ...extraParams } as TStreamAuthorParams);
        break;
      case StreamSource.COLLECTION:
        nexusEndpoint = postStreamApi.collection({ ...params, ...extraParams } as TStreamCollectionParams);
        break;
      default:
        throw Err.validation(ValidationErrorCode.INVALID_INPUT, `Invalid stream type: ${invokeEndpoint}`, {
          service: ErrorService.Nexus,
          operation: 'fetchPostStream',
          context: { invokeEndpoint },
        });
    }
    return await queryNexus<NexusPostsKeyStream>({ url: nexusEndpoint });
  }
}
