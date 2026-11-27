import { buildFile } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it, vi } from 'vitest';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { legacyFileUri } from '@/libs/indexer/social/legacy/legacyMedia';
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
    ensureProfile: vi.fn(async (user: string) => {
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
    expect(sources.ensureProfile).not.toHaveBeenCalled();
  });

  it('loads the profile of a user the view does not hold once, then reads their avatar', async () => {
    const sources = fakeSources({ afterEnsure: { [ALICE]: { image: AVATAR.url } }, files: { [AVATAR.url]: BYTES } });

    const answer = await answerLocalMedia({ kind: 'avatar', user: ALICE }, sources);

    expect(sources.ensureProfile).toHaveBeenCalledExactlyOnceWith(ALICE);
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

  it('answers tooLarge when the file is over the size the worker serves', async () => {
    const sources = fakeSources({ profiles: { [ALICE]: { image: AVATAR.url } } });
    sources.readFile.mockRejectedValueOnce(
      Err.client(ClientErrorCode.PAYLOAD_TOO_LARGE, 'too large', {
        service: ErrorService.Homeserver,
        operation: 'test',
      }),
    );

    expect(await answerLocalMedia({ kind: 'avatar', user: ALICE }, sources)).toEqual({ status: 'tooLarge' });
  });

  it('hands over a copy of the bytes, so transferring it leaves the read buffer alone', async () => {
    const sources = fakeSources({ files: { [ATTACHMENT.url]: BYTES } });
    const name = ATTACHMENT.url.slice(ATTACHMENT.url.lastIndexOf('/') + 1);

    const answer = await answerLocalMedia({ kind: 'file', owner: BOB, name }, sources);

    expect(answer.status).toBe('found');
    expect(answer.status === 'found' ? answer.bytes : null).not.toBe(BYTES.buffer);
  });

  describe('with the older social tree', () => {
    const fileId = '0034A0X7NJ52C';
    const oldFile = legacyFileUri(BOB, fileId) ?? '';
    const withLegacy = (files: Record<string, { bytes: Uint8Array; contentType: string }>) => {
      const sources = fakeSources({});
      const readLegacyFile = vi.fn(async (uri: string) => files[uri] ?? null);
      return { ...sources, readLegacyFile } satisfies LocalMediaSources;
    };

    it('reads an attachment by its file id, typed by its record', async () => {
      const sources = withLegacy({ [oldFile]: { bytes: BYTES, contentType: 'image/png' } });

      const answer = await answerLocalMedia({ kind: 'file', owner: BOB, name: fileId }, sources);

      expect(oldFile).not.toBe('');
      expect(answer).toMatchObject({ status: 'found', contentType: 'image/png' });
      expect(bytesOf(answer)).toEqual([...BYTES]);
      expect(sources.readLegacyFile).toHaveBeenCalledExactlyOnceWith(oldFile);
      expect(sources.readFile).not.toHaveBeenCalled();
    });

    it('reads an avatar the profile names by its older file', async () => {
      const sources = withLegacy({ [oldFile]: { bytes: BYTES, contentType: 'image/jpeg' } });
      sources.profile.mockReturnValue({ image: oldFile });

      const answer = await answerLocalMedia({ kind: 'avatar', user: BOB }, sources);

      expect(answer).toMatchObject({ status: 'found', contentType: 'image/jpeg' });
    });

    it('still reads v1 media by path, and answers none for an older file it cannot read', async () => {
      const name = ATTACHMENT.url.slice(ATTACHMENT.url.lastIndexOf('/') + 1);
      const sources = { ...withLegacy({}), readFile: vi.fn(async () => BYTES) };

      expect(await answerLocalMedia({ kind: 'file', owner: BOB, name }, sources)).toMatchObject({ status: 'found' });
      expect(await answerLocalMedia({ kind: 'file', owner: BOB, name: fileId }, sources)).toEqual({ status: 'none' });
      expect(sources.readLegacyFile).toHaveBeenCalledExactlyOnceWith(oldFile);
    });

    it('answers tooLarge when the older file is over the size the worker serves', async () => {
      const sources = withLegacy({});
      sources.readLegacyFile.mockRejectedValueOnce(
        Err.client(ClientErrorCode.PAYLOAD_TOO_LARGE, 'too large', {
          service: ErrorService.Homeserver,
          operation: 'test',
        }),
      );

      expect(await answerLocalMedia({ kind: 'file', owner: BOB, name: fileId }, sources)).toEqual({
        status: 'tooLarge',
      });
    });
  });
});
