import type { TTagEventParams } from '@/controllers/tag/tag.types';

export interface TCreateTagInput extends TTagEventParams {
  tagUrl: string;
  /** The exact bytes to PUT at `tagUrl`, as `buildTag` spelled them. */
  tagBody: Uint8Array;
}

export interface TCreateTagListInput {
  tagList: TCreateTagInput[];
  isCurrent?: () => boolean;
}

/** The tag file is resolved from the viewer's local tag row or Nexus `tag_uri`, never rebuilt from ids. */
export type TDeleteTagInput = TTagEventParams & {
  isCurrent?: () => boolean;
  /** Whether the session's capabilities cover the resolved tag file; a scoped grant may not cover every tree. */
  canWrite: (tagUri: string) => boolean;
};

export enum TagKind {
  USER = 'user',
  POST = 'post',
}

/** The viewer's tag on an external resource (a web link): written by URL, with no local tag row. */
export interface TCreateResourceTagInput {
  tagUrl: string;
  /** The exact bytes to PUT at `tagUrl`, as `buildTag` spelled them. */
  tagBody: Uint8Array;
  isCurrent?: () => boolean;
}

/** The viewer's resolved tag file on an external resource. */
export interface TDeleteResourceTagInput {
  tagUri: string;
  isCurrent?: () => boolean;
  canWrite: (tagUri: string) => boolean;
}
