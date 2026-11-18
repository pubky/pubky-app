import { getValidMimeTypes } from 'pubky-app-specs';

/**
 * Supported MIME types for file attachments.
 * Imported directly from pubky-app-specs to ensure consistency.
 */
export const POST_SUPPORTED_ATTACHMENT_MIME_TYPES = getValidMimeTypes() as string[];

export const ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES = POST_SUPPORTED_ATTACHMENT_MIME_TYPES.filter((mime) =>
  mime.startsWith('image/'),
);

/** File input accept attribute string for supported attachment types */
export const POST_ATTACHMENT_ACCEPT_STRING = POST_SUPPORTED_ATTACHMENT_MIME_TYPES.join(',');

export const ARTICLE_ATTACHMENT_ACCEPT_STRING = ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES.join(',');

/**
 * Non-image media an article body may embed inline (`![alt](attachment:{n})`), on top of the image
 * types above. Filtered through the spec list so a spec change can never widen it silently.
 * The cover stays image-only (`ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES`).
 */
export const ARTICLE_INLINE_NON_IMAGE_MIME_TYPES = [
  'video/mp4',
  'video/mpeg',
  'audio/mpeg',
  'audio/wav',
  'application/pdf',
].filter((mime) => POST_SUPPORTED_ATTACHMENT_MIME_TYPES.includes(mime));

/** Every MIME type an article body may embed inline: images plus the non-image media above. */
export const ARTICLE_INLINE_SUPPORTED_MIME_TYPES = [
  ...ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES,
  ...ARTICLE_INLINE_NON_IMAGE_MIME_TYPES,
];

/** File input accept strings for the per-kind insert buttons of the article editor */
export const ARTICLE_INLINE_ACCEPT_STRING_BY_KIND = {
  image: ARTICLE_ATTACHMENT_ACCEPT_STRING,
  video: ARTICLE_INLINE_NON_IMAGE_MIME_TYPES.filter((mime) => mime.startsWith('video/')).join(','),
  audio: ARTICLE_INLINE_NON_IMAGE_MIME_TYPES.filter((mime) => mime.startsWith('audio/')).join(','),
  pdf: ARTICLE_INLINE_NON_IMAGE_MIME_TYPES.filter((mime) => mime === 'application/pdf').join(','),
} as const;

/** Human-readable list of supported file types for error messages (derived from MIME types) */
export const POST_SUPPORTED_FILE_TYPES = POST_SUPPORTED_ATTACHMENT_MIME_TYPES.map((mime) => mime.split('/')[1]).join(
  ', ',
);

export const ARTICLE_SUPPORTED_FILE_TYPES = ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES.map(
  (mime) => mime.split('/')[1],
).join(', ');

/** De-duplicated: `video/mpeg` and `audio/mpeg` share a subtype */
export const ARTICLE_INLINE_SUPPORTED_FILE_TYPES = [
  ...new Set(ARTICLE_INLINE_SUPPORTED_MIME_TYPES.map((mime) => mime.split('/')[1])),
].join(', ');
