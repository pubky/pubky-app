import type { Pubky } from '@/models/models.types';

export type PubchiDraftPostStatus =
  'proposed' | 'applying' | 'applied' | 'failed' | 'reverted' | 'rejected' | 'reconciliation-pending';

export type PubchiDraftPostRecord = {
  id: string;
  owner: Pubky;
  bot: Pubky;
  served_purpose: 'ask';
  question: string;
  submitted_at: number;
  response_run_id: string;
  response: unknown;
  response_sha256?: string;
  status: PubchiDraftPostStatus;
  operation?: 'apply' | 'reject' | 'revert';
  post_uri?: string;
  composite_post_id?: string;
  /** Set only after the post write returns its own ID; content similarity is never proof. */
  publication_confirmed?: boolean;
  updated_at: number;
};

export const pubchiDraftPostTableSchema = 'id, owner, status, updated_at';
