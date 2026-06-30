import {
  getAppStoreUrl,
  getEmail,
  getGithubUrl,
  getPlayStoreUrl,
  getPubkyCoreUrl,
  getPubkyRingUrl,
  getTelegramUrl,
  getTwitterGetpubkyUrl,
  getTwitterUrl,
} from '@/libs/runtime-config/runtime-config';
import { APP_VERSION } from './app';

/**
 * External Links Configuration
 *
 * This file centralizes all external URLs used throughout the application.
 * URLs can be overridden using environment variables for different environments.
 */

// App release URL (version injected from package.json via next.config.ts)
export const APP_RELEASE_URL = `https://github.com/pubky/pubky-app/releases/tag/${APP_VERSION}`;

// Pubky ecosystem links
export const getPubkyRingLink = getPubkyRingUrl;
export const getPubkyCoreLink = getPubkyCoreUrl;

// Social media links
export const getTwitterLink = getTwitterUrl;
export const getTwitterGetpubkyLink = getTwitterGetpubkyUrl;
export const getTelegramLink = getTelegramUrl;
export const getGithubLink = getGithubUrl;

// Contact links
export const getEmailLink = (): string => `mailto:${getEmail()}`;

// App store links
export const getAppStoreLink = getAppStoreUrl;
export const getPlayStoreLink = getPlayStoreUrl;
