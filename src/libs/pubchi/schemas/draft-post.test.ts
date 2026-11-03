import { describe, expect, it } from 'vitest';
import { parsePubchiDraftPostReceipt } from './draft-post';

const owner = '4bfmrcuwfq4ksqoupn6wcfxrh5enr1izdeyszmhfrntuf1mzoh5o';
const bot = 'wnpkm7d4c7caym93kzhpamjkn11hu8jdz4m9o3y1x9huopniwuay';

const receipt = {
  schema: 'pubchi-draft-post',
  version: 1,
  application_id: 'a'.repeat(64),
  owner,
  bot,
  run_id: 'run-1',
  draft_sha256: 'b'.repeat(64),
  kind: 'short',
  content: 'Pubky keeps public social state on your homeserver.',
  rationale: 'Matches the public profile evidence.',
  evidence: [`pubky://${owner}/pub/pubky.app/profile.json`],
  status: 'applying',
  suggested_at: 1_788_600_000,
};

describe('pubchi draft-post receipt schema', () => {
  it('parses a receipt and keeps unknown members', () => {
    const parsed = parsePubchiDraftPostReceipt({
      ...receipt,
      zzz_other_writer: { exact: 'value' },
      ext: { foo: { bytes: 'keep' } },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      schema: 'pubchi-draft-post',
      status: 'applying',
      zzz_other_writer: { exact: 'value' },
      ext: { foo: { bytes: 'keep' } },
    });
  });

  it('rejects a receipt with the wrong schema name', () => {
    expect(parsePubchiDraftPostReceipt({ ...receipt, schema: 'pubchi-tag-application' }).ok).toBe(false);
  });

  it('accepts a canonical pubky post_uri and rejects https', () => {
    expect(
      parsePubchiDraftPostReceipt({
        ...receipt,
        post_uri: `pubky://${owner}/pub/pubky.app/posts/0032W6CBGDBP0`,
      }).ok,
    ).toBe(true);
    expect(parsePubchiDraftPostReceipt({ ...receipt, post_uri: 'https://example.com/posts/1' }).ok).toBe(false);
  });
});
