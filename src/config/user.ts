/**
 * User/Profile-related configuration constants
 * These values are based on pubky-social-specs
 */

import { limits } from 'pubky-social-specs';

export { getProfileLocalEditTtlMs } from '@/libs/runtime-config/runtime-config';

/** Minimum character length for user name */
export const USER_NAME_MIN_LENGTH = limits.userNameMinLength;

/** Maximum character length for user name */
export const USER_NAME_MAX_LENGTH = limits.userNameMaxLength;

/** Maximum character length for user bio */
export const USER_BIO_MAX_LENGTH = limits.userBioMaxLength;

/** Maximum character length for user status */
export const USER_STATUS_MAX_LENGTH = limits.userStatusMaxLength;

/** Maximum character length for link label */
export const USER_LINK_LABEL_MAX_LENGTH = limits.userLinkTitleMaxLength;

/** Maximum character length for link URL */
export const USER_LINK_URL_MAX_LENGTH = limits.userLinkUrlMaxLength;

/** Maximum number of links a user can have */
export const USER_MAX_LINKS = limits.userLinksMaxCount;
