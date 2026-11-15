/**
 * App-open suggestion object written under U at
 * `/pub/app.pubchi/v1/suggestions/<id>.json`.
 *
 * Shape from pubchi-design.md "Background suggestions" (read-only/assisted App
 * write; hosted background remains out for v1). Closed fields. No prompt text,
 * draft, private input, or raw tool output.
 */

import { z } from 'zod';
import { isCanonicalPublicEvidenceUri, type PubchiAnswerV1 } from './answer';
import { err, ok, type ParseResult } from './codes';
import { scanForbiddenPublicState } from './forbidden';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

export const PUBCHI_SUGGESTION_KIND = 'what-i-missed' as const;
export const PUBCHI_SUGGESTION_TITLE_MAX = 80;
export const PUBCHI_SUGGESTION_SUMMARY_MAX = 1200;
export const PUBCHI_SUGGESTION_SOURCE_MAX = 50;
export const PUBCHI_SUGGESTION_TTL_SECONDS = 7 * 24 * 60 * 60;

const SUGGESTION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isPubkyAppResourceUri(uri: string): boolean {
  if (!isCanonicalPublicEvidenceUri(uri)) return false;
  const pathStart = uri.indexOf('/', 'pubky://'.length);
  return pathStart >= 0 && uri.slice(pathStart).startsWith('/pub/pubky.app/');
}

const SourceUriSchema = z
  .string()
  .max(512)
  .refine(isPubkyAppResourceUri, 'source URI must be a public pubky.app resource');

export const PubchiSuggestionV1Schema = z
  .object({
    schema: z.literal('pubchi-suggestion'),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    updated_at: zUnix,
    suggestion_id: z.string().regex(SUGGESTION_ID),
    kind: z.literal(PUBCHI_SUGGESTION_KIND),
    title: z.string().trim().min(1).max(PUBCHI_SUGGESTION_TITLE_MAX),
    summary: z.string().trim().min(1).max(PUBCHI_SUGGESTION_SUMMARY_MAX),
    source_uris: z.array(SourceUriSchema).min(1).max(PUBCHI_SUGGESTION_SOURCE_MAX),
    run_id: z.string().regex(RUN_ID),
    expires_at: zUnix,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.expires_at <= value.updated_at) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['expires_at'], message: 'SCHEMA_INVALID' });
    }
  });

export type PubchiSuggestionV1 = z.infer<typeof PubchiSuggestionV1Schema>;

export function parsePubchiSuggestionV1(input: unknown): ParseResult<PubchiSuggestionV1> {
  const forbidden = scanForbiddenPublicState(input);
  if (!forbidden.ok) return forbidden;
  const result = fromZod(PubchiSuggestionV1Schema, input);
  return result.ok ? ok(result.value) : err(result.code);
}

const DEFAULT_TITLE = 'What you missed';

function titleFromSummary(summary: string): string {
  const sentence = summary.trim().split(/(?<=[.!?])\s+/)[0] ?? '';
  const clipped = sentence.slice(0, PUBCHI_SUGGESTION_TITLE_MAX).trim();
  return clipped.length > 0 ? clipped : DEFAULT_TITLE;
}

function uniqueSourceUris(answer: PubchiAnswerV1): string[] {
  const collected: string[] = [];
  const seen = new Set<string>();
  for (const item of [...answer.evidence.map((entry) => entry.uri), ...answer.sources]) {
    if (!isPubkyAppResourceUri(item) || seen.has(item)) continue;
    seen.add(item);
    collected.push(item);
    if (collected.length >= PUBCHI_SUGGESTION_SOURCE_MAX) break;
  }
  return collected;
}

export function suggestionFromAnswer(
  answer: PubchiAnswerV1,
  params: { suggestionId: string; nowSeconds: number },
): PubchiSuggestionV1 | null {
  const source_uris = uniqueSourceUris(answer);
  if (source_uris.length === 0) return null;
  const candidate = {
    schema: 'pubchi-suggestion' as const,
    version: 1 as const,
    bot: answer.bot,
    owner: answer.owner,
    updated_at: params.nowSeconds,
    suggestion_id: params.suggestionId,
    kind: PUBCHI_SUGGESTION_KIND,
    title: titleFromSummary(answer.summary),
    summary: answer.summary.trim().slice(0, PUBCHI_SUGGESTION_SUMMARY_MAX),
    source_uris,
    run_id: answer.run_id,
    expires_at: params.nowSeconds + PUBCHI_SUGGESTION_TTL_SECONDS,
  };
  const parsed = parsePubchiSuggestionV1(candidate);
  return parsed.ok ? parsed.value : null;
}
