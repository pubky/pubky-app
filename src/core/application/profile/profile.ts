import JSZip from 'jszip';
import { baseUriBuilder } from 'pubky-app-specs';
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
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserNormalizer } from '@/pipes/user/user.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalProfileService } from '@/services/local/profile/profile';
import { LocalUserService } from '@/services/local/user/user';
import { NexusBootstrapService } from '@/services/nexus/bootstrap/bootstrap';
import { useAuthStore } from '@/stores/auth/auth.store';

const DELETE_FILE_MAX_ATTEMPTS = 3;
const DELETE_FILE_RETRY_DELAY_MS = 500;

export class ProfileApplication {
  private constructor() {} // Prevent instantiation

  /**
   * Commits the set details operation to the homeserver and local database.
   * @param profile - The profile to set
   * @param url - The URL of the profile
   * @param pubky - The public key of the user
   */
  static async commitCreate({ profile, url, pubky }: TCreateProfileInput) {
    try {
      await HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: profile.toJson() });
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
   * Updates full user profile in both homeserver and local database.
   * Follows local-first pattern: updates homeserver first, then local DB.
   *
   * @param params - Parameters containing user's public key and profile data
   */
  static async commitUpdate({ pubky, name, bio, image, links }: TApplicationCommitUpdateDetailsParams) {
    const userDetails = await LocalUserService.readDetails({ userId: pubky });
    if (!userDetails) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'User profile not found', {
        service: ErrorService.Local,
        operation: 'commitUpdate',
        context: { pubky },
      });
    }

    // Build complete user object with updated fields
    const { user, meta } = UserNormalizer.to(
      {
        name,
        bio: bio ?? '',
        image,
        links,
        status: userDetails.status ?? '',
      },
      pubky,
    );

    // Update homeserver with complete profile
    await HomeserverService.request({ method: HttpMethod.PUT, url: meta.url, bodyJson: user.toJson() });
    // Update local database after successful homeserver sync
    await LocalProfileService.updateDetails(user, pubky);
  }

  /**
   * Updates user status in both homeserver and local database.
   */
  static async commitUpdateStatus({ pubky, status }: { pubky: Pubky; status: string }) {
    // Get current user details from local DB
    const currentUser = await UserDetailsModel.findById(pubky);
    if (!currentUser) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'User profile not found', {
        service: ErrorService.Local,
        operation: 'commitUpdateStatus',
        context: { pubky },
      });
    }

    // Build complete user object with updated status
    // According to spec, we must send the full profile, not just the status field
    const { user, meta } = UserNormalizer.to(
      {
        name: currentUser.name,
        bio: currentUser.bio,
        image: currentUser.image,
        links: (currentUser.links ?? []).map((link) => ({ title: link.title, url: link.url })),
        status: status || '',
      },
      pubky,
    );

    // Update homeserver with complete profile
    await HomeserverService.request({ method: HttpMethod.PUT, url: meta.url, bodyJson: user.toJson() });

    // Update local database after successful homeserver sync
    await UserDetailsModel.upsert({
      ...currentUser,
      status: status || null,
    });
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
   * Commits the delete profile operation to the homeserver and local database.
   * @param pubky - The public key of the user
   * @param setProgress - The function to set the progress
   */
  static async commitDelete({ pubky, setProgress }: TDeleteAccountParams) {
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
