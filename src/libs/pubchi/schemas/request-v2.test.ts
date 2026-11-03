import { describe, expect, it } from 'vitest';
import vectors from './__fixtures__/request-v2-vectors.json';
import { bytesToHex, canonicalJson, hexToBytes } from './canonical';
import { verifyPubkySignature } from './ed25519';
import {
  parseRequestObjectV1,
  parseRequestObjectV2,
  type RequestObjectV2,
  signRequestObjectV2,
  unsignedBytesV2,
  type UnsignedRequestObjectV2,
} from './request';

const PKCS8_ED25519_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

async function vectorKey(): Promise<CryptoKey> {
  const seed = hexToBytes(vectors.seed_hex_test_only);
  if (!seed) throw new Error('Invalid test seed');
  const pkcs8 = new Uint8Array(PKCS8_ED25519_PREFIX.length + seed.length);
  pkcs8.set(PKCS8_ED25519_PREFIX);
  pkcs8.set(seed, PKCS8_ED25519_PREFIX.length);
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, ['sign']);
}

describe('RequestObjectV2 vectors', () => {
  it('reproduces canonical bytes and verifies every vector', async () => {
    for (const vector of vectors.vectors) {
      const parsedV2 = parseRequestObjectV2(vector.object);
      if (vector.expect === 'schema') {
        if (vector.name === 'plain v2 parsed as v1') {
          expect(parseRequestObjectV1(vector.object).ok).toBe(false);
        } else {
          expect(parsedV2.ok).toBe(false);
        }
        continue;
      }

      expect(parsedV2).toEqual({ ok: true, value: vector.object });
      const request = vector.object as RequestObjectV2;
      expect(bytesToHex(new TextEncoder().encode(canonicalJson(request)))).toBe(vector.canonical_hex);

      const { signature, ...unsigned } = request;
      const signatureBytes = hexToBytes(signature);
      expect(signatureBytes).not.toBeNull();
      const signer = request.signer ?? request.asker;
      expect(await verifyPubkySignature(signer, unsignedBytesV2(unsigned), signatureBytes!)).toBe(
        vector.expect === 'ok',
      );
    }
  });

  it('signs the plain vector through the App signing path', async () => {
    const vector = vectors.vectors.find(({ name }) => name === 'plain v2');
    if (!vector || vector.expect !== 'ok') throw new Error('Missing plain v2 vector');
    const { signature, ...unsigned } = vector.object;
    expect((await signRequestObjectV2(unsigned as UnsignedRequestObjectV2, await vectorKey())).signature).toBe(
      signature,
    );
  });
});
