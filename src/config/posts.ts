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

/** Maximum character length for collection names */
export const COLLECTION_NAME_MAX_CHARACTER_LENGTH = validationLimits.collectionNameMaxLength;

/** Maximum character length for collection descriptions */
export const COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH = validationLimits.collectionDescriptionMaxLength;

/** Maximum number of items allowed per collection */
export const COLLECTION_ITEMS_MAX_COUNT = validationLimits.collectionItemsMaxCount;

/** Maximum character length for serialized collection content */
export const COLLECTION_CONTENT_MAX_LENGTH = validationLimits.collectionContentMaxLength;

/** Maximum character length for a collection item URI (same limit as post attachment URLs in spec). */
export const COLLECTION_ITEM_URI_MAX_LENGTH = validationLimits.postAttachmentUrlMaxLength;

/**
 * Maximum character length for a collection cover image URL.
 * Reuses the spec's post attachment URL limit (cover_image is bound to the
 * same `post_attachment_url_max_length` and protocol allowlist on the BE).
 */
export const COLLECTION_COVER_IMAGE_URL_MAX_LENGTH = validationLimits.postAttachmentUrlMaxLength;

/** Allowed URL protocols for collection item URIs and cover images (spec post-attachment allowlist). */
export const COLLECTION_COVER_IMAGE_ALLOWED_PROTOCOLS = validationLimits.postAllowedAttachmentProtocols;

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
