import type { PubkyAppCollectionContent } from 'pubky-app-specs';
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

function normalizeCoverImage(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

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

export class CollectionPostContent {
  private constructor() {}

  static normalize(input: CollectionContentInput): CollectionContent {
    const name = input.name.trim();
    const description = (input.description ?? '').trim();
    const items = normalizeCollectionItemUris(input.items ?? []);
    const cover_image = normalizeCoverImage(input.coverImage);

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

    const collection: CollectionContent = { name, description, items, cover_image };
    if (JSON.stringify(collection).length > COLLECTION_CONTENT_MAX_LENGTH) {
      throwCollectionValidation('Collection content is too long', {
        field: 'content',
        maxLength: COLLECTION_CONTENT_MAX_LENGTH,
      });
    }

    return collection;
  }

  static toJson(input: CollectionContentInput): string {
    return JSON.stringify(this.normalize(input));
  }

  /**
   * Parse a `PubkyAppPost::content` envelope for a `kind = Collection` post.
   *
   * Read-side type-safety comes from `PubkyAppCollectionContent` (re-exported by
   * `pubky-app-specs`); we never construct that envelope manually — the write
   * side goes through `PubkySpecsBuilder.createCollectionPost(...)` which builds
   * and serializes the envelope itself.
   */
  static parse(content: string): CollectionContent | null {
    let parsed: Partial<PubkyAppCollectionContent>;
    try {
      parsed = JSON.parse(content) as Partial<PubkyAppCollectionContent>;
    } catch {
      return null;
    }

    if (typeof parsed.name !== 'string') return null;
    if (parsed.description !== undefined && typeof parsed.description !== 'string') return null;
    if (parsed.items !== undefined && !Array.isArray(parsed.items)) return null;
    if (parsed.items && !parsed.items.every((item): item is string => typeof item === 'string')) return null;
    if (parsed.cover_image !== undefined && parsed.cover_image !== null && typeof parsed.cover_image !== 'string') {
      return null;
    }

    return this.normalize({
      name: parsed.name,
      description: parsed.description ?? '',
      items: parsed.items ?? [],
      coverImage: parsed.cover_image ?? null,
    });
  }

  static addItem(collection: CollectionContent, itemUri: string): CollectionContent {
    const trimmedUri = itemUri.trim();
    if (collection.items.includes(trimmedUri)) {
      return collection;
    }

    return this.normalize({
      ...collection,
      items: [...collection.items, trimmedUri],
      coverImage: collection.cover_image,
    });
  }

  static removeItem(collection: CollectionContent, itemUri: string): CollectionContent {
    const trimmedUri = itemUri.trim();
    if (!collection.items.includes(trimmedUri)) {
      return collection;
    }

    return this.normalize({
      ...collection,
      items: collection.items.filter((item) => item !== trimmedUri),
      coverImage: collection.cover_image,
    });
  }
}
