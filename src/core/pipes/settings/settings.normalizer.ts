import { baseUriBuilder } from 'pubky-app-specs';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import {
  defaultNotificationPreferences,
  defaultPrivacyPreferences,
  type NotificationPreferences,
  type PrivacyPreferences,
  type SettingsState,
  type SettingsStore,
} from '@/stores/settings/settings.types';

/**
 * Settings JSON structure for homeserver persistence.
 * This matches the SettingsState structure used in the store.
 */
export interface SettingsJson {
  notifications: NotificationPreferences;
  privacy: PrivacyPreferences;
  language: string;
  updatedAt: number;
  version: number;
}

/**
 * Input type for parsing settings from homeserver.
 * Allows partial nested objects to support backwards compatibility
 * when new fields are added to notifications or privacy.
 */
export interface SettingsJsonInput {
  notifications?: Partial<NotificationPreferences>;
  privacy?: Partial<PrivacyPreferences>;
  language?: string;
  updatedAt?: number;
  version?: number;
}

/**
 * Result of normalizing settings, containing the settings JSON and metadata.
 */
export interface SettingsNormalizerResult {
  settings: SettingsJson;
  meta: {
    url: string;
    path: string;
  };
}

/** Path constant for settings.json */
const SETTINGS_PATH = 'pub/pubky.app/settings.json';

export class SettingsNormalizer {
  private constructor() {}

  /**
   * Extracts settings state from a store or partial state object.
   * Used to create a clean SettingsState object for persistence.
   * @param store, The settings store or state object
   * @returns A clean SettingsState object
   */
  static extractState(store: SettingsState | SettingsStore): SettingsState {
    return {
      notifications: store.notifications,
      privacy: store.privacy,
      muted: store.muted,
      language: store.language,
      updatedAt: store.updatedAt,
      version: store.version,
    };
  }

  /**
   * Builds the settings URL for a given pubky.
   * URL format: pubky://{pubky}/pub/pubky.app/settings.json
   */
  static buildUrl(pubky: Pubky): string {
    const baseUri = baseUriBuilder(pubky);
    return `${baseUri}settings.json`;
  }

  /**
   * Converts settings state to the format stored on the homeserver.
   * @param settings, The settings state from the store
   * @param pubky, The user's public key
   * @returns SettingsNormalizerResult containing settings JSON and metadata
   */
  static to(settings: SettingsState, pubky: Pubky): SettingsNormalizerResult {
    const url = this.buildUrl(pubky);

    const settingsJson: SettingsJson = {
      notifications: settings.notifications,
      privacy: settings.privacy,
      language: settings.language,
      updatedAt: settings.updatedAt,
      version: settings.version,
    };

    Logger.debug('Settings normalized for homeserver', { url, settings: settingsJson });

    return {
      settings: settingsJson,
      meta: {
        url,
        path: SETTINGS_PATH,
      },
    };
  }

  /**
   * Converts homeserver settings JSON to store state format.
   * Applies defaults for any missing fields to ensure backwards compatibility.
   * @param json, The settings JSON from the homeserver
   * @returns SettingsState for the store
   */
  static from(json: SettingsJsonInput): SettingsState {
    return {
      notifications: {
        ...defaultNotificationPreferences,
        ...json.notifications,
      },
      privacy: {
        ...defaultPrivacyPreferences,
        ...json.privacy,
      },
      muted: [], // Muted is not synced to homeserver, always defaults to empty
      language: json.language ?? 'en',
      updatedAt: json.updatedAt ?? Date.now(),
      version: json.version ?? 1,
    };
  }
}
