import type { KnownPostKind } from 'pubky-social-specs';
import type { CollectionContent } from '@/models/post/collection/collectionPost.types';
import type { TFileAttachmentResult } from '@/pipes/file/file.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';

export type PostValidatorData = {
  /** The text of a note, or the `{title, body}` JSON of an article as the composer builds it. */
  content: string;
  kind: KnownPostKind;
  parentUri?: string;
  embed?: string;
  attachments?: TFileAttachmentResult[];
  /** `pubky://` URL of a Locks lock file. Present only on a lock post's public announcement. */
  lock?: string;
};

/**
 * The change an edit makes to a post's newest stored version. Members left out keep the stored
 * value, so a member this client does not know (or does not show, like an attachment's alt text)
 * survives the edit.
 */
export type TPostEdit = {
  /** A note's text, or an article's `{title, body}` JSON as the composer builds it. */
  content?: string;
  /** A collection's envelope as this client shows it; item notes and unknown members are kept. */
  collection?: CollectionContent;
  /** The full ordered attachment URI list; `null` or `[]` clears it. */
  attachmentUris?: string[] | null;
  /** Names of freshly uploaded attachments, by URI. */
  attachmentNames?: Record<string, string>;
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
