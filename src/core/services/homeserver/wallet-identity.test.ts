import type { Session } from '@synonymdev/pubky';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { startWalletKeyApproval, walletIdentityScope } from './wallet-identity';

const { start, kind } = vi.hoisted(() => ({ start: vi.fn(), kind: vi.fn() }));
vi.mock('@synonymdev/pubky', async (load) => ({
  ...(await load<typeof import('@synonymdev/pubky')>()),
  GrantAuthFlow: { start },
  AuthFlowKind: { signin: kind },
}));
const account = 'buyer';
const path = walletIdentityScope('mainnet');
const state = () => useAuthStore.getState();
const sdkSession = (owner: string, scope = path as string) => {
  const key = new Uint8Array(32).fill(7);
  const keys = { scopes: [scope], deriveForPath: vi.fn(() => key), free: vi.fn() };
  const info = { publicKey: { z32: () => owner, free: vi.fn() }, capabilities: [scope + ':e'], free: vi.fn() };
  return { key, info, grant: { encryptionKeys: keys, free: vi.fn() }, free: vi.fn(), signout: vi.fn(async () => {}) };
};
const social = sdkSession(account);
function prepare(grant = sdkSession(account)) {
  const flow = { authorizationUrl: 'pubkyauth://fixture', tryPollOnce: vi.fn(async () => grant), free: vi.fn() };
  start.mockReturnValue(flow);
  return { grant, flow };
}
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    currentUserPubky: account,
    session: asOpaque<Session>(social),
    generation: 'current',
    isLoggingOut: false,
    needsAccountSync: false,
  });
});

it('requests one memory-only signed grant and erases its key after use', async () => {
  const { grant, flow } = prepare();
  let bytes: Uint8Array | undefined;
  await startWalletKeyApproval(account, 'mainnet', new AbortController().signal, async (key, guard) => {
    guard();
    expect(grant.signout).toHaveBeenCalledOnce();
    expect(key.byteLength).toBe(32);
    bytes = key;
  }).result;
  expect(start).toHaveBeenCalledWith(
    path + ':e',
    undefined,
    expect.objectContaining({ approvalFormat: 'signedApprovalV1' }),
  );
  expect(bytes?.every((n) => n === 0)).toBe(true);
  expect(grant.grant.encryptionKeys.free).toHaveBeenCalledOnce();
  expect(grant.free).toHaveBeenCalledOnce();
  expect(flow.free).toHaveBeenCalledOnce();
  expect(state().session).toBe(social);
});
it.each([
  ['other', path],
  [account, '/priv/pubky-wallet/v1/'],
  [account, walletIdentityScope('testnet')],
])('discards a grant for a different account or scope', async (user, scope) => {
  const { grant } = prepare(sdkSession(user, scope));
  const consume = vi.fn();
  await expect(
    startWalletKeyApproval(account, 'mainnet', new AbortController().signal, consume).result,
  ).rejects.toThrow(/different|exact/);
  expect(consume).not.toHaveBeenCalled();
  expect(grant.signout).toHaveBeenCalledOnce();
  expect(grant.grant.encryptionKeys.deriveForPath).not.toHaveBeenCalled();
});
it('retires an approval that arrives after cancellation', async () => {
  const { grant } = prepare();
  const controller = new AbortController();
  const consume = vi.fn();
  const active = startWalletKeyApproval(account, 'mainnet', controller.signal, consume);
  controller.abort();
  await expect(active.result).rejects.toThrow('ended');
  expect(grant.signout).toHaveBeenCalledOnce();
  expect(consume).not.toHaveBeenCalled();
});
it('discards key bytes when the social grant changes during signout', async () => {
  const { grant } = prepare();
  grant.signout.mockImplementation(async () => {
    useAuthStore.setState({ generation: 'replaced' });
  });
  const consume = vi.fn();
  await expect(
    startWalletKeyApproval(account, 'mainnet', new AbortController().signal, consume).result,
  ).rejects.toThrow('ended');
  expect(grant.key.every((n) => n === 0)).toBe(true);
  expect(consume).not.toHaveBeenCalled();
});
it('wipes the key and closes its session if revocation fails', async () => {
  const { grant } = prepare();
  grant.signout.mockRejectedValue(new Error('sensitive text from transport'));
  const consume = vi.fn();
  await expect(
    startWalletKeyApproval(account, 'mainnet', new AbortController().signal, consume).result,
  ).rejects.toThrow('temporary wallet grant');
  expect(consume).not.toHaveBeenCalled();
  expect(grant.key.every((n) => n === 0)).toBe(true);
  expect(grant.free).toHaveBeenCalledOnce();
});
