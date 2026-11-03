import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { PubchiService } from '@/services/pubchi/pubchi';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiApplication } from './pubchi';

const owner = Keypair.random().publicKey.z32();
const bot = Keypair.random().publicKey.z32();
const postId = '0032W6CBGDBP0';
const sessionIdentity = { pubky: owner, capabilities: ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'] as string[] };
type StoredRecord = {
  id: string;
  owner: string;
  bot: string;
  served_purpose: 'ask';
  question: string;
  submitted_at: number;
  response_run_id: string;
  response: ReturnType<typeof answer>;
  response_sha256: string;
  status: 'proposed' | 'applying' | 'applied' | 'failed' | 'reverted' | 'rejected' | 'reconciliation-pending';
  operation?: 'apply' | 'reject' | 'revert';
  post_uri?: string;
  composite_post_id?: string;
  publication_confirmed?: boolean;
  updated_at: number;
};
let record: StoredRecord;
let draftHash: string;
let applicationId: string;
let receiptText: string | undefined;
let postPresent = false;

vi.mock('@/database/pubchi/pubchi', () => ({
  getPubchiDatabase: vi.fn(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      selectCurrentUserPubky: () => sessionIdentity.pubky,
      selectSession: () => ({
        info: { publicKey: { z32: () => sessionIdentity.pubky }, capabilities: sessionIdentity.capabilities },
      }),
    }),
  },
}));

vi.mock('@/libs/pubchi/device-key', () => ({
  getCurrentDeviceKey: async () => {
    const key = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    return { key: key.privateKey, signer: owner, owner, created_at: 1, expires_at: 2_000_000_000 };
  },
  signWithDeviceKey: async () => 'a'.repeat(128),
}));

function answer(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const evidenceUri = `pubky://${owner}/pub/pubky.app/profile.json`;
  return {
    schema: 'pubchi-answer',
    version: 1,
    owner,
    bot,
    generated_at: now,
    run_id: 'run-1',
    purpose: 'ask',
    question: 'Draft a short post about Pubky',
    summary: 'A short post you can publish as yourself.',
    evidence: [
      {
        kind: 'user',
        label: 'Owner profile',
        uri: evidenceUri,
        claimants: [],
        claimant_count: 0,
        in_your_graph: true,
      },
    ],
    sources: [],
    tool_trace_summary: { tools: [], call_count: 0, truncated: false },
    policy_version: 1,
    section: 'draft_post',
    draft_post: {
      content: 'Pubky keeps public social state on your homeserver.',
      kind: 'short',
      tags: ['pubky-app'],
      rationale: 'Matches the public profile evidence.',
      evidence: [evidenceUri],
    },
    ...overrides,
  };
}

async function setRecord(response = answer()) {
  draftHash = await sha256Hex(canonicalJson(response.draft_post));
  applicationId = await sha256Hex(canonicalJson({ owner, run_id: response.run_id, draft_sha256: draftHash }));
  record = {
    id: 'record-1',
    owner,
    bot,
    served_purpose: 'ask',
    question: response.question,
    submitted_at: Date.now(),
    response_run_id: response.run_id,
    response,
    response_sha256: await sha256Hex(canonicalJson(response)),
    status: 'proposed',
    updated_at: Date.now(),
  };
}

function notFound() {
  return Err.client(ClientErrorCode.NOT_FOUND, 'NOT_FOUND', {
    service: ErrorService.Homeserver,
    operation: 'test',
    context: { statusCode: HttpStatusCode.NOT_FOUND },
  });
}

