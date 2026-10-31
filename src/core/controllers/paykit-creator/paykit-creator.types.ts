import type { HttpStatusCode } from '@/libs/http/http.types';

export type TPaykitCreatorControllerResult =
  { ok: true; held: boolean } | { ok: false; message: string; statusCode: HttpStatusCode.BAD_REQUEST };
