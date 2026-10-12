import JSZip from 'jszip';
import { buildUri, decodeObject, deletionPaths, encodeObject, listPrefix, type User } from 'pubky-social-specs';
import type {
  TApplicationCommitUpdateDetailsParams,
  TCreateProfileInput,
  TDeleteAccountParams,
  TDownloadDataParams,
} from '@/application/profile/profile.types';
import { APP_PRIVATE_PATH } from '@/config/app-files';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus, toAppError } from '@/libs/error/error.utils';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { sleep } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import type { ProfileChanges } from '@/pipes/pipes.types';
import { UserNormalizer } from '@/pipes/user/user.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { retryHomeserverWriteAfterReread } from '@/services/homeserver/write-retry';
import { LocalProfileService } from '@/services/local/profile/profile';
import { NexusBootstrapService } from '@/services/nexus/bootstrap/bootstrap';
import { useAuthStore } from '@/stores/auth/auth.store';

const DELETE_FILE_MAX_ATTEMPTS = 3;
const DELETE_FILE_RETRY_DELAY_MS = 500;
const PROFILE_LOCK_PREFIX = 'pubky-app:profile:';

export class ProfileApplication {
  private constructor() {} // Prevent instantiation

  private static pendingWrites = new Map<Pubky, Promise<void>>();

  /**
   * Commits the set details operation to the homeserver and local database.
   * @param profile - The profile to set
   * @param url - The URL of the profile
   * @param pubky - The public key of the user
   */
  static async commitCreate({ profile: built, pubky }: TCreateProfileInput) {
    const profile = built.object;
    try {
      await HomeserverService.putBlob({ url: built.url, blob: built.body });
      // Persist the successfully-created profile immediately so onboarding revisit
      // and the welcome dialog do not depend on Nexus indexing catching up first.
      await LocalProfileService.upsertDetails(
        {
          id: pubky,
          name: profile.name,
          bio: profile.bio ?? '',
          image: profile.image ?? null,
          links: profile.links?.map((link) => ({ title: link.title, url: link.url })) ?? [],
          status: profile.status || null,
          indexed_at: Date.now(),
        },
        'local',
      );
      // Tell Nexus this user exists (best-effort, never rejects; see NexusBootstrapService.ingest).
      void NexusBootstrapService.ingest(pubky);
      const authStore = useAuthStore.getState();
      authStore.setCurrentUserPubky(pubky);
      authStore.setHasProfile(true);
    } catch (error) {
      // TODO: Previously we were resetting the auth store here. Check #571 PR for more details.
      // Jump again in that case, when we will work in error handling. NEXT
      throw error;
    }
  }

  /**
   * Publishes the fields the user edited in the profile form.
   *
   * @param params - The user's public key and the changed fields
   */
  static async commitUpdate({ pubky, changes }: TApplicationCommitUpdateDetailsParams) {
    await this.commitChanges({
      pubky,
      changes,
      operation: 'commitUpdate',
      deletedMessage: 'Cannot update a deleted profile',
    });
  }

  /**
   * Publishes a new status, leaving every other profile field as published.
   */
  static async commitUpdateStatus({ pubky, status }: { pubky: Pubky; status: string }) {
    await this.commitChanges({
      pubky,
      changes: { status },
      operation: 'commitUpdateStatus',
      deletedMessage: 'Cannot update the status of a deleted profile',
    });
  }

