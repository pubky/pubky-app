import { Keypair } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagKind } from '@/application/tag/tag.types';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { TagController } from '@/controllers/tag/tag';
import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod, HttpStatusCode } from '@/libs/http/http.types';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { PUBKY_RUNTIME_ENV_NAMES } from '@/libs/runtime-config/runtime-config.schema';
import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalPubchiBindingService } from '@/services/local/pubchi/binding';
import { PubchiService } from '@/services/pubchi/pubchi';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiApplication } from './pubchi';

const owner = Keypair.random().publicKey.z32();
const bot = Keypair.random().publicKey.z32();
const tagDocumentSha256 = 'e'.repeat(64);
const target = { kind: 'user' as const, uri: `pubky://${owner}/pub/pubky.app/profile.json` };
const sessionIdentity = { pubky: owner, capabilities: ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'] as string[] };
type StoredRecord = {
  id: string;
  owner: string;
  bot: string;
  served_purpose: 'ask';
  question: string;
  target: typeof target;
  submitted_at: number;
  response_run_id: string;
  response: ReturnType<typeof answer>;
  response_sha256: string;
  statuses: Record<
    number,
    'proposed' | 'applying' | 'applied' | 'superseded' | 'failed' | 'reverted' | 'reconciliation-pending'
  >;
  operations?: Record<number, 'apply' | 'revert'>;
  already_existed?: Record<number, boolean | null>;
  tag_document_sha256?: Record<number, string | null>;
  updated_at: number;
};
let record: StoredRecord;
let receiptText: string | undefined;

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
  return {
    schema: 'pubchi-answer',
    version: 1,
    owner,
    bot,
    generated_at: now,
    run_id: 'run-1',
    purpose: 'ask',
    question: 'Suggest a tag',
    summary: 'One tag.',
    evidence: [],
    sources: [],
    tool_trace_summary: { tools: [], call_count: 0, truncated: false },
    policy_version: 1,
    section: 'tag_suggestions',
    target: { ...target, snapshot_sha256: 'a'.repeat(64) },
    tag_suggestions: [
      {
        label: 'builder',
        rationale: 'Public evidence',
        evidence: [target.uri],
        already_applied: false,
        source: 'vocab',
      },
    ],
    ...overrides,
  };
}

