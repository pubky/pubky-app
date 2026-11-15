import { Keypair } from '@synonymdev/pubky';
import { describe, expect, it } from 'vitest';
import { parsePubchiBotV1 } from './bot';
import { botUri, PATHS } from './paths';

const OWNER = Keypair.random().publicKey.z32();
const BOT = Keypair.random().publicKey.z32();

const VALID = {
  schema: 'pubchi-bot',
  version: 1,
  bot: BOT,
  owner: OWNER,
  display_name: 'Pubchi',
  created_at: 1,
  backup_confirmed_at: null,
  homeserver_account: null,
  key_generation: 1,
};

describe('PubchiBotV1', () => {
  it('parses and preserves extension members in the custody v1 document', () => {
    expect(parsePubchiBotV1(VALID)).toEqual({ ok: true, value: VALID });
    expect(PATHS.bot).toBe('/pub/app.pubchi/v1/bot.json');
    expect(botUri(OWNER)).toBe(`pubky://${OWNER}/pub/app.pubchi/v1/bot.json`);
  });

  it.each([
    { ...VALID, display_name: '' },
    { ...VALID, display_name: 'x'.repeat(41) },
    { ...VALID, key_generation: 0 },
  ])('rejects invalid and forbidden fields', (candidate) => {
    expect(parsePubchiBotV1(candidate).ok).toBe(false);
  });

  it('preserves unknown members and ext', () => {
    expect(parsePubchiBotV1({ ...VALID, extra_field: true, ext: { badge: { color: 'orange' } } })).toEqual({
      ok: true,
      value: { ...VALID, extra_field: true, ext: { badge: { color: 'orange' } } },
    });
  });
});
