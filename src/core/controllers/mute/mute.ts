import { MuteApplication } from '@/application/mute/mute';
import type { TMuteParams } from '@/controllers/mute/mute.types';
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
  static async commitMute(eventType: HttpMethod, { muter, mutee }: TMuteParams) {
    const normalizedMutee = stripPubkyPrefix(mutee) as Pubky;
    const { meta, mute } = MuteNormalizer.to({ muter, mutee: normalizedMutee });
    await MuteApplication.commitMute({
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
  static async fetchMutedUsers(pubky: Pubky): Promise<Pubky[]> {
    return MuteApplication.fetchMutedUsers(pubky);
  }
}
