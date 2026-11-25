'use client';

import { useEffect, useState } from 'react';
import { getUserProfileUrl } from '@/app/routes';
import type { PubchiRequestBinding } from '@/application/pubchi/pubchi.types';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { UserController } from '@/controllers/user/user';
import { useDraftPostApplication } from '@/hooks/useDraftPostApplication/useDraftPostApplication';
import { useTagSuggestionApplication } from '@/hooks/useTagSuggestionApplication/useTagSuggestionApplication';
import { PUBCHI_BASIS_HEADING_EVIDENCE, PUBCHI_BASIS_HEADINGS, pubchiBasisHeading } from '@/libs/pubchi/basis-copy';
import { linkifyPubkys } from '@/libs/pubchi/capabilities-v1';
import { DRAFT_POST_COPY } from '@/libs/pubchi/draft-post-copy';
import type { ExecutionScope, PubchiAnswerV1, PubchiEvidenceV1 } from '@/libs/pubchi/schemas/answer';
import { pubkyUriToAppHref } from '@/libs/pubchi/uri';
import { copyToClipboard, truncateMiddle } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/toast';
import { initialFromName } from '@/organisms/AvatarWithFallback/AvatarWithFallback.utils';

type PubchiAnswerCardProps = {
  answer: PubchiAnswerV1;
  replyText?: string;
  binding?: PubchiRequestBinding;
  currentUserPubky?: string | null;
  cursorSource?: 'device' | 'remote' | 'none';
  visible?: boolean;
};

const icons = {
  user: '●',
  post: '▤',
  tag: '#',
  claim: '◇',
} as const;

const C3_SECTIONS = [
  { id: 'followed_posts', label: 'Posts from people you follow' },
  { id: 'replies_to_you', label: 'Replies to you' },
  { id: 'tags_on_you', label: 'Tags on you' },
] as const;

type EvidenceGroup = {
  id: string;
  label: string;
  items: PubchiEvidenceV1[];
  more: number;
};

