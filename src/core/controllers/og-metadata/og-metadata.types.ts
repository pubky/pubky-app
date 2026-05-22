import type { TOgMetadataResult } from '@/application/og-metadata/og-metadata.types';
import { HttpStatusCode } from '@/libs/http/http.types';

export type TOgMetadataControllerResult =
  | { ok: true; metadata: TOgMetadataResult }
  | { ok: false; message: string; statusCode: HttpStatusCode.BAD_REQUEST };
