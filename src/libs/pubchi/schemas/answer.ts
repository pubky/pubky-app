/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: c5cf3c7 (uncommitted C5 diff)
 * Do not redefine these contracts.
 */

import { z } from 'zod';
import { err, ok, type ParseResult } from './codes';
import { isPubkyId, PUBKY_ID_RE } from './pubky';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

export const SOURCE_URI = /^(?:pubky:\/\/[ybndrfg8ejkmcpqxot1uwisza345h769]{52}\/.+|https:\/\/nexus[^/]*\/.+)$/;
export const PUBKY_APP_POST_URI =
  /^pubky:\/\/[ybndrfg8ejkmcpqxot1uwisza345h769]{52}\/pub\/pubky\.app\/posts\/[A-Z0-9]{13}$/;
const C5_POST_URI = PUBKY_APP_POST_URI;
const C5_PROFILE_URI = /^pubky:\/\/[ybndrfg8ejkmcpqxot1uwisza345h769]{52}\/pub\/pubky\.app\/profile\.json$/;
/** Maximum length accepted for a public Pubky evidence URI. */
export const PUBLIC_EVIDENCE_URI_MAX_LENGTH = 512;
/** pubky-app-specs `tagLabelMaxLength`; tag policy reads this installed cap at runtime. */
const C5_LABEL_MAX_LENGTH = 20;
const C5_LABEL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const C5_SHA256 = /^[a-f0-9]{64}$/;
/** pubky-app-specs `postShortContentMaxLength`. */
const C6_SHORT_CONTENT_MAX = 2000;
/** App article body cap: `postLongContentMaxLength` − title 100 − JSON 22. */
const C6_LONG_CONTENT_MAX = 49_878;
/** pubky-app-specs `feedTagsMaxCount`. */
const C6_TAG_MAX = 5;
const codePointLength = (value: string): number => Array.from(value).length;

/**
 * `pubky://<52-char z32>/pub/<segment>(/<segment>)*`
 *
 * Each segment is non-empty; no segment or URI may contain query/fragment,
 * percent-encoding, backslashes, whitespace, control characters, `.` or `..`.
 */
export function isCanonicalPublicEvidenceUri(uri: string): boolean {
  if (uri.length > PUBLIC_EVIDENCE_URI_MAX_LENGTH) return false;
  if (!uri.startsWith('pubky://')) return false;
  const id = uri.slice('pubky://'.length, 'pubky://'.length + 52);
  const path = uri.slice('pubky://'.length + 52);
  if (!PUBKY_ID_RE.test(id) || !path.startsWith('/pub/')) return false;
  const publicPath = path.slice('/pub/'.length);
  if (!publicPath || /[?#%\\\s\x00-\x1F\x7F]/.test(uri)) return false;
  return publicPath.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

const PublicEvidenceUriSchema = z
  .string()
  .max(PUBLIC_EVIDENCE_URI_MAX_LENGTH)
  .refine(isCanonicalPublicEvidenceUri, 'evidence URI must be a canonical public Pubky URI');

const C5TargetSchema = z
  .object({
    kind: z.enum(['post', 'user']),
    uri: z.string(),
    snapshot_sha256: z.string().regex(C5_SHA256).nullable(),
  })
  .strict()
  .superRefine((target, ctx) => {
    const post = C5_POST_URI.test(target.uri);
    const profile = C5_PROFILE_URI.test(target.uri);
    if ((!post && !profile) || (target.kind === 'post' ? !post : !profile)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['uri'], message: 'target kind must match canonical URI' });
    }
  });

const C5LabelSchema = z
  .string()
  .min(1)
  .max(C5_LABEL_MAX_LENGTH)
  .refine((value) => C5_LABEL.test(value) && value.split('-').length <= 3, 'invalid tag label');

const C5SuggestionSchema = z
  .object({
    label: C5LabelSchema,
    rationale: z
      .string()
      .refine(
        (value) => codePointLength(value) >= 1 && codePointLength(value) <= 120,
        'rationale must be 1-120 code points',
      ),
    evidence: z.array(PublicEvidenceUriSchema).min(1).max(8),
    already_applied: z.boolean(),
    source: z.enum(['vocab', 'open']),
  })
  .strict();

const C6DraftPostSchema = z
  .object({
    content: z.string(),
    kind: z.enum(['short', 'long']),
    tags: z.array(C5LabelSchema).max(C6_TAG_MAX).optional(),
    parent_uri: z.string().regex(C5_POST_URI).optional(),
    rationale: z
      .string()
      .refine(
        (value) => codePointLength(value) >= 1 && codePointLength(value) <= 120,
        'rationale must be 1-120 code points',
      ),
    evidence: z.array(PublicEvidenceUriSchema).min(1).max(8),
  })
  .strict()
  .superRefine((draft, ctx) => {
    const max = draft.kind === 'long' ? C6_LONG_CONTENT_MAX : C6_SHORT_CONTENT_MAX;
    const points = codePointLength(draft.content);
    if (points < 1 || draft.content.trim().length === 0 || points > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: `content must be 1-${max} non-whitespace code points for kind ${draft.kind}`,
      });
    }
  });