async function setRecord(response = answer()) {
  response.target!.snapshot_sha256 = await sha256Hex(
    canonicalJson({ kind: 'user', uri: target.uri, pubky: owner, name: '', bio: null }),
  );
  record = {
    id: 'record-1',
    owner,
    bot,
    served_purpose: 'ask',
    question: response.question,
    target,
    submitted_at: Date.now(),
    response_run_id: response.run_id,
    response,
    response_sha256: await sha256Hex(canonicalJson(response)),
    statuses: { 0: 'proposed' },
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

describe('Pubchi tag suggestion applications', () => {
  beforeEach(async () => {
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled] = 'true';
    process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl] = 'https://pubchi.example.com';
    resetRuntimeConfigForTests();
    sessionIdentity.pubky = owner;
    sessionIdentity.capabilities = ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'];
    receiptText = undefined;
    await setRecord();
    vi.mocked(getPubchiDatabase).mockReturnValue(
      asOpaque<ReturnType<typeof getPubchiDatabase>>({
        tagApplications: {
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
      if (url === target.uri) return JSON.stringify({});
      if (receiptText === undefined) throw notFound();
      return receiptText;
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
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiEnabled];
    delete process.env[PUBKY_RUNTIME_ENV_NAMES.pubchiApiUrl];
    resetRuntimeConfigForTests();
  });

  it('A preserves unknown receipt members across every receipt transition and a second-device extension', async () => {
    receiptText = JSON.stringify({
      ...receipt(),
      zzz_other_writer: { exact: 'value' },
      ext: { foo: { bytes: 'keep' } },
    });
    const prepared = await PubchiApplication.prepareTagSuggestionApplication(
      record.id,
      0,
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
    for (const status of ['applied', 'superseded', 'failed', 'reverted'] as const) {
      await PubchiApplication.finalizeTagSuggestionApplication(record.id, 0, prepared.applicationId, status);
      expect(JSON.parse(receiptText!)).toMatchObject({
        status,
        zzz_other_writer: { exact: 'value' },
        ext: { foo: { bytes: 'keep' }, bar: { second: true } },
      });
    }
    expect(HomeserverService.requestRawText).toHaveBeenCalledTimes(6);
    expect(HomeserverService.request).toHaveBeenCalledTimes(5);
    expect(vi.mocked(HomeserverService.request).mock.calls.every(([call]) => call.method === HttpMethod.PUT)).toBe(
      true,
    );
  });

  it('A refuses failed or oversized receipt reads before PUT and creates a receipt after 404', async () => {
    vi.mocked(HomeserverService.requestRawText).mockRejectedValueOnce(new Error('500'));
    await expect(
      PubchiApplication.prepareTagSuggestionApplication(record.id, 0, owner, sessionIdentity.capabilities),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.request).not.toHaveBeenCalled();

    vi.mocked(HomeserverService.requestRawText).mockReset().mockResolvedValue('x'.repeat(65_537));
    await expect(
      PubchiApplication.prepareTagSuggestionApplication(record.id, 0, owner, sessionIdentity.capabilities),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.request).not.toHaveBeenCalled();

    vi.mocked(HomeserverService.requestRawText)
      .mockReset()
      .mockImplementation(async (url) => {
        if (url === target.uri) return JSON.stringify({});
        throw notFound();
      });
    await expect(
      PubchiApplication.prepareTagSuggestionApplication(record.id, 0, owner, sessionIdentity.capabilities),
    ).resolves.toBeDefined();
    expect(HomeserverService.request).toHaveBeenCalledWith(expect.objectContaining({ method: HttpMethod.PUT }));
  });

  it('B refuses tampered digests, run ids, bindings, stale records, and either missing capability before I/O', async () => {
    const cases = [
      () => ({ ...record, response: { ...record.response, summary: 'tampered' } }),
      () => ({ ...record, response_run_id: 'other' }),
      () => ({ ...record, question: 'other question' }),
      () => ({ ...record, target: { ...target, uri: 'pubky://other/pub/pubky.app/profile.json' } }),
      () => ({ ...record, submitted_at: Date.now() - 601_000 }),
      () => ({ ...record, response: { ...record.response, generated_at: Math.floor(Date.now() / 1000) - 601 } }),
    ];
    for (const mutate of cases) {
      record = mutate();
      await expect(
        PubchiApplication.prepareTagSuggestionApplication(record.id, 0, owner, sessionIdentity.capabilities),
      ).rejects.toBeInstanceOf(AppError);
      expect(HomeserverService.requestRawText).not.toHaveBeenCalled();
      record = structuredClone(record);
      await setRecord();
    }
    for (const capabilities of [['/priv/app.pubchi/v1/:rw'], ['/pub/pubky.app/:rw']]) {
      await expect(
        PubchiApplication.prepareTagSuggestionApplication(record.id, 0, owner, capabilities),
      ).rejects.toBeInstanceOf(AppError);
      expect(HomeserverService.requestRawText).not.toHaveBeenCalled();
    }
  });

  it('B refuses an edited or deleted target before receipt or tag writes', async () => {
    vi.mocked(HomeserverService.requestRawText).mockImplementation(async (url) => {
      if (url === target.uri) return JSON.stringify({ name: 'edited' });
      throw notFound();
    });
    await expect(
      PubchiApplication.prepareTagSuggestionApplication(record.id, 0, owner, sessionIdentity.capabilities),
    ).rejects.toMatchObject({ message: 'Target changed — ask again' });
    expect(HomeserverService.request).not.toHaveBeenCalled();

    vi.mocked(HomeserverService.requestRawText).mockRejectedValue(notFound());
    await expect(
      PubchiApplication.prepareTagSuggestionApplication(record.id, 0, owner, sessionIdentity.capabilities),
    ).rejects.toMatchObject({ message: 'Target changed — ask again' });
    expect(HomeserverService.request).not.toHaveBeenCalled();
  });

  it('B rejects a current identity that is not the stored owner before target I/O', async () => {
    await expect(
      PubchiApplication.prepareTagSuggestionApplication(record.id, 0, bot, sessionIdentity.capabilities),
    ).rejects.toBeInstanceOf(AppError);
    expect(HomeserverService.requestRawText).not.toHaveBeenCalled();
  });

  it('B retains persisted target and label after the rendered query answer is mutated', async () => {
    const response = answer();
    response.target.snapshot_sha256 = await sha256Hex(
      canonicalJson({ kind: 'user', uri: target.uri, pubky: owner, name: '', bio: null }),
    );
    vi.spyOn(PubchiService, 'query').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiService.query>>>(response),
    );
    const result = await PubchiApplication.query({
      owner,
      question: response.question,
      purpose: 'ask',
      target,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    const rendered = asOpaque<{ result: ReturnType<typeof answer> }>(result);
    rendered.result.tag_suggestions![0]!.label = 'mutated-after-render';
    const prepared = await PubchiApplication.prepareTagSuggestionApplication(
      record.id,
      0,
      owner,
      sessionIdentity.capabilities,
    );
    expect(prepared.suggestion.label).toBe('builder');
    expect(JSON.parse(receiptText!)).toMatchObject({ label: 'builder', target: { uri: target.uri } });
  });

  it('E surfaces a typed persistence failure when query cannot atomically write tag suggestions', async () => {
    vi.mocked(getPubchiDatabase).mockReturnValue(
      asOpaque<ReturnType<typeof getPubchiDatabase>>({
        tagApplications: { put: vi.fn() },
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
        target,
        nowSeconds: Math.floor(Date.now() / 1000),
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it.each([
    [true, 'superseded'],
    [false, 'applied'],
  ] as const)('C records %s existing tag as %s through the controller', async (alreadyExisted, status) => {
    vi.spyOn(TagController, 'commitCreatePreservingExisting').mockResolvedValue({
      tagUrl: `pubky://${owner}/pub/pubky.app/tags/builder`,
      alreadyExisted,
      tagDocumentSha256,
    });
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged');

    await expect(PubchiController.applyTagSuggestion(record.id, 0)).resolves.toBe(status);

    expect(JSON.parse(receiptText!)).toMatchObject({ status });
    expect(record.tag_document_sha256?.[0]).toBe(tagDocumentSha256);
    expect(JSON.parse(receiptText!)).toMatchObject({ tag_document_sha256: tagDocumentSha256 });
    expect(remove).not.toHaveBeenCalled();
  });

  it('leaves a successful tag write pending when its document proof is unavailable', async () => {
    vi.spyOn(TagController, 'commitCreatePreservingExisting').mockResolvedValue({
      tagUrl: `pubky://${owner}/pub/pubky.app/tags/builder`,
      alreadyExisted: false,
    });

    await expect(PubchiController.applyTagSuggestion(record.id, 0)).resolves.toBe('reconciliation-pending');

    expect(record.tag_document_sha256?.[0]).toBeNull();
    expect(JSON.parse(receiptText!)).toMatchObject({ status: 'applying', tag_document_sha256: null });
  });

  it('C records failed receipt and surfaces create failures without retrying the tag write', async () => {
    const create = vi
      .spyOn(TagController, 'commitCreatePreservingExisting')
      .mockRejectedValue(new Error('tag write failed'));

    await expect(PubchiController.applyTagSuggestion(record.id, 0)).rejects.toThrow('tag write failed');

    expect(create).toHaveBeenCalledTimes(1);
    expect(JSON.parse(receiptText!)).toMatchObject({ status: 'failed' });
  });

  it('D deletes the stored tag binding and preserves receipt extensions on revert', async () => {
    record.statuses = { 0: 'applied' };
    record.response.tag_suggestions![0]!.label = 'stored-label';
    record.response_sha256 = await sha256Hex(canonicalJson(record.response));
    receiptText = JSON.stringify({
      ...(await appliedReceipt()),
      zzz_other_writer: { exact: 'value' },
      ext: { foo: { bytes: 'keep' } },
    });
    const materialize = vi.spyOn(TagController, 'materializeForDelete').mockResolvedValue();
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged').mockResolvedValue();

    await expect(PubchiController.revertTagSuggestion(record.id, 0)).resolves.toBeUndefined();

    const params = { taggedKind: TagKind.USER, taggedId: owner, label: 'stored-label', taggerId: owner };
    expect(materialize).toHaveBeenCalledWith(params);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(params, tagDocumentSha256);
    expect(JSON.parse(receiptText!)).toMatchObject({
      status: 'reverted',
      zzz_other_writer: { exact: 'value' },
      ext: { foo: { bytes: 'keep' } },
    });
  });

  it.each(['superseded', 'applying', 'failed'] as const)('D refuses a %s receipt without deleting', async (status) => {
    record.statuses = { 0: 'applied' };
    receiptText = JSON.stringify({ ...receipt(), status });
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged');

    await expect(PubchiController.revertTagSuggestion(record.id, 0)).rejects.toBeInstanceOf(AppError);

    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    ['legacy receipt without proof', { tag_document_sha256: undefined }],
    ['invalid document proof', { tag_document_sha256: 'invalid' }],
    ['pre-existing tag', { already_existed: true }],
    ['foreign receipt owner', { owner: bot }],
    ['different application', { application_id: 'f'.repeat(64) }],
    ['different suggestion', { suggestion_sha256: 'f'.repeat(64) }],
    ['missing canonical URI', { tag_uri: undefined }],
  ])('refuses to revert a %s before touching the public tag', async (_name, overrides) => {
    record.statuses = { 0: 'applied' };
    receiptText = JSON.stringify({ ...(await appliedReceipt()), ...overrides });
    const materialize = vi.spyOn(TagController, 'materializeForDelete');
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged');

    await expect(PubchiController.revertTagSuggestion(record.id, 0)).rejects.toBeInstanceOf(AppError);

    expect(materialize).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses receipt proof that conflicts with the successful local apply outcome', async () => {
    record.statuses = { 0: 'applied' };
    record.tag_document_sha256 = { 0: 'f'.repeat(64) };
    receiptText = JSON.stringify(await appliedReceipt());
    const remove = vi.spyOn(TagController, 'commitDeleteIfUnchanged');

    await expect(PubchiController.revertTagSuggestion(record.id, 0)).rejects.toBeInstanceOf(AppError);

    expect(remove).not.toHaveBeenCalled();
  });

  it('D leaves receipt unchanged and surfaces delete failures', async () => {
    record.statuses = { 0: 'applied' };
    receiptText = JSON.stringify(await appliedReceipt());
    const before = receiptText;
    vi.spyOn(TagController, 'materializeForDelete').mockResolvedValue();
    vi.spyOn(TagController, 'commitDeleteIfUnchanged').mockRejectedValue(new Error('delete failed'));

    await expect(PubchiController.revertTagSuggestion(record.id, 0)).rejects.toThrow('delete failed');

    expect(receiptText).toBe(before);
  });

  it('D persists reconciliation-pending and returns typed retryable failure after receipt finalization fails', async () => {
    record.statuses = { 0: 'applied' };
    receiptText = JSON.stringify(await appliedReceipt());
    vi.spyOn(TagController, 'materializeForDelete').mockResolvedValue();
    vi.spyOn(TagController, 'commitDeleteIfUnchanged').mockResolvedValue();
    vi.spyOn(HomeserverService, 'request').mockImplementation(async (input) => {
      if (input.method === HttpMethod.PUT) throw new Error('receipt unavailable');
      return undefined;
    });

    await expect(PubchiController.revertTagSuggestion(record.id, 0)).rejects.toMatchObject({ category: 'network' });

    expect(record.statuses[0]).toBe('reconciliation-pending');
    expect(receiptText).toContain('"status":"applied"');
  });

  it.each([
    [
      'superseded receipt remains superseded when its pre-existing tag is present',
      'superseded',
      'apply',
      true,
      false,
      'superseded',
    ],
    ['applied receipt remains applied when its tag is present', 'applied', 'apply', true, false, 'applied'],
    [
      'applied receipt with an absent tag after revert finalizes reverted',
      'applied',
      'revert',
      false,
      false,
      'reverted',
    ],
    ['reverted receipt repairs a stale local applied status', 'reverted', 'revert', false, false, 'reverted'],
    ['applying receipt and C5-created tag finalizes applied', 'applying', 'apply', true, false, 'applied'],
    ['applying receipt and pre-existing tag finalizes superseded', 'applying', 'apply', true, true, 'superseded'],
    ['applying receipt and absent tag finalizes failed', 'applying', 'apply', false, false, 'failed'],
    ['failed receipt and C5-created tag self-heals to applied', 'failed', 'apply', true, false, 'applied'],
    ['failed receipt and pre-existing tag self-heals to superseded', 'failed', 'apply', true, true, 'superseded'],
    ['failed receipt with unknown authorship remains pending', 'failed', 'apply', true, null, 'reconciliation-pending'],
    ['failed receipt and absent tag remains failed', 'failed', 'apply', false, false, 'failed'],
  ] as const)('reconciles %s', async (_name, receiptStatus, operation, tagPresent, alreadyExisted, expected) => {
    record.statuses = { 0: receiptStatus === 'reverted' ? 'applied' : 'reconciliation-pending' };
    record.operations = { 0: operation };
    record.already_existed = { 0: alreadyExisted };
    receiptText = JSON.stringify({ ...receipt(), status: receiptStatus });
    vi.mocked(HomeserverService.requestRawText).mockImplementation(async (url) => {
      if (url.includes('/priv/app.pubchi/v1/tag-applications/')) return receiptText!;
      if (url.includes('/pub/pubky.app/tags/')) {
        if (!tagPresent) throw notFound();
        return JSON.stringify({ uri: target.uri, label: 'builder', created_at: 1 });
      }
      return JSON.stringify({});
    });

    await expect(PubchiApplication.reconcileTagSuggestionApplication(record.id, 0, owner)).resolves.toBe(expected);
    expect(record.statuses[0]).toBe(expected);
    expect(JSON.parse(receiptText!).status).toBe(expected === 'reconciliation-pending' ? receiptStatus : expected);
  });

  it('does not reconcile while an apply operation is in flight', async () => {
    let resolveCreate!: (value: Awaited<ReturnType<typeof TagController.commitCreatePreservingExisting>>) => void;
    const commitCreate = vi.spyOn(TagController, 'commitCreatePreservingExisting').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const apply = PubchiController.applyTagSuggestion(record.id, 0);
    await vi.waitFor(() => expect(commitCreate).toHaveBeenCalledOnce());

    await expect(PubchiApplication.reconcileTagSuggestionApplication(record.id, 0, owner)).resolves.toBe('applying');
    expect(record.statuses[0]).toBe('applying');
    expect(HomeserverService.request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(receiptText!).status).toBe('applying');
    resolveCreate({ tagUrl: `pubky://${owner}/pub/pubky.app/tags/builder`, alreadyExisted: false, tagDocumentSha256 });
    await expect(apply).resolves.toBe('applied');
  });

  it('keeps a crash after tag PUT before outcome persistence pending without offering authorship', async () => {
    record.statuses = { 0: 'applying' };
    record.operations = { 0: 'apply' };
    record.already_existed = { 0: null };
    receiptText = JSON.stringify({ ...receipt(), status: 'applying', already_existed: null });
    vi.mocked(HomeserverService.requestRawText).mockImplementation(async (url) => {
      if (url.includes('/priv/app.pubchi/v1/tag-applications/')) return receiptText!;
      if (url.includes('/pub/pubky.app/tags/'))
        return JSON.stringify({ uri: target.uri, label: 'builder', created_at: 1 });
      return JSON.stringify({});
    });

    await expect(PubchiApplication.reconcileTagSuggestionApplication(record.id, 0, owner)).resolves.toBe(
      'reconciliation-pending',
    );
    expect(record.statuses[0]).toBe('reconciliation-pending');
    expect(JSON.parse(receiptText!).status).toBe('applying');
  });

  it.each([
    ['malformed', '{'],
    ['wrong canonical tag', JSON.stringify({ uri: target.uri, label: 'other', created_at: 1 })],
    ['oversized tag', 'x'.repeat(65_537)],
  ])('keeps applying reconciliation pending for an indeterminate %s tag read', async (_name, raw) => {
    record.statuses = { 0: 'applying' };
    record.operations = { 0: 'apply' };
    record.already_existed = { 0: false };
    receiptText = JSON.stringify({ ...receipt(), status: 'applying' });
    vi.mocked(HomeserverService.requestRawText).mockImplementation(async (url) => {
      if (url.includes('/priv/app.pubchi/v1/tag-applications/')) return receiptText!;
      if (url.includes('/pub/pubky.app/tags/')) return raw;
      return JSON.stringify({});
    });

    await expect(PubchiApplication.reconcileTagSuggestionApplication(record.id, 0, owner)).resolves.toBe(
      'reconciliation-pending',
    );
  });

  it('keeps revert reconciliation pending for an indeterminate tag read', async () => {
    record.statuses = { 0: 'reconciliation-pending' };
    record.operations = { 0: 'revert' };
    receiptText = JSON.stringify({ ...receipt(), status: 'applied' });
    vi.mocked(HomeserverService.requestRawText).mockImplementation(async (url) => {
      if (url.includes('/priv/app.pubchi/v1/tag-applications/')) return receiptText!;
      if (url.includes('/pub/pubky.app/tags/')) return '{';
      return JSON.stringify({});
    });

    await expect(PubchiApplication.reconcileTagSuggestionApplication(record.id, 0, owner)).resolves.toBe(
      'reconciliation-pending',
    );
  });

  it('rehydrates a receipt applying before its local application state was persisted', async () => {
    receiptText = JSON.stringify({ ...receipt(), status: 'applying', already_existed: null });

    await expect(PubchiApplication.rehydrateTagSuggestionStatuses(record.id, owner)).resolves.toMatchObject({
      0: 'applying',
    });
    expect(record.operations?.[0]).toBe('apply');
    expect(record.already_existed?.[0]).toBeNull();
  });

  it('keeps reconciliation pending when the durable receipt cannot be read', async () => {
    record.statuses = { 0: 'reconciliation-pending' };
    vi.mocked(HomeserverService.requestRawText).mockRejectedValue(new Error('receipt unavailable'));

    await expect(PubchiApplication.reconcileTagSuggestionApplication(record.id, 0, owner)).resolves.toBe(
      'reconciliation-pending',
    );
    expect(record.statuses[0]).toBe('reconciliation-pending');
  });
});

function receipt() {
  return {
    schema: 'pubchi-tag-application',
    version: 1,
    application_id: 'b'.repeat(64),
    owner,
    bot,
    run_id: 'run-1',
    target: { ...target, snapshot_sha256: 'a'.repeat(64) },
    label: 'builder',
    source: 'vocab',
    evidence: [target.uri],
    suggestion_sha256: 'c'.repeat(64),
    status: 'applying',
    suggested_at: Math.floor(Date.now() / 1000),
  };
}

async function appliedReceipt() {
  const suggestion = record.response.tag_suggestions[0]!;
  return {
    ...receipt(),
    application_id: await sha256Hex(
      canonicalJson({ owner, run_id: record.response.run_id, target_uri: target.uri, label: suggestion.label }),
    ),
    target: record.response.target,
    label: suggestion.label,
    suggestion_sha256: await sha256Hex(canonicalJson(suggestion)),
    status: 'applied',
    already_existed: false,
    tag_document_sha256: tagDocumentSha256,
    tag_uri: TagNormalizer.from({ taggedKind: TagKind.USER, taggedId: owner, label: suggestion.label, taggerId: owner })
      .tagUrl,
  };
}
