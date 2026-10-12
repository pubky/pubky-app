import { listPrefix, parseUri } from 'pubky-social-specs';
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
  static async commitMute(params: TMuteApplicationCommitParams) {
    const { muter, mutee } = params;
    if (params.eventType === HttpMethod.PUT) {
      await LocalMuteService.create({ muter, mutee });
      await HomeserverService.putBlob({ url: params.muteUrl, blob: params.muteBody });
      return;
    }

    await LocalMuteService.delete({ muter, mutee });
    // The 0.x copy too: an un-migrated mute would otherwise keep filtering after the unmute.
    for (const url of params.deleteUrls) await HomeserverService.deleteIdempotent(url);
  }

  /**
   * Fetches the list of muted user IDs from the homeserver and persists them to the local MUTED stream.
   * Callers do not need to persist the result; this method handles fetch + persist.
   * @param pubky - The user's pubky to fetch mutes for
   * @returns Array of muted user pubkeys
   */
  static async fetchMutedUsers(pubky: Pubky): Promise<Pubky[]> {
    // Union of the v1 mutes and the ones a 0.x client wrote, so an un-migrated account keeps its
    // filtering. The key is the file name in both layouts.
    const [current, legacy] = await Promise.all([
      HomeserverService.list({ baseDirectory: `${listPrefix(pubky, 'private')}mutes/` }),
      HomeserverService.list({ baseDirectory: `${listPrefix(pubky, 'legacy')}mutes/` }),
    ]);
    const stream = [...new Set([...current, ...legacy].map(mutedKey).filter((id): id is Pubky => id !== null))];

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

/** The muted key a listed file names, in the v1 layout (`mutes/<key>.json`) or the 0.x one (`mutes/<key>`). */
function mutedKey(url: string): Pubky | null {
  try {
    const parsed = parseUri(url);
    if (parsed.kind === 'mute') return parsed.id;
    if (parsed.kind === 'foreign' && parsed.namespace === 'pubky.app' && parsed.rest.length === 2)
      return parsed.rest[1];
  } catch {
    // Someone else's file names can be anything; a name that is no canonical URI names no mute.
  }
  return null;
}
