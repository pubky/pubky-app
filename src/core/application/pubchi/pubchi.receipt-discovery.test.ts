import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { TagController } from '@/controllers/tag/tag';
import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiApplication } from './pubchi';

const owner = Keypair.random().publicKey.z32();
const otherOwner = Keypair.random().publicKey.z32();
const targetAuthor = Keypair.random().publicKey.z32();
const bot = Keypair.random().publicKey.z32();
const targetUri = `pubky://${targetAuthor}/pub/pubky.app/posts/0035Q0HAH8V6G`;
const identity = { current: owner };
const tagDocumentSha256 = 'e'.repeat(64);

vi.mock('@/database/pubchi/pubchi', () => ({ getPubchiDatabase: vi.fn() }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      currentUserPubky: identity.current,
      selectCurrentUserPubky: () => identity.current,
    }),
  },
}));

function notFound() {
  return Err.client(ClientErrorCode.NOT_FOUND, 'NOT_FOUND', {
    service: ErrorService.Homeserver,
    operation: 'test',
    context: { statusCode: HttpStatusCode.NOT_FOUND },
  });
}

function receipt(applicationId: string, overrides: Record<string, unknown> = {}) {
  return {
    schema: 'pubchi-tag-application',
    version: 1,
    application_id: applicationId,
    owner,
    bot,
    run_id: `run-${applicationId[0]}`,
    target: { kind: 'post', uri: targetUri, snapshot_sha256: 'c'.repeat(64) },
    label: `label-${applicationId[0]}`,
    source: 'vocab',
    evidence: [targetUri],
    suggestion_sha256: 'd'.repeat(64),
    status: 'applied',
    already_existed: false,
    tag_document_sha256: tagDocumentSha256,
    tag_uri: TagNormalizer.from({
      taggedKind: TagKind.POST,
      taggedId: `${targetAuthor}:0035Q0HAH8V6G`,
      label: `label-${applicationId[0]}`,
      taggerId: owner,
    }).tagUrl,
    suggested_at: 1,
    ...overrides,
  };
}

function receiptUrl(applicationId: string, receiptOwner = owner) {
  return `pubky://${receiptOwner}/priv/app.pubchi/v1/tag-applications/${applicationId}.json`;
}

