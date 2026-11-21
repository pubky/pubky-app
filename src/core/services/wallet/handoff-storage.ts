import type { Network } from '@beignet/wallet-core';
import { bytesToHex } from '@noble/hashes/utils';
import type { Path, Session, SessionStorage } from '@synonymdev/pubky';
import { z } from 'zod';
import { APP_PRIVATE_PATH } from '@/config/app-files';
import { HomeserverService } from '@/services/homeserver/homeserver';

export class RingEnrollmentError extends Error {}

const chunkBytes = 2 * 1024 * 1024;
const maxEnvelopeBytes = 256 * 1024 * 1024 + 64 * 1024;
const digest = z.string().regex(/^[0-9a-f]{64}$/);
export const handoffManifest = z
  .strictObject({
    bytes: z.number().int().min(1).max(maxEnvelopeBytes),
    chunks: z
      .array(digest)
      .min(1)
      .max(Math.ceil(maxEnvelopeBytes / chunkBytes)),
  })
  .refine((manifest) => manifest.chunks.length === Math.ceil(manifest.bytes / chunkBytes));

export type HandoffProgress = (completedBytes: number, totalBytes: number) => void;

type Manifest = z.infer<typeof handoffManifest>;
type Storage = {
  session: Session;
  storage: SessionStorage;
  network: Network;
  transferId: string;
  assertActive: () => void;
};

function chunkPath({ network, transferId }: Storage, index: number, hash: string) {
  return `${APP_PRIVATE_PATH}wallet/${network}/handoffs/${transferId}/${index}-${hash}.bin` as const;
}

const invalid = () => new RingEnrollmentError('The private wallet transfer is incomplete or invalid.');

/** Bound the actual stream even if the homeserver omits or misreports Content-Length. */
export async function readBoundedFile(storage: SessionStorage, path: Path, limit: number, exact = false) {
  const response = await storage.get(path);
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  try {
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw invalid();
    const buffer = new Uint8Array(limit);
    let used = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.length > limit - used) throw invalid();
      buffer.set(value, used);
      used += value.length;
    }
    if (exact && used !== limit) throw invalid();
    return buffer.subarray(0, used);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function hashChunk(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function readChunk(ctx: Storage, index: number, hash: string, size: number) {
  ctx.assertActive();
  const chunk = await readBoundedFile(ctx.storage, chunkPath(ctx, index, hash), size, true);
  ctx.assertActive();
  if ((await hashChunk(chunk)) !== hash) throw invalid();
  return chunk;
}

/** Journal every possible path before the first PUT, including a PUT whose reply might be lost. */
export async function describeHandoff(envelope: Uint8Array, assertActive: () => void): Promise<Manifest> {
  if (!(envelope instanceof Uint8Array) || !envelope.length || envelope.length > maxEnvelopeBytes) throw invalid();
  const manifest: Manifest = { bytes: envelope.length, chunks: [] };
  for (let offset = 0; offset < envelope.length; offset += chunkBytes) {
    assertActive();
    // Native async hashing gives the browser time to render and renew the lease.
    manifest.chunks.push(await hashChunk(envelope.slice(offset, offset + chunkBytes)));
  }
  return manifest;
}

export async function uploadHandoff(
  ctx: Storage,
  envelope: Uint8Array,
  manifest: Manifest,
  progress?: HandoffProgress,
) {
  for (const [index, hash] of manifest.chunks.entries()) {
    ctx.assertActive();
    const offset = index * chunkBytes;
    const chunk = envelope.slice(offset, offset + chunkBytes);
    const path = chunkPath(ctx, index, hash);
    // Both the path and the immutable body are derived from this exact chunk.
    await HomeserverService.writeHandoffChunk(ctx.session, ctx.storage, path, chunk, ctx.assertActive);
    await readChunk(ctx, index, hash, chunk.length);
    progress?.(offset + chunk.length, envelope.length);
  }
}

export async function downloadHandoff(ctx: Storage, manifest: Manifest, progress?: HandoffProgress) {
  const envelope = new Uint8Array(manifest.bytes);
  for (const [index, hash] of manifest.chunks.entries()) {
    const offset = index * chunkBytes;
    const size = Math.min(chunkBytes, envelope.length - offset);
    envelope.set(await readChunk(ctx, index, hash, size), offset);
    progress?.(offset + size, envelope.length);
  }
  return envelope;
}

/** Only retire chunks after observing the committed marker that no longer references them. */
export async function retireHandoff(ctx: Storage, manifest: Manifest) {
  const batchSize = 4;
  let complete = true;
  for (let offset = 0; offset < manifest.chunks.length; offset += batchSize) {
    ctx.assertActive();
    const batch = manifest.chunks.slice(offset, offset + batchSize);
    // A transient failure on one retired path must not strand all later paths.
    const results = await Promise.allSettled(
      batch.map((hash, i) =>
        HomeserverService.writeHandoffChunk(
          ctx.session,
          ctx.storage,
          chunkPath(ctx, offset + i, hash),
          null,
          ctx.assertActive,
        ),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected' && !missingChunk.safeParse(result.reason).success) complete = false;
    }
  }
  ctx.assertActive();
  return complete;
}

const missingChunk = z.object({
  name: z.literal('RequestError'),
  data: z.object({ reason: z.literal('Http'), statusCode: z.union([z.literal(404), z.literal(410)]) }),
});
