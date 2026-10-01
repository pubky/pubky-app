export type Timestamp = number;
export type SyncStatus = 'local' | 'homeserver' | 'nexus';

// Lowercase serialization of `PubkyAppPostKind` (specs enum is numeric). Single source for the string form.
export const POST_KINDS = ['short', 'long', 'image', 'video', 'link', 'file', 'collection', 'unknown'] as const;
export type PostKind = (typeof POST_KINDS)[number];

// A Pubky identifier in z32 string format
export type Pubky = string;

export interface PaginationParams {
  skip?: number;
  limit?: number;
}

export enum CompositeIdDomain {
  POSTS = 'posts',
  FILES = 'files',
}

export type CompositeIdParams = {
  uri: Pubky;
  domain: CompositeIdDomain;
};

export type CompositeIdResult = {
  pubky: Pubky;
  id: string;
};
