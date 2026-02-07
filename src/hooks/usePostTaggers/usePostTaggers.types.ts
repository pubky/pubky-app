import type * as Core from '@/core';

export type TaggersState = {
  ids: Core.Pubky[];
  skip: number;
  isLoading: boolean;
  hasMore: boolean;
  totalCount?: number;
};

export type TaggersStateMap = Map<string, TaggersState>;

export interface UsePostTaggersResult {
  taggersByLabel: Map<string, Core.Pubky[]>;
  taggerStates: TaggersStateMap;
  fetchAllTaggers: (label: string, initialIds: Core.Pubky[], totalCount?: number) => Promise<void>;
}
