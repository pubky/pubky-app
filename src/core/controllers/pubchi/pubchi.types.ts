import type { Conversation, PubchiTarget } from '@/libs/pubchi/schemas/ask-body';
import type { Phase0Purpose } from '@/libs/pubchi/schemas/request';
import type { Pubky } from '@/models/models.types';

export type TCreatePubchiParams = {
  displayName: string;
};

export type TConfirmPubchiBackupParams = {
  phrase: string;
  confirmations: ReadonlyArray<{ position: number; word: string }>;
};

export type TPubchiQueryParams = {
  signal?: AbortSignal;
  question: string;
  purpose: Phase0Purpose;
  conversation?: Conversation;
  proposalVersion?: 2;
  targetFeedId?: string;
  currentFeed?: unknown;
  target?: PubchiTarget;
};

export type TPubchiOwnerParam = {
  owner: Pubky;
};

export type TExportPubchiParams = {
  includeHistory?: boolean;
};
