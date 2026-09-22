import { webcrypto } from 'node:crypto';
import type { GrantAuthFlow, Pubky } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CAPABILITIES } from '@/config/auth';
import { asOpaque } from '@/test-utils/type-assertions';
import { type GrantFlowRequest, GrantFlowService } from './grant-flow';

vi.mock('@/config/network', async (original) => ({
  ...(await original<typeof import('@/config/network')>()),
  getHomeserver: () => '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y',
}));
vi.mock('./homeserver.utils', () => ({
  createCancelableAuthApproval: () => ({ awaitApproval: new Promise(() => {}), cancel: vi.fn() }),
}));
const savedKey = 'pubky-pending-grant-v1';
const request: GrantFlowRequest = { purpose: 'signin', capabilities: APP_CAPABILITIES, generation: 'generation' };
const makeFlow = (mode: 'local' | 'delegated' = 'delegated') =>
  asOpaque<GrantAuthFlow>({
    authorizationUrl: 'pubkyauth://grant',
    free: vi.fn(),
    saveDelegated: vi.fn(() => {
      if (mode === 'local') throw new Error('Local mode');
      return 'delegated-state';
    }),
    saveLocal: vi.fn(() => 'local-state'),
  });
function makeSdk(flow = makeFlow()) {
  return asOpaque<Pubky>({
    startGrantAuthFlow: vi.fn().mockResolvedValue(flow),
    resumeDelegatedGrantAuthFlow: vi.fn().mockResolvedValue(flow),
    resumeGrantAuthFlow: vi.fn().mockReturnValue(flow),
  });
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  sessionStorage.clear();
  GrantFlowService.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pending Ring grant flow', () => {
  it.each(['local', 'delegated'] as const)(
    'saves the actual %s mode before displaying a link and resumes with the matching SDK method',
    async (mode) => {
      const sdk = makeSdk(makeFlow(mode));
      await GrantFlowService.start(sdk, request);
      const record = JSON.parse(sessionStorage.getItem(savedKey)!);
      expect(record.mode).toBe(mode);
      await GrantFlowService.start(sdk, request);
      expect(sdk.startGrantAuthFlow).toHaveBeenCalledOnce();
      expect(mode === 'delegated' ? sdk.resumeDelegatedGrantAuthFlow : sdk.resumeGrantAuthFlow).toHaveBeenCalledWith(
        `${mode}-state`,
      );
    },
  );
  it.each([
    { generation: 'new-generation' },
    { purpose: 'upgrade' as const },
    { capabilities: '/pub/pubky.app/:rw,/priv/social/:rw' as const },
    { expectedPubky: 'another-account' },
    { purpose: 'signup' as const, inviteCode: 'invite' },
    { fresh: true },
  ])('discards a pending flow when its context changes: %j', async (change) => {
    const sdk = makeSdk();
    await GrantFlowService.start(sdk, request);
    await GrantFlowService.start(sdk, { ...request, ...change });
    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(2);
    expect(sdk.resumeDelegatedGrantAuthFlow).not.toHaveBeenCalled();
  });
  it('does not duplicate a plaintext invite in binding metadata', async () => {
    const sdk = makeSdk();
    await GrantFlowService.start(sdk, { ...request, purpose: 'signup', inviteCode: 'private-invite' });
    const saved = JSON.parse(sessionStorage.getItem(savedKey)!);
    expect(saved.context).not.toContain('private-invite');
    expect(JSON.parse(saved.context).inviteHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('expires pending serialization after the bounded resume window', async () => {
    const sdk = makeSdk();
    await GrantFlowService.start(sdk, request);
    const record = JSON.parse(sessionStorage.getItem(savedKey)!);
    record.createdAt -= 180_001;
    sessionStorage.setItem(savedKey, JSON.stringify(record));
    await GrantFlowService.start(sdk, request);
    expect(sdk.startGrantAuthFlow).toHaveBeenCalledTimes(2);
  });
  it('replaces malformed state without passing it to SDK resume', async () => {
    sessionStorage.setItem(savedKey, '{broken');
    const sdk = makeSdk();
    await GrantFlowService.start(sdk, request);
    expect(sdk.startGrantAuthFlow).toHaveBeenCalledOnce();
  });
  it('does not display a link when pending state cannot be saved', async () => {
    const flow = makeFlow();
    const sdk = makeSdk(flow);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    await expect(GrantFlowService.start(sdk, request)).rejects.toThrow();
    expect(flow.free).toHaveBeenCalledOnce();
  });
  it('an old completion cannot clear a newer pending flow', async () => {
    const sdk = makeSdk();
    const first = await GrantFlowService.start(sdk, request);
    await GrantFlowService.start(sdk, { ...request, fresh: true });
    const saved = sessionStorage.getItem(savedKey);
    first.completeAuthFlow?.();
    expect(sessionStorage.getItem(savedKey)).toBe(saved);
  });
  it('cancel during asynchronous start prevents a late pending record', async () => {
    const flow = makeFlow();
    const sdk = makeSdk(flow);
    let resolve!: (flow: GrantAuthFlow) => void;
    vi.mocked(sdk.startGrantAuthFlow).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const result = GrantFlowService.start(sdk, request);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AuthFlowCanceled' });
    await vi.waitFor(() => expect(sdk.startGrantAuthFlow).toHaveBeenCalledOnce());
    GrantFlowService.clear();
    resolve(flow);
    await rejected;
    expect(sessionStorage.getItem(savedKey)).toBeNull();
    expect(flow.free).toHaveBeenCalledOnce();
  });
});
