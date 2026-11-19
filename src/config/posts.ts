import { limits } from 'pubky-social-specs';

/** Public key display length */
export const DEFAULT_DISPLAY_PUBLIC_KEY_LENGTH = 8;

/**
 * Post-related configuration constants
 */

/** Maximum number of tags allowed per post */
export const POST_MAX_TAGS = limits.feedTagsMaxCount;

/** Maximum character length for post content */
export const POST_MAX_CHARACTER_LENGTH = limits.postNoteContentMaxLength;

/** Maximum character length for article title */
export const ARTICLE_TITLE_MAX_CHARACTER_LENGTH = limits.articleTitleMaxLength;

/**
 * Maximum character length for an article body, the body alone: the title has its own cap above
 * and the envelope is the data model's to spell. Code points, as the data model counts (the
 * composer counts UTF-16 units, which is never more permissive).
 */
export const ARTICLE_MAX_CHARACTER_LENGTH = limits.articleBodyMaxLength;

/** Maximum character length for a lock announcement title */
export const LOCK_TITLE_MAX_CHARACTER_LENGTH = 100;

/** Maximum character length for a lock announcement teaser (41 characters reserved for JSON string) */
export const LOCK_TEASER_MAX_CHARACTER_LENGTH = limits.postNoteContentMaxLength - LOCK_TITLE_MAX_CHARACTER_LENGTH - 41;

/** Maximum character length for a tag */
export const TAG_MAX_LENGTH = limits.tagLabelMaxLength;

/** Maximum character length for feedback comments */
export const FEEDBACK_MAX_CHARACTER_LENGTH = 1000;

/** Maximum character length for collection names */
export const COLLECTION_NAME_MAX_CHARACTER_LENGTH = limits.collectionNameMaxLength;

/** Maximum character length for collection descriptions */
export const COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH = limits.collectionDescriptionMaxLength;

/** Maximum number of items allowed per collection */
export const COLLECTION_ITEMS_MAX_COUNT = limits.collectionItemsMaxCount;

/** Maximum character length for serialized collection content */
export const COLLECTION_CONTENT_MAX_LENGTH = limits.collectionContentMaxLength;

/** Maximum character length for a collection item URI (a v1 reference; was the 0.x attachment URL limit). */
export const COLLECTION_ITEM_URI_MAX_LENGTH = limits.referenceUriMaxLength;

/** Maximum character length for a collection cover image URL (the v1 image URL limit). */
export const COLLECTION_COVER_IMAGE_URL_MAX_LENGTH = limits.imageUrlMaxLength;

/** Allowed URL protocols for collection item URIs and cover images (spec post-attachment allowlist). */
export const COLLECTION_COVER_IMAGE_ALLOWED_PROTOCOLS: readonly string[] = limits.postAllowedAttachmentProtocols;

/** Maximum file size for non-image files (spec) */
export const ATTACHMENT_MAX_OTHER_SIZE = limits.maxFileSizeBytes;

/** Maximum number of attachments per post */
export const POST_ATTACHMENT_MAX_FILES = limits.postAttachmentsMaxCount;

/**
 * Maximum total number of attachments per article: the optional cover plus the
 * inline body images that map onto `attachment:{n}` slots.
 */
export const ARTICLE_ATTACHMENT_MAX_FILES = limits.postAttachmentsMaxCount;

/** Maximum number of cover images per article (the cover picker's cap) */
export const ARTICLE_COVER_MAX_FILES = 1;

/**
 * Lock Server default, mirrored because the server offers no way to read it: a lock holds 10
 * resources, and the locked post is one of them.
 */
export const LOCK_ATTACHMENT_MAX_FILES = 9;

/** Decimal, as the server counts it: a file of 10 MiB is already over. */
export const LOCK_ATTACHMENT_MAX_SIZE = 10_000_000;
