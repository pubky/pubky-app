import type { TagKind } from '@/application/tag/tag.types';
import type { Pubky } from '@/models/models.types';

export type TaggersState = {
  /** Tagger IDs fetched from Nexus so far, in server order */
  ids: Pubky[];
  /** Server offset of the next page */
  skip: number;
  isLoading: boolean;
  /** Whether Nexus may still have more taggers past `skip` */
  hasMore: boolean;
  /** Whether the first page has been fetched at least once */
  hasFetched: boolean;
  /** Tagger count the last fetch was started for; a different count triggers a re-sync */
  totalCount?: number;
};

export type TaggersStateMap = Map<string, TaggersState>;

export interface UseEntityTaggersResult {
  /** Fetched tagger IDs keyed by lowercase label */
  taggersByLabel: Map<string, Pubky[]>;
  taggerStates: TaggersStateMap;
  /** Fetch the first page for a label. No-op while loading or when already fetched for the same `totalCount`. */
  loadTaggers: (label: string, totalCount?: number) => Promise<void>;
  /** Fetch the next page for a label that still has more taggers. */
  loadMoreTaggers: (label: string) => Promise<void>;
}

export interface FetchTaggerPageParams {
  taggedId: string;
  taggedKind: TagKind;
  label: string;
  skip: number;
}

export interface MergeTaggerIdsParams {
  /** IDs fetched from Nexus (undefined before the first page lands) */
  fetchedIds?: Pubky[];
  /** IDs from the tag's local-first preview, which reflects the viewer's own toggles immediately */
  previewIds: Pubky[];
  /** Current viewer, reconciled against `isViewerTagger` when provided */
  viewerId?: Pubky | null;
  /** Whether the viewer currently tags the entity with this label (local-first truth) */
  isViewerTagger?: boolean;
}