const EvidenceSchema = z
  .object({
    kind: z.enum(['user', 'post', 'tag', 'claim']),
    label: z.string().min(1).max(80),
    uri: PublicEvidenceUriSchema,
    claimants: z.array(zPubky).max(10),
    claimant_count: z.number().int().nonnegative().max(10_000),
    in_your_graph: z.boolean().nullable(),
    section: z.enum(['followed_posts', 'replies_to_you', 'tags_on_you']).optional(),
  })
  .strict();

export const PubchiEvidenceV1Schema = EvidenceSchema;

const ToolTraceSummarySchema = z
  .object({
    tools: z.array(z.string().max(16)).max(16),
    call_count: z.number().int().nonnegative().max(64),
    truncated: z.boolean(),
  })
  .strict();

const ContinuationSchema = z
  .object({
    since: z.string().datetime({ offset: true }),
    until: z.string().datetime({ offset: true }),
    complete: z.boolean(),
    skipped: z.number().int().nonnegative(),
  })
  .strict();

export const PubchiCitationSchema = z
  .object({
    kind: z.enum(['knowledge', 'web']),
    title: z.string().min(1).max(160),
    url: z
      .url()
      .max(512)
      .refine((value) => value.startsWith('https://'), 'citation URLs must use HTTPS'),
    source_id: z.string().max(80).optional(),
    corpus_version: z.string().max(40).optional(),
    snippet: z.string().max(240).optional(),
  })
  .strict();

export const ExecutionScopeSchema = z
  .object({
    time: z
      .object({
        since_ms: z.number().int().nonnegative(),
        until_ms: z.number().int().nonnegative(),
        label: z.string().max(80),
        source: z.enum(['explicit', 'default', 'tool']),
      })
      .strict()
      .nullable(),
    graph: z
      .object({
        kind: z.enum(['whole_graph', 'owner_network', 'none']),
        hops: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      })
      .strict(),
    filters: z.array(z.string().max(160)).max(10),
    complete: z.boolean(),
  })
  .strict();

export const PUBCHI_ANSWER_BASIS = ['graph', 'knowledge', 'model', 'mixed', 'web'] as const;
export type PubchiKnownAnswerBasis = (typeof PUBCHI_ANSWER_BASIS)[number];

/** Known `basis` values plus a forward-compatible string. Unknown strings must not fail parse. */
export const PubchiAnswerBasisSchema = z.string().min(1).max(40);

export function isPubchiKnownAnswerBasis(value: string): value is PubchiKnownAnswerBasis {
  return (PUBCHI_ANSWER_BASIS as readonly string[]).includes(value);
}

export const PubchiAnswerV1Schema = z
  .object({
    schema: z.literal('pubchi-answer'),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    generated_at: zUnix,
    run_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    purpose: z.literal('ask'),
    question: z.string().min(1).max(500),
    summary: z.string().min(1).max(1200),
    evidence: z.array(EvidenceSchema).max(50),
    sources: z.array(z.string().regex(SOURCE_URI)).max(50),
    tool_trace_summary: ToolTraceSummarySchema,
    policy_version: z.literal(1),
    section: z.enum(['tag_suggestions', 'draft_post']).optional(),
    target: C5TargetSchema.optional(),
    tag_suggestions: z.array(C5SuggestionSchema).max(10).optional(),
    draft_post: C6DraftPostSchema.optional(),
    continuation: ContinuationSchema.optional(),
    scope: ExecutionScopeSchema.optional(),
    basis: PubchiAnswerBasisSchema.optional(),
    citations: z.array(PubchiCitationSchema).max(8).optional(),
  })
  .strict();

