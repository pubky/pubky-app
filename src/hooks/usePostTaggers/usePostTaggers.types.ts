import type { Pubky } from '@/models/models.types';
export type TaggersState = {
  ids: Pubky[];
  skip: number;
  isLoading: boolean;
  hasMore: boolean;
  totalCount?: number;
};

export type TaggersStateMap = Map<string, TaggersState>;

export interface UsePostTaggersResult {
  taggersByLabel: Map<string, Pubky[]>;
  taggerStates: TaggersStateMap;
  fetchAllTaggers: (label: string, initialIds: Pubky[], totalCount?: number) => Promise<void>;
}
