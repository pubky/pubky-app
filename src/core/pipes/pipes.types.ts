import type { KnownPostKind } from 'pubky-social-specs';
import type { CollectionLayout } from '@/config/collections';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';

export type PostValidatorData = {
  /** The text of a note, or the `{ title, body }` JSON of an article as the composer builds it. */
  content: string;
  kind: KnownPostKind;
  parentUri?: string;
  embed?: string;
  /** The uploads an article's body references by slot, or a note's media, in slot order. */
  attachments?: TFileAttachmentResult[];
  /** An article's cover: written in the envelope's `cover_image`, never as an attachment slot (ADR-0023). */
  coverImage?: TFileAttachmentResult;
  /** `pubky://` URL of a Locks lock file. Present only on a lock post's public announcement. */
  lock?: string;
};

/**
 * The change a collection edit makes, applied to the collection as it is where the edit lands: the
 * stored head under the post lock, and the cached row read there (`CollectionPostContent.apply`).
 * Never the item list the controller read before the lock, so an edit queued behind another edit
 * of the same collection keeps that edit (ADR-0027).
 */
export type TCollectionEdit =
  /** The name, description, cover and layout; the items stay what the collection holds. */
  | {
      op: 'details';
      name: string;
      description?: string | null;
      /** The cover URL, or `null` for none. */
      coverImage: string | null;
      /** Absent keeps the collection's layout. */
      layout?: CollectionLayout;
    }
  /** Adds the post `spellings[0]` names unless one of its spellings is already an item. */
  | { op: 'add'; spellings: readonly string[] }
  /** Removes the item any of `spellings` names. */
  | { op: 'remove'; spellings: readonly string[] }
  /** The item URIs in the drafted order, merged against the collection's items (`reorderItems`). */
  | { op: 'reorder'; order: string[] };

/**
 * The change an edit makes to a post's newest stored version. Members left out keep the stored
 * value, so a member this client does not know (or does not show, like an attachment's alt text)
 * survives the edit.
 */
export type TPostEdit = {
  /** A note's text, or an article's `{ title, body }` JSON as the composer builds it. */
  content?: string;
  /** A collection's change, applied to the stored envelope; item notes and unknown members are kept. */
  collection?: TCollectionEdit;
  /** The full ordered attachment URI list; `null` or `[]` clears it. */
  attachmentUris?: string[] | null;
  /** Names of freshly uploaded attachments, by URI. */
  attachmentNames?: Record<string, string>;
  /** An article's cover URI; `null` clears it, absent keeps the stored one. */
  coverImage?: string | null;
  kind?: KnownPostKind;
};

export type UserValidatorData = Omit<NexusUserDetails, 'id' | 'indexed_at'>;

/** The fields `profile.json` publishes. */
export type ProfileFields = Pick<UserValidatorData, 'name' | 'bio' | 'image' | 'links' | 'status'>;

/**
 * Edits to apply onto the published profile. An omitted field keeps its published value;
 * `null`, `''` or `[]` clears it.
 */
export type ProfileChanges = Partial<ProfileFields>;
