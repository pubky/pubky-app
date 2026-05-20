import type { TOgMetadataFetchOutcome } from '@/application/og-metadata/og-metadata.types';

export type TOgMetadataControllerResult =
  | { ok: true; outcome: TOgMetadataFetchOutcome }
  | { ok: false; message: string; statusCode: 400 };
