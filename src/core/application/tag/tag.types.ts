import type { TTagEventParams } from '@/controllers/tag/tag.types';

export interface TCreateTagInput extends TTagEventParams {
  tagUrl: string;
  tagBody: Uint8Array;
}

export interface TCreateTagListInput {
  tagList: TCreateTagInput[];
  isCurrent?: () => boolean;
}

export type TDeleteTagInput = Omit<TCreateTagInput, 'tagBody'> & { isCurrent?: () => boolean };

export enum TagKind {
  USER = 'user',
  POST = 'post',
}
