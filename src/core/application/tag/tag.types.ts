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
  /** Whether the session's capabilities cover the resolved tag file; a Ring session covers only `/pub/pubky.app/`. */
  canWrite?: (tagUri: string) => boolean;
};

export enum TagKind {
  USER = 'user',
  POST = 'post',
}
