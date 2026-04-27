import * as Core from '@/core';
import { HttpMethod } from '@/libs/http/http.types';
import { stripPubkyPrefix } from '@/libs/utils/utils';

export class MuteController {
  private constructor() {}

  /**
   * Commit a mute action to indexeddb and the homeserver
   * @param eventType - The event type (PUT or DELETE)
   * @param muter - The muter user ID
   * @param mutee - The mutee user ID
   */
  static async commitMute(eventType: HttpMethod, { muter, mutee }: Core.TMuteParams) {
    const normalizedMutee = stripPubkyPrefix(mutee) as Core.Pubky;
    const { meta, mute } = Core.MuteNormalizer.to({ muter, mutee: normalizedMutee });
    await Core.MuteApplication.commitMute({
      eventType,
      muteUrl: meta.url,
      muteJson: mute.toJson(),
      muter,
      mutee: normalizedMutee,
    });
  }

  /**
   * Fetch all muted user IDs from the homeserver
   * @param pubky - The user's pubky to fetch mutes for
   * @returns Array of muted user pubkeys
   */
  static async fetchMutedUsers(pubky: Core.Pubky): Promise<Core.Pubky[]> {
    return Core.MuteApplication.fetchMutedUsers(pubky);
  }
}
