import { describe, expect, it, vi } from 'vitest';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import { canApplyTagSuggestion } from './tag-application';

const owner = '4bfmrcuwfq4ksqoupn6wcfxrh5enr1izdeyszmhfrntuf1mzoh5o';
const bot = 'wnpkm7d4c7caym93kzhpamjkn11hu8jdz4m9o3y1x9huopniwuay';
const target = {
  kind: 'user' as const,
  uri: `pubky://${owner}/pub/pubky.app/profile.json`,
  snapshot_sha256: 'a'.repeat(64),
};

const answer: PubchiAnswerV1 = {
  schema: 'pubchi-answer',
  version: 1,
  bot,
  owner,
  generated_at: 1_800_000_000,
  run_id: 'run-1',
  purpose: 'ask',
  question: 'Suggest tags for this user',
  summary: 'One suggestion.',
  evidence: [],
  sources: [],
  tool_trace_summary: { tools: [], call_count: 0, truncated: false },
  policy_version: 1,
  section: 'tag_suggestions',
  target,
  tag_suggestions: [
    {
      label: 'pubky-app',
      rationale: 'Public profile evidence.',
      evidence: [target.uri],
      already_applied: false,
      source: 'vocab',
    },
  ],
};

const binding = {
  owner,
  bot,
  servedPurpose: 'ask' as const,
  question: answer.question,
  target,
  submitted_at: 1_800_000_000_000,
  responseRunId: answer.run_id,
  responseSha256: 'b'.repeat(64),
  response: answer,
};

const session = {
  info: { capabilities: ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'] },
};

describe('tag suggestion apply binding', () => {
  it('accepts the exact stored response binding with both capability gates', () => {
    vi.setSystemTime(1_800_000_000_000);
    expect(canApplyTagSuggestion(binding, 0, session, 1_800_000_000)).toBe(true);
    vi.useRealTimers();
  });

  it('rejects answer fields that differ from the stored signed request binding', () => {
    expect(
      canApplyTagSuggestion(
        { ...binding, response: { ...answer, target: { ...target, uri: 'pubky://other/pub/pubky.app/profile.json' } } },
        0,
        session,
        1_800_000_000,
      ),
    ).toBe(false);
    expect(canApplyTagSuggestion({ ...binding, response: { ...answer, owner: bot } }, 0, session, 1_800_000_000)).toBe(
      false,
    );
    expect(
      canApplyTagSuggestion({ ...binding, response: { ...answer, question: 'different' } }, 0, session, 1_800_000_000),
    ).toBe(false);
    expect(
      canApplyTagSuggestion({ ...binding, response: { ...answer, run_id: 'different' } }, 0, session, 1_800_000_000),
    ).toBe(false);
  });

  it('rejects either stale service or local age', () => {
    vi.setSystemTime(1_800_000_000_000);
    expect(canApplyTagSuggestion(binding, 0, session, 1_800_000_601)).toBe(false);
    expect(
      canApplyTagSuggestion({ ...binding, submitted_at: 1_800_000_000_000 - 601_000 }, 0, session, 1_800_000_000),
    ).toBe(false);
    vi.useRealTimers();
  });

  it('requires separate public and private capability coverage', () => {
    expect(
      canApplyTagSuggestion(binding, 0, { info: { capabilities: ['/priv/app.pubchi/v1/:rw'] } }, 1_800_000_000),
    ).toBe(false);
    expect(canApplyTagSuggestion(binding, 0, { info: { capabilities: ['/pub/pubky.app/:rw'] } }, 1_800_000_000)).toBe(
      false,
    );
  });
});