export function PubchiAnswerCard({
  answer,
  replyText,
  binding,
  currentUserPubky,
  cursorSource = 'none',
  visible = true,
}: PubchiAnswerCardProps) {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const { statuses, approve, revert, reconcile } = useTagSuggestionApplication(
    answer.section === 'tag_suggestions' ? binding?.recordId : undefined,
    visible,
  );
  const draft = useDraftPostApplication(answer.section === 'draft_post' ? binding?.recordId : undefined, visible);

  useEffect(() => {
    let active = true;
    const claimantIds = [
      ...new Set(answer.evidence.filter((item) => item.kind !== 'user').flatMap((item) => item.claimants)),
    ];
    if (claimantIds.length === 0) return;
    void Promise.all(
      claimantIds.map(async (userId) => {
        const user = await UserController.getOrFetch({ userId });
        return [userId, user?.name || userId] as const;
      }),
    ).then((entries) => {
      if (active) setNames(new Map(entries));
    });
    return () => {
      active = false;
    };
  }, [answer]);

  return (
    <div data-surface="pubchi-answer" data-testid="pubchi-answer" className="flex flex-col gap-3">
      {answer.section === 'draft_post' && answer.draft_post ? (
        <Card data-testid="pubchi-draft-post" data-surface="pubchi-draft-post">
          <CardHeader>
            <CardTitle>{DRAFT_POST_COPY.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Typography size="sm" className="text-muted-foreground">
              {DRAFT_POST_COPY.publishAsYou}
            </Typography>
            <Typography data-testid="pubchi-draft-post-content">{answer.draft_post.content}</Typography>
            <Typography size="sm">{answer.draft_post.rationale}</Typography>
            {answer.draft_post.tags?.length ? (
              <Typography size="sm" data-testid="pubchi-draft-post-tags">
                {answer.draft_post.tags.join(', ')}
              </Typography>
            ) : null}
            {draft.status === 'applied' ? (
              <div className="flex items-center gap-2">
                <Typography size="sm">{DRAFT_POST_COPY.published}</Typography>
                <Button type="button" data-testid="pubchi-draft-post-revert" onClick={() => void draft.revert()}>
                  {DRAFT_POST_COPY.revert}
                </Button>
              </div>
            ) : draft.status === 'rejected' ? (
              <Typography size="sm" data-testid="pubchi-draft-post-rejected">
                {DRAFT_POST_COPY.rejected}
              </Typography>
            ) : draft.status === 'reverted' ? (
              <Typography size="sm">{DRAFT_POST_COPY.reverted}</Typography>
            ) : draft.status === 'reconciliation-pending' ? (
              <div className="flex items-center gap-2">
                <Typography size="sm">{DRAFT_POST_COPY.reconcile}</Typography>
                <Button
                  type="button"
                  data-testid="pubchi-draft-post-check-again"
                  onClick={() => void draft.reconcile()}
                >
                  {DRAFT_POST_COPY.checkAgain}
                </Button>
              </div>
            ) : draft.status === 'reconciling' ? (
              <Button type="button" disabled>
                {DRAFT_POST_COPY.checking}
              </Button>
            ) : draft.status === 'failed' ? (
              <div className="flex items-center gap-2">
                <Button type="button" data-testid="pubchi-draft-post-retry" onClick={() => void draft.approve()}>
                  {DRAFT_POST_COPY.retry}
                </Button>
                <Button type="button" data-testid="pubchi-draft-post-reject" onClick={() => void draft.reject()}>
                  {DRAFT_POST_COPY.reject}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  data-testid="pubchi-draft-post-approve"
                  disabled={draft.status === 'applying' || draft.status === 'rejecting'}
                  onClick={() => void draft.approve()}
                >
                  {draft.status === 'applying' ? DRAFT_POST_COPY.applying : DRAFT_POST_COPY.approve}
                </Button>
                <Button
                  type="button"
                  data-testid="pubchi-draft-post-reject"
                  disabled={draft.status === 'applying' || draft.status === 'rejecting'}
                  onClick={() => void draft.reject()}
                >
                  {draft.status === 'rejecting' ? DRAFT_POST_COPY.rejecting : DRAFT_POST_COPY.reject}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
      {answer.section === 'tag_suggestions' && answer.tag_suggestions ? (
        <Card data-testid="pubchi-tag-suggestions">
          <CardHeader>
            <CardTitle>Suggested tags</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {answer.target ? (
              <Link
                href={pubkyUriToAppHref(answer.target.uri, currentUserPubky) ?? answer.target.uri}
                className="truncate text-sm underline"
                title={answer.target.uri}
              >
                {truncateMiddle(answer.target.uri, 64)}
              </Link>
            ) : null}
            {answer.tag_suggestions.map((suggestion, index) => {
              const status = suggestion.already_applied ? 'superseded' : (statuses[index] ?? 'proposed');
              return (
                <div
                  key={`${suggestion.label}-${index}`}
                  data-testid={`pubchi-tag-suggestion-${index}`}
                  className="flex flex-col gap-2 rounded-md border p-3"
                >
                  <Typography className="font-medium">{suggestion.label}</Typography>
                  <Typography size="sm">{suggestion.rationale}</Typography>
                  {status === 'superseded' ? (
                    <Typography size="sm" data-testid={`pubchi-tag-already-applied-${index}`}>
                      Already applied
                    </Typography>
                  ) : status === 'applied' ? (
                    <Button type="button" data-testid={`pubchi-tag-revert-${index}`} onClick={() => void revert(index)}>
                      Revert
                    </Button>
                  ) : status === 'reconciliation-pending' ? (
                    <div className="flex items-center gap-2">
                      <Typography size="sm">
                        Pubchi could not confirm the result of this tag. Check again, or manage the tag from the
                        post&apos;s tags.
                      </Typography>
                      <Button
                        type="button"
                        data-testid={`pubchi-tag-check-again-${index}`}
                        onClick={() => void reconcile(index)}
                      >
                        Check again
                      </Button>
                    </div>
                  ) : status === 'reconciling' ? (
                    <Button type="button" disabled>
                      Checking…
                    </Button>
                  ) : status === 'reverted' ? (
                    <Typography size="sm">Reverted</Typography>
                  ) : status === 'failed' ? (
                    <Button type="button" data-testid={`pubchi-tag-retry-${index}`} onClick={() => void approve(index)}>
                      Retry
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      data-testid={`pubchi-tag-approve-${index}`}
                      disabled={status === 'applying'}
                      onClick={() => void approve(index)}
                    >
                      {status === 'applying' ? 'Applying…' : 'Approve'}
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      {answer.evidence.length > 0 ? (
        <div className="flex flex-col gap-3" data-testid="pubchi-answer-evidence">
          {groupEvidence(answer).map((group) => {
            return (
              <section key={group.id} data-testid={`pubchi-evidence-section-${group.id}`}>
                <Typography size="sm" className="mb-1 font-medium">
                  {group.label} ({group.items.length})
                </Typography>
                <div className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <EvidenceItem
                      key={`${item.uri}-${item.label}`}
                      item={item}
                      names={names}
                      tools={answer.tool_trace_summary.tools}
                      currentUserPubky={currentUserPubky}
                    />
                  ))}
                </div>
                {group.more > 0 ? (
                  <Typography size="sm" className="text-muted-foreground">
                    and {group.more} more
                  </Typography>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}

      {hasInterpretationDetails(answer) ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {answer.basis
                ? pubchiBasisHeading(answer.basis)
                : hasDeterministicRoute(answer.tool_trace_summary.tools)
                  ? PUBCHI_BASIS_HEADINGS.graph
                  : PUBCHI_BASIS_HEADING_EVIDENCE}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {answer.scope && (answer.basis === undefined || answer.basis === 'graph' || answer.basis === 'mixed') ? (
              <Typography data-testid="pubchi-answer-scope" size="xs" className="mb-2 text-muted-foreground">
                {formatScopeLine(answer.scope)}
              </Typography>
            ) : null}
            {answer.summary.trim() !== replyText?.trim() ? (
              <Typography size="sm">
                {answer.summary && (answer.basis === undefined || answer.basis === 'graph' || answer.basis === 'mixed')
                  ? linkifyPubkys(answer.summary).map((part, index) =>
                      typeof part === 'string' ? (
                        part
                      ) : (
                        <Link
                          key={`${part.pubky}-${index}`}
                          href={getUserProfileUrl(part.pubky, currentUserPubky)}
                          className="underline"
                        >
                          pubky:{part.pubky}
                        </Link>
                      ),
                    )
                  : answer.summary || 'No evidence was found for this question.'}
              </Typography>
            ) : null}
            <ToolTrace answer={answer} currentUserPubky={currentUserPubky} />
          </CardContent>
        </Card>
      ) : null}
      {answer.citations?.length ? (
        <Card data-testid="pubchi-answer-citations">
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {answer.citations.map((citation) => (
              <div key={citation.url} className="flex flex-col gap-1">
                <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                  {citation.title}
                </a>
                {citation.snippet ? <Typography size="sm">{citation.snippet}</Typography> : null}
                {citation.corpus_version ? (
                  <Typography size="xs" className="text-muted-foreground">
                    Corpus version: {citation.corpus_version}
                  </Typography>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {answer.continuation ? (
        <Typography data-testid="pubchi-cursor-status" size="xs" className="text-muted-foreground">
          Since {new Date(answer.continuation.since).toLocaleString()} ·{' '}
          {answer.continuation.complete ? 'complete' : 'partial — cursor kept'}
          {cursorSource === 'device' ? ' · cursor kept on this device' : ''}
        </Typography>
      ) : null}
    </div>
  );
}

function hasInterpretationDetails(answer: PubchiAnswerV1): boolean {
  return (
    answer.evidence.length > 0 ||
    Boolean(answer.citations?.length) ||
    answer.sources.length > 0 ||
    Boolean(answer.continuation) ||
    answer.tool_trace_summary.call_count > 0 ||
    answer.tool_trace_summary.truncated ||
    hasDeterministicRoute(answer.tool_trace_summary.tools)
  );
}

function ToolTrace({ answer, currentUserPubky }: { answer: PubchiAnswerV1; currentUserPubky?: string | null }) {
  const { tools, call_count: callCount, truncated } = answer.tool_trace_summary;
  const callLabel = `${callCount} ${callCount === 1 ? 'call' : 'calls'}`;
  const sourceLabel =
    tools.length > 0 ? `Sources: ${tools.join(', ')} · ${callLabel}` : 'Sources: none — answered from the model';
  return (
    <div data-testid="pubchi-tool-trace" className="mt-3 flex flex-col gap-2 border-t pt-3">
      <Collapsible>
        <CollapsibleTrigger className="text-left text-sm font-medium">{sourceLabel}</CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 pt-2">
          <div className="flex items-center gap-2">
            <Typography size="sm" data-testid="pubchi-run-id">
              Run ID: {truncateMiddle(answer.run_id, 40)}
            </Typography>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="pubchi-run-id-copy"
              onClick={() => {
                void copyToClipboard({ text: answer.run_id }).then(
                  () => toast({ title: 'Copied', dismissButton: true }),
                  () => undefined,
                );
              }}
            >
              Copy
            </Button>
          </div>
          <Typography size="sm">
            {tools.join(', ') || 'none'} · {callLabel}
            {truncated ? ' · truncated' : ''}
          </Typography>
          {answer.sources.map((source) => {
            const href = pubkyUriToAppHref(source, currentUserPubky);
            return href ? (
              <Link key={source} href={href} className="text-sm break-all underline">
                {source}
              </Link>
            ) : (
              <Typography key={source} size="sm" className="break-all">
                {source}
              </Typography>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function groupEvidence(answer: PubchiAnswerV1): EvidenceGroup[] {
  const hasSections = answer.evidence.some((item) => item.section !== undefined);
  if (!hasSections) {
    return genericEvidenceGroups(answer.evidence);
  }

  const sectionGroups = C3_SECTIONS.flatMap((section) => {
    const items = answer.evidence.filter((item) => item.section === section.id);
    return items.length > 0
      ? [{ id: section.id, label: section.label, items, more: moreEvidenceCount(answer, items.length) }]
      : [];
  });
  const unsectioned = answer.evidence.filter((item) => item.section === undefined);
  return [...sectionGroups, ...genericEvidenceGroups(unsectioned)];
}

function genericEvidenceGroups(evidence: PubchiEvidenceV1[]): EvidenceGroup[] {
  return (['post', 'claim', 'tag', 'user'] as const).flatMap((kind) => {
    const items = evidence.filter((item) => item.kind === kind);
    return items.length > 0 ? [{ id: kind, label: kind === 'claim' ? 'Evidence' : `${kind}s`, items, more: 0 }] : [];
  });
}

function moreEvidenceCount(answer: PubchiAnswerV1, itemCount: number): number {
  return answer.tool_trace_summary.truncated && answer.continuation?.skipped && itemCount > 0
    ? answer.continuation.skipped
    : 0;
}

function formatScopeLine(scope: ExecutionScope): string {
  if (scope.graph.kind === 'none') return 'No graph lookup';

  const graph =
    scope.graph.kind === 'whole_graph'
      ? 'whole graph'
      : `your network${scope.graph.hops ? ` (${scope.graph.hops} hops)` : ''}`;
  if (scope.time === null) return `Scope: current indexed graph (no time filter) · ${graph}`;

  const since = formatUtcDate(scope.time.since_ms);
  const until = formatUtcDate(scope.time.until_ms, scope.time.since_ms);
  const label = /\([^()]*UTC\)$/.test(scope.time.label)
    ? scope.time.label
    : `${scope.time.label} (${since}–${until} UTC)`;
  return `Scope: ${label} · ${graph}`;
}

function formatUtcDate(timestamp: number, rangeStart?: number): string {
  if (rangeStart !== undefined) {
    const startParts = utcDateParts(rangeStart);
    const endParts = utcDateParts(timestamp);
    if (startParts.month === endParts.month && startParts.year === endParts.year) return String(endParts.day);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(timestamp);
}

function utcDateParts(timestamp: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(timestamp);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

function EvidenceItem({
  item,
  names,
  tools,
  currentUserPubky,
}: {
  item: PubchiEvidenceV1;
  names: Map<string, string>;
  tools: string[];
  currentUserPubky?: string | null;
}) {
  const href = pubkyUriToAppHref(item.uri, currentUserPubky);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">{icons[item.kind]}</span>
          {href ? (
            <Link href={href} className="font-medium underline">
              {item.label}
            </Link>
          ) : (
            <Typography>{item.label}</Typography>
          )}
          {item.in_your_graph === true ? <Badge>In your graph</Badge> : null}
        </div>
        <Typography size="sm">
          {countLabel(tools)}: {item.claimant_count}
        </Typography>
        {item.kind !== 'user' ? (
          <div className="flex flex-wrap gap-2">
            {item.claimants.slice(0, 3).map((claimant) => (
              <Link key={claimant} href={getUserProfileUrl(claimant, currentUserPubky)} className="text-sm underline">
                <span
                  className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs"
                  aria-hidden="true"
                >
                  {initialFromName(names.get(claimant) ?? claimant)}
                </span>
                {names.get(claimant) ?? claimant}
              </Link>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const DETERMINISTIC_TOOLS = new Set([
  'nexus_influencer',
  'rank_users',
  'rank_tags_recv',
  'rank_tags_apply',
  'nexus_user_tags',
  'get_tag_landscape',
  'tag_landscape',
  'top_posts',
  'recommend_follows',
  'recommend',
  'stale_follows',
]);

function hasDeterministicRoute(tools: string[]): boolean {
  return tools.length > 0 && tools.every((tool) => DETERMINISTIC_TOOLS.has(tool));
}

function countLabel(tools: string[]): string {
  if (tools.some((tool) => tool === 'nexus_user_tags' || tool === 'get_tag_landscape' || tool === 'tag_landscape'))
    return 'Tagged by';
  if (tools.some((tool) => tool === 'nexus_influencer' || tool === 'rank_users')) return 'Followers';
  if (tools.some((tool) => tool === 'rank_tags_recv')) return 'Tags received';
  if (tools.some((tool) => tool === 'rank_tags_apply')) return 'Tags applied';
  if (tools.includes('top_posts')) return 'Replies';
  if (tools.some((tool) => tool === 'recommend_follows' || tool === 'recommend' || tool === 'stale_follows'))
    return 'Count';
  return 'Evidence';
}
