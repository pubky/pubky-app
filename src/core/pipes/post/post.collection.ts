import type { CollectionContent as StoredCollectionContent, NewCollection } from 'pubky-social-specs';
import { DEFAULT_COLLECTION_LAYOUT, isCollectionLayout } from '@/config/collections';
import {
  COLLECTION_CONTENT_MAX_LENGTH,
  COLLECTION_COVER_IMAGE_ALLOWED_PROTOCOLS,
  COLLECTION_COVER_IMAGE_URL_MAX_LENGTH,
  COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH,
  COLLECTION_ITEM_URI_MAX_LENGTH,
  COLLECTION_ITEMS_MAX_COUNT,
  COLLECTION_NAME_MAX_CHARACTER_LENGTH,
} from '@/config/posts';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { collectionItemUris } from '@/libs/post/collectionContent';
import { CompositeIdDomain } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import type { CollectionContent, CollectionContentInput } from '@/models/post/collection/collectionPost.types';

const ALLOWED_COLLECTION_URL_PROTOCOLS = new Set(
  COLLECTION_COVER_IMAGE_ALLOWED_PROTOCOLS.map((scheme) => `${scheme}:`),
);

function throwCollectionValidation(message: string, context?: Record<string, unknown>): never {
  throw Err.validation(ValidationErrorCode.INVALID_INPUT, message, {
    service: ErrorService.Local,
    operation: 'validateCollectionContent',
    context,
  });
}

function isValidCollectionItemUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return ALLOWED_COLLECTION_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeCollectionItemUris(rawItems: string[]): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  rawItems.forEach((raw, index) => {
    const item = raw.trim();
    if (!item) {
      throwCollectionValidation('Collection item URI is required', { field: 'items', index });
    }

    if (seen.has(item)) return;

    if (item.length > COLLECTION_ITEM_URI_MAX_LENGTH) {
      throwCollectionValidation('Collection item URI is too long', {
        field: 'items',
        index,
        maxLength: COLLECTION_ITEM_URI_MAX_LENGTH,
      });
    }

    if (!isValidCollectionItemUri(item)) {
      throwCollectionValidation('Collection item URI is invalid', { field: 'items', index });
    }

    seen.add(item);
    items.push(item);
  });

  return items;
}

function isValidCollectionCoverImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_COLLECTION_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeCoverImage(input: string | null | undefined): string | undefined {
  if (input == null) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  if (trimmed.length > COLLECTION_COVER_IMAGE_URL_MAX_LENGTH) {
    throwCollectionValidation('Collection cover image URL is too long', {
      field: 'coverImage',
      maxLength: COLLECTION_COVER_IMAGE_URL_MAX_LENGTH,
    });
  }

  if (!isValidCollectionCoverImageUrl(trimmed)) {
    throwCollectionValidation('Collection cover image URL is invalid', {
      field: 'coverImage',
    });
  }

  return trimmed;
}

/**
 * What makes two item URIs the same item: a post reference is the post it names, so its 0.x and v1
 * spellings (`postReferenceSpellings`) are one item; anything else is its exact URI. The row an edit
 * starts from may spell a post the 0.x way (Nexus serves a migrated collection's `content` as it
 * was) while the stored v1 head spells it the v1 way.
 */
function collectionItemKey(uri: string): string {
  return buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS }) ?? uri;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === 'string';
}

export class CollectionPostContent {
  private constructor() {}

  static normalize(input: CollectionContentInput): CollectionContent {
    const name = input.name.trim();
    const description = (input.description ?? '').trim();
    const items = normalizeCollectionItemUris(input.items ?? []);
    const cover_image = normalizeCoverImage(input.coverImage);
    const layout = isCollectionLayout(input.layout) ? input.layout : DEFAULT_COLLECTION_LAYOUT;

    if (!name) {
      throwCollectionValidation('Collection name is required', { field: 'name' });
    }

    if (name.length > COLLECTION_NAME_MAX_CHARACTER_LENGTH) {
      throwCollectionValidation('Collection name is too long', {
        field: 'name',
        maxLength: COLLECTION_NAME_MAX_CHARACTER_LENGTH,
      });
    }

    if (description.length > COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH) {
      throwCollectionValidation('Collection description is too long', {
        field: 'description',
        maxLength: COLLECTION_DESCRIPTION_MAX_CHARACTER_LENGTH,
      });
    }

    if (items.length > COLLECTION_ITEMS_MAX_COUNT) {
      throwCollectionValidation('Collection has too many items', {
        field: 'items',
        maxCount: COLLECTION_ITEMS_MAX_COUNT,
        count: items.length,
      });
    }

    const collection: CollectionContent = { name, description, items, cover_image, layout };
    if (JSON.stringify(collection).length > COLLECTION_CONTENT_MAX_LENGTH) {
      throwCollectionValidation('Collection content is too long', {
        field: 'content',
        maxLength: COLLECTION_CONTENT_MAX_LENGTH,
      });
    }

    return collection;
  }

