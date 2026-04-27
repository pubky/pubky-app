import { APP_VERSION } from './app';
import { Env } from '@/libs/env/env';

/**
 * External Links Configuration
 *
 * This file centralizes all external URLs used throughout the application.
 * URLs can be overridden using environment variables for different environments.
 */

// App release URL (version injected from package.json via next.config.ts)
export const APP_RELEASE_URL = `https://github.com/pubky/pubky-app/releases/tag/${APP_VERSION}`;

// Pubky ecosystem links
export const PUBKY_RING_URL = Env.NEXT_PUBLIC_PUBKY_RING_URL;
export const PUBKY_CORE_URL = Env.NEXT_PUBLIC_PUBKY_CORE_URL;

// Social media links
export const TWITTER_URL = Env.NEXT_PUBLIC_TWITTER_URL;
export const TWITTER_GETPUBKY_URL = Env.NEXT_PUBLIC_TWITTER_GETPUBKY_URL;
export const TELEGRAM_URL = Env.NEXT_PUBLIC_TELEGRAM_URL;
export const GITHUB_URL = Env.NEXT_PUBLIC_GITHUB_URL;

// Contact links
export const EMAIL_URL = `mailto:${Env.NEXT_PUBLIC_EMAIL}`;

// App store links
export const APP_STORE_URL = Env.NEXT_PUBLIC_APP_STORE_URL;
export const PLAY_STORE_URL = Env.NEXT_PUBLIC_PLAY_STORE_URL;
