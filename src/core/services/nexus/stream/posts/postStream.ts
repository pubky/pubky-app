import * as Core from '@/core';
import { HttpMethod } from '@/libs/http/http.types';

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
  static async fetchByIds(params: Core.TStreamPostsByIdsParams): Promise<Core.NexusPostWithAttachmentMetadata[]> {
    const { url, body } = Core.postStreamApi.postsByIds(params);
    return await Core.queryNexus<Core.NexusPostWithAttachmentMetadata[]>({
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
  static async fetch({
    params,
    invokeEndpoint,
    extraParams,
  }: Core.TPostStreamFetchParams): Promise<Core.NexusPostsKeyStream> {
    let nexusEndpoint: string;
    switch (invokeEndpoint) {
      case Core.StreamSource.ALL:
        nexusEndpoint = Core.postStreamApi.all(params);
        break;
      case Core.StreamSource.FOLLOWING:
      case Core.StreamSource.FRIENDS:
      case Core.StreamSource.BOOKMARKS:
        // TODO: from now, always is going to be
        if (!params.viewer_id) {
          throw new Error('Viewer ID is required for friends stream');
        }
        nexusEndpoint = Core.postStreamApi[invokeEndpoint]({ ...params, observer_id: params.viewer_id });
        break;
      case Core.StreamSource.REPLIES:
        nexusEndpoint = Core.postStreamApi[invokeEndpoint]({
          ...params,
          ...extraParams,
        } as Core.TStreamPostRepliesParams);
        break;
      case Core.StreamSource.AUTHOR:
      case Core.StreamSource.AUTHOR_REPLIES:
        nexusEndpoint = Core.postStreamApi[invokeEndpoint]({ ...params, ...extraParams } as Core.TStreamAuthorParams);
        break;
      default:
        throw new Error(`Invalid stream type: ${invokeEndpoint}`);
    }
    return await Core.queryNexus<Core.NexusPostsKeyStream>({ url: nexusEndpoint });
  }
}
