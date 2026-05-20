import type { TOgMetadataFetchOutcome } from '@/application/og-metadata/og-metadata.types';
import { HttpStatusCode } from '@/libs/http/http.types';

export type TOgMetadataControllerResult =
  | { ok: true; outcome: TOgMetadataFetchOutcome }
  | { ok: false; message: string; statusCode: HttpStatusCode.BAD_REQUEST };
