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
   * Mute syncs in flight, keyed by muter and mutee. Overlapping commits for one pair run in order:
   * `deleteIdempotent` waits between its attempts outside the homeserver's per-file queue, so a mute
   * issued while an unmute is still retrying must wait for it, or the retried DELETE would remove
   * the mute the user just put back.
   */
  private static readonly inFlightMutes = new Map<string, Promise<void>>();

  /**
   * Handles muting or unmuting a user.
   * Performs local database operations and syncs with the homeserver, one commit at a time per pair.
   * @param params - Parameters containing event type, the URL and bytes to PUT or the URLs to delete, and user IDs
   */
  static async commitMute(params: TMuteApplicationCommitParams): Promise<void> {
    const key = `${params.muter}:${params.mutee}`;
    const previous = this.inFlightMutes.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.syncMute(params));
    this.inFlightMutes.set(key, run);
    try {
      await run;
    } finally {
      if (this.inFlightMutes.get(key) === run) this.inFlightMutes.delete(key);
    }
  }

  private static async syncMute(params: TMuteApplicationCommitParams): Promise<void> {
    const { muter, mutee, isCurrent } = params;
    // A commit that waited in the queue may start after a logout cleared the database: the shared
    // MUTED stream then belongs to the next account, so a stale session writes nothing.
    if (isCurrent && !isCurrent()) return;
    if (params.eventType === HttpMethod.PUT) {
      await LocalMuteService.create({ muter, mutee });
      if (isCurrent && !isCurrent()) return;
      await HomeserverService.putBlob({ url: params.muteUrl, blob: params.muteBody });
      return;
    }

    await LocalMuteService.delete({ muter, mutee });
    // Both copies, the 0.x one first: `deleteIdempotent` absorbs the 404 of a copy that was never there.
    for (const url of params.deleteUrls) {
      if (isCurrent && !isCurrent()) return;
      await HomeserverService.deleteIdempotent(url);
    }
  }

  /**
   * Fetches the list of muted user IDs from the homeserver and persists them to the local MUTED stream.
   * Callers do not need to persist the result; this method handles fetch + persist.
   *
   * Only the v1 private tree is listed: the migration gate guarantees every 0.x mute was copied there,
   * and an unmute deletes both copies, so the 0.x tree has nothing the v1 one lacks (ADR-0014).
   * @param pubky - The user's pubky to fetch mutes for
   * @returns Array of muted user pubkeys
   */
  static async fetchMutedUsers(pubky: Pubky): Promise<Pubky[]> {
    const muteUris = await HomeserverService.listAll({ baseDirectory: `${listPrefix(pubky, 'private')}mutes/` });
    const stream = muteUris.map(mutedKey).filter((id): id is Pubky => id !== null);

    await LocalStreamUsersService.upsert({
      streamId: UserStreamTypes.MUTED,
      stream,
    });
    return stream;
  }

  /**
   * Homeserver `/events-stream` (live) for mute directory changes only. The directory is private, so
   * the service attaches the signed-in session and fails as an auth error without one.
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

/** The muted key a listed file names (`mutes/<key>.json`); any other file in the directory names no mute. */
function mutedKey(url: string): Pubky | null {
  try {
    const parsed = parseUri(url);
    return parsed.kind === 'mute' ? parsed.id : null;
  } catch {
    // A name that is no canonical URI names no mute.
    return null;
  }
}
