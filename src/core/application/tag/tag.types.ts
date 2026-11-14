import type { TTagEventParams } from '@/controllers/tag/tag.types';

export interface TCreateTagInput extends TTagEventParams {
  tagUrl: string;
  tagJson: Record<string, unknown>;
}

export interface TCreateTagListInput {
  tagList: TCreateTagInput[];
  isCurrent?: () => boolean;
  preserveExisting?: boolean;
}

/** The tag file is resolved from the viewer's local tag row or Nexus `tag_uri`, never rebuilt from ids. */
export type TDeleteTagInput = TTagEventParams & {
  isCurrent?: () => boolean;
  /** Whether the session's capabilities cover the resolved tag file; a Ring session covers only `/pub/pubky.app/`. */
  canWrite: (tagUri: string) => boolean;
};

export enum TagKind {
  USER = 'user',
  POST = 'post',
}

export interface TCreateTagResult {
  tagUrl: string;
  alreadyExisted: boolean;
  /** Present only for assisted writes whose exact document can later be compared before undo. */
  tagDocumentSha256?: string;
}
