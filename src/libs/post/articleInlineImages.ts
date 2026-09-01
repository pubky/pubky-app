import type { Definition, Html, Image, Nodes, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfm } from 'micromark-extension-gfm';
import { visit } from 'unist-util-visit';

/**
 * Inline article images — the attachment-mapping scheme for `kind: long` posts.
 *
 * Composer bodies reference uploaded images by their canonical homeserver file
 * URI (`pubky://{author}/pub/pubky.app/files/{fileId}`). Published bodies
 * reference slots of `post.attachments` instead (`![alt](attachment:{n})`), so
 * the body never persists a host-specific CDN URL. `serializeArticleBody`
 * converts composer → published form on create/save; `deserializeArticleBody`
 * converts published → composer form when opening an article for edit.
 *
 * All body inspection is AST-based (never regex over the whole document) so
 * image syntax inside code fences or inline code is never misinterpreted, and
 * rewrites are span-targeted using mdast positions so the author's markdown
 * formatting is preserved byte-for-byte outside the rewritten destinations.
 *
 * This module is pure and server-safe: no IO, no controllers, no stores.
 */

const ATTACHMENT_REF_PATTERN = /^attachment:(0|[1-9][0-9]*)$/;
const ATTACHMENT_SCHEME_PATTERN = /^attachment:/i;
const FILE_PATH_PREFIX = '/pub/pubky.app/files/';
const BLOB_PATH_PREFIX = '/pub/pubky.app/blobs/';
const PUBKY_URI_PATTERN = /pubky:\/\/[^\s"'<>)]+/gi;

export type SerializeArticleBodyErrorCode =
  /** A literal `attachment:{n}` destination was typed into the composer */
  | 'HAND_TYPED_ATTACHMENT_REF'
  /** A `blob:` object URL or homeserver blob URI was used as an image destination */
  | 'BLOB_URI'
  /** More unique author-owned inline images than the attachment cap allows */
  | 'TOO_MANY_INLINE_IMAGES'
  /** Raw HTML contains an author-owned file or blob URI, escaping managed rewriting */
  | 'RAW_HTML_FILE_URI'
  /** A reference-style definition points at an author-owned file URI */
  | 'REFERENCE_STYLE_FILE_URI'
  /** An image node without source positions cannot be rewritten (never expected) */
  | 'UNPROCESSABLE_IMAGE';

export interface SerializeArticleBodyError {
  code: SerializeArticleBodyErrorCode;
  /** Populated for TOO_MANY_INLINE_IMAGES: the inline-image cap that was exceeded */
  max?: number;
}

export interface SerializeArticleBodyResult {
  /** Published-form body; unchanged from the input when `errors` is non-empty */
  body: string;
  /** Unique author-owned inline file URIs in first-appearance order */
  inlineUris: string[];
  errors: SerializeArticleBodyError[];
}

export interface DeserializeArticleBodyResult {
  /** Composer-form body with `attachment:{n}` destinations resolved to file URIs */
  body: string;
  /** One entry per image that had to be removed because its reference was invalid */
  warnings: string[];
}

function parseBody(body: string): Root {
  return fromMarkdown(body, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

/**
 * Returns the slot index for a strict `attachment:{n}` destination
 * (lowercase scheme, base-10, no sign, no leading zeros), or null.
 */
export function parseAttachmentRef(src: string | null | undefined): number | null {
  if (!src) return null;
  const match = ATTACHMENT_REF_PATTERN.exec(src);
  return match ? Number(match[1]) : null;
}

/**
 * Returns true for any `attachment:`-prefixed destination, including malformed
 * variants (`attachment:01`, `Attachment:2`) that `parseAttachmentRef` rejects.
 * Used to block publishing hand-typed references.
 */
export function isAttachmentRefScheme(src: string | null | undefined): boolean {
  return Boolean(src && ATTACHMENT_SCHEME_PATTERN.test(src.trim()));
}

/**
 * Returns the owner pubky of a strict homeserver file URI
 * (`pubky://{owner}/pub/pubky.app/files/{fileId}`), or null for anything else.
 */
export function parseFileUriOwner(uri: string | null | undefined): string | null {
  if (!uri) return null;

  let parsed: URL;
  try {
    parsed = new URL(uri.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'pubky:') return null;
  if (!parsed.pathname.startsWith(FILE_PATH_PREFIX)) return null;

  const fileId = parsed.pathname.slice(FILE_PATH_PREFIX.length);
  if (!fileId || fileId.includes('/')) return null;

  return parsed.hostname || null;
}

/** Returns true when `uri` is a homeserver file URI owned by `authorPubky`. */
export function isAuthorFileUri(uri: string | null | undefined, authorPubky: string): boolean {
  const owner = parseFileUriOwner(uri);
  return owner !== null && owner === authorPubky;
}

function isBlobUri(src: string): boolean {
  const trimmed = src.trim();
  if (/^blob:/i.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'pubky:' && parsed.pathname.startsWith(BLOB_PATH_PREFIX);
  } catch {
    return false;
  }
}

function isAuthorBlobUri(uri: string, authorPubky: string): boolean {
  try {
    const parsed = new URL(uri.trim());
    return (
      parsed.protocol === 'pubky:' && parsed.pathname.startsWith(BLOB_PATH_PREFIX) && parsed.hostname === authorPubky
    );
  } catch {
    return false;
  }
}

interface NodeSpan {
  start: number;
  end: number;
}

function getNodeSpan(node: Nodes): NodeSpan | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  return { start, end };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Serializes a single image node back to markdown with correct escaping. */
function imageMarkdown(alt: string | null | undefined, url: string, title: string | null | undefined): string {
  const image: Image = { type: 'image', url, alt: alt ?? '', title: title ?? null };
  return toMarkdown({ type: 'root', children: [{ type: 'paragraph', children: [image] }] }).trimEnd();
}

/**
 * Replaces an image node's destination inside `body`. When the destination
 * appears exactly once in the node's source span AND sits inside the
 * destination region (after the label's `](`), only that substring is
 * replaced, preserving the author's alt/title formatting verbatim. Otherwise
 * — including when an entity-escaped destination differs from its decoded
 * form while the decoded URL appears in the alt text — the whole span is
 * rebuilt from the node so a raw URI can never survive in the alt.
 */
function replaceImageDestination(body: string, node: Image, span: NodeSpan, newUrl: string): string {
  const source = body.slice(span.start, span.end);

  let replacement: string | null = null;
  if (countOccurrences(source, node.url) === 1) {
    const index = source.indexOf(node.url);
    const destinationStart = source.indexOf('](');
    if (destinationStart !== -1 && index > destinationStart) {
      replacement = source.slice(0, index) + newUrl + source.slice(index + node.url.length);
    }
  }
  replacement ??= imageMarkdown(node.alt, newUrl, node.title);

  return body.slice(0, span.start) + replacement + body.slice(span.end);
}

interface CollectedNodes {
  images: Image[];
  definitions: Definition[];
  htmlNodes: Html[];
}

function collectNodes(tree: Root): CollectedNodes {
  const images: Image[] = [];
  const definitions: Definition[] = [];
  const htmlNodes: Html[] = [];

  visit(tree, (node) => {
    if (node.type === 'image') images.push(node);
    else if (node.type === 'definition') definitions.push(node);
    else if (node.type === 'html') htmlNodes.push(node);
  });

  return { images, definitions, htmlNodes };
}

/**
 * Converts a composer-form body to published form: collects unique
 * author-owned inline file URIs in first-appearance order and rewrites each
 * of their image destinations to `attachment:{n}`, where slots start after
 * the cover (`n = index + 1` when `coverPresent`).
 *
 * Returns the input body unchanged (with `errors`) when the body contains
 * destinations that must never be published: hand-typed `attachment:` refs,
 * blob URIs, more managed images than `maxInlineImages`, or author-owned file
 * URIs hidden in raw HTML or reference-style definitions.
 *
 * Non-author `pubky://` URLs and external URLs are left verbatim and never
 * collected.
 */
export function serializeArticleBody(params: {
  body: string;
  coverPresent: boolean;
  authorPubky: string;
  maxInlineImages: number;
}): SerializeArticleBodyResult {
  const { body, coverPresent, authorPubky, maxInlineImages } = params;
  const { images, definitions, htmlNodes } = collectNodes(parseBody(body));

  const errors: SerializeArticleBodyError[] = [];
  const pushError = (error: SerializeArticleBodyError) => {
    if (!errors.some((existing) => existing.code === error.code)) errors.push(error);
  };

  const inlineUris: string[] = [];
  const managed: { node: Image; span: NodeSpan; slot: number }[] = [];

  for (const node of images) {
    if (isAttachmentRefScheme(node.url)) {
      pushError({ code: 'HAND_TYPED_ATTACHMENT_REF' });
      continue;
    }
    if (isBlobUri(node.url)) {
      pushError({ code: 'BLOB_URI' });
      continue;
    }
    if (!isAuthorFileUri(node.url, authorPubky)) continue;

    const span = getNodeSpan(node);
    if (!span) {
      pushError({ code: 'UNPROCESSABLE_IMAGE' });
      continue;
    }

    const uri = node.url.trim();
    let index = inlineUris.indexOf(uri);
    if (index === -1) {
      index = inlineUris.length;
      inlineUris.push(uri);
    }
    managed.push({ node, span, slot: index + (coverPresent ? 1 : 0) });
  }

  for (const definition of definitions) {
    if (isAttachmentRefScheme(definition.url)) pushError({ code: 'HAND_TYPED_ATTACHMENT_REF' });
    else if (isBlobUri(definition.url)) pushError({ code: 'BLOB_URI' });
    else if (isAuthorFileUri(definition.url, authorPubky)) pushError({ code: 'REFERENCE_STYLE_FILE_URI' });
  }

  for (const htmlNode of htmlNodes) {
    const uris = htmlNode.value.match(PUBKY_URI_PATTERN) ?? [];
    if (uris.some((uri) => isAuthorFileUri(uri, authorPubky) || isAuthorBlobUri(uri, authorPubky))) {
      pushError({ code: 'RAW_HTML_FILE_URI' });
    }
  }

  if (inlineUris.length > maxInlineImages) {
    pushError({ code: 'TOO_MANY_INLINE_IMAGES', max: maxInlineImages });
  }

  if (errors.length > 0) {
    return { body, inlineUris: [], errors };
  }

  // Rewrite from the last span to the first so earlier offsets stay valid.
  let rewritten = body;
  for (const { node, span, slot } of [...managed].sort((a, b) => b.span.start - a.span.start)) {
    rewritten = replaceImageDestination(rewritten, node, span, `attachment:${slot}`);
  }

  return { body: rewritten, inlineUris, errors };
}

/**
 * Converts a published-form body back to composer form: every image whose
 * destination is a strict `attachment:{n}` reference is resolved to
 * `attachments[n]`. Images with references that cannot be resolved — index out
 * of range, target not an author-owned file URI, or a malformed
 * `attachment:`-scheme destination — are removed with a warning instead of
 * failing, so a damaged article always remains editable.
 */
export function deserializeArticleBody(params: {
  body: string;
  attachments: string[];
  authorPubky: string;
}): DeserializeArticleBodyResult {
  const { body, attachments, authorPubky } = params;
  const { images } = collectNodes(parseBody(body));

  const warnings: string[] = [];
  let result = body;

  // Process from the last span to the first so earlier offsets stay valid.
  const refImages = images
    .filter((node) => isAttachmentRefScheme(node.url))
    .map((node) => ({ node, span: getNodeSpan(node) }))
    .filter((entry): entry is { node: Image; span: NodeSpan } => entry.span !== null)
    .sort((a, b) => b.span.start - a.span.start);

  for (const { node, span } of refImages) {
    const index = parseAttachmentRef(node.url);
    const uri = index !== null ? attachments[index] : undefined;

    if (uri && isAuthorFileUri(uri, authorPubky)) {
      result = replaceImageDestination(result, node, span, uri.trim());
    } else {
      result = result.slice(0, span.start) + result.slice(span.end);
      warnings.push('An image referencing a missing attachment was removed.');
    }
  }

  return { body: result, warnings };
}

/**
 * Counts the unique author-owned inline image URIs in a composer-form body —
 * the number of attachment slots the body would consume at publish (excluding
 * the cover). Used for insert-time budget checks; `serializeArticleBody`
 * remains the authoritative cap enforcement at publish.
 */
export function countInlineImageUris(body: string, authorPubky: string): number {
  const { images } = collectNodes(parseBody(body));
  const unique = new Set<string>();
  for (const node of images) {
    if (isAuthorFileUri(node.url, authorPubky)) unique.add(node.url.trim());
  }
  return unique.size;
}

/**
 * Collects every attachment slot referenced by the body's images and
 * reference-style definitions. Source of truth for the slot-0 cover rule.
 */
export function collectAttachmentRefIndexes(body: string): Set<number> {
  // Cheap pre-check: strict refs require the literal scheme, and callers run
  // this per render on up to 50k-char bodies — skip the full parse when no
  // ref can possibly exist. Any entity reference ('&…;') can decode into the
  // scheme, so the presence of '&' forfeits the shortcut.
  if (!body.includes('attachment:') && !body.includes('&')) return new Set();

  const { images, definitions } = collectNodes(parseBody(body));
  const indexes = new Set<number>();

  for (const node of [...images, ...definitions]) {
    const index = parseAttachmentRef(node.url);
    if (index !== null) indexes.add(index);
  }

  return indexes;
}

/**
 * Slot-0 cover rule: when the published body references `attachment:0`,
 * slot 0 is an inline image and the article has no cover.
 */
export function articleHasInlineSlotZero(body: string): boolean {
  // Delegates so cover detection can never disagree with ref collection —
  // an entity-escaped ref (e.g. `attachment:&#48;`) decodes to a valid slot-0
  // reference that no literal substring check would catch
  return collectAttachmentRefIndexes(body).has(0);
}
