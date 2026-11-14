import { Keypair } from '@synonymdev/pubky';
import { describe, expect, it } from 'vitest';
import { generateDeviceKey } from '@/libs/pubchi/device-key';
import {
  type DeviceDelegationV1,
  parseDeviceDelegationV1,
  signDeviceDelegationV1,
  type UnsignedDeviceDelegationV1,
  verifyDeviceDelegationV1,
} from './delegation';

const NOW = 1_800_000_000;
const owner = Keypair.random().publicKey.z32();
const bot = Keypair.random().publicKey.z32();

async function signedDelegation(params: {
  signer: string;
  key: CryptoKey;
  purposes?: UnsignedDeviceDelegationV1['purposes'];
  expires_at?: number;
}): Promise<DeviceDelegationV1> {
  return signDeviceDelegationV1(
    {
      schema: 'pubchi-device-delegation',
      version: 1,
      owner,
      signer: params.signer,
      bot,
      purposes: params.purposes ?? ['who-tagged-me'],
      created_at: NOW,
      expires_at: params.expires_at ?? NOW + 86_400,
    },
    params.key,
  );
}

describe('DeviceDelegationV1 fail-closed validation', () => {
  it('rejects an expired delegation', async () => {
    const device = await generateDeviceKey();
    const value = await signedDelegation({ signer: device.signer, key: device.key, expires_at: NOW + 1 });
    expect(parseDeviceDelegationV1(value).ok).toBe(true);
    await expect(verifyDeviceDelegationV1(value, owner, device.signer, bot, 'who-tagged-me', NOW + 2)).resolves.toEqual(
      {
        ok: false,
        code: 'REQUEST_EXPIRED',
      },
    );
  });

  it('rejects a delegation that does not grant the requested purpose', async () => {
    const device = await generateDeviceKey();
    const value = await signedDelegation({
      signer: device.signer,
      key: device.key,
      purposes: ['who-tagged-me'],
    });
    await expect(verifyDeviceDelegationV1(value, owner, device.signer, bot, 'summarize', NOW + 1)).resolves.toEqual({
      ok: false,
      code: 'PATH_FORBIDDEN',
    });
  });

  it('rejects a delegation whose signer is not the device that signed it', async () => {
    const device = await generateDeviceKey();
    const other = await generateDeviceKey();
    const value = await signedDelegation({ signer: device.signer, key: device.key });
    expect(parseDeviceDelegationV1(value).ok).toBe(true);
    await expect(verifyDeviceDelegationV1(value, owner, other.signer, bot, 'who-tagged-me', NOW + 1)).resolves.toEqual({
      ok: false,
      code: 'INVALID_PUBKY',
    });
  });

  it('accepts a live self-signed delegation for a granted purpose', async () => {
    const device = await generateDeviceKey();
    const value = await signedDelegation({ signer: device.signer, key: device.key });
    await expect(verifyDeviceDelegationV1(value, owner, device.signer, bot, 'who-tagged-me', NOW + 1)).resolves.toEqual(
      {
        ok: true,
        value,
      },
    );
  });

  it('accepts legacy delegations through 30 days and rejects older ones', async () => {
    const device = await generateDeviceKey();
    const withinLegacyWindow = await signedDelegation({
      signer: device.signer,
      key: device.key,
      expires_at: NOW + 30 * 24 * 60 * 60,
    });
    const beyondLegacyWindow = await signedDelegation({
      signer: device.signer,
      key: device.key,
      expires_at: NOW + 30 * 24 * 60 * 60 + 1,
    });

    expect(parseDeviceDelegationV1(withinLegacyWindow).ok).toBe(true);
    expect(parseDeviceDelegationV1(beyondLegacyWindow)).toEqual({ ok: false, code: 'SCHEMA_INVALID' });
  });
});
