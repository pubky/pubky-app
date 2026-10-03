/**
 * User/Profile-related configuration constants
 * These values are based on pubky-app-specs
 */

import validationLimits from 'pubky-app-specs/validationLimits.json';
import { getTtlUserMs } from '@/config/sync';

/** Minimum character length for user name */
export const USER_NAME_MIN_LENGTH = validationLimits.userNameMinLength;

/** Maximum character length for user name */
export const USER_NAME_MAX_LENGTH = validationLimits.userNameMaxLength;

/** Maximum character length for user bio */
export const USER_BIO_MAX_LENGTH = validationLimits.userBioMaxLength;

/** Maximum character length for user status */
export const USER_STATUS_MAX_LENGTH = validationLimits.userStatusMaxLength;

/** Maximum character length for link label */
export const USER_LINK_LABEL_MAX_LENGTH = validationLimits.userLinkTitleMaxLength;

/** Maximum character length for link URL */
export const USER_LINK_URL_MAX_LENGTH = validationLimits.userLinkUrlMaxLength;

/** Maximum number of links a user can have */
export const USER_MAX_LINKS = validationLimits.userLinksMaxCount;

/**
 * How long a profile the user just saved is kept against Nexus responses that don't include it
 * yet. It bounds the protection; it doesn't confirm indexing.
 */
export const PROFILE_LOCAL_EDIT_TTL_MS = 300_000;

/**
 * The protection window in effect. It never outlasts the user TTL the local write stamped, so a
 * row kept against a payload never goes stale while protected and gets refetched every tick.
 */
export const getProfileLocalEditTtlMs = () => Math.min(PROFILE_LOCAL_EDIT_TTL_MS, getTtlUserMs());