  /**
   * Applies `changes` onto the profile currently on the homeserver, PUTs it, then stores
   * exactly what was published locally. The PUT replaces the whole `profile.json`, so every
   * field the user didn't change comes from a fresh homeserver read, never from the local
   * cache, which can be older than the last save. A failed read aborts before the PUT, and a
   * missing profile (a deleted account) is refused so it isn't recreated. The whole write
   * holds the user's profile lock (see `withProfileLock`). A PUT the homeserver refuses with a
   * retried status (429, 500, 503 or the publish conflict) starts over from the read, so a field
   * another device changed meanwhile is kept, never replayed from the stale read.
   */
  private static async commitChanges({
    pubky,
    changes,
    operation,
    deletedMessage,
  }: {
    pubky: Pubky;
    changes: ProfileChanges;
    operation: string;
    deletedMessage: string;
  }) {
    await this.withProfileLock(pubky, async () => {
      const url = buildUri(pubky, 'user');
      const fence = HomeserverService.createWriteFence();
      const user = await retryHomeserverWriteAfterReread(fence, async () => {
        let next: { body: Uint8Array; user: User };
        try {
          next = await this.readAndApply(pubky, changes);
        } catch (error) {
          if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) {
            throw Err.client(ClientErrorCode.GONE, deletedMessage, {
              service: ErrorService.Homeserver,
              operation,
              context: { pubky },
              cause: error,
            });
          }
          throw error;
        }

        await HomeserverService.putBlob({ url, blob: next.body, fence });
        return next.user;
      });
      await LocalProfileService.updateDetails(user, pubky);
    });
  }

  /**
   * The bytes of the profile with `changes` applied, read fresh from the homeserver. The v1 profile
   * is decoded and edited in place, so members another client added survive. An account whose
   * only profile is the 0.x one (not migrated yet) gets a fresh v1 profile built from the 0.x
   * fields: the package has no 0.x reader, so that copy's unknown members cannot be carried.
   * Rejects with a 404 when neither exists (a deleted account).
   */
  private static async readAndApply(pubky: Pubky, changes: ProfileChanges): Promise<{ body: Uint8Array; user: User }> {
    const url = buildUri(pubky, 'user');
    const current = await HomeserverService.getFreshBytes(url);
    if (current) {
      try {
        const user = UserNormalizer.applyChanges(decodeObject(url, current, 'user'), changes);
        return { body: encodeObject(url, user), user };
      } catch (error) {
        // The stored profile does not decode, or the edit breaks a profile rule
        throw Err.validation(
          ValidationErrorCode.INVALID_INPUT,
          error instanceof Error ? error.message : String(error),
          {
            service: ErrorService.PubkyAppSpecs,
            operation: 'readAndApply',
            context: { pubky },
            cause: error,
          },
        );
      }
    }
    const legacyJson = await HomeserverService.getFreshJson(`${listPrefix(pubky, 'legacy')}profile.json`);
    const built = UserNormalizer.to(UserNormalizer.merge(UserNormalizer.fromPublished(legacyJson), changes), pubky);
    return { body: built.body, user: built.object };
  }

  /**
   * Runs one user's profile writes and account deletion one at a time. Each write reads the
   * published profile before its PUT, so an overlapping write would read the copy an earlier one
   * is about to replace, and a write that read `profile.json` before a deletion could PUT it back
   * after. Web Locks share the lock with every tab of the app, so a deletion also waits for a
   * write already in flight in another tab. Without them (an insecure origin), a queue covers
   * this tab only.
   */
  private static async withProfileLock(pubky: Pubky, task: () => Promise<void>): Promise<void> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      try {
        await navigator.locks.request(`${PROFILE_LOCK_PREFIX}${pubky}`, task);
      } catch (error) {
        // `request` itself can reject with a DOMException that no Err factory has reported.
        throw toAppError(error, ErrorService.Local, 'withProfileLock');
      }
      return;
    }

    const previousTask = this.pendingWrites.get(pubky) ?? Promise.resolve();
    const pendingTask = previousTask.catch(() => {}).then(task);

    this.pendingWrites.set(pubky, pendingTask);

    try {
      await pendingTask;
    } finally {
      if (this.pendingWrites.get(pubky) === pendingTask) {
        this.pendingWrites.delete(pubky);
      }
    }
  }

  /**
   * Deletes a single homeserver file, absorbing transient failures.
   *
   * Account deletion issues one DELETE per file — hundreds in a row for an active
   * account — so a single transport blip used to abort the entire flow mid-way
   * (Sentry PUBKY-APP-6Y). Each file gets a few attempts with a short backoff.
   * A 404 counts as success: the file may have been removed by an attempt whose
   * response was lost, and "file gone" is the desired end state either way. Each attempt is a
   * single DELETE, so the homeserver write retry policy's attempts don't multiply with these.
   */
  private static async deleteFile(url: string) {
    for (let attempt = 1; ; attempt++) {
      try {
        await HomeserverService.delete(url, { singleAttempt: true });
        return;
      } catch (error) {
        if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) {
          return;
        }
        if (attempt >= DELETE_FILE_MAX_ATTEMPTS) {
          throw error;
        }
        Logger.warn('[ProfileApplication] File deletion failed, retrying', { url, attempt });
        await sleep(DELETE_FILE_RETRY_DELAY_MS * attempt);
      }
    }
  }

  /**
   * Commits the delete profile operation to the homeserver and local database. Holds the
   * user's profile lock throughout, so a profile write can't PUT `profile.json` back after it
   * is deleted.
   * @param pubky - The public key of the user
   * @param setProgress - The function to set the progress
   */
  static async commitDelete({ pubky, setProgress }: TDeleteAccountParams) {
    await this.withProfileLock(pubky, async () => {
      // Clear local IndexedDB data first
      await LocalProfileService.deleteAll();

      // Enumerate every tree before deleting (single list calls are page-limited), so nothing is
      // missed and progress reporting stays accurate.
      const dataList = await this.listAllTrees(pubky);

      // The profiles go last, the 0.x one first: deletionPaths orders them so.
      const profileUrls = deletionPaths({ kind: 'user', id: '' }).map((path) => `pubky://${pubky}${path}`);
      const filesToDelete = dataList.filter((file) => !profileUrls.includes(file));

      // Sort remaining files alphanumerically and reverse
      filesToDelete.sort().reverse();

      // Total files including the profiles for progress calculation
      const totalFiles = filesToDelete.length + profileUrls.length;

      // Delete each file (excluding profile.json) and update progress
      for (let index = 0; index < filesToDelete.length; index++) {
        await this.deleteFile(filesToDelete[index]);

        if (!setProgress) {
          continue;
        }

        setProgress(Math.round(((index + 1) / totalFiles) * 100));
      }

      // Finally, delete the profiles and update progress to 100%
      for (const profileUrl of profileUrls) await this.deleteFile(profileUrl);

      if (setProgress) {
        setProgress(100);
      }
    });
  }

  /**
   * Downloads all user data from the homeserver and packages it into a ZIP file.
   * Enumerates every file via paginated listing, formats JSON files with indentation, and preserves binary files.
   * Automatically triggers a browser download of the generated ZIP file.
   *
   * NOTE: This export flow is not reachable from the UI yet. The Settings → Account
   * "Download your data" section still needs to be built and wired to
   * `ProfileController.downloadData`.
   * @param params - Parameters containing user's public key and optional progress callback
   */
  static async downloadData({ pubky, setProgress }: TDownloadDataParams) {
    const dataList = await this.listAllTrees(pubky);

    // Create JSZip instance and data folder
    const zip = new JSZip();
    const dataFolder = zip.folder('data');

    if (!dataFolder) {
      throw Err.client(ClientErrorCode.UNPROCESSABLE, "Error creating 'data' folder in zip.", {
        service: ErrorService.Local,
        operation: 'downloadData',
        context: { pubky },
      });
    }

    const totalFiles = dataList.length;

    // Fetch each file and add to zip
    await Promise.all(
      dataList.map(async (dataUrl, index) => {
        const response = await HomeserverService.get(dataUrl);
        const arrayBuffer = await response.arrayBuffer();
        const fileName = dataUrl.split(`pubky://${pubky}/`)[1];

        // Try to parse as JSON and format with indentation, fallback to binary for non-JSON files
        try {
          const decoder = new TextDecoder('utf-8');
          const decodedString = decoder.decode(arrayBuffer);
          const parsedData = JSON.parse(decodedString);
          dataFolder.file(fileName, JSON.stringify(parsedData, null, 2));
        } catch {
          dataFolder.file(fileName, new Uint8Array(arrayBuffer), { binary: true });
        }

        if (setProgress) {
          setProgress(Math.round(((index + 1) / totalFiles) * 100));
        }
      }),
    );

    // Generate zip blob and trigger download
    const now = new Date();
    const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pubky}_${formattedDateTime}_pubky.app.zip`;
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Every file of the account this app writes: the v1 public and private trees, the app's own
   * namespace, and the 0.x tree an un-migrated or migrated account still holds.
   */
  private static async listAllTrees(pubky: Pubky): Promise<string[]> {
    const prefixes = [
      listPrefix(pubky, 'legacy'),
      listPrefix(pubky, 'public'),
      listPrefix(pubky, 'private'),
      `pubky://${pubky}${APP_PRIVATE_PATH}`,
    ];
    const lists = await Promise.all(prefixes.map((baseDirectory) => HomeserverService.listAll({ baseDirectory })));
    return lists.flat();
  }
}