describe('Pubchi durable tag receipt discovery', () => {
  beforeEach(() => {
    identity.current = owner;
    vi.mocked(getPubchiDatabase).mockReturnValue(
      asOpaque<ReturnType<typeof getPubchiDatabase>>({
        tagApplications: {
          where: () => ({ equals: () => ({ toArray: async () => [] }) }),
        },
      }),
    );

    vi.spyOn(HomeserverService, 'getCurrentSessionInfo').mockImplementation(
      () => useAuthStore.getState().selectSession?.()?.info ?? null,
    );
    vi.spyOn(HomeserverService, 'createWriteFence').mockReturnValue({
      enter: () => undefined,
      assertCurrent: () => undefined,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('filters by target, reconciles state, and preserves path order', async () => {
    const applied = 'a'.repeat(64);
    const superseded = 'b'.repeat(64);
    const otherTarget = 'c'.repeat(64);
    vi.spyOn(HomeserverService, 'list').mockResolvedValue([
      receiptUrl(applied),
      receiptUrl(superseded),
      receiptUrl(otherTarget),
    ]);
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      if (url === receiptUrl(applied)) return JSON.stringify(receipt(applied));
      if (url === receiptUrl(superseded))
        return JSON.stringify(receipt(superseded, { status: 'superseded', already_existed: true }));
      if (url === receiptUrl(otherTarget))
        return JSON.stringify(
          receipt(otherTarget, {
            target: { kind: 'post', uri: `${targetUri}-other`, snapshot_sha256: 'c'.repeat(64) },
          }),
        );
      return JSON.stringify({
        uri: targetUri,
        label: url.includes(`label-${superseded[0]}`) ? `label-${superseded[0]}` : `label-${applied[0]}`,
        created_at: 1,
      });
    });

    await expect(PubchiApplication.discoverTagSuggestions(owner, targetUri)).resolves.toMatchObject([
      { applicationId: applied, status: 'applied', alreadyExisted: false },
      { applicationId: superseded, status: 'superseded', alreadyExisted: true },
    ]);
  });

  it.each([
    ['applied tag absent', 'applied', false, 'absent', 'reverted-outside'],
    ['applied tag indeterminate', 'applied', false, 'indeterminate', 'reconciliation-pending'],
    ['applying tag absent', 'applying', null, 'absent', 'failed'],
    ['applying known-created tag present', 'applying', false, 'present', 'applied'],
    ['applying pre-existing tag present', 'applying', true, 'present', 'superseded'],
    ['applying unknown-authorship tag present', 'applying', null, 'present', 'reconciliation-pending'],
  ] as const)('maps %s', async (_name, status, alreadyExisted, tagState, expected) => {
    const id = 'a'.repeat(64);
    vi.spyOn(HomeserverService, 'list').mockResolvedValue([receiptUrl(id)]);
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      if (url === receiptUrl(id)) return JSON.stringify(receipt(id, { status, already_existed: alreadyExisted }));
      if (tagState === 'absent') throw notFound();
      if (tagState === 'indeterminate') return JSON.stringify({ uri: targetUri, label: 'wrong', created_at: 1 });
      return JSON.stringify({ uri: targetUri, label: 'label-a', created_at: 1 });
    });

    const [result] = await PubchiApplication.discoverTagSuggestions(owner, targetUri);
    expect(result?.status).toBe(expected);
  });

  it('caps receipt GETs at 50 and ignores malformed and foreign-owner paths', async () => {
    const own = Array.from({ length: 60 }, (_, index) => index.toString(16).padStart(64, '0'));
    vi.spyOn(HomeserverService, 'list').mockResolvedValue([
      ...own.map((id) => receiptUrl(id)),
      receiptUrl('f'.repeat(64), otherOwner),
    ]);
    const reads = vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      const id = /([a-f0-9]{64})\.json$/.exec(url)?.[1] ?? '';
      if (id === own[0]) return '{';
      return JSON.stringify(receipt(id));
    });

    await PubchiApplication.discoverTagSuggestions(owner, targetUri);

    expect(reads.mock.calls.filter(([url]) => url.includes('/tag-applications/'))).toHaveLength(50);
    expect(reads).not.toHaveBeenCalledWith(receiptUrl('f'.repeat(64), otherOwner));
  });

  it('lets the current live answer row win deduplication', async () => {
    const id = await sha256Hex(canonicalJson({ owner, run_id: 'run-a', target_uri: targetUri, label: 'label-a' }));
    vi.mocked(getPubchiDatabase).mockReturnValue(
      asOpaque<ReturnType<typeof getPubchiDatabase>>({
        tagApplications: {
          get: vi.fn(async () => ({
            id: 'live-record',
            owner,
            bot,
            served_purpose: 'ask',
            question: 'Suggest tags',
            target: { kind: 'post', uri: targetUri },
            submitted_at: 1,
            response_run_id: 'run-a',
            response_sha256: 'e'.repeat(64),
            response: {
              owner,
              bot,
              run_id: 'run-a',
              tag_suggestions: [{ label: 'label-a' }],
            },
          })),
        },
      }),
    );
    vi.spyOn(HomeserverService, 'list').mockResolvedValue([receiptUrl(id)]);
    const reads = vi.spyOn(HomeserverService, 'requestRawText').mockResolvedValue(JSON.stringify(receipt(id)));

    await expect(
      PubchiApplication.discoverTagSuggestions(owner, targetUri, () => true, 'live-record'),
    ).resolves.toEqual([]);
    expect(reads).not.toHaveBeenCalled();
  });

  it('stops dispatching new GETs when the generation becomes stale', async () => {
    const ids = Array.from({ length: 12 }, (_, index) => index.toString(16).padStart(64, '0'));
    let current = true;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.spyOn(HomeserverService, 'list').mockResolvedValue(ids.map((id) => receiptUrl(id)));
    const reads = vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      await gate;
      const id = /([a-f0-9]{64})\.json$/.exec(url)?.[1] ?? '';
      return JSON.stringify(receipt(id));
    });

    const discovery = PubchiApplication.discoverTagSuggestions(owner, targetUri, () => current);
    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(4));
    current = false;
    release();

    await expect(discovery).resolves.toEqual([]);
    expect(reads).toHaveBeenCalledTimes(4);
  });

  it('reverts from fetched receipt parameters and preserves unknown members', async () => {
    const id = 'a'.repeat(64);
    const params = {
      taggedKind: TagKind.POST,
      taggedId: `${targetAuthor}:0035Q0HAH8V6G`,
      label: 'label-a',
      taggerId: owner,
    };
    const tagUrl = TagNormalizer.from(params).tagUrl;
    let stored = receipt(id, {
      target: { kind: 'post', uri: targetUri, snapshot_sha256: 'c'.repeat(64), another_writer: true },
      tag_uri: tagUrl,
      ext: { another_writer: true },
    });
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      if (url === receiptUrl(id)) return JSON.stringify(stored);
      return JSON.stringify({ uri: targetUri, label: 'label-a', created_at: 1 });
    });
    vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === HttpMethod.PUT) stored = input.bodyJson as typeof stored;
      return undefined;
    });
    const materialize = vi.spyOn(TagController, 'materializeForDelete').mockResolvedValue();
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged').mockResolvedValue();

    await expect(PubchiController.revertDiscoveredTagSuggestion(targetUri, id)).resolves.toMatchObject({
      status: 'reverted',
    });

    expect(materialize).toHaveBeenCalledWith(params);
    expect(remove).toHaveBeenCalledWith(params, tagDocumentSha256);
    expect(TagNormalizer.from(remove.mock.calls[0]![0]).tagUrl).toBe(tagUrl);
    expect(stored).toMatchObject({
      status: 'reverted',
      target: { another_writer: true },
      ext: { another_writer: true },
    });
  });

  it.each([
    ['superseded receipt', { status: 'superseded' }, 'present'],
    ['indeterminate public tag', {}, 'indeterminate'],
    ['mismatched public tag', {}, 'mismatch'],
    ['missing document proof', { tag_document_sha256: undefined }, 'present'],
    ['invalid document proof', { tag_document_sha256: 'invalid' }, 'present'],
    ['missing canonical tag URI', { tag_uri: undefined }, 'present'],
    ['unknown authorship', { already_existed: null }, 'present'],
    ['mismatched receipt tag URI', { tag_uri: targetUri }, 'present'],
  ] as const)('never deletes for %s', async (_name, overrides, publicState) => {
    const id = 'a'.repeat(64);
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      if (url === receiptUrl(id)) return JSON.stringify(receipt(id, overrides));
      if (publicState === 'indeterminate') throw new Error('offline');
      if (publicState === 'mismatch') return JSON.stringify({ uri: targetUri, label: 'different', created_at: 1 });
      return JSON.stringify({ uri: targetUri, label: 'label-a', created_at: 1 });
    });
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged');

    await expect(PubchiController.revertDiscoveredTagSuggestion(targetUri, id)).rejects.toBeDefined();
    expect(remove).not.toHaveBeenCalled();
  });

  it('identity switch during preparation causes no DELETE or receipt PUT', async () => {
    const id = 'a'.repeat(64);
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      if (url === receiptUrl(id)) {
        identity.current = otherOwner;
        return JSON.stringify(receipt(id));
      }
      return JSON.stringify({ uri: targetUri, label: 'label-a', created_at: 1 });
    });
    const write = vi.spyOn(HomeserverService, 'request');
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged');

    await expect(PubchiController.revertDiscoveredTagSuggestion(targetUri, id)).resolves.toBeUndefined();

    expect(remove).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('does not PUT when the receipt GET fails during finalization', async () => {
    const id = 'a'.repeat(64);
    let receiptReads = 0;
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      if (url === receiptUrl(id)) {
        receiptReads++;
        if (receiptReads === 1) return JSON.stringify(receipt(id));
        throw new Error('receipt unavailable');
      }
      return JSON.stringify({ uri: targetUri, label: 'label-a', created_at: 1 });
    });
    vi.spyOn(TagController, 'materializeForDelete').mockResolvedValue();
    vi.spyOn(TagController, 'commitDeleteIfUnchanged').mockResolvedValue();
    const write = vi.spyOn(HomeserverService, 'request');

    await expect(PubchiController.revertDiscoveredTagSuggestion(targetUri, id)).rejects.toBeDefined();
    expect(write).not.toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT }));
  });

  it('does not finalize a receipt whose document proof changed after deletion', async () => {
    const id = 'a'.repeat(64);
    let receiptReads = 0;
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      if (url === receiptUrl(id)) {
        receiptReads++;
        return JSON.stringify(receipt(id, receiptReads > 1 ? { tag_document_sha256: 'f'.repeat(64) } : {}));
      }
      return JSON.stringify({ uri: targetUri, label: 'label-a', created_at: 1 });
    });
    vi.spyOn(TagController, 'materializeForDelete').mockResolvedValue();
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged').mockResolvedValue();
    const write = vi.spyOn(HomeserverService, 'request');

    await expect(PubchiController.revertDiscoveredTagSuggestion(targetUri, id)).rejects.toMatchObject({
      message: 'Receipt cannot be finalized',
    });

    expect(remove).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });
});
