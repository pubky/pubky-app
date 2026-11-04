/**
 * Client-side Pubchi export/import. Hashes the exact UTF-8 document body
 * stored under `/pub/app.pubchi/v1/`. Does not read or write `/priv/`.
 */
import { parsePubchiBotV1 } from '@/libs/pubchi/schemas/bot';
import { canonicalJson, sha256Hex } from '@/libs/pubchi/schemas/canonical';
import { err, ok, type ParseResult } from '@/libs/pubchi/schemas/codes';
import { parsePubchiConfigV1 } from '@/libs/pubchi/schemas/config';
import { parseDeviceDelegationV1 } from '@/libs/pubchi/schemas/delegation';
import { parsePubchiDocumentText, validatePubchiDocumentSize } from '@/libs/pubchi/schemas/document';
import { parseFeedProposal } from '@/libs/pubchi/schemas/feed';
import { scanForbiddenPublicState } from '@/libs/pubchi/schemas/forbidden';
import { type ManifestV1, parseManifestV1 } from '@/libs/pubchi/schemas/manifest';
import { isAllowlistedPath, PATHS } from '@/libs/pubchi/schemas/paths';
import { parseRequestBindingV1, parseRequestObjectV1 } from '@/libs/pubchi/schemas/request';
import { parseOwnerBindingV1 } from '@/libs/pubchi/schemas/tenant';

export const EXPORT_BUNDLE_SCHEMA = 'pubchi-export-bundle' as const;
export const PUBCHI_PUBLIC_ROOT = '/pub/app.pubchi/v1/' as const;

const HISTORY_PREFIXES = [
  '/pub/app.pubchi/v1/requests/',
  '/pub/app.pubchi/v1/suggestions/',
  '/pub/app.pubchi/v1/runs/',
] as const;

export const PUBLIC_LIST_DIRECTORIES = [
  PUBCHI_PUBLIC_ROOT,
  '/pub/app.pubchi/v1/feeds/',
  '/pub/app.pubchi/v1/bots/',
  '/pub/app.pubchi/v1/devices/',
  '/pub/app.pubchi/v1/cursors/',
  '/pub/app.pubchi/v1/follower-snapshots/',
  '/pub/app.pubchi/v1/requests/',
  '/pub/app.pubchi/v1/suggestions/',
  '/pub/app.pubchi/v1/runs/',
] as const;

export type PortableDocument = {
  path: string;
  body: string;
};

export type PubchiExportBundleV1 = {
  schema: typeof EXPORT_BUNDLE_SCHEMA;
  version: 1;
  bot: string;
  owner: string;
  exported_at: number;
  include_history: boolean;
  manifest: ManifestV1;
  objects: Record<string, string>;
};

export type ImportDiffEntry = {
  path: string;
  status: 'add' | 'change' | 'unchanged' | 'missing-from-bundle';
};

export type PubchiImportPlan = {
  bot: string;
  owner: string;
  include_history: boolean;
  diff: ImportDiffEntry[];
  hashes: Record<string, string>;
};

export type ReconstructedFeed = {
  path: string;
  name: string;
  tags: string[];
  canApply: boolean;
};

export function isHistoryPath(path: string): boolean {
  return HISTORY_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function isPortableByDefault(path: string): boolean {
  return isAllowlistedPath(path) && !isHistoryPath(path);
}

export function publicListDirectories(includeHistory: boolean): readonly string[] {
  return PUBLIC_LIST_DIRECTORIES.filter((directory) => includeHistory || !isHistoryPath(directory));
}

export function utf8ByteLength(body: string): number {
  return new TextEncoder().encode(body).byteLength;
}

export async function hashDocumentBody(body: string): Promise<string> {
  return sha256Hex(body);
}

export function pathFromOwnedUrl(url: string, owner: string): string | undefined {
  const prefix = `pubky://${owner}`;
  if (!url.startsWith(prefix)) return undefined;
  const path = url.slice(prefix.length);
  return path.startsWith('/pub/app.pubchi/v1/') ? path : undefined;
}

export function validatePortableDocument(
  path: string,
  body: string,
  expected: { bot: string; owner: string },
  includeHistory: boolean,
): ParseResult<{ schema: string; version: number }> {
  if (path.startsWith('/priv/') || path.includes('/priv/')) return err('PATH_FORBIDDEN');
  if (!isAllowlistedPath(path)) return err('PATH_FORBIDDEN');
  if (isHistoryPath(path) && !includeHistory) return err('PATH_FORBIDDEN');
  const size = validatePubchiDocumentSize(body);
  if (!size.ok) return size;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return err('SCHEMA_INVALID');
  }
  const forbidden = scanForbiddenPublicState(value);
  if (!forbidden.ok) return forbidden;
  const parsed = parsePortableValue(path, value);
  if (!parsed.ok) return parsed;
  const envelope = parsed.value as { schema?: unknown; version?: unknown; bot?: unknown; owner?: unknown };
  if (typeof envelope.schema !== 'string' || !/^pubchi-[a-z0-9-]+$/.test(envelope.schema)) {
    return err('SCHEMA_INVALID');
  }
  if (envelope.version !== 1 && envelope.version !== 2) return err('VERSION_UNSUPPORTED');
  if (typeof envelope.bot === 'string' && envelope.bot !== expected.bot) return err('BOT_MISMATCH');
  if (typeof envelope.owner === 'string' && envelope.owner !== expected.owner) return err('BOT_MISMATCH');
  return ok({ schema: envelope.schema, version: envelope.version });
}