  /**
   * Parse the `content` envelope of a collection post, in either spelling (v1 `{ uri, note }`
   * items or 0.x URI strings), into the shape this client shows. The write side never spells the
   * envelope: `buildPost` does on create, and `toStored` + `encodeContent` on edit.
   */
  static parse(content: string): CollectionContent | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }

    if (!isRecord(parsed)) return null;

    const { name, description, items, cover_image, layout } = parsed;

    if (typeof name !== 'string') return null;
    if (!isNullableString(description)) return null;
    if (items != null && !Array.isArray(items)) return null;
    if (!isNullableString(cover_image)) return null;

    try {
      return this.normalize({
        name,
        description: description ?? '',
        items: items ? collectionItemUris(items) : [],
        coverImage: cover_image ?? undefined,
        layout: isCollectionLayout(layout) ? layout : DEFAULT_COLLECTION_LAYOUT,
      });
    } catch {
      return null;
    }
  }

  /**
   * Adds the item `spellings[0]` names unless one of its spellings is already in the collection: a
   * stored item may reference a post the 0.x way (an author who has not migrated), and the same
   * post must not be curated twice. Returns the same reference when nothing changes.
   */
  static addItem(collection: CollectionContent, spellings: readonly string[]): CollectionContent {
    const trimmed = spellings.map((uri) => uri.trim());
    const items = collection.items ?? [];

    if (items.some((item) => trimmed.includes(item))) {
      return collection;
    }

    return this.normalize({
      ...collection,
      items: [trimmed[0], ...items],
      coverImage: collection.cover_image,
    });
  }

  /** Removes the item any of `spellings` names. Returns the same reference when none is present. */
  static removeItem(collection: CollectionContent, spellings: readonly string[]): CollectionContent {
    const trimmed = spellings.map((uri) => uri.trim());
    const items = collection.items ?? [];

    if (!items.some((item) => trimmed.includes(item))) {
      return collection;
    }

    return this.normalize({
      ...collection,
      items: items.filter((item) => !trimmed.includes(item)),
      coverImage: collection.cover_image,
    });
  }

  /**
   * Replace the item order with `orderedItems`, merged against the current
   * envelope so a stale draft cannot clobber concurrent edits: items added
   * since the draft was taken are kept (leading, matching `addItem`'s prepend
   * semantics) and drafted URIs that were removed in the meantime are dropped
   * rather than resurrected. Returns the same collection reference when the
   * merge produces no change.
   */
  static reorderItems(collection: CollectionContent, orderedItems: string[]): CollectionContent {
    const currentItems = collection.items ?? [];
    const trimmedOrder = orderedItems.map((item) => item.trim());
    // By item identity, as `toStored`: a draft taken from the Nexus-served row may spell a post
    // the 0.x way while the row has since converged to the stored v1 spelling. A drafted item is
    // emitted as the collection spells it, and each current item is matched once, so a post the
    // collection spells both ways keeps both entries here (`toStored` collapses them on write) and
    // an unchanged draft is still no change.
    const unmatched = new Map<string, string[]>();
    for (const item of currentItems) {
      const key = collectionItemKey(item);
      unmatched.set(key, [...(unmatched.get(key) ?? []), item]);
    }
    const reordered = trimmedOrder.flatMap((item) => unmatched.get(collectionItemKey(item))?.shift() ?? []);
    const remaining = new Set(Array.from(unmatched.values()).flat());

    const merged = [...currentItems.filter((item) => remaining.has(item)), ...reordered];

    if (merged.length === currentItems.length && merged.every((item, index) => item === currentItems[index])) {
      return collection;
    }

    return this.normalize({
      ...collection,
      items: merged,
      coverImage: collection.cover_image,
    });
  }

  /** The `buildPost` input of a new collection. */
  static toNewInput(collection: CollectionContent): NewCollection {
    return {
      kind: 'collection',
      name: collection.name,
      description: collection.description || null,
      items: (collection.items ?? []).map((uri) => ({ uri })),
      cover_image: collection.cover_image ?? null,
      layout: collection.layout,
    };
  }

  /**
   * `next` merged onto the stored envelope: the items come in `next`'s order, a kept one is the
   * stored item unchanged (its spelling, note and unknown members, matched by `collectionItemKey`),
   * only a new one is spelled as `next` gives it, and the envelope keeps the members this client
   * does not know. Two spellings of one post, in `next` or in `stored`, are one kept item: the
   * first stored one.
   */
  static toStored(stored: StoredCollectionContent, next: CollectionContent): StoredCollectionContent {
    const storedItems = new Map<string, StoredCollectionContent['items'][number]>();
    for (const item of stored.items) {
      const key = collectionItemKey(item.uri);
      if (!storedItems.has(key)) storedItems.set(key, item);
    }
    const seen = new Set<string>();
    const items: StoredCollectionContent['items'] = [];
    for (const uri of next.items ?? []) {
      const key = collectionItemKey(uri);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(storedItems.get(key) ?? { uri, note: null });
    }
    return {
      ...stored,
      name: next.name,
      description: next.description || null,
      cover_image: next.cover_image ?? null,
      layout: next.layout,
      items,
    };
  }
}
