import { PUBCHI_PRIVATE_DIRECTORY, sessionCovers } from '@/libs/pubchi/capabilities';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import type { PubchiTarget } from '@/libs/pubchi/schemas/ask-body';
import type { Pubky } from '@/models/models.types';
import type { PubchiTagApplicationRecord } from '@/models/pubchi/tag-application.schema';

export const PUBKY_TAG_DIRECTORY = '/pub/pubky.app/';
const MAX_APPLICATION_AGE_SECONDS = 600;

export type TagApplicationBinding = {
  owner: Pubky;
  bot: Pubky;
  servedPurpose: 'ask';
  question: string;
  response: PubchiAnswerV1;
  target: PubchiTarget;
  submitted_at: number;
  responseRunId: string;
  responseSha256: string;
};

type SessionLike = { info?: { capabilities?: string[] } };

export function tagApplicationBinding(record: PubchiTagApplicationRecord): TagApplicationBinding | undefined {
  const response = record.response as PubchiAnswerV1;
  if (response.run_id !== record.response_run_id || response.owner !== record.owner || response.bot !== record.bot)
    return undefined;
  return {
    owner: record.owner,
    bot: record.bot,
    servedPurpose: record.served_purpose,
    question: record.question,
    target: record.target,
    submitted_at: record.submitted_at,
    responseRunId: record.response_run_id,
    responseSha256: record.response_sha256 ?? '',
    response,
  };
}

export function canApplyTagSuggestion(
  binding: TagApplicationBinding,
  suggestionIndex: number,
  currentSession: SessionLike | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const answer = binding.response;
  const suggestion = answer.tag_suggestions?.[suggestionIndex];
  if (!suggestion || !answer.target || !answer.target.snapshot_sha256) return false;
  if (answer.owner !== binding.owner || answer.bot !== binding.bot) return false;
  if (binding.responseRunId !== answer.run_id || !binding.responseSha256) return false;
  if (answer.purpose !== binding.servedPurpose || answer.question !== binding.question) return false;
  if (answer.target.kind !== binding.target.kind || answer.target.uri !== binding.target.uri) return false;
  if (answer.run_id.length === 0 || !Number.isFinite(binding.submitted_at)) return false;
  if (Math.abs(nowSeconds - answer.generated_at) > MAX_APPLICATION_AGE_SECONDS) return false;
  if (Math.abs(Date.now() - binding.submitted_at) > MAX_APPLICATION_AGE_SECONDS * 1000) return false;
  if (suggestion.already_applied) return false;
  const capabilities = currentSession?.info?.capabilities ?? [];
  return sessionCovers(capabilities, PUBKY_TAG_DIRECTORY) && sessionCovers(capabilities, PUBCHI_PRIVATE_DIRECTORY);
}
