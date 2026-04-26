import JSZip from 'jszip';

import * as Specs from 'pubky-app-specs';
import * as Core from '@/core';
import { HttpMethod } from '@/libs/http/http.types';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export class ProfileApplication {
  private constructor() {} // Prevent instantiation

  /**
   * Commits the set details operation to the homeserver and local database.
   * @param profile - The profile to set
   * @param url - The URL of the profile
   * @param pubky - The public key of the user
   */
  static async commitCreate({ profile, url, pubky }: Core.TCreateProfileInput) {
    try {
      await Core.HomeserverService.request({ method: HttpMethod.PUT, url, bodyJson: profile.toJson() });
      const authStore = Core.useAuthStore.getState();
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
  static async commitUpdate({ pubky, name, bio, image, links }: Core.TApplicationCommitUpdateDetailsParams) {
    const userDetails = await Core.LocalUserService.readDetails({ userId: pubky });
    if (!userDetails) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'User profile not found', {
        service: ErrorService.Local,
        operation: 'commitUpdate',
        context: { pubky },
      });
    }

    // Build complete user object with updated fields
    const { user, meta } = Core.UserNormalizer.to(
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
    await Core.HomeserverService.request({ method: HttpMethod.PUT, url: meta.url, bodyJson: user.toJson() });
    // Update local database after successful homeserver sync
    await Core.LocalProfileService.updateDetails(user, pubky);
  }

  /**
   * Updates user status in both homeserver and local database.
   */
  static async commitUpdateStatus({ pubky, status }: { pubky: Core.Pubky; status: string }) {
    // Get current user details from local DB
    const currentUser = await Core.UserDetailsModel.findById(pubky);
    if (!currentUser) {
      throw Err.client(ClientErrorCode.NOT_FOUND, 'User profile not found', {
        service: ErrorService.Local,
        operation: 'commitUpdateStatus',
        context: { pubky },
      });
    }

    // Build complete user object with updated status
    // According to spec, we must send the full profile, not just the status field
    const { user, meta } = Core.UserNormalizer.to(
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
    await Core.HomeserverService.request({ method: HttpMethod.PUT, url: meta.url, bodyJson: user.toJson() });

    // Update local database after successful homeserver sync
    await Core.UserDetailsModel.upsert({
      ...currentUser,
      status: status || null,
    });
  }

  /**
   * Commits the delete profile operation to the homeserver and local database.
   * @param pubky - The public key of the user
   * @param setProgress - The function to set the progress
   */
  static async commitDelete({ pubky, setProgress }: Core.TDeleteAccountParams) {
    // Clear local IndexedDB data first
    await Core.LocalProfileService.deleteAll();

    const baseDirectory = Specs.baseUriBuilder(pubky);
    // TODO: Using undefined, false, and Infinity here as a temporary workaround since
    // homeserver.list does not yet support pagination. This ensures all files are deleted.
    const dataList = await Core.HomeserverService.list({ baseDirectory, reverse: false, limit: Infinity });

    // Separate profile.json and other files
    const profileUrl = `${baseDirectory}profile.json`;
    const filesToDelete = dataList.filter((file) => file !== profileUrl);

    // Sort remaining files alphanumerically and reverse
    filesToDelete.sort().reverse();

    // Total files including profile.json for progress calculation
    const totalFiles = filesToDelete.length + 1;

    // Delete each file (excluding profile.json) and update progress
    for (let index = 0; index < filesToDelete.length; index++) {
      await Core.HomeserverService.delete(filesToDelete[index]);

      if (!setProgress) {
        continue;
      }

      setProgress(Math.round(((index + 1) / totalFiles) * 100));
    }

    // Finally, delete profile.json and update progress to 100%
    await Core.HomeserverService.delete(profileUrl);

    if (setProgress) {
      setProgress(100);
    }
  }

  /**
   * Downloads all user data from the homeserver and packages it into a ZIP file.
   * Fetches all files at once (using Infinity limit), formats JSON files with indentation, and preserves binary files.
   * Automatically triggers a browser download of the generated ZIP file.
   * @param params - Parameters containing user's public key and optional progress callback
   */
  static async downloadData({ pubky, setProgress }: Core.TDownloadDataParams) {
    const baseDirectory = Specs.baseUriBuilder(pubky);

    // TODO: Using undefined, false, and Infinity here as a temporary workaround since homeserver.list does not yet
    // support pagination. This ensures all files are retrieved.
    const dataList = await Core.HomeserverService.list({ baseDirectory, reverse: false, limit: Infinity });

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
        const response = await Core.HomeserverService.get(dataUrl);
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