export type PubchiEvidenceV1 = z.infer<typeof EvidenceSchema>;
export type PubchiAnswerV1 = z.infer<typeof PubchiAnswerV1Schema>;
export type ExecutionScope = z.infer<typeof ExecutionScopeSchema>;
export type PubchiCitation = z.infer<typeof PubchiCitationSchema>;
export type PubchiAnswerBasis = NonNullable<PubchiAnswerV1['basis']>;
export type PubchiTagSuggestion = z.infer<typeof C5SuggestionSchema>;
export type PubchiDraftPost = z.infer<typeof C6DraftPostSchema>;

export function parsePubchiAnswerV1(input: unknown): ParseResult<PubchiAnswerV1> {
  const parsed = fromZod(PubchiAnswerV1Schema, input);
  if (!parsed.ok) return parsed;
  const isC5 =
    parsed.value.section === 'tag_suggestions' ||
    parsed.value.target !== undefined ||
    parsed.value.tag_suggestions !== undefined;
  const isC6 = parsed.value.section === 'draft_post' || parsed.value.draft_post !== undefined;
  if (isC5 && isC6) return err('SCHEMA_INVALID');
  if (isC5) {
    const c5Fields = [parsed.value.section, parsed.value.target, parsed.value.tag_suggestions];
    if (c5Fields.some((value) => value !== undefined) && c5Fields.some((value) => value === undefined))
      return err('SCHEMA_INVALID');
    if (parsed.value.section !== 'tag_suggestions') return err('SCHEMA_INVALID');
  }
  if (isC6) {
    if (parsed.value.section !== 'draft_post' || !parsed.value.draft_post) return err('SCHEMA_INVALID');
  }
  if (parsed.value.section === 'tag_suggestions' && parsed.value.target && parsed.value.tag_suggestions) {
    const targetUri = parsed.value.target.uri;
    const topEvidence = new Set(parsed.value.evidence.map((item) => item.uri));
    const labels = new Set<string>();
    for (const suggestion of parsed.value.tag_suggestions) {
      const normalized = suggestion.label.normalize('NFKC').toLowerCase();
      if (labels.has(normalized)) return err('SCHEMA_INVALID');
      labels.add(normalized);
      if (!suggestion.evidence.every((uri) => topEvidence.has(uri) || uri === targetUri)) return err('SCHEMA_INVALID');
    }
    if (parsed.value.target.snapshot_sha256 === null && parsed.value.tag_suggestions.length > 0)
      return err('SCHEMA_INVALID');
  }
  if (parsed.value.section === 'draft_post' && parsed.value.draft_post) {
    const topEvidence = new Set(parsed.value.evidence.map((item) => item.uri));
    if (!parsed.value.draft_post.evidence.every((uri) => topEvidence.has(uri))) return err('SCHEMA_INVALID');
    const tags = parsed.value.draft_post.tags ?? [];
    const labels = new Set<string>();
    for (const label of tags) {
      const normalized = label.normalize('NFKC').toLowerCase();
      if (labels.has(normalized)) return err('SCHEMA_INVALID');
      labels.add(normalized);
    }
  }
  if (parsed.value.basis !== undefined && isPubchiKnownAnswerBasis(parsed.value.basis)) {
    const graphKind = parsed.value.scope?.graph.kind;
    if (
      (parsed.value.basis === 'model' || parsed.value.basis === 'knowledge' || parsed.value.basis === 'web') &&
      graphKind !== 'none'
    )
      return err('SCHEMA_INVALID');
    if (parsed.value.basis === 'graph' && graphKind === 'none') return err('SCHEMA_INVALID');
    if (parsed.value.basis === 'model' && parsed.value.citations?.length) return err('SCHEMA_INVALID');
  }
  for (const item of parsed.value.evidence) {
    const id = item.uri.slice('pubky://'.length, 'pubky://'.length + 52);
    if (!isPubkyId(id)) return err('URI_FORBIDDEN');
  }
  return ok(parsed.value);
}
