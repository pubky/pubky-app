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

export type TDeleteTagInput = Omit<TCreateTagInput, 'tagJson'> & { isCurrent?: () => boolean };

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