function parsePortableValue(path: string, value: unknown): ParseResult<unknown> {
  if (path === PATHS.bot) return parsePubchiBotV1(value);
  if (path === PATHS.manifest) return parseManifestV1(value);
  if (path === PATHS.config) return parsePubchiConfigV1(value);
  if (path.startsWith('/pub/app.pubchi/v1/bots/')) return parseOwnerBindingV1(value);
  if (path.startsWith('/pub/app.pubchi/v1/devices/')) return parseDeviceDelegationV1(value);
  if (path.startsWith('/pub/app.pubchi/v1/feeds/')) return parseFeedProposal(value);
  if (path.startsWith('/pub/app.pubchi/v1/requests/')) {
    const binding = parseRequestBindingV1(value);
    return binding.ok ? binding : parseRequestObjectV1(value);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return err('SCHEMA_INVALID');
  const schema = (value as { schema?: unknown }).schema;
  if (typeof schema !== 'string' || !schema.startsWith('pubchi-')) return err('SCHEMA_INVALID');
  return ok(value);
}

export async function buildExportBundle(
  documents: readonly PortableDocument[],
  params: { bot: string; owner: string; exportedAt: number; includeHistory?: boolean },
): Promise<ParseResult<PubchiExportBundleV1>> {
  const includeHistory = Boolean(params.includeHistory);
  const objects: Record<string, string> = {};
  const entries: ManifestV1['objects'] = [];

  const sorted = [...documents].sort((left, right) => left.path.localeCompare(right.path));
  for (const document of sorted) {
    if (document.path === PATHS.manifest) continue;
    if (isHistoryPath(document.path) && !includeHistory) continue;
    const validated = validatePortableDocument(document.path, document.body, params, includeHistory);
    if (!validated.ok) return validated;
    const bytes = utf8ByteLength(document.body);
    const sha256 = await hashDocumentBody(document.body);
    objects[document.path] = document.body;
    entries.push({
      path: document.path,
      schema: validated.value.schema,
      version: 1,
      bytes,
      sha256,
    });
  }

  const manifest: ManifestV1 = {
    schema: 'pubchi-manifest',
    version: 1,
    bot: params.bot,
    owner: params.owner,
    updated_at: params.exportedAt,
    objects: entries,
  };
  const parsedManifest = parseManifestV1(manifest);
  if (!parsedManifest.ok) return parsedManifest;
  const manifestBody = canonicalJson(parsedManifest.value);
  objects[PATHS.manifest] = manifestBody;

  return ok({
    schema: EXPORT_BUNDLE_SCHEMA,
    version: 1,
    bot: params.bot,
    owner: params.owner,
    exported_at: params.exportedAt,
    include_history: includeHistory,
    manifest: parsedManifest.value,
    objects,
  });
}

export function serializeExportBundle(bundle: PubchiExportBundleV1): string {
  return canonicalJson(bundle);
}

export async function parseExportBundle(input: unknown): Promise<ParseResult<PubchiExportBundleV1>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return err('SCHEMA_INVALID');
  const record = input as Record<string, unknown>;
  if (record.schema !== EXPORT_BUNDLE_SCHEMA) return err('SCHEMA_INVALID');
  if (record.version !== 1) return err('VERSION_UNSUPPORTED');
  if (typeof record.bot !== 'string' || typeof record.owner !== 'string') return err('INVALID_PUBKY');
  if (typeof record.exported_at !== 'number' || !Number.isInteger(record.exported_at) || record.exported_at < 0) {
    return err('SCHEMA_INVALID');
  }
  if (typeof record.include_history !== 'boolean') return err('SCHEMA_INVALID');
  const parsedManifest = parseManifestV1(record.manifest);
  if (!parsedManifest.ok) return parsedManifest;
  if (parsedManifest.value.bot !== record.bot || parsedManifest.value.owner !== record.owner)
    return err('BOT_MISMATCH');
  if (record.objects === null || typeof record.objects !== 'object' || Array.isArray(record.objects)) {
    return err('SCHEMA_INVALID');
  }
  const objects: Record<string, string> = {};
  for (const [path, body] of Object.entries(record.objects as Record<string, unknown>)) {
    if (typeof body !== 'string') return err('SCHEMA_INVALID');
    objects[path] = body;
  }
  const bundle: PubchiExportBundleV1 = {
    schema: EXPORT_BUNDLE_SCHEMA,
    version: 1,
    bot: record.bot,
    owner: record.owner,
    exported_at: record.exported_at,
    include_history: record.include_history,
    manifest: parsedManifest.value,
    objects,
  };
  const hashes = await verifyBundleHashes(bundle);
  if (!hashes.ok) return hashes;
  return ok(bundle);
}

