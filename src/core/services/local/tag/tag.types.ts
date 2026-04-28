import type { TTagEventParams } from '@/controllers/tag/tag.types';
export type TLocalTagParams = Omit<TTagEventParams, 'taggedKind'>;
