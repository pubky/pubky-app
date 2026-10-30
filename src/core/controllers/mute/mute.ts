import { MuteApplication } from '@/application/mute/mute';
import type { TMuteDirectoryEvent, TMuteParams } from '@/controllers/mute/mute.types';
import { HttpMethod } from '@/libs/http/http.types';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import { MuteNormalizer } from '@/pipes/mute/mute.normalizer';

export class MuteController {
  private constructor() {}

  /**
   * Commit a mute action to indexeddb and the homeserver
   * @param eventType - The event type (PUT or DELETE)
   * @param muter - The muter user ID
   * @param mutee - The mutee user ID
   */
  static async commitMute(eventType: HttpMethod.PUT | HttpMethod.DELETE, { muter, mutee }: TMuteParams) {
    const params = { muter, mutee: stripPubkyPrefix(mutee) as Pubky };
    if (eventType === HttpMethod.DELETE) {
      await MuteApplication.commitMute({ ...params, eventType, deleteUrls: MuteNormalizer.toDeleteUrls(params) });
      return;
    }
    const { url, body } = MuteNormalizer.to(params);
    await MuteApplication.commitMute({ ...params, eventType, muteUrl: url, muteBody: body });
  }

  /**
   * Fetch all muted user IDs from the homeserver
   * @param pubky - The user's pubky to fetch mutes for
   * @returns Array of muted user pubkeys
   */
  static async fetchMutedUsers(pubky: Pubky): Promise<Pubky[]> {
    return MuteApplication.fetchMutedUsers(pubky);
  }

  /**
   * Live SSE (via SDK) for `/priv/social/v1/mutes/` changes on the homeserver.
   */
  static subscribeMuteDirectoryEventStream(
    pubky: Pubky,
    cursor: string | null,
  ): Promise<ReadableStream<TMuteDirectoryEvent>> {
    return MuteApplication.subscribeMuteDirectoryEventStream(pubky, cursor);
  }
}
