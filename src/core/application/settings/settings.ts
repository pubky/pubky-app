import * as Core from '@/core';
import { HttpMethod, Logger, AppError, HttpStatusCode } from '@/libs';

/**
 * Settings application service.
 *
 * Handles synchronization of user settings between the local store and homeserver.
 * Settings are stored at: pubky://{pubky}/pub/pubky.app/settings.json
 */
export class SettingsApplication {
  private constructor() {}

  /**
   * Commits settings update to the homeserver.
   *
   * @param settings, The current settings state to persist
   * @param pubky, The user's public key
   */
  static async commitUpdate(settings: Core.SettingsState, pubky: Core.Pubky): Promise<void> {
    const { settings: settingsJson, meta } = Core.SettingsNormalizer.to(settings, pubky);

    Logger.info('[Settings] Pushing to homeserver', { url: meta.url, settings: settingsJson });

    await Core.HomeserverService.request({
      method: HttpMethod.PUT,
      url: meta.url,
      bodyJson: settingsJson as unknown as Record<string, unknown>,
    });

    Logger.info('[Settings] Push complete');
  }

  /**
   * Fetches settings from the homeserver.
   * Returns null if settings don't exist on homeserver (404).
   *
   * @param pubky, The user's public key
   * @returns The settings state from homeserver, or null if not found
   */
  static async fetchFromHomeserver(pubky: Core.Pubky): Promise<Core.SettingsState | null> {
    const url = Core.SettingsNormalizer.buildUrl(pubky);

    Logger.info('[Settings] Pulling from homeserver', { url });

    try {
      const settingsJson = await Core.HomeserverService.request<Core.SettingsJson>({ method: HttpMethod.GET, url });

      if (!settingsJson) {
        Logger.info('[Settings] Pull complete, no settings found');
        return null;
      }

      const settings = Core.SettingsNormalizer.from(settingsJson);
      Logger.info('[Settings] Pull complete', { settings });
      return settings;
    } catch (error) {
      // Handle 404, settings don't exist yet
      if (error instanceof AppError && error.context?.statusCode === HttpStatusCode.NOT_FOUND) {
        Logger.info('[Settings] Pull complete, settings file not found (404)');
        return null;
      }
      throw error;
    }
  }

  /**
   * Initializes settings on bootstrap.
   * Fetches settings from homeserver and merges with local settings.
   * Uses version and timestamp for conflict resolution (newer wins).
   *
   * @param pubky, The user's public key
   * @returns The remote settings if newer than local, or null if local is newer/equal
   * @throws If fetch or sync operations fail, caller should handle errors
   */
  static async initializeSettings(
    pubky: Core.Pubky,
    localSettings: Core.SettingsState,
  ): Promise<Core.SettingsState | null> {
    Logger.info('[Settings] Initializing settings sync');
    const remoteSettings = await this.fetchFromHomeserver(pubky);

    if (!remoteSettings) {
      Logger.info('[Settings] No remote settings, pushing local to homeserver');
      // Stamp a real timestamp if updatedAt is 0 (initial default), so homeserver has a valid timestamp for future conflict resolution
      const settingsWithTimestamp = { ...localSettings, updatedAt: localSettings.updatedAt || Date.now() };
      await this.commitUpdate(settingsWithTimestamp, pubky);
      return settingsWithTimestamp;
    }

    // Check if remote settings are newer (higher version or same version with newer timestamp)
    const isRemoteNewer =
      remoteSettings.version > localSettings.version ||
      (remoteSettings.version === localSettings.version && remoteSettings.updatedAt > localSettings.updatedAt);

    Logger.info('[Settings] Comparing versions', {
      local: { version: localSettings.version, updatedAt: localSettings.updatedAt },
      remote: { version: remoteSettings.version, updatedAt: remoteSettings.updatedAt },
      isRemoteNewer,
    });

    if (isRemoteNewer) {
      Logger.info('[Settings] Using remote settings (newer)');
      return remoteSettings;
    }

    Logger.info('[Settings] Local settings newer, pushing to homeserver');
    await this.commitUpdate(localSettings, pubky);
    return null;
  }
}
