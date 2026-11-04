import { Keypair } from '@synonymdev/pubky';
import { describe, expect, it } from 'vitest';
import { parsePubchiConfigV1 } from './config';

const owner = Keypair.random().publicKey.z32();

const valid = {
  schema: 'pubchi-config',
  version: 1,
  bot: owner,
  owner,
  updated_at: 1,
  display_name: 'Pubchi',
  tier: 'read-only',
  language: 'en',
  summary: { length: 'short', include_sources: true, include_disagreement: true },
  interests: { topics: [], excluded_topics: [] },
  proactive: { enabled: false, max_suggestions_per_day: 1, quiet_hours_utc: { start: 22, end: 7 } },
  follower_history_opt_in: false,
  brain: {
    adapter: 'vercel-ai',
    execution: 'synonym-hosted',
    provider_id: 'moonshot',
    model_id: 'kimi-k3',
    endpoint: null,
    send_public_graph_context: true,
    send_public_web_context: false,
  },
};

describe('PubchiConfigV1Schema', () => {
  it('parses the positive fixture', () => {
    expect(parsePubchiConfigV1(valid)).toEqual({ ok: true, value: valid });
  });

  it.each([
    ['hosted endpoint', { brain: { ...valid.brain, endpoint: 'https://example.com' } }],
    ['self-hosted without endpoint', { brain: { ...valid.brain, execution: 'self-hosted', endpoint: null } }],
    [
      'self-hosted endpoint userinfo',
      { brain: { ...valid.brain, execution: 'self-hosted', endpoint: 'https://user:pass@example.com' } },
    ],
    [
      'self-hosted endpoint query',
      { brain: { ...valid.brain, execution: 'self-hosted', endpoint: 'https://example.com/?api_key=secret' } },
    ],
    [
      'self-hosted endpoint fragment',
      { brain: { ...valid.brain, execution: 'self-hosted', endpoint: 'https://example.com/#secret' } },
    ],
    [
      'too many topics',
      { interests: { topics: Array.from({ length: 21 }, () => ({ label: 'topic', weight: 1 })), excluded_topics: [] } },
    ],
    [
      'mnemonic-like label',
      {
        interests: {
          topics: [{ label: 'one two three four five six seven eight nine ten eleven twelve', weight: 1 }],
          excluded_topics: [],
        },
      },
    ],
    ['api key', { api_key: 'not-a-secret' }],
  ])('rejects %s', (_name, change) => {
    expect(parsePubchiConfigV1({ ...valid, ...change })).toMatchObject({ ok: false });
  });

  it('preserves unknown members and ext', () => {
    expect(
      parsePubchiConfigV1({ ...valid, future_field: { enabled: true }, ext: { badge: { color: 'orange' } } }),
    ).toEqual({
      ok: true,
      value: { ...valid, future_field: { enabled: true }, ext: { badge: { color: 'orange' } } },
    });
  });

  it('rejects a forbidden-shaped value inside ext', () => {
    expect(parsePubchiConfigV1({ ...valid, ext: { credential: 'sk-abcdefghijklmnopqrstuvwxyz' } })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN_SECRET',
    });
  });
});
