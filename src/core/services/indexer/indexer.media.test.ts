import { buildFile } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { LocalMediaAnswer } from '@/libs/pwa/localMedia';
import { answerLocalMedia, type LocalMediaSources } from './indexer.media';

const ALICE = fakeOwner(1);
const BOB = fakeOwner(2);
const BYTES = new Uint8Array([137, 80, 78, 71]);
const AVATAR = buildFile(ALICE, { bytes: BYTES, type: 'image/png' });
const ATTACHMENT = buildFile(BOB, { bytes: BYTES, type: 'application/pdf' });

/** A view holding `profiles` (and `afterEnsure` once a user is loaded) over a homeserver holding `files`. */
function fakeSources({
  profiles = {},
  afterEnsure = {},
  files = {},
}: {
  profiles?: Record<string, { image: string | null }>;
  afterEnsure?: Record<string, { image: string | null }>;
  files?: Record<string, Uint8Array>;
}) {
  const loaded = new Set<string>();
  const sources = {
    profile: vi.fn((user: string) => profiles[user] ?? (loaded.has(user) ? (afterEnsure[user] ?? null) : null)),
    ensureUser: vi.fn(async (user: string) => {
      loaded.add(user);
    }),
    readFile: vi.fn(async (uri: string) => files[uri] ?? null),
  } satisfies LocalMediaSources;
  return sources;
}

const bytesOf = (answer: LocalMediaAnswer) =>
  answer.status === 'found' ? [...new Uint8Array(answer.bytes)] : answer.status;

describe('answerLocalMedia', () => {
  it('reads an avatar from the image the profile in the view names', async () => {
    const sources = fakeSources({ profiles: { [ALICE]: { image: AVATAR.url } }, files: { [AVATAR.url]: BYTES } });

    const answer = await answerLocalMedia({ kind: 'avatar', user: ALICE }, sources);

    expect(answer).toMatchObject({ status: 'found', contentType: 'image/png' });
    expect(bytesOf(answer)).toEqual([...BYTES]);
    expect(sources.readFile).toHaveBeenCalledWith(AVATAR.url);
    expect(sources.ensureUser).not.toHaveBeenCalled();
  });

  it('loads a user the view does not hold once, then reads their avatar', async () => {
    const sources = fakeSources({ afterEnsure: { [ALICE]: { image: AVATAR.url } }, files: { [AVATAR.url]: BYTES } });

    const answer = await answerLocalMedia({ kind: 'avatar', user: ALICE }, sources);

    expect(sources.ensureUser).toHaveBeenCalledExactlyOnceWith(ALICE);
    expect(bytesOf(answer)).toEqual([...BYTES]);
  });

  it.each([
    ['a profile without an image', { profiles: { [ALICE]: { image: null } } }],
    ['a user the view still does not hold after loading', {}],
    ['an image that is not v1 media', { profiles: { [ALICE]: { image: 'https://example.com/a.png' } } }],
    ['an image the homeserver no longer has', { profiles: { [ALICE]: { image: AVATAR.url } } }],
  ])('answers none for %s', async (_label, setup) => {
    const sources = fakeSources(setup);

    expect(await answerLocalMedia({ kind: 'avatar', user: ALICE }, sources)).toEqual({ status: 'none' });
  });

  it('reads a file from its owner’s public media, typed by its extension', async () => {
    const name = ATTACHMENT.url.slice(ATTACHMENT.url.lastIndexOf('/') + 1);
    const sources = fakeSources({ files: { [ATTACHMENT.url]: BYTES } });

    const answer = await answerLocalMedia({ kind: 'file', owner: BOB, name }, sources);

    expect(answer).toMatchObject({ status: 'found', contentType: 'application/pdf' });
    expect(sources.readFile).toHaveBeenCalledWith(ATTACHMENT.url);
  });

  it.each([
    ['a 0.x file id', BOB, '0034A0X7NJ52C'],
    ['a name with an unknown extension', BOB, 'abc.exe'],
    ['an owner that is no key', 'not-a-key', 'abc.png'],
  ])('answers none without a read for %s', async (_label, owner, name) => {
    const sources = fakeSources({});

    expect(await answerLocalMedia({ kind: 'file', owner, name }, sources)).toEqual({ status: 'none' });
    expect(sources.readFile).not.toHaveBeenCalled();
  });

  it('answers failed when the homeserver read fails', async () => {
    const sources = fakeSources({ profiles: { [ALICE]: { image: AVATAR.url } } });
    sources.readFile.mockRejectedValueOnce(new Error('unreachable'));

    expect(await answerLocalMedia({ kind: 'avatar', user: ALICE }, sources)).toEqual({ status: 'failed' });
  });

  it('hands over a copy of the bytes, so transferring it leaves the read buffer alone', async () => {
    const sources = fakeSources({ files: { [ATTACHMENT.url]: BYTES } });
    const name = ATTACHMENT.url.slice(ATTACHMENT.url.lastIndexOf('/') + 1);

    const answer = await answerLocalMedia({ kind: 'file', owner: BOB, name }, sources);

    expect(answer.status).toBe('found');
    expect(answer.status === 'found' ? answer.bytes : null).not.toBe(BYTES.buffer);
  });
});
