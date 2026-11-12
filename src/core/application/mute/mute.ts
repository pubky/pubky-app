import { xor } from 'lodash-es';
import { listPrefix, parseUri } from 'pubky-social-specs';
import type { TMuteApplicationCommitParams, TMuteFetchOptions } from '@/application/mute/mute.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalMuteService } from '@/services/local/mute/mute';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { awaitBounded } from '@/utils/bounded-read';
import { withSyncLock } from '@/utils/sync-lock';

/**
 * The user's mute sync lock (`withSyncLock`), shared by every tab: a commit holds it `shared` across
 * the MUTED stream write and the PUT or DELETEs, so commits overlap each other (with Web Locks; the
 * per-tab fallback queue runs them one at a time); `fetchMutedUsers` holds it `exclusive` from the
 * LIST through the local read to the upsert. So no commit lands between the listing and the upsert,
 * in this tab or another, and a mute being written in any tab (its row stored, its PUT not yet
 * landed) is either listed or written after the fetch, never undone by it.
 */
const muteSyncLock = (pubky: Pubky) => `pubky-mutes-sync:${pubky}`;

/**
 * The pair's write lock, held `exclusive` inside the shared user lock: `deleteIdempotent` waits between
 * its attempts outside the homeserver's per-file queue, so a mute PUT from another tab could land
 * between an unmute's DELETE attempts and be removed by the retry. Writes to one pair run one after
 * another, retries included; writes to different pairs still overlap under Web Locks.
 */
const muteWriteLock = (pubky: Pubky, mutee: Pubky) => `pubky-mute-write:${pubky}:${mutee}`;

export class MuteApplication {
  private constructor() {}

  /**
   * Mute syncs in flight, keyed by muter and mutee. Overlapping commits for one pair run in order:
   * `deleteIdempotent` waits between its attempts outside the homeserver's per-file queue, so a mute
   * issued while an unmute is still retrying must wait for it, or the retried DELETE would remove
   * the mute the user just put back. `muteWriteLock` orders the same across tabs.
   */
  private static readonly inFlightMutes = new Map<string, Promise<void>>();

  /** Commits settled so far, counted under the locks: a LIST that spans a settle may predate that commit's write. */
  private static settledMuteCommits = 0;

  /** LISTs started so far, and the newest one whose answer counted: an older LIST that answers late must not undo it. */
  private static listsStarted = 0;
  private static newestListApplied = 0;

  /**
   * Handles muting or unmuting a user.
   * Performs local database operations and syncs with the homeserver, one commit at a time per pair,
   * holding `muteSyncLock` `shared` and `muteWriteLock` `exclusive`.
   * @param params - Parameters containing event type, the URL and bytes to PUT or the URLs to delete, and user IDs
   */
  static async commitMute(params: TMuteApplicationCommitParams): Promise<void> {
    const { muter, mutee } = params;
    const key = `${muter}:${mutee}`;
    const previous = this.inFlightMutes.get(key) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() =>
        withSyncLock(muteSyncLock(muter), 'shared', () =>
          withSyncLock(muteWriteLock(muter, mutee), 'exclusive', () => this.syncMuteUnderLocks(params)),
        ),
      );
    this.inFlightMutes.set(key, run);
    try {
      await run;
    } finally {
      if (this.inFlightMutes.get(key) === run) this.inFlightMutes.delete(key);
    }
  }

  /** Counts the commit settled before the locks are released, so a listing granted next sees the count. */
  private static async syncMuteUnderLocks(params: TMuteApplicationCommitParams): Promise<void> {
    try {
      await this.syncMute(params);
    } finally {
      this.settledMuteCommits += 1;
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
   *
   * The whole run holds `muteSyncLock` `exclusive`; the wait for the LIST is bounded by
   * `HOMESERVER_SYNC_READ_TIMEOUT_MS` (`awaitBounded`), after which the run fails like a failed LIST.
   *
   * The sync coordinator calls this on a timer, so the local write also stands down in four cases: the session
   * the fetch started for ended; a commit of this tab settled during the run; a LIST started later has already
   * answered; or the members are unchanged, because a rewrite wakes every `useMutedUsers` reader on each poll.
   * The second and third are the per-tab guards from before the lock, kept as defence in depth: under it a
   * listing never overlaps a commit or another listing of this tab (Web Locks, or the per-tab queue where they
   * are unavailable), so neither fires, and a commit of this tab waiting for the lock writes after this run.
   * @param pubky - The user's pubky to fetch mutes for
   * @returns Array of muted user pubkeys
   */
  static async fetchMutedUsers(pubky: Pubky, { isCurrent }: TMuteFetchOptions = {}): Promise<Pubky[]> {
    return withSyncLock(muteSyncLock(pubky), 'exclusive', () => this.fetchMutedUsersUnderLock(pubky, isCurrent));
  }

  private static async fetchMutedUsersUnderLock(pubky: Pubky, isCurrent?: () => boolean): Promise<Pubky[]> {
    const settledBeforeList = this.settledMuteCommits;
    this.listsStarted += 1;
    const list = this.listsStarted;
    const baseDirectory = `${listPrefix(pubky, 'private')}mutes/`;
    // The lock is held across this read: a timeout rejects here, before the local read and the upsert below, so
    // nothing the abandoned LIST answers late is ever applied.
    const muteUris = await awaitBounded(HomeserverService.listAll({ baseDirectory }), {
      operation: 'fetchMutedUsers',
      context: { baseDirectory },
    });
    const stream = muteUris.map(mutedKey).filter((id): id is Pubky => id !== null);

    const local = await LocalStreamUsersService.findById(UserStreamTypes.MUTED);
    if (isCurrent && !isCurrent()) return stream;
    if (this.settledMuteCommits !== settledBeforeList) return stream;
    if (list < this.newestListApplied) return stream;
    this.newestListApplied = list;
    if (local && xor(local.stream, stream).length === 0) return stream;

    await LocalStreamUsersService.upsert({
      streamId: UserStreamTypes.MUTED,
      stream,
    });
    return stream;
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
