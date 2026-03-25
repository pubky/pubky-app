import * as Core from '@/core';
import { baseUriBuilder } from 'pubky-app-specs';
import { HttpMethod, Logger, AppError, HttpStatusCode } from '@/libs';

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
   * Fetches the list of muted user IDs from the homeserver and persists them to the local MUTED stream.
   * Callers do not need to persist the result; this method handles fetch + persist.
   * @param pubky - The user's pubky to fetch mutes for
   * @returns Array of muted user pubkeys
   */
  static async fetchMutedUsers(pubky: Core.Pubky): Promise<Core.Pubky[]> {
    let stream: Core.Pubky[] = [];
    try {
      const mutesDirectory = `${baseUriBuilder(pubky)}mutes/`;
      const muteUris = await Core.HomeserverService.list({ baseDirectory: mutesDirectory });
      stream = muteUris.map((uri) => uri.split('/').pop()).filter((id): id is string => !!id) as Core.Pubky[];
    } catch (error) {
      if (error instanceof AppError && error.context?.statusCode === HttpStatusCode.NOT_FOUND) {
        Logger.info('Mutes directory not found, defaulting to empty list', { pubky });
      } else {
        throw error;
      }
    }

    // Persist the muted users to the local MUTED stream
    await Core.LocalStreamUsersService.upsert({
      streamId: Core.UserStreamTypes.MUTED,
      stream,
    });
    return stream;
  }
}
