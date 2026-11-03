import type { PubchiExportBundleV1, PubchiImportPlan, ReconstructedFeed } from '@/libs/pubchi/portability';
import type { ExecutionScope, PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import type { Conversation, PubchiTarget } from '@/libs/pubchi/schemas/ask-body';
import type { PubchiBotV1 } from '@/libs/pubchi/schemas/bot';
import type { PubchiOwnerContextV1 } from '@/libs/pubchi/schemas/context';
import type { FeedProposalV1, FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import type { QueryResultV1 } from '@/libs/pubchi/schemas/query';
import type { Phase0Purpose } from '@/libs/pubchi/schemas/request';
import type { OwnerBindingV1 } from '@/libs/pubchi/schemas/tenant';
import type { Pubky } from '@/models/models.types';

export type PubchiAskBody = {
  question: string;
  conversation?: Conversation;
  proposal_version?: 2;
  target_feed_id?: string;
  current_feed?: unknown;
  target?: PubchiTarget;
};

export type PubchiRequestBinding = {
  owner: Pubky;
  bot: Pubky;
  servedPurpose: 'ask';
  question: string;
  target?: PubchiTarget;
  submitted_at: number;
  recordId: string;
};

export type DiscoveredTagSuggestion = {
  applicationId: string;
  owner: Pubky;
  target: PubchiTarget;
  label: string;
  status: 'applying' | 'applied' | 'superseded' | 'failed' | 'reverted' | 'reverted-outside' | 'reconciliation-pending';
  alreadyExisted: boolean | null;
};

export type PubchiQueryApplicationParams = {
  owner: Pubky;
  question: string;
  purpose: Phase0Purpose;
  nowSeconds?: number;
  context?: PubchiOwnerContextV1 | null;
  proposalVersion?: 2;
  targetFeedId?: string;
  currentFeed?: unknown;
  conversation?: Conversation;
  target?: PubchiTarget;
};

export type PubchiQuerySuccess =
  | { kind: 'query'; result: QueryResultV1 }
  | { kind: 'answer'; result: PubchiAnswerV1; binding?: PubchiRequestBinding }
  | { kind: 'feed'; result: FeedProposalV1; applyAllowed: true }
  | { kind: 'feed-v2'; result: FeedProposalV2; applyAllowed: false }
  | { kind: 'feed-unsupported'; code: 'FEED_UNSUPPORTED_LIKES' | 'FEED_UNSUPPORTED_REACH' | 'FEED_SPECS_INVALID' };

export type PubchiExecutionScope = ExecutionScope;

export type PubchiBindingWriteParams = {
  owner: Pubky;
  bot: Pubky;
};

export type PubchiBindingRecordResult = OwnerBindingV1;

export type CreatePubchiParams = {
  owner: Pubky;
  displayName: string;
  capabilities: string[];
};

export type CreatedPubchi = {
  bot: Pubky;
  displayName: string;
  createdAt: number;
  backupConfirmedAt: number | null;
  verified: boolean;
  phrase: string;
};

export type LoadedPubchi = Omit<CreatedPubchi, 'phrase'>;

export type ConfirmPubchiBackupParams = {
  owner: Pubky;
  phrase: string;
  confirmations: ReadonlyArray<{ position: number; word: string }>;
};

export type PubchiRemoteState = {
  pointer: PubchiBotV1;
  binding: OwnerBindingV1;
};

export type PubchiExportParams = {
  includeHistory?: boolean;
};

export type PubchiImportPreview = {
  bundle: PubchiExportBundleV1;
  plan: PubchiImportPlan;
  feeds: ReconstructedFeed[];
};

export type PubchiImportResult = PubchiImportPreview & {
  hashes: Record<string, string>;
};
