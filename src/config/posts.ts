import { getValidMimeTypes } from 'pubky-app-specs';
import validationLimits from 'pubky-app-specs/validationLimits.json';

/** Public key display length */
export const DEFAULT_DISPLAY_PUBLIC_KEY_LENGTH = 8;

/**
 * Post-related configuration constants
 */

/** Maximum number of tags allowed per post */
export const POST_MAX_TAGS = validationLimits.feedTagsMaxCount;

/** Maximum character length for post content */
export const POST_MAX_CHARACTER_LENGTH = validationLimits.postShortContentMaxLength;

/** Maximum character length for article title */
export const ARTICLE_TITLE_MAX_CHARACTER_LENGTH = 100;

/** Maximum character length for article content (22 characters reserved for JSON string) */
export const ARTICLE_MAX_CHARACTER_LENGTH =
  validationLimits.postLongContentMaxLength - ARTICLE_TITLE_MAX_CHARACTER_LENGTH - 22;

/** Maximum character length for a tag */
export const TAG_MAX_LENGTH = validationLimits.tagLabelMaxLength;

/** Maximum character length for feedback comments */
export const FEEDBACK_MAX_CHARACTER_LENGTH = 1000;

/**
 * Supported MIME types for file attachments.
 * Imported directly from pubky-app-specs to ensure consistency.
 */
export const POST_SUPPORTED_ATTACHMENT_MIME_TYPES = getValidMimeTypes() as string[];

export const ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES = getValidMimeTypes().filter((t) =>
  t.startsWith('image/'),
) as string[];

/** File input accept attribute string for supported attachment types */
export const POST_ATTACHMENT_ACCEPT_STRING = POST_SUPPORTED_ATTACHMENT_MIME_TYPES.join(',');

export const ARTICLE_ATTACHMENT_ACCEPT_STRING = ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES.join(',');

/** Maximum file size for images (5MB) */
export const ATTACHMENT_MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Maximum file size for non-image files (spec) */
export const ATTACHMENT_MAX_OTHER_SIZE = validationLimits.maxFileSizeBytes;

/** Maximum number of attachments per post */
export const POST_ATTACHMENT_MAX_FILES = validationLimits.postAttachmentsMaxCount;

/** Maximum number of attachments per article */
export const ARTICLE_ATTACHMENT_MAX_FILES = 1;

/** Human-readable list of supported file types for error messages (derived from MIME types) */
export const POST_SUPPORTED_FILE_TYPES = POST_SUPPORTED_ATTACHMENT_MIME_TYPES.map((mime) => mime.split('/')[1]).join(
  ', ',
);

export const ARTICLE_SUPPORTED_FILE_TYPES = ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES.map(
  (mime) => mime.split('/')[1],
).join(', ');
