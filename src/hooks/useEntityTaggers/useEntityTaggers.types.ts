import type { TagKind } from '@/application/tag/tag.types';
import type { Pubky } from '@/models/models.types';

export type TaggersState = {
  /** Tagger IDs fetched from Nexus so far, in server order */
  ids: Pubky[];
  /** Server offset of the next page */
  skip: number;
  isLoading: boolean;
  /** Automatic loading pauses after an error until the viewer retries. */
  hasError: boolean;
  /** Whether Nexus may still have more taggers past `skip` */
  hasMore: boolean;
  /** Whether the first page has been fetched at least once */
  hasFetched: boolean;
  /** Last observed metadata count, used for refreshes rather than exhaustion. */
  totalCount?: number;
  requestId?: number;
  mutationKey?: string;
  viewerOverride?: boolean;
  serverRelationship?: boolean;
  /** Fresh server membership, overridden only by an explicit local mutation. */
  isViewerTagger?: boolean;
  /** Retained after a failed refresh so retry repeats the same window. */
  refreshTarget?: number;
};

export type TaggersStateMap = Map<string, TaggersState>;

export interface UseEntityTaggersResult {
  taggerStates: TaggersStateMap;
  /** Fetch initially or revalidate loaded rows when metadata/local mutations change. */
  loadTaggers: (label: string, totalCount?: number) => Promise<void>;
  /** Fetch the next page for a label that still has more taggers. */
  loadMoreTaggers: (label: string) => Promise<void>;
}

export interface FetchTaggerPageParams {
  taggedId: string;
  taggedKind: TagKind;
  label: string;
  skip: number;
  viewerId?: Pubky | null;
}

export interface MergeTaggerIdsParams {
  /** IDs fetched from Nexus (undefined before the first page lands) */
  fetchedIds?: Pubky[];
  /** IDs from the tag's local-first preview, which reflects the viewer's own toggles immediately */
  previewIds: Pubky[];
  /** Current viewer, reconciled against `isViewerTagger` when provided */
  viewerId?: Pubky | null;
  /** Server membership or an explicit local mutation; never raw cached metadata. */
  isViewerTagger?: boolean;
}
