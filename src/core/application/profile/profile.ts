import JSZip from 'jszip';
import { baseUriBuilder, userUriBuilder } from 'pubky-app-specs';
import type {
  TApplicationCommitUpdateDetailsParams,
  TCreateProfileInput,
  TDeleteAccountParams,
  TDownloadDataParams,
} from '@/application/profile/profile.types';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { sleep } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import type { ProfileChanges } from '@/pipes/pipes.types';
import { UserNormalizer } from '@/pipes/user/user.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
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
  static async commitCreate({ profile, url, pubky }: TCreateProfileInput) {
    try {
      await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: profile.toJson() });
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
   * holds the user's profile lock (see `withProfileLock`).
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
      let publishedJson: unknown;
      try {
        publishedJson = await HomeserverService.getFreshJson(userUriBuilder(pubky));
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

      const published = UserNormalizer.fromPublished(publishedJson);
      const { user, meta } = UserNormalizer.to(UserNormalizer.merge(published, changes), pubky);
      await HomeserverService.request({ method: HttpMethod.PUT, url: meta.url, bodyJson: user.toJson() });
      await LocalProfileService.updateDetails(user, pubky);
    });
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
      await navigator.locks.request(`${PROFILE_LOCK_PREFIX}${pubky}`, task);
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
   * response was lost, and "file gone" is the desired end state either way.
   */
  private static async deleteFile(url: string) {
    for (let attempt = 1; ; attempt++) {
      try {
        await HomeserverService.delete(url);
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

      const baseDirectory = baseUriBuilder(pubky);
      // Enumerate the full directory before deleting (single list calls are page-limited),
      // so nothing is missed and progress reporting stays accurate.
      const dataList = await HomeserverService.listAll({ baseDirectory });

      // Separate profile.json and other files
      const profileUrl = `${baseDirectory}profile.json`;
      const filesToDelete = dataList.filter((file) => file !== profileUrl);

      // Sort remaining files alphanumerically and reverse
      filesToDelete.sort().reverse();

      // Total files including profile.json for progress calculation
      const totalFiles = filesToDelete.length + 1;

      // Delete each file (excluding profile.json) and update progress
      for (let index = 0; index < filesToDelete.length; index++) {
        await this.deleteFile(filesToDelete[index]);

        if (!setProgress) {
          continue;
        }

        setProgress(Math.round(((index + 1) / totalFiles) * 100));
      }

      // Finally, delete profile.json and update progress to 100%
      await this.deleteFile(profileUrl);

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
    const baseDirectory = baseUriBuilder(pubky);

    const dataList = await HomeserverService.listAll({ baseDirectory });

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
}
