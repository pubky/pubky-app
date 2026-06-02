import { baseUriBuilder } from 'pubky-app-specs';
import type { TMuteApplicationCommitParams } from '@/application/mute/mute.types';
import { MUTE_HOMESERVER_EVENTS_PATH_PREFIX } from '@/config/mute-sync';
import type { TMuteDirectoryEvent } from '@/controllers/mute/mute.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalMuteService } from '@/services/local/mute/mute';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';

export class MuteApplication {
  private constructor() {}

  /**
   * Handles muting or unmuting a user.
   * Performs local database operations and syncs with the homeserver.
   * @param params - Parameters containing event type, URLs, JSON data, and user IDs
   */
  static async commitMute({ eventType, muteUrl, muteJson, muter, mutee }: TMuteApplicationCommitParams) {
    if (eventType === HttpMethod.PUT) {
      await LocalMuteService.create({ muter, mutee });
      await HomeserverService.request({ method: eventType, url: muteUrl, bodyJson: muteJson });
      return;
    }

    if (eventType === HttpMethod.DELETE) {
      await LocalMuteService.delete({ muter, mutee });
      await HomeserverService.request({ method: eventType, url: muteUrl, bodyJson: muteJson });
      return;
    }
  }

  /**
   * Fetches the list of muted user IDs from the homeserver and persists them to the local MUTED stream.
   * Callers do not need to persist the result; this method handles fetch + persist.
   * @param pubky - The user's pubky to fetch mutes for
   * @returns Array of muted user pubkeys
   */
  static async fetchMutedUsers(pubky: Pubky): Promise<Pubky[]> {
    const mutesDirectory = `${baseUriBuilder(pubky)}mutes/`;
    const muteUris = await HomeserverService.list({ baseDirectory: mutesDirectory });
    const stream = muteUris.map((uri) => uri.split('/').pop()).filter((id): id is string => !!id) as Pubky[];

    await LocalStreamUsersService.upsert({
      streamId: UserStreamTypes.MUTED,
      stream,
    });
    return stream;
  }

  /**
   * Homeserver `/events-stream` (live) for mute directory changes only.
   * @see HomeserverService.subscribeUserEventStreamForPath
   */
  static subscribeMuteDirectoryEventStream(
    pubky: Pubky,
    cursor: string | null,
  ): Promise<ReadableStream<TMuteDirectoryEvent>> {
    return HomeserverService.subscribeUserEventStreamForPath({
      userZ32: pubky,
      cursor,
      pathPrefix: MUTE_HOMESERVER_EVENTS_PATH_PREFIX,
    });
  }
}