export async function verifyBundleHashes(bundle: PubchiExportBundleV1): Promise<ParseResult<Record<string, string>>> {
  const hashes: Record<string, string> = {};
  const expected = new Set(bundle.manifest.objects.map((entry) => entry.path));
  for (const path of Object.keys(bundle.objects)) {
    if (path === PATHS.manifest) continue;
    if (!expected.has(path)) return err('PATH_FORBIDDEN');
  }
  for (const entry of bundle.manifest.objects) {
    const body = bundle.objects[entry.path];
    if (body === undefined) return err('SCHEMA_INVALID');
    const validated = validatePortableDocument(
      entry.path,
      body,
      { bot: bundle.bot, owner: bundle.owner },
      bundle.include_history || isHistoryPath(entry.path),
    );
    if (!validated.ok) return validated;
    if (validated.value.schema !== entry.schema) return err('SCHEMA_INVALID');
    const bytes = utf8ByteLength(body);
    const sha256 = await hashDocumentBody(body);
    if (bytes !== entry.bytes || sha256 !== entry.sha256) return err('BODY_HASH_MISMATCH');
    hashes[entry.path] = sha256;
  }
  const manifestBody = bundle.objects[PATHS.manifest];
  if (manifestBody === undefined) return err('SCHEMA_INVALID');
  const manifestParsed = parsePubchiDocumentText(manifestBody, parseManifestV1);
  if (!manifestParsed.ok) return manifestParsed;
  hashes[PATHS.manifest] = await hashDocumentBody(manifestBody);
  return ok(hashes);
}

export async function planImport(params: {
  bundle: PubchiExportBundleV1;
  destinationOwner: string;
  destinationBot?: string | null;
  destinationBindingBot?: string | null;
  destinationBodies?: Record<string, string>;
}): Promise<ParseResult<PubchiImportPlan>> {
  if (params.destinationOwner !== params.bundle.owner) return err('BOT_MISMATCH');
  if (params.destinationBot && params.destinationBot !== params.bundle.bot) return err('BOT_MISMATCH');
  if (params.destinationBindingBot && params.destinationBindingBot !== params.bundle.bot) return err('BOT_MISMATCH');
  const hashes = await verifyBundleHashes(params.bundle);
  if (!hashes.ok) return hashes;
  const current = params.destinationBodies ?? {};
  const diff: ImportDiffEntry[] = [];
  const seen = new Set<string>();
  for (const entry of params.bundle.manifest.objects) {
    seen.add(entry.path);
    const existing = current[entry.path];
    if (existing === undefined) {
      diff.push({ path: entry.path, status: 'add' });
      continue;
    }
    diff.push({
      path: entry.path,
      status: existing === params.bundle.objects[entry.path] ? 'unchanged' : 'change',
    });
  }
  const manifestBody = params.bundle.objects[PATHS.manifest];
  if (manifestBody !== undefined) {
    const existing = current[PATHS.manifest];
    diff.push({
      path: PATHS.manifest,
      status: existing === undefined ? 'add' : existing === manifestBody ? 'unchanged' : 'change',
    });
    seen.add(PATHS.manifest);
  }
  for (const path of Object.keys(current)) {
    if (!seen.has(path) && isAllowlistedPath(path) && (params.bundle.include_history || !isHistoryPath(path))) {
      diff.push({ path, status: 'missing-from-bundle' });
    }
  }
  return ok({
    bot: params.bundle.bot,
    owner: params.bundle.owner,
    include_history: params.bundle.include_history,
    diff,
    hashes: hashes.value,
  });
}

export function reconstructFeedsFromBundle(bundle: PubchiExportBundleV1): ParseResult<ReconstructedFeed[]> {
  const feeds: ReconstructedFeed[] = [];
  for (const entry of bundle.manifest.objects) {
    if (!entry.path.startsWith('/pub/app.pubchi/v1/feeds/')) continue;
    const body = bundle.objects[entry.path];
    if (body === undefined) return err('SCHEMA_INVALID');
    const parsed = parsePubchiDocumentText(body, parseFeedProposal);
    if (!parsed.ok) return parsed;
    if (parsed.value.bot !== bundle.bot || parsed.value.owner !== bundle.owner) return err('BOT_MISMATCH');
    feeds.push({
      path: entry.path,
      name: parsed.value.feed.name,
      tags: parsed.value.feed.feed.tags ?? [],
      canApply: parsed.value.version === 1,
    });
  }
  return ok(feeds);
}

export function importWriteOrder(bundle: PubchiExportBundleV1): string[] {
  const paths = bundle.manifest.objects.map((entry) => entry.path);
  const rank = (path: string): number => {
    if (path === PATHS.bot) return 0;
    if (path.startsWith('/pub/app.pubchi/v1/bots/')) return 1;
    if (path === PATHS.config) return 2;
    if (path.startsWith('/pub/app.pubchi/v1/feeds/')) return 3;
    return 4;
  };
  return [...paths].sort((left, right) => rank(left) - rank(right) || left.localeCompare(right)).concat(PATHS.manifest);
}
