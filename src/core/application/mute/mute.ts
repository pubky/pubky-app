import * as Core from '@/core';
import { baseUriBuilder } from 'pubky-app-specs';
import { HttpMethod } from '@/libs';

export class MuteApplication {
  private constructor() {}

  /**
   * Handles muting or unmuting a user.
   * Performs local database operations and syncs with the homeserver.
   * @param params - Parameters containing event type, URLs, JSON data, and user IDs
   */
  static async commitMute({ eventType, muteUrl, muteJson, muter, mutee }: Core.TMuteApplicationCommitParams) {
    if (eventType === HttpMethod.PUT) {
      await Core.LocalMuteService.create({ muter, mutee });
      await Core.HomeserverService.request({ method: eventType, url: muteUrl, bodyJson: muteJson });
      return;
    }

    if (eventType === HttpMethod.DELETE) {
      await Core.LocalMuteService.delete({ muter, mutee });
      await Core.HomeserverService.request({ method: eventType, url: muteUrl, bodyJson: muteJson });
      return;
    }
  }

  /**
   * Fetches the list of muted user IDs from the homeserver.
   * Lists all entries under the mutes directory and extracts the mutee pubkeys.
   * @param pubky - The user's pubky to fetch mutes for
   * @returns Array of muted user pubkeys
   */
  static async fetchMutedUsers(pubky: Core.Pubky): Promise<Core.Pubky[]> {
    const mutesDirectory = `${baseUriBuilder(pubky)}mutes/`;
    const muteUris = await Core.HomeserverService.list({ baseDirectory: mutesDirectory });
    return muteUris.map((uri) => uri.split('/').pop() as Core.Pubky);
  }
}
