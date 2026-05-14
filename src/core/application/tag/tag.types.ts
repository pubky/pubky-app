import type { TTagEventParams } from '@/controllers/tag/tag.types';

export interface TCreateTagInput extends TTagEventParams {
  tagUrl: string;
  tagJson: Record<string, unknown>;
}

export interface TCreateTagListInput {
  tagList: TCreateTagInput[];
}

export type TDeleteTagInput = Omit<TCreateTagInput, 'tagJson'>;

export enum TagKind {
  USER = 'user',
  POST = 'post',
}
