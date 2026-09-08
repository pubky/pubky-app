import type { TTagEventParams } from '@/controllers/tag/tag.types';

export type TLocalTagParams = Omit<TTagEventParams, 'taggedKind'>;

export type TLocalTagMutation = TLocalTagParams & {
  /** Count from the local write; absent when only a rollback marker changes. */
  taggersCount?: number;
};
