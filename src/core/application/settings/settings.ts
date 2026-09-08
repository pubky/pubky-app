import { hasHttpStatus } from '@/libs/error/error.utils';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { type SettingsJson, SettingsNormalizer } from '@/pipes/settings/settings.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import type { SettingsState } from '@/stores/settings/settings.types';

/**
 * Settings application service.
 *
 * Handles synchronization of user settings between the local store and homeserver.
 * Settings are stored at: pubky://{pubky}/pub/pubky.app/settings.json
 */
export class SettingsApplication {
  private static pendingCommits = new Map<Pubky, Promise<void>>();

  private constructor() {}

  /**
   * Commits settings update to the homeserver.
   *
   * Settings are replaced as one document, so a client whose local store predates
   * `privacy.moderationBot` would erase it (and trigger a spurious re-follow on the next
   * sign-in). When the local state lacks the field, the remote value is carried over first.
   * This self-limits: once the store has learned the field, no extra read happens.
   *
   * @param settings, The current settings state to persist
   * @param pubky, The user's public key
   * @param signal, Optional cancellation signal checked when this queued write starts
   */
  static async commitUpdate(settings: SettingsState, pubky: Pubky, signal?: AbortSignal): Promise<void> {
    await this.enqueueWrite(pubky, async () => {
      if (signal?.aborted) return;

      let resolved = settings;
      if (settings.privacy.moderationBot === undefined) {
        // Best effort: a failed read must not block an ordinary settings change.
        const remote = await this.fetchFromHomeserver(pubky).catch((error: unknown) => {
          Logger.warn('[Settings] Could not read remote moderation-bot state before write', { error });
          return null;
        });
        if (signal?.aborted) return;
        resolved = this.withRemoteModerationBot(settings, remote);
      }

      await this.push(resolved, pubky);
    });
  }

  /** Returns local settings enriched with the remote processed-bot state when only the remote has it. */
  private static withRemoteModerationBot(settings: SettingsState, remote: SettingsState | null): SettingsState {
    const moderationBot = remote?.privacy.moderationBot;
    if (settings.privacy.moderationBot !== undefined || moderationBot === undefined) return settings;

    Logger.info('[Settings] Carrying remote moderation-bot state into local write');
    return { ...settings, privacy: { ...settings.privacy, moderationBot } };
  }

  /** Serializes homeserver writes per account so concurrent full-document replaces cannot interleave. */
  private static async enqueueWrite(pubky: Pubky, write: () => Promise<void>): Promise<void> {
    const previousCommit = this.pendingCommits.get(pubky) ?? Promise.resolve();
    const pendingCommit = previousCommit.catch(() => {}).then(write);

    this.pendingCommits.set(pubky, pendingCommit);

    try {
      await pendingCommit;
    } finally {
      if (this.pendingCommits.get(pubky) === pendingCommit) {
        this.pendingCommits.delete(pubky);
      }
    }
  }

  private static async push(settings: SettingsState, pubky: Pubky): Promise<void> {
    const { settings: settingsJson, meta } = SettingsNormalizer.to(settings, pubky);

    Logger.info('[Settings] Pushing to homeserver', { url: meta.url, settings: settingsJson });

    await HomeserverService.request({
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
  static async fetchFromHomeserver(pubky: Pubky): Promise<SettingsState | null> {
    const url = SettingsNormalizer.buildUrl(pubky);

    Logger.info('[Settings] Pulling from homeserver', { url });

    try {
      const settingsJson = await HomeserverService.request<SettingsJson>({ method: HttpMethod.GET, url });

      if (!settingsJson) {
        Logger.info('[Settings] Pull complete, no settings found');
        return null;
      }

      const settings = SettingsNormalizer.from(settingsJson);
      Logger.info('[Settings] Pull complete', { settings });
      return settings;
    } catch (error) {
      // Handle 404, settings don't exist yet
      if (hasHttpStatus(error, HttpStatusCode.NOT_FOUND)) {
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
   * @returns The settings the store should adopt: remote when newer, or local enriched with
   *   remote-only moderation-bot state; null when the store is already current
   * @throws If fetch or sync operations fail, caller should handle errors
   */
  static async initializeSettings(pubky: Pubky, localSettings: SettingsState): Promise<SettingsState | null> {
    Logger.info('[Settings] Initializing settings sync');
    const remoteSettings = await this.fetchFromHomeserver(pubky);

    if (!remoteSettings) {
      Logger.info('[Settings] No remote settings, pushing local to homeserver');
      // Stamp a real timestamp if updatedAt is 0 (initial default), so homeserver has a valid timestamp for future conflict resolution
      const settingsWithTimestamp = { ...localSettings, updatedAt: localSettings.updatedAt || Date.now() };
      await this.enqueueWrite(pubky, () => this.push(settingsWithTimestamp, pubky));
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
    // The remote document was just read; reuse it instead of probing again inside commitUpdate.
    const settingsToPush = this.withRemoteModerationBot(localSettings, remoteSettings);
    await this.enqueueWrite(pubky, () => this.push(settingsToPush, pubky));
    return settingsToPush === localSettings ? null : settingsToPush;
  }
}
