import { z } from 'zod';
import { signWithDeviceKey } from '@/libs/pubchi/device-key';
import { canonicalJson, hexToBytes } from './canonical';
import { err, ok, type ParseResult } from './codes';
import { verifyPubkySignature } from './ed25519';
import { PHASE0_PURPOSES } from './request';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

export const DEVICE_DELEGATION_MAX_SECONDS = 7 * 24 * 60 * 60;
const LEGACY_DEVICE_DELEGATION_MAX_SECONDS = 30 * 24 * 60 * 60;

const UnsignedDeviceDelegationV1Schema = z
  .object({
    schema: z.literal('pubchi-device-delegation'),
    version: zVersion1,
    owner: zPubky,
    signer: zPubky,
    bot: zPubky,
    purposes: z.array(z.enum(PHASE0_PURPOSES)).min(1).max(PHASE0_PURPOSES.length),
    created_at: zUnix,
    expires_at: zUnix,
  })
  .strict();

export const DeviceDelegationV1Schema = UnsignedDeviceDelegationV1Schema.extend({
  signature: z.string().regex(/^[0-9a-f]{128}$/),
}).strict();

export type UnsignedDeviceDelegationV1 = z.infer<typeof UnsignedDeviceDelegationV1Schema>;
export type DeviceDelegationV1 = z.infer<typeof DeviceDelegationV1Schema>;

export function delegationPath(signer: string): string {
  return `/pub/app.pubchi/v1/devices/${signer}.json`;
}

export function delegationUri(owner: string, signer: string): string {
  return `pubky://${owner}${delegationPath(signer)}`;
}

export function parseDeviceDelegationV1(input: unknown): ParseResult<DeviceDelegationV1> {
  const parsed = fromZod(DeviceDelegationV1Schema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (
    value.expires_at <= value.created_at ||
    value.expires_at - value.created_at > LEGACY_DEVICE_DELEGATION_MAX_SECONDS
  ) {
    return err('SCHEMA_INVALID');
  }
  if (new Set(value.purposes).size !== value.purposes.length) return err('SCHEMA_INVALID');
  return ok(value);
}

export function unsignedDelegationBytes(unsigned: UnsignedDeviceDelegationV1): Uint8Array {
  return new TextEncoder().encode(canonicalJson(unsigned));
}

export async function signDeviceDelegationV1(
  unsigned: UnsignedDeviceDelegationV1,
  key: CryptoKey,
): Promise<DeviceDelegationV1> {
  return { ...unsigned, signature: await signWithDeviceKey(key, unsignedDelegationBytes(unsigned)) };
}

export async function verifyDeviceDelegationV1(
  delegation: DeviceDelegationV1,
  owner: string,
  signer: string,
  bot: string,
  purpose: (typeof PHASE0_PURPOSES)[number],
  now: number,
): Promise<ParseResult<DeviceDelegationV1>> {
  const parsed = parseDeviceDelegationV1(delegation);
  if (!parsed.ok) return parsed;
  if (parsed.value.owner !== owner || parsed.value.signer !== signer || parsed.value.bot !== bot) {
    return err('INVALID_PUBKY');
  }
  if (now > parsed.value.expires_at) return err('REQUEST_EXPIRED');
  if (!parsed.value.purposes.includes(purpose)) return err('PATH_FORBIDDEN');
  const { signature, ...unsigned } = parsed.value;
  const bytes = hexToBytes(signature);
  if (!bytes || !(await verifyPubkySignature(signer, unsignedDelegationBytes(unsigned), bytes))) {
    return err('SIGNATURE_INVALID');
  }
  return ok(parsed.value);
}
