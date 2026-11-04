/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts.
 *
 * Browser-safe adaptation: `signRequestObjectV1` / `verifyRequestObjectV1` are
 * async because Web Crypto Ed25519 and SHA-256 are async.
 */

import { z } from 'zod';
import { signWithDeviceKey } from '@/libs/pubchi/device-key';
import { bodySha256, canonicalJson, hexToBytes, SHA256_HEX_RE } from './canonical';
import { err, ok, type ParseResult } from './codes';
import { verifyPubkySignature } from './ed25519';
import type { NonceStore } from './nonce';
import type { TenantV1 } from './tenant';
import { fromZod, zPubky, zSha256, zUnix, zVersion1, zVersion2 } from './zod';

export const REQUEST_TTL_SECONDS = 600;
export const CLOCK_SKEW_SECONDS = 60;

export const PHASE0_PURPOSES = ['ask', 'who-tagged-me', 'build-feed', 'what-i-missed', 'summarize'] as const;
export type Phase0Purpose = (typeof PHASE0_PURPOSES)[number];

const UnsignedRequestObjectV1Schema = z
  .object({
    schema: z.literal('pubchi-request-object'),
    version: zVersion1,
    asker: zPubky,
    signer: zPubky.optional(),
    bot: zPubky,
    purpose: z.enum(PHASE0_PURPOSES),
    body_sha256: zSha256,
    issued_at: zUnix,
    expires_at: zUnix,
    nonce: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const RequestObjectV1Schema = UnsignedRequestObjectV1Schema.extend({
  signature: z.string().regex(/^[0-9a-f]{128}$/),
}).strict();

export type UnsignedRequestObjectV1 = z.infer<typeof UnsignedRequestObjectV1Schema>;
export type RequestObjectV1 = z.infer<typeof RequestObjectV1Schema>;

export function parseRequestObjectV1(input: unknown): ParseResult<RequestObjectV1> {
  return fromZod(RequestObjectV1Schema, input);
}

const OwnerContextV2Schema = z
  .object({
    about: z.string().optional(),
    instructions: z.string().optional(),
  })
  .strict();

const UnsignedRequestObjectV2Schema = z
  .object({
    schema: z.literal('pubchi-request-object-v2'),
    version: zVersion2,
    audience: z.string().min(1),
    asker: zPubky,
    signer: zPubky.optional(),
    bot: zPubky,
    key_generation: z.number().int().min(1),
    purpose: z.enum(['ask', 'who-tagged-me', 'build-feed']),
    body_sha256: zSha256,
    issued_at: zUnix,
    expires_at: zUnix,
    nonce: z.string().regex(/^[0-9a-f]{64}$/),
    context: OwnerContextV2Schema.optional(),
  })
  .strict();

export const RequestObjectV2Schema = UnsignedRequestObjectV2Schema.extend({
  signature: z.string().regex(/^[0-9a-f]{128}$/),
}).strict();

export type OwnerContextV2 = z.infer<typeof OwnerContextV2Schema>;
export type UnsignedRequestObjectV2 = z.infer<typeof UnsignedRequestObjectV2Schema>;
export type RequestObjectV2 = z.infer<typeof RequestObjectV2Schema>;

export function parseRequestObjectV2(input: unknown): ParseResult<RequestObjectV2> {
  return fromZod(RequestObjectV2Schema, input);
}

export const RequestBindingV1Schema = z
  .object({
    schema: z.literal('pubchi-request'),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    updated_at: zUnix,
    request_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    body_sha256: zSha256,
    capability: z.enum(PHASE0_PURPOSES),
    expires_at: zUnix,
  })
  .strict();

export type RequestBindingV1 = z.infer<typeof RequestBindingV1Schema>;

export function parseRequestBindingV1(input: unknown): ParseResult<RequestBindingV1> {
  return fromZod(RequestBindingV1Schema, input);
}

export function unsignedBytes(unsigned: UnsignedRequestObjectV1): Uint8Array {
  return new TextEncoder().encode(canonicalJson(unsigned));
}

export async function signRequestObjectV1(unsigned: UnsignedRequestObjectV1, key: CryptoKey): Promise<RequestObjectV1> {
  const signature = await signWithDeviceKey(key, unsignedBytes(unsigned));
  return { ...unsigned, signature };
}

export function unsignedBytesV2(unsigned: UnsignedRequestObjectV2): Uint8Array {
  return new TextEncoder().encode(canonicalJson(unsigned));
}

export async function signRequestObjectV2(unsigned: UnsignedRequestObjectV2, key: CryptoKey): Promise<RequestObjectV2> {
  const signature = await signWithDeviceKey(key, unsignedBytesV2(unsigned));
  return { ...unsigned, signature };
}

export type VerifyRequestInput = {
  request: unknown;
  tenant: TenantV1;
  body: unknown;
  now: number;
  nonces: NonceStore;
};

export type VerifySignedRequestInput = {
  request: unknown;
  body: unknown;
  now: number;
  nonces: NonceStore;
  consumeNonce?: boolean;
};

export type VerifiedRequest = {
  request: RequestObjectV1;
  tenant: TenantV1;
};

async function verifyRequestSignatureV1(input: {
  request: unknown;
  body: unknown;
  now: number;
}): Promise<ParseResult<RequestObjectV1>> {
  const parsed = parseRequestObjectV1(input.request);
  if (!parsed.ok) return parsed;
  const request = parsed.value;

  if (request.expires_at <= request.issued_at) return err('REQUEST_MALFORMED');
  if (request.expires_at - request.issued_at > REQUEST_TTL_SECONDS) return err('REQUEST_MALFORMED');

  if (request.issued_at > input.now + CLOCK_SKEW_SECONDS) return err('CLOCK_SKEW');
  if (input.now > request.expires_at + CLOCK_SKEW_SECONDS) return err('REQUEST_EXPIRED');

  const { signature, ...unsigned } = request;
  const sig = hexToBytes(signature);
  if (!sig || !(await verifyPubkySignature(request.signer ?? request.asker, unsignedBytes(unsigned), sig))) {
    return err('SIGNATURE_INVALID');
  }

  if (!SHA256_HEX_RE.test(request.body_sha256) || request.body_sha256 !== (await bodySha256(input.body))) {
    return err('BODY_HASH_MISMATCH');
  }

  return ok(request);
}

/**
 * Parse, expiry, signature, body hash, and nonce consume — no tenant.
 * Phase 0 HTTP uses this before homeserver resolution so an unsigned POST
 * cannot force outbound DHT/GET work.
 */
export async function verifySignedRequestObjectV1(
  input: VerifySignedRequestInput,
): Promise<ParseResult<RequestObjectV1>> {
  const signed = await verifyRequestSignatureV1(input);
  if (!signed.ok) return signed;
  if (input.consumeNonce !== false) {
    const first = await input.nonces.consume(signed.value.bot, signed.value.nonce, signed.value.expires_at);
    if (!first) return err('NONCE_REPLAY');
  }
  return signed;
}

export async function verifyRequestObjectV1(input: VerifyRequestInput): Promise<ParseResult<VerifiedRequest>> {
  const signed = await verifyRequestSignatureV1(input);
  if (!signed.ok) return signed;
  const request = signed.value;

  if (request.asker !== input.tenant.owner) return err('ASKER_MISMATCH');
  if (request.bot !== input.tenant.bot) return err('BOT_MISMATCH');
  // Fail closed: this verifier has no DeviceDelegationV1. A self-consistent
  // device signature is not authorization — reject before nonce consume.
  if (request.signer !== undefined) return err('DELEGATION_INVALID');

  const first = await input.nonces.consume(request.bot, request.nonce, request.expires_at);
  if (!first) return err('NONCE_REPLAY');

  return ok({ request, tenant: input.tenant });
}