describe('Pubchi draft post applications', () => {
  beforeEach(async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = 'https://pubchi.example.com';
    resetRuntimeConfigForTests();
    sessionIdentity.pubky = owner;
    sessionIdentity.capabilities = ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'];
    receiptText = undefined;
    postPresent = false;
    await setRecord();
    vi.mocked(getPubchiDatabase).mockReturnValue(
      asOpaque<ReturnType<typeof getPubchiDatabase>>({
        draftPosts: {
          get: vi.fn(async () => record),
          update: vi.fn(async (_id, change: Partial<StoredRecord>) => Object.assign(record, change)),
          put: vi.fn(async (value) => {
            record = structuredClone(value);
          }),
        },
        transaction: vi.fn(async (_mode, _table, work) => work()),
      }),
    );
    vi.spyOn(LocalPubchiBindingService, 'readActive').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof LocalPubchiBindingService.readActive>>>({ owner, bot, status: 'active' }),
    );
    vi.spyOn(HomeserverService, 'requestRawText').mockImplementation(async (url) => {
      if (url.includes('/priv/app.pubchi/v1/draft-posts/')) {
        if (receiptText === undefined) throw notFound();
        return receiptText;
      }
      if (url.includes('/pub/pubky.app/posts/')) {
        if (!postPresent) throw notFound();
        return JSON.stringify({ content: 'published' });
      }
      throw notFound();
    });
    vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === HttpMethod.PUT) receiptText = JSON.stringify(input.bodyJson);
      return undefined;
    });

    vi.spyOn(HomeserverService, 'getCurrentSessionInfo').mockImplementation(
      () => useAuthStore.getState().selectSession?.()?.info ?? null,
    );
    vi.spyOn(HomeserverService, 'createWriteFence').mockReturnValue({
      enter: () => undefined,
      assertCurrent: () => undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PubchiApplication.resetDraftPostOperationsForTests();
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
    resetRuntimeConfigForTests();
  });

  it('query persist stores a proposed draft and never publishes', async () => {
    const create = vi.spyOn(PostController, 'commitCreate');
    const response = answer();
    vi.spyOn(PubchiService, 'query').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiService.query>>>(response),
    );
    const result = await PubchiApplication.query({
      owner,
      question: response.question,
      purpose: 'ask',
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    expect(result).toMatchObject({ kind: 'answer', binding: { recordId: record.id, owner } });
    expect(record.status).toBe('proposed');
    expect(create).not.toHaveBeenCalled();
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('A preserves unknown receipt members across every receipt transition and a second-device extension', async () => {
    receiptText = JSON.stringify({
      ...receipt(),
      zzz_other_writer: { exact: 'value' },
      ext: { foo: { bytes: 'keep' } },
    });
    const prepared = await PubchiApplication.prepareDraftPostApplication(
      record.id,
      owner,
      sessionIdentity.capabilities,
    );
    expect(JSON.parse(receiptText!)).toMatchObject({
      status: 'applying',
      zzz_other_writer: { exact: 'value' },
      ext: { foo: { bytes: 'keep' } },
    });
    receiptText = JSON.stringify({
      ...JSON.parse(receiptText!),
      ext: { foo: { bytes: 'keep' }, bar: { second: true } },
    });
    for (const status of ['applied', 'failed', 'reverted', 'rejected'] as const) {
      await PubchiApplication.finalizeDraftPostApplication(record.id, prepared.applicationId, status);
      expect(JSON.parse(receiptText!)).toMatchObject({
        status,
        zzz_other_writer: { exact: 'value' },
        ext: { foo: { bytes: 'keep' }, bar: { second: true } },
      });
    }
    expect(HomeserverService.request).toHaveBeenCalledTimes(5);
    expect(vi.mocked(HomeserverService.request).mock.calls.every(([call]) => call.method === HttpMethod.PUT)).toBe(
      true,
    );
  });

  it('A refuses failed or oversized receipt reads before PUT and creates a receipt after 404', async () => {
    vi.mocked(HomeserverService.requestRawText).mockRejectedValueOnce(new Error('500'));
    await expect(
      PubchiApplication.prepareDraftPostApplication(record.id, owner, sessionIdentity.capabilities),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.request).not.toHaveBeenCalled();

    vi.mocked(HomeserverService.requestRawText).mockReset().mockResolvedValue('x'.repeat(65_537));
    await expect(
      PubchiApplication.prepareDraftPostApplication(record.id, owner, sessionIdentity.capabilities),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.request).not.toHaveBeenCalled();

    vi.mocked(HomeserverService.requestRawText)
      .mockReset()
      .mockImplementation(async () => {
        throw notFound();
      });
    await expect(
      PubchiApplication.prepareDraftPostApplication(record.id, owner, sessionIdentity.capabilities),
    ).resolves.toBeDefined();
    expect(HomeserverService.request).toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT }));
  });

  it('B refuses tampered digests, run ids, bindings, stale records, and either missing capability before I/O', async () => {
    const cases = [
      () => ({ ...record, response: { ...record.response, summary: 'tampered' } }),
      () => ({ ...record, response_run_id: 'other' }),
      () => ({ ...record, question: 'other question' }),
      () => ({ ...record, submitted_at: Date.now() - 601_000 }),
      () => ({ ...record, response: { ...record.response, generated_at: Math.floor(Date.now() / 1000) - 601 } }),
    ];
    for (const mutate of cases) {
      record = mutate();
      await expect(
        PubchiApplication.prepareDraftPostApplication(record.id, owner, sessionIdentity.capabilities),
      ).rejects.toBeInstanceOf(AppError);
      expect(HomeserverService.requestRawText).not.toHaveBeenCalled();
      await setRecord();
    }
    for (const capabilities of [['/priv/app.pubchi/v1/:rw'], ['/pub/pubky.app/:rw']]) {
      await expect(
        PubchiApplication.prepareDraftPostApplication(record.id, owner, capabilities),
      ).rejects.toBeInstanceOf(AppError);
      expect(HomeserverService.requestRawText).not.toHaveBeenCalled();
    }
  });

  it('B rejects a current identity that is not the stored owner before receipt I/O', async () => {
    await expect(
      PubchiApplication.prepareDraftPostApplication(record.id, bot, sessionIdentity.capabilities),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.requestRawText).not.toHaveBeenCalled();
  });

  it('B retains persisted draft content after the rendered query answer is mutated', async () => {
    const response = answer();
    vi.spyOn(PubchiService, 'query').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiService.query>>>(response),
    );
    const result = await PubchiApplication.query({
      owner,
      question: response.question,
      purpose: 'ask',
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    const rendered = asOpaque<{ result: ReturnType<typeof answer> }>(result);
    rendered.result.draft_post!.content = 'mutated-after-render';
    const prepared = await PubchiApplication.prepareDraftPostApplication(
      record.id,
      owner,
      sessionIdentity.capabilities,
    );
    expect(prepared.draft.content).toBe('Pubky keeps public social state on your homeserver.');
    expect(JSON.parse(receiptText!)).toMatchObject({ content: 'Pubky keeps public social state on your homeserver.' });
  });

  it('E surfaces a typed persistence failure when query cannot atomically write a draft', async () => {
    vi.mocked(getPubchiDatabase).mockReturnValue(
      asOpaque<ReturnType<typeof getPubchiDatabase>>({
        draftPosts: { put: vi.fn() },
        transaction: vi.fn(async () => {
          throw new Error('Dexie failed');
        }),
      }),
    );
    const response = answer();
    vi.spyOn(PubchiService, 'query').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiService.query>>>(response),
    );
    await expect(
      PubchiApplication.query({
        owner,
        question: response.question,
        purpose: 'ask',
        nowSeconds: Math.floor(Date.now() / 1000),
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('C publishes as the owner through commitCreate and records applied with a URI under U', async () => {
    const create = vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);
    const remove = vi.spyOn(PostController, 'commitDelete');

    await expect(PubchiController.applyDraftPost(record.id)).resolves.toBe('applied');

    expect(create).toHaveBeenCalledWith({
      authorId: owner,
      content: 'Pubky keeps public social state on your homeserver.',
      isArticle: false,
      tags: ['pubky-app'],
    });
    expect(remove).not.toHaveBeenCalled();
    expect(JSON.parse(receiptText!)).toMatchObject({
      status: 'applied',
      post_uri: `pubky://${owner}/pub/pubky.app/posts/${postId}`,
    });
    expect(record.post_uri).toBe(`pubky://${owner}/pub/pubky.app/posts/${postId}`);
  });

  it('C wraps kind=long as App article JSON before commitCreate', async () => {
    const response = answer({
      draft_post: {
        content: 'Headline\nBody paragraph',
        kind: 'long',
        rationale: 'Matches the public profile evidence.',
        evidence: [`pubky://${owner}/pub/pubky.app/profile.json`],
      },
    });
    await setRecord(response);
    const create = vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);

    await expect(PubchiController.applyDraftPost(record.id)).resolves.toBe('applied');

    expect(create).toHaveBeenCalledWith({
      authorId: owner,
      content: JSON.stringify({ title: 'Headline', body: 'Body paragraph' }),
      isArticle: true,
    });
  });

  it('C refuses a second in-flight apply before another commitCreate', async () => {
    let resolveCreate!: (value: string) => void;
    const create = vi.spyOn(PostController, 'commitCreate').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const first = PubchiController.applyDraftPost(record.id);
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    await expect(PubchiController.applyDraftPost(record.id)).rejects.toMatchObject({
      code: ClientErrorCode.CONFLICT,
      message: 'Draft post operation is already in progress',
    });
    expect(create).toHaveBeenCalledTimes(1);
    resolveCreate(`${owner}:${postId}`);
    await expect(first).resolves.toBe('applied');
    expect(record.post_uri).toBe(`pubky://${owner}/pub/pubky.app/posts/${postId}`);
  });

  it('C retries a failed apply from a stored URI without creating a second post', async () => {
    record.status = 'failed';
    record.composite_post_id = `${owner}:${postId}`;
    record.publication_confirmed = true;
    record.post_uri = `pubky://${owner}/pub/pubky.app/posts/${postId}`;
    const create = vi.spyOn(PostController, 'commitCreate');

    await expect(PubchiController.applyDraftPost(record.id)).resolves.toBe('applied');

    expect(create).not.toHaveBeenCalled();
    expect(JSON.parse(receiptText!)).toMatchObject({
      status: 'applied',
      post_uri: `pubky://${owner}/pub/pubky.app/posts/${postId}`,
    });
  });

  it('keeps an unbound publication pending after a lost response and never makes it revertible', async () => {
    const create = vi.spyOn(PostController, 'commitCreate').mockRejectedValue(new Error('response lost'));
    const remove = vi.spyOn(PostController, 'commitDelete');
    await expect(PubchiController.applyDraftPost(record.id)).resolves.toBe('reconciliation-pending');
    expect(create).toHaveBeenCalledOnce();
    expect(record.composite_post_id).toBeUndefined();
    expect(record.publication_confirmed).not.toBe(true);
    await expect(PubchiController.reconcileDraftPost(record.id)).resolves.toBe('reconciliation-pending');
    await expect(PubchiController.applyDraftPost(record.id)).rejects.toThrow('Draft post is no longer applicable');
    await expect(PubchiController.revertDraftPost(record.id)).rejects.toThrow('Draft post cannot be reverted');
    expect(create).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses to revert a legacy content-matched post without confirmed publication provenance', async () => {
    record.status = 'applied';
    record.composite_post_id = `${owner}:${postId}`;
    record.post_uri = `pubky://${owner}/pub/pubky.app/posts/${postId}`;
    receiptText = JSON.stringify({ ...receipt(), status: 'applied', post_uri: record.post_uri });
    const remove = vi.spyOn(PostController, 'commitDelete');
    await expect(PubchiController.revertDraftPost(record.id)).rejects.toThrow('Draft post cannot be reverted');
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a receipt that points to a different post or a different draft operation', async () => {
    record.status = 'applied';
    record.publication_confirmed = true;
    record.composite_post_id = `${owner}:${postId}`;
    record.post_uri = `pubky://${owner}/pub/pubky.app/posts/${postId}`;
    const remove = vi.spyOn(PostController, 'commitDelete');
    for (const changes of [
      { post_uri: `pubky://${owner}/pub/pubky.app/posts/OTHERPOST` },
      { application_id: 'f'.repeat(64) },
    ]) {
      receiptText = JSON.stringify({ ...receipt(), status: 'applied', post_uri: record.post_uri, ...changes });
      await expect(PubchiController.revertDraftPost(record.id)).rejects.toBeInstanceOf(AppError);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it('C truncates oversized receipt content to 64 KiB and keeps the full draft hash', async () => {
    const oversized = '你'.repeat(22_000);
    const response = answer({
      draft_post: {
        content: oversized,
        kind: 'long',
        rationale: 'Matches the public profile evidence.',
        evidence: [`pubky://${owner}/pub/pubky.app/profile.json`],
      },
    });
    await setRecord(response);
    vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);
    const draftSha = await sha256Hex(canonicalJson(response.draft_post));

    await expect(PubchiController.applyDraftPost(record.id)).resolves.toBe('applied');

    const stored = JSON.parse(receiptText!) as { content: string; draft_sha256: string };
    expect(new TextEncoder().encode(receiptText!).byteLength).toBeLessThanOrEqual(64 * 1024);
    expect(stored.content.length).toBeLessThan(oversized.length);
    expect(stored.draft_sha256).toBe(draftSha);
  });

  it('keeps an uncertain write pending without retrying the post write', async () => {
    const create = vi.spyOn(PostController, 'commitCreate').mockRejectedValue(new Error('post write failed'));

    await expect(PubchiController.applyDraftPost(record.id)).resolves.toBe('reconciliation-pending');

    expect(create).toHaveBeenCalledTimes(1);
    expect(JSON.parse(receiptText!)).toMatchObject({ status: 'applying' });
  });

  it('C refuses a published URI that is not under U', async () => {
    vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${bot}:${postId}`);

    await expect(PubchiController.applyDraftPost(record.id)).rejects.toMatchObject({
      message: 'Draft post was not published as you',
    });
    expect(JSON.parse(receiptText!)).toMatchObject({ status: 'failed' });
  });

  it('reject writes a rejected receipt and never creates a post object', async () => {
    const create = vi.spyOn(PostController, 'commitCreate');
    const remove = vi.spyOn(PostController, 'commitDelete');

    await expect(PubchiController.rejectDraftPost(record.id)).resolves.toBeUndefined();

    expect(create).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(JSON.parse(receiptText!)).toMatchObject({ status: 'rejected' });
    expect(record.status).toBe('rejected');
    expect(record.post_uri).toBeUndefined();
  });

  it('reject still writes a receipt after the 600s publish window', async () => {
    record.submitted_at = Date.now() - 601_000;
    record.response = { ...record.response, generated_at: Math.floor(Date.now() / 1000) - 601 };
    record.response_sha256 = await sha256Hex(canonicalJson(record.response));
    const create = vi.spyOn(PostController, 'commitCreate');

    await expect(PubchiController.rejectDraftPost(record.id)).resolves.toBeUndefined();

    expect(create).not.toHaveBeenCalled();
    expect(JSON.parse(receiptText!)).toMatchObject({ status: 'rejected' });
  });

  it('D deletes the stored post and preserves receipt extensions on revert', async () => {
    record.status = 'applied';
    record.composite_post_id = `${owner}:${postId}`;
    record.publication_confirmed = true;
    record.post_uri = `pubky://${owner}/pub/pubky.app/posts/${postId}`;
    receiptText = JSON.stringify({
      ...receipt(),
      status: 'applied',
      post_uri: record.post_uri,
      zzz_other_writer: { exact: 'value' },
      ext: { foo: { bytes: 'keep' } },
    });
    const remove = vi.spyOn(PostController, 'commitDelete').mockResolvedValue();

    await expect(PubchiController.revertDraftPost(record.id)).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledWith({ compositePostId: `${owner}:${postId}` });
    expect(JSON.parse(receiptText!)).toMatchObject({
      status: 'reverted',
      zzz_other_writer: { exact: 'value' },
      ext: { foo: { bytes: 'keep' } },
    });
  });

  it.each(['applying', 'failed', 'rejected'] as const)('D refuses a %s receipt without deleting', async (status) => {
    record.status = 'applied';
    record.composite_post_id = `${owner}:${postId}`;
    record.publication_confirmed = true;
    receiptText = JSON.stringify({ ...receipt(), status });
    const remove = vi.spyOn(PostController, 'commitDelete');

    await expect(PubchiController.revertDraftPost(record.id)).rejects.toBeInstanceOf(AppError);

    expect(remove).not.toHaveBeenCalled();
  });

  it('D treats an already-deleted post as reverted without a second delete', async () => {
    record.status = 'applied';
    record.composite_post_id = `${owner}:${postId}`;
    record.publication_confirmed = true;
    record.post_uri = `pubky://${owner}/pub/pubky.app/posts/${postId}`;
    receiptText = JSON.stringify({ ...receipt(), status: 'applied', post_uri: record.post_uri });
    const remove = vi.spyOn(PostController, 'commitDelete').mockRejectedValue(notFound());

    await expect(PubchiController.revertDraftPost(record.id)).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(JSON.parse(receiptText!)).toMatchObject({ status: 'reverted' });
    expect(record.status).toBe('reverted');
  });

  it('D persists reconciliation-pending and surfaces other delete failures', async () => {
    record.status = 'applied';
    record.composite_post_id = `${owner}:${postId}`;
    record.publication_confirmed = true;
    record.post_uri = `pubky://${owner}/pub/pubky.app/posts/${postId}`;
    receiptText = JSON.stringify({ ...receipt(), status: 'applied', post_uri: record.post_uri });
    const before = receiptText;
    vi.spyOn(PostController, 'commitDelete').mockRejectedValue(new Error('delete failed'));

    await expect(PubchiController.revertDraftPost(record.id)).rejects.toThrow('delete failed');

    expect(record.status).toBe('reconciliation-pending');
    expect(receiptText).toBe(before);
  });

  it('D persists reconciliation-pending and returns typed retryable failure after receipt finalization fails', async () => {
    record.status = 'applied';
    record.composite_post_id = `${owner}:${postId}`;
    record.publication_confirmed = true;
    record.post_uri = `pubky://${owner}/pub/pubky.app/posts/${postId}`;
    receiptText = JSON.stringify({ ...receipt(), status: 'applied', post_uri: record.post_uri });
    vi.spyOn(PostController, 'commitDelete').mockResolvedValue();
    vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === HttpMethod.PUT) throw new Error('receipt unavailable');
      return undefined;
    });

    await expect(PubchiController.revertDraftPost(record.id)).rejects.toMatchObject({ category: 'network' });

    expect(record.status).toBe('reconciliation-pending');
    expect(receiptText).toContain('"status":"applied"');
  });

  it.each([
    ['rejected receipt remains rejected', 'rejected', 'reject', false, 'rejected'],
    ['applied receipt remains applied when its post is present', 'applied', 'apply', true, 'applied'],
    ['applied receipt with an absent post after revert finalizes reverted', 'applied', 'revert', false, 'reverted'],
    ['reverted receipt repairs a stale local applied status', 'reverted', 'revert', false, 'reverted'],
    ['applying receipt and C6-created post finalizes applied', 'applying', 'apply', true, 'applied'],
    ['applying receipt and absent post finalizes failed', 'applying', 'apply', false, 'failed'],
    ['failed receipt and C6-created post self-heals to applied', 'failed', 'apply', true, 'applied'],
    ['failed receipt and absent post remains failed', 'failed', 'apply', false, 'failed'],
  ] as const)('reconciles %s', async (_name, receiptStatus, operation, present, expected) => {
    record.status = receiptStatus === 'reverted' ? 'applied' : 'reconciliation-pending';
    record.operation = operation;
    record.publication_confirmed = true;
    record.composite_post_id = `${owner}:${postId}`;
    record.post_uri = `pubky://${owner}/pub/pubky.app/posts/${postId}`;
    postPresent = present;
    receiptText = JSON.stringify({ ...receipt(), status: receiptStatus, post_uri: record.post_uri });

    await expect(PubchiApplication.reconcileDraftPostApplication(record.id, owner)).resolves.toBe(expected);
    expect(record.status).toBe(expected);
    expect(JSON.parse(receiptText!).status).toBe(expected);
  });

  it('does not reconcile while an apply operation is in flight', async () => {
    let resolveCreate!: (value: string) => void;
    const commitCreate = vi.spyOn(PostController, 'commitCreate').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const apply = PubchiController.applyDraftPost(record.id);
    await vi.waitFor(() => expect(commitCreate).toHaveBeenCalledOnce());

    await expect(PubchiApplication.reconcileDraftPostApplication(record.id, owner)).resolves.toBe('applying');
    expect(record.status).toBe('applying');
    expect(JSON.parse(receiptText!).status).toBe('applying');
    resolveCreate(`${owner}:${postId}`);
    await expect(apply).resolves.toBe('applied');
  });

  it('rehydrates a receipt applying before its local application state was persisted', async () => {
    receiptText = JSON.stringify({ ...receipt(), status: 'applying' });

    await expect(PubchiApplication.rehydrateDraftPostStatus(record.id, owner)).resolves.toBe('applying');
    expect(record.operation).toBe('apply');
  });

  it('keeps reconciliation pending when the durable receipt cannot be read', async () => {
    record.status = 'reconciliation-pending';
    vi.mocked(HomeserverService.requestRawText).mockRejectedValue(new Error('receipt unavailable'));

    await expect(PubchiApplication.reconcileDraftPostApplication(record.id, owner)).resolves.toBe(
      'reconciliation-pending',
    );
    expect(record.status).toBe('reconciliation-pending');
  });
});

function receipt() {
  return {
    schema: 'pubchi-draft-post',
    version: 1,
    application_id: applicationId,
    owner,
    bot,
    run_id: 'run-1',
    draft_sha256: draftHash,
    kind: 'short',
    content: 'Pubky keeps public social state on your homeserver.',
    tags: ['pubky-app'],
    rationale: 'Matches the public profile evidence.',
    evidence: [`pubky://${owner}/pub/pubky.app/profile.json`],
    status: 'applying',
    suggested_at: Math.floor(Date.now() / 1000),
  };
}
