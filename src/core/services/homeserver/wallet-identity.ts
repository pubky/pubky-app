import type { Network } from '@beignet/wallet-core';
import { AuthFlowKind, GrantAuthFlow, type Session } from '@synonymdev/pubky';
import { getDefaultHttpRelay } from '@/config/network';
import { useAuthStore } from '@/stores/auth/auth.store';

export type WalletKeyConsumer = (key: Uint8Array, assertCurrent: () => void) => Promise<void>;

export class WalletKeyApprovalError extends Error {}

export function walletIdentityScope(network: Network) {
  if (network !== 'mainnet' && network !== 'testnet' && network !== 'regtest') {
    throw new WalletKeyApprovalError('Unknown wallet network.');
  }
  return `/priv/pubky-wallet/v1/${network}/wallet-key` as const;
}

export function localWalletUnlockScope(network: Network, deviceId: string) {
  walletIdentityScope(network);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(deviceId))
    throw new WalletKeyApprovalError('Invalid wallet unlock device.');
  return `/priv/pubky-wallet/v1/${network}/devices/${deviceId}/unlock` as const;
}

function accountGuard(account: string, signal: AbortSignal) {
  const initial = useAuthStore.getState();
  const session = initial.session;
  const generation = initial.generation;
  if (!session || accountFor(session) !== account)
    throw new WalletKeyApprovalError('Sign in to the expected Pubky account first.');
  return () => {
    const current = useAuthStore.getState();
    if (
      signal.aborted ||
      current.session !== session ||
      current.currentUserPubky !== account ||
      current.generation !== generation ||
      current.isLoggingOut ||
      current.needsAccountSync
    ) {
      throw new WalletKeyApprovalError('The wallet approval ended. Start again from your signed-in account.');
    }
  };
}

function accountFor(session: Session) {
  const info = session.info;
  try {
    const publicKey = info.publicKey;
    try {
      return publicKey.z32();
    } finally {
      publicKey.free();
    }
  } finally {
    info.free();
  }
}

function approvedKey(session: Session, account: string, path: string) {
  if (accountFor(session) !== account) {
    throw new WalletKeyApprovalError('Ring approved a different Pubky identity. Select your signed-in identity.');
  }
  const info = session.info;
  try {
    if (info.capabilities.length !== 1 || info.capabilities[0] !== path + ':e')
      throw new WalletKeyApprovalError('Ring did not approve this exact wallet permission.');
  } finally {
    info.free();
  }
  const grant = session.grant;
  if (!grant) throw new WalletKeyApprovalError('This signer did not provide a signed wallet approval.');
  try {
    const keys = grant.encryptionKeys;
    if (!keys) throw new WalletKeyApprovalError('Use a Pubky Ring version that supports encryption-key approval.');
    try {
      if (keys.scopes.length !== 1 || keys.scopes[0] !== path) {
        throw new WalletKeyApprovalError('Ring did not approve this exact wallet scope.');
      }
      const key = keys.deriveForPath(path);
      if (key.length === 32) return key;
      key.fill(0);
      throw new WalletKeyApprovalError('Ring returned an invalid wallet key.');
    } finally {
      keys.free();
    }
  } finally {
    grant.free();
  }
}

/** This grant is separate from social sign-in. Neither the flow nor its approval is saved anywhere. */
export function startWalletKeyApproval(
  account: string,
  network: Network,
  signal: AbortSignal,
  consume: WalletKeyConsumer,
  localDeviceId?: string,
) {
  const assertCurrent = accountGuard(account, signal);
  assertCurrent();
  const path =
    localDeviceId === undefined ? walletIdentityScope(network) : localWalletUnlockScope(network, localDeviceId);
  // The synchronous SDK API uses a fresh in-memory PoP key. Its delegated alternative writes a key to IndexedDB.
  const flow = GrantAuthFlow.start(`${path}:e`, AuthFlowKind.signin(), {
    clientId: window.location.host + '/wallet',
    relay: getDefaultHttpRelay(),
    approvalFormat: 'signedApprovalV1',
  });
  const authorizationUrl = flow.authorizationUrl;
  const result = (async () => {
    let session: Session | undefined;
    let key: Uint8Array | undefined;
    try {
      const expires = Date.now() + 5 * 60_000;
      while (!session) {
        assertCurrent();
        if (Date.now() >= expires)
          throw new WalletKeyApprovalError('The wallet approval expired. Start a new request.');
        session = await flow.tryPollOnce();
        if (!session) await new Promise<void>((done) => setTimeout(done, 200));
      }
      try {
        assertCurrent();
        key = approvedKey(session, account, path);
      } finally {
        // Also retire a mismatched identity or an approval delivered after cancellation.
        await session.signout().catch(() => {
          throw new WalletKeyApprovalError(
            'Could not close the temporary wallet grant. Check active apps in Pubky Ring.',
          );
        });
      }
      assertCurrent();
      await consume(key, assertCurrent);
    } finally {
      if (key?.byteLength) key.fill(0);
      session?.free();
      flow.free();
    }
  })();
  return { authorizationUrl, result };
}
