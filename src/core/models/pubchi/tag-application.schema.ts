import type { Pubky } from '@/models/models.types';

export type PubchiTagApplicationRecord = {
  id: string;
  owner: Pubky;
  /** Legacy per-suggestion key; v1 response records do not use it. */
  binding_id?: string;
  bot: Pubky;
  served_purpose: 'ask';
  question: string;
  target: { kind: 'post' | 'user'; uri: string };
  submitted_at: number;
  response_run_id: string;
  response: unknown;
  response_sha256?: string;
  statuses?: Record<
    number,
    'proposed' | 'applying' | 'applied' | 'superseded' | 'failed' | 'reverted' | 'reconciliation-pending'
  >;
  operations?: Record<number, 'apply' | 'revert'>;
  already_existed?: Record<number, boolean | null>;
  tag_document_sha256?: Record<number, string | null>;
  /** Legacy per-suggestion position; v1 response records do not use it. */
  suggestion_index?: number;
  status?:
    'proposed' | 'rejected' | 'applying' | 'applied' | 'superseded' | 'failed' | 'reverted' | 'reconciliation-pending';
  updated_at: number;
};

export const pubchiTagApplicationTableSchema = 'id, owner, status, updated_at';
