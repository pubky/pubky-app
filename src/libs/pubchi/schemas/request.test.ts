import { Keypair } from '@synonymdev/pubky';
import { describe, expect, it } from 'vitest';
import { generateDeviceKey } from '@/libs/pubchi/device-key';
import { bodySha256, hexToBytes } from './canonical';
import { signDeviceDelegationV1, type UnsignedDeviceDelegationV1, verifyDeviceDelegationV1 } from './delegation';
import { verifyPubkySignature } from './ed25519';
import { MemoryNonceStore } from './nonce';
import {
  signRequestObjectV1,
  unsignedBytes,
  type UnsignedRequestObjectV1,
  verifyRequestObjectV1,
  verifySignedRequestObjectV1,
} from './request';
import { PHASE0_BRAIN, PHASE0_BUDGETS, PHASE0_TIER } from './tenant';

const NOW = 1_800_000_000;
const BODY = { question: 'Who tagged me?' };

async function unsignedFor(asker: string, bot: string, signer?: string): Promise<UnsignedRequestObjectV1> {
  const base: UnsignedRequestObjectV1 = {
    schema: 'pubchi-request-object',
    version: 1,
    asker,
    bot,
    purpose: 'who-tagged-me',
    body_sha256: await bodySha256(BODY),
    issued_at: NOW,
    expires_at: NOW + 600,
    nonce: '11'.repeat(32),
  };
  return signer ? { ...base, signer } : base;
}

function tenant(owner: string, bot: string) {
  return {
    schema: 'pubchi-tenant' as const,
    version: 1 as const,
    bot,
    owner,
    tier: PHASE0_TIER,
    brain: PHASE0_BRAIN,
    budgets: PHASE0_BUDGETS,
    created_at: NOW,
    updated_at: NOW,
  };
}

describe('verifyRequestObjectV1 device signer', () => {
  it('verifies a device-signed request under the device key and not the owner key', async () => {
    const owner = Keypair.random().publicKey.z32();
    const bot = Keypair.random().publicKey.z32();
    const device = await generateDeviceKey();
    const request = await signRequestObjectV1(await unsignedFor(owner, bot, device.signer), device.key);
    const { signature, ...unsigned } = request;
    const message = unsignedBytes(unsigned);
    const sig = hexToBytes(signature);
    expect(sig).not.toBeNull();
    expect(await verifyPubkySignature(device.signer, message, sig!)).toBe(true);
    expect(await verifyPubkySignature(owner, message, sig!)).toBe(false);

    const signed = await verifySignedRequestObjectV1({
      request,
      body: BODY,
      now: NOW + 1,
      nonces: new MemoryNonceStore(),
    });
    expect(signed).toEqual({ ok: true, value: request });

    const rootOnly = await verifyRequestObjectV1({
      request,
      tenant: tenant(owner, bot),
      body: BODY,
      now: NOW + 1,
      nonces: new MemoryNonceStore(),
    });
    expect(rootOnly).toEqual({ ok: false, code: 'DELEGATION_INVALID' });
  });

  it('reaches ASKER_MISMATCH on a signer-bearing request whose asker is not the tenant owner', async () => {
    const owner = Keypair.random().publicKey.z32();
    const other = Keypair.random().publicKey.z32();
    const bot = Keypair.random().publicKey.z32();
    const device = await generateDeviceKey();
    const request = await signRequestObjectV1(await unsignedFor(other, bot, device.signer), device.key);
    const verified = await verifyRequestObjectV1({
      request,
      tenant: tenant(owner, bot),
      body: BODY,
      now: NOW + 1,
      nonces: new MemoryNonceStore(),
    });
    expect(verified).toEqual({ ok: false, code: 'ASKER_MISMATCH' });
  });

  it('rejects a request whose signer is not the stored device key', async () => {
    const ownerKey = await generateDeviceKey();
    const stored = await generateDeviceKey();
    const bot = Keypair.random().publicKey.z32();
    const request = await signRequestObjectV1(await unsignedFor(ownerKey.signer, bot, stored.signer), ownerKey.key);
    expect(request.signer).toBe(stored.signer);
    expect(request.signer).not.toBe(ownerKey.signer);
    const verified = await verifySignedRequestObjectV1({
      request,
      body: BODY,
      now: NOW + 1,
      nonces: new MemoryNonceStore(),
    });
    expect(verified).toEqual({ ok: false, code: 'SIGNATURE_INVALID' });
  });

  it('does not treat a self-consistent device signature as authorization without a matching delegation', async () => {
    const owner = Keypair.random().publicKey.z32();
    const bot = Keypair.random().publicKey.z32();
    const delegated = await generateDeviceKey();
    const attacker = await generateDeviceKey();
    const unsignedDelegation: UnsignedDeviceDelegationV1 = {
      schema: 'pubchi-device-delegation',
      version: 1,
      owner,
      signer: delegated.signer,
      bot,
      purposes: ['who-tagged-me'],
      created_at: NOW,
      expires_at: NOW + 86_400,
    };
    const delegation = await signDeviceDelegationV1(unsignedDelegation, delegated.key);
    const request = await signRequestObjectV1(await unsignedFor(owner, bot, attacker.signer), attacker.key);

    const selfConsistent = await verifySignedRequestObjectV1({
      request,
      body: BODY,
      now: NOW + 1,
      nonces: new MemoryNonceStore(),
    });
    expect(selfConsistent).toEqual({ ok: true, value: request });

    await expect(
      verifyDeviceDelegationV1(delegation, owner, request.signer!, bot, 'who-tagged-me', NOW + 1),
    ).resolves.toEqual({ ok: false, code: 'INVALID_PUBKY' });

    await expect(
      verifyRequestObjectV1({
        request,
        tenant: tenant(owner, bot),
        body: BODY,
        now: NOW + 1,
        nonces: new MemoryNonceStore(),
      }),
    ).resolves.toEqual({ ok: false, code: 'DELEGATION_INVALID' });
  });
});
