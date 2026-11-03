'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardTitle } from '@/atoms/Card/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Link } from '@/atoms/Link/Link';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/atoms/Sheet/Sheet';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { FeedController } from '@/controllers/feed/feed';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { useDiscoveredTagSuggestions } from '@/hooks/useDiscoveredTagSuggestions/useDiscoveredTagSuggestions';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';
import { usePubchiQuery } from '@/hooks/usePubchiQuery/usePubchiQuery';
import {
  PUBCHI_QUESTION_MAX_LENGTH_MESSAGE,
  pubchiQueryFormDefaults,
  QUERY_FORM_FIELDS,
} from '@/hooks/usePubchiQuery/usePubchiQuery.types';
import { PUBCHI_DEGRADED_SESSION_MESSAGE } from '@/libs/pubchi/capabilities';
import { parsePostReference } from '@/libs/pubchi/capabilities-v1';
import { effectiveTier } from '@/libs/pubchi/effective-tier';
import { pubchiErrorCopy } from '@/libs/pubchi/error-copy';
import { isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { PUBCHI_QUESTION_MAX_LENGTH } from '@/libs/pubchi/limits';
import type { PubchiTarget } from '@/libs/pubchi/schemas/ask-body';
import { pubkyUriToAppHref } from '@/libs/pubchi/uri';
import { copyToClipboard, truncateMiddle } from '@/libs/utils/utils';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';
import { toast } from '@/molecules/Toaster/toast';
import { RingApprovalDialog } from '@/organisms/RingApprovalDialog/RingApprovalDialog';
import { useAuthStore } from '@/stores/auth/auth.store';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { PubchiAnswerCard } from '../PubchiAnswerCard/PubchiAnswerCard';
import { PubchiAppliedTagSuggestions } from '../PubchiAppliedTagSuggestions/PubchiAppliedTagSuggestions';
import { PubchiCapabilities } from '../PubchiCapabilities/PubchiCapabilities';
import { PubchiFeedBuilder } from '../PubchiFeedBuilder/PubchiFeedBuilder';
import { PubchiFlyoutHeader } from '../PubchiFlyoutHeader/PubchiFlyoutHeader';
import { PubchiProactiveSuggestions } from '../PubchiProactiveSuggestions/PubchiProactiveSuggestions';

export const PUBCHI_PANEL_SURFACE = 'pubchi-panel';

export type PubchiPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PubchiPanel({ open, onOpenChange }: PubchiPanelProps) {
  const {
    form,
    submit,
    result,
    errorCode,
    loading,
    elapsedMs,
    enabled,
    pubchiAvailable,
    signingAvailable,
    signingUnavailableMessage,
    setupDevice,
    setupLoading,
    cursorSource,
  } = usePubchiQuery();
  const { needsReapproval, reapprove, loading: reapprovalLoading, pubchi, config } = usePubchiEnrollment();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const prefill = usePubchiStore((state) => state.flyout.prefill);
  const quickQuestionsOpen = usePubchiStore((state) => state.quickQuestionsOpen);
  const conversation = usePubchiStore((state) => state.conversation);
  const conversationGeneration = usePubchiStore((state) => state.conversationGeneration);
  const databaseBlocked = usePubchiStore((state) => state.databaseBlocked);
  const feedBuilderOpen = usePubchiStore((state) => state.feedBuilder.open);
  const feedBuilderProposal = usePubchiStore((state) => state.feedBuilder.proposal);
  const proactiveSuggestions = usePubchiStore((state) => state.proactiveSuggestions);
  const clearConversation = usePubchiStore((state) => state.clearConversation);
  const setQuickQuestionsOpen = usePubchiStore((state) => state.setQuickQuestionsOpen);
  const question = useWatch({ control: form.control, name: QUERY_FORM_FIELDS.QUESTION }) ?? '';
  const questionLength = question.length;
  const questionOverLimit = questionLength > PUBCHI_QUESTION_MAX_LENGTH;
  const postReference = parsePostReference(question);
  const [suggestionTarget, setSuggestionTarget] = useState<PubchiTarget | undefined>();
  const discoveredTargetUri = suggestionTarget?.kind === 'post' ? suggestionTarget.uri : undefined;
  const liveTagSuggestionRecordId = result?.kind === 'answer' ? result.binding?.recordId : undefined;
  const {
    suggestions: discoveredSuggestions,
    revert: revertDiscoveredSuggestion,
    reconcile: reconcileDiscoveredSuggestion,
  } = useDiscoveredTagSuggestions(currentUserPubky, discoveredTargetUri, open, liveTagSuggestionRecordId);
  const [prefilledQuestion, setPrefilledQuestion] = useState<string>();
  const [editFeed, setEditFeed] = useState<FeedModelSchema | undefined>();
  const [showDatabaseBlockedNotice, setShowDatabaseBlockedNotice] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [feedBuilderRevision, setFeedBuilderRevision] = useState(0);
  const preparedPrefillRef = useRef<{ prefill: typeof prefill; generation: number } | undefined>(undefined);
  const lastFeedResultRef = useRef<typeof result>(undefined);
  const consumedFeedResultRef = useRef<typeof result>(undefined);
  const initialTier = effectiveTier({
    desired: config?.tier ?? 'read-only',
    ceiling: 'assisted',
    sessionCoversPubchi: !needsReapproval,
  });
  const [tier, setTier] = useState(initialTier);
  const resolvedTier = effectiveTier({
    desired: config?.tier ?? 'read-only',
    ceiling: 'assisted',
    sessionCoversPubchi: !needsReapproval,
  });

  useEffect(() => {
    if (!open) {
      if (prefill) PubchiController.consumePrefill(currentUserPubky);
      preparedPrefillRef.current = undefined;
      setSuggestionTarget(undefined);
      setPrefilledQuestion(undefined);
      return;
    }
    if (!prefill) return;
    if (prefill.ownerPubky !== currentUserPubky) {
      PubchiController.consumePrefill(currentUserPubky);
      return;
    }
    if (preparedPrefillRef.current?.prefill !== prefill) {
      preparedPrefillRef.current = { prefill, generation: conversationGeneration };
      setEditFeed(undefined);
      setSuggestionTarget(prefill.target);
      setPrefilledQuestion(prefill.question);
      if (prefill.feedId) {
        void FeedController.get({ feedId: prefill.feedId }).then((feed) => setEditFeed(feed));
      }
      form.setValue(QUERY_FORM_FIELDS.QUESTION, prefill.question, { shouldValidate: true });
      document.getElementById(QUERY_FORM_FIELDS.QUESTION)?.focus();
    } else if (
      preparedPrefillRef.current.generation !== conversationGeneration ||
      form.getValues(QUERY_FORM_FIELDS.QUESTION) !== prefill.question
    ) {
      // Editing the question or resetting its context cancels the queued action.
      PubchiController.consumePrefill(currentUserPubky);
      return;
    }
    // A freshly mounted query hook prepares its signer asynchronously. Keep the
    // action in the store until it can submit, and consume it before submitting
    // so a readiness rerender cannot start a duplicate request.
    if (prefill.source === 'post-menu' && !signingAvailable) return;
    const nextPrefill = PubchiController.consumePrefill(currentUserPubky);
    if (!nextPrefill) return;
    if (nextPrefill.source === 'post-menu') {
      const target = nextPrefill.target?.kind === 'post' ? nextPrefill.target : undefined;
      void submit('ask', { target });
    }
  }, [conversationGeneration, currentUserPubky, form, open, prefill, question, signingAvailable, submit]);

  useEffect(() => {
    if (
      !prefilledQuestion ||
      question === prefilledQuestion ||
      question === 'Suggest tags for this post' ||
      question === 'Suggest tags for this user' ||
      question.startsWith('Summarize this thread ')
    ) {
      return;
    }
    setSuggestionTarget(undefined);
    setPrefilledQuestion(undefined);
  }, [prefilledQuestion, question]);

  useEffect(() => {
    if (result === lastFeedResultRef.current) return;
    lastFeedResultRef.current = result;
    if (result?.kind !== 'feed-v2') return;
    if (consumedFeedResultRef.current === result) return;
    consumedFeedResultRef.current = result;
    // Successful interpretation starts a new form draft, even when the service
    // returns the same proposal twice. Failures leave the existing form mounted.
    setFeedBuilderRevision((revision) => revision + 1);
    if (result.result.mode === 'create') setEditFeed(undefined);
    PubchiController.openFeedBuilder(result.result);
    onOpenChange(false);
    PubchiController.closeFlyout();
  }, [onOpenChange, result]);

  useEffect(() => {
    if (!databaseBlocked) {
      setShowDatabaseBlockedNotice(false);
      return;
    }
    const timer = setTimeout(() => setShowDatabaseBlockedNotice(true), 5_000);
    return () => clearTimeout(timer);
  }, [databaseBlocked]);

  useEffect(() => {
    if (needsReapproval) {
      setTier('read-only');
    } else if (config) {
      setTier(resolvedTier);
    }
  }, [config, needsReapproval, resolvedTier]);

  if (!enabled || !isPubchiPanelEnabled()) {
    return null;
  }

  const actionsDisabled = loading || setupLoading || !signingAvailable || questionOverLimit;
  const errorCopy = pubchiErrorCopy(errorCode);
  const feedInterpretationError =
    !loading && result?.kind === 'feed'
      ? 'This Pubchi service returned an older feed format. Your draft is unchanged. Edit its settings manually or try again after the service is updated.'
      : undefined;
  const clearPanelConversation = () => {
    PubchiController.consumePrefill(currentUserPubky);
    setSuggestionTarget(undefined);
    setPrefilledQuestion(undefined);
    consumedFeedResultRef.current = undefined;
    form.reset(pubchiQueryFormDefaults);
    clearConversation();
  };
  const submitQuestion = async (
    purpose: Parameters<typeof submit>[0],
    requestOptions?: Parameters<typeof submit>[1],
  ): Promise<boolean> => {
    PubchiController.consumePrefill(currentUserPubky);
    if (!requestOptions?.targetFeedId) setEditFeed(undefined);
    return submit(purpose, requestOptions);
  };
  const openFeedBuilder = () => {
    setEditFeed(undefined);
    const initialQuestion = question.trim();
    const owner = currentUserPubky ?? 'a'.repeat(52);
    PubchiController.openFeedBuilder({
      schema: 'pubchi-feed-proposal',
      version: 2,
      bot: 'b'.repeat(52),
      owner,
      generated_at: Math.floor(Date.now() / 1000),
      mode: 'create',
      target_feed_id: null,
      feed: {
        name: 'New feed',
        icon: 'rss',
        feed: {
          reach: 'following',
          sort: 'recent',
          layout: 'columns',
          content: undefined,
          tags: [],
          domain_tags: [],
        },
      },
      mapping: { status: 'exact', unmapped: [] },
      warnings: [],
      installed_user_feed_id: null,
    });
    onOpenChange(false);
    PubchiController.closeFlyout();
    if (initialQuestion) {
      void submitQuestion('build-feed', { proposalVersion: 2 });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
          <div data-surface={PUBCHI_PANEL_SURFACE} data-testid={PUBCHI_PANEL_SURFACE} className="flex flex-col gap-4">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Pubchi
              </SheetTitle>
              <SheetDescription>Read-only questions. The service never receives your session or key.</SheetDescription>
            </SheetHeader>

            {showDatabaseBlockedNotice ? (
              <Typography role="status" size="sm">
                Pubchi is updating in another tab — close it or reload.
              </Typography>
            ) : null}

            <PubchiFlyoutHeader
              pubchi={pubchi}
              tier={tier}
              brainLabel={config?.brain.execution === 'self-hosted' ? 'Own endpoint' : 'Hosted Kimi'}
              missedCount={proactiveSuggestions.length}
            />

            <PubchiProactiveSuggestions
              suggestions={proactiveSuggestions}
              currentUserPubky={currentUserPubky}
              onDismiss={(suggestionId) => PubchiController.dismissProactiveSuggestion(suggestionId)}
            />

            {needsReapproval ? (
              <div className="flex flex-col gap-3" data-testid="pubchi-degraded-session">
                <Typography size="sm">{PUBCHI_DEGRADED_SESSION_MESSAGE}</Typography>
                <Button type="button" disabled={reapprovalLoading} onClick={() => setApprovalOpen(true)}>
                  Re-approve
                </Button>
              </div>
            ) : null}

            {pubchiAvailable === false ? (
              <Typography data-testid="pubchi-not-enrolled" size="sm">
                Create a Pubchi in Settings to start asking.
              </Typography>
            ) : null}

            {!needsReapproval && pubchiAvailable !== false && !signingAvailable ? (
              <div className="flex flex-col gap-3" data-testid="pubchi-signing-unavailable">
                <Typography size="sm">{signingUnavailableMessage}</Typography>
                <Button
                  type="button"
                  data-testid="pubchi-setup-device"
                  disabled={setupLoading}
                  onClick={() => void setupDevice()}
                >
                  {setupLoading ? 'Setting up…' : 'Set up this browser'}
                </Button>
              </div>
            ) : null}

            {conversation.turns.length > 0 ? (
              <div className="flex flex-col gap-2" data-testid="pubchi-conversation">
                <div className="flex items-center justify-between">
                  <Typography size="sm" className="font-medium">
                    Conversation
                  </Typography>
                  <Button type="button" variant="ghost" size="sm" onClick={clearPanelConversation}>
                    New conversation
                  </Button>
                </div>
                {conversation.turns.map((turn, index) => (
                  <Card key={`${turn.role}-${index}`}>
                    <CardContent className="flex flex-col gap-1 pt-4">
                      <Typography size="xs" className="text-muted-foreground">
                        {turn.role === 'user'
                          ? 'You'
                          : turn.basis && turn.basis !== 'graph'
                            ? 'From what I know'
                            : 'Pubchi'}
                      </Typography>
                      <Typography size="sm">{turn.text}</Typography>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submitQuestion('ask');
              }}
            >
              <ControlledTextareaField
                name={QUERY_FORM_FIELDS.QUESTION}
                control={form.control}
                label="Question"
                placeholder="Ask about your graph…"
              />
              <Typography
                size="xs"
                data-testid="pubchi-question-count"
                className={questionOverLimit ? 'text-destructive' : 'text-muted-foreground'}
              >
                {questionLength}/{PUBCHI_QUESTION_MAX_LENGTH}
              </Typography>
              {questionOverLimit ? (
                <Typography size="sm" data-testid="pubchi-question-over-limit" className="text-destructive">
                  {PUBCHI_QUESTION_MAX_LENGTH_MESSAGE}
                </Typography>
              ) : null}
              <PubchiCapabilities
                compact
                tier={tier}
                disabled={actionsDisabled}
                onSelect={(nextQuestion, purpose) => {
                  form.setValue(QUERY_FORM_FIELDS.QUESTION, nextQuestion, { shouldValidate: true });
                  void submitQuestion(purpose);
                }}
                onAsk={() => void submitQuestion('ask')}
                quickQuestionsOpen={quickQuestionsOpen}
                onQuickQuestionsOpenChange={setQuickQuestionsOpen}
                onBuildFeed={openFeedBuilder}
              />
              <Typography size="xs" className="text-muted-foreground">
                Build feed opens the feed builder — pick filters or describe the feed.
              </Typography>
              {postReference || suggestionTarget?.kind === 'post' ? (
                <div className="flex flex-wrap gap-2">
                  {postReference || suggestionTarget?.kind === 'post' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      data-testid="pubchi-summarize-thread"
                      disabled={actionsDisabled}
                      onClick={() => {
                        const target = suggestionTarget?.kind === 'post' ? suggestionTarget : undefined;
                        const uri = postReference?.uri ?? target?.uri;
                        if (!uri) return;
                        form.setValue(QUERY_FORM_FIELDS.QUESTION, `Summarize this thread ${uri}`, {
                          shouldValidate: true,
                        });
                        void submitQuestion('ask', { target });
                      }}
                    >
                      Summarize thread
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="pubchi-suggest-tags"
                    disabled={actionsDisabled || suggestionTarget?.kind !== 'post'}
                    onClick={() => {
                      const target = suggestionTarget;
                      if (!target || target.kind !== 'post') return;
                      form.setValue(QUERY_FORM_FIELDS.QUESTION, `Suggest tags for this ${target.kind}`, {
                        shouldValidate: true,
                      });
                      void submitQuestion('ask', { target });
                    }}
                  >
                    Suggest tags
                  </Button>
                </div>
              ) : null}
              {!postReference && suggestionTarget?.kind === 'user' ? (
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="pubchi-suggest-tags"
                  disabled
                  aria-disabled="true"
                  onClick={() => {
                    const target = suggestionTarget;
                    if (target.kind !== 'post') return;
                    form.setValue(QUERY_FORM_FIELDS.QUESTION, 'Suggest tags for this user', { shouldValidate: true });
                    void submitQuestion('ask', { target });
                  }}
                >
                  Suggest tags
                </Button>
              ) : null}
            </form>

            {errorCode ? (
              <div
                data-testid="pubchi-error"
                role="alert"
                className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3"
              >
                <Typography size="sm">{errorCopy.message}</Typography>
                {errorCopy.settingsLink ? (
                  <Link href={errorCopy.settingsLink} size="default">
                    Open Pubchi settings
                  </Link>
                ) : null}
                {errorCopy.supportCode ? (
                  <Typography size="xs" className="text-muted-foreground">
                    Support code: {errorCopy.supportCode}
                  </Typography>
                ) : null}
              </div>
            ) : null}

            {feedInterpretationError ? (
              <Typography role="alert" size="sm" data-testid="pubchi-feed-version-error">
                {feedInterpretationError}
              </Typography>
            ) : null}
            {loading ? <PubchiAnswerSkeleton elapsedMs={elapsedMs} /> : null}
            {discoveredTargetUri ? (
              <PubchiAppliedTagSuggestions
                suggestions={discoveredSuggestions}
                onRevert={(applicationId) => void revertDiscoveredSuggestion(applicationId)}
                onReconcile={(applicationId) => void reconcileDiscoveredSuggestion(applicationId)}
              />
            ) : null}
            {!loading && result?.kind === 'answer' ? (
              <>
                <PubchiAnswerCard
                  answer={result.result}
                  replyText={
                    conversation.turns.at(-1)?.role === 'assistant' ? conversation.turns.at(-1)?.text : undefined
                  }
                  binding={result.binding}
                  currentUserPubky={currentUserPubky}
                  cursorSource={cursorSource}
                  visible={open}
                />
              </>
            ) : null}

            {!loading && result?.kind === 'query' ? (
              <div className="flex flex-col gap-3" data-testid="pubchi-evidence">
                {result.result.items.length > 0 ? (
                  result.result.items.map((item) => {
                    const href = pubkyUriToAppHref(item.source_uri, currentUserPubky);
                    return (
                      <Card key={`${item.source_uri}-${item.label}`}>
                        <CardContent className="flex flex-col gap-1 pt-4">
                          <CardTitle>{item.label}</CardTitle>
                          <Typography size="sm">
                            Tagged by {item.claimant_count} {item.claimant_count === 1 ? 'account' : 'accounts'}
                          </Typography>
                          {href ? (
                            <Link href={href} className="text-sm break-all underline">
                              Tagger
                            </Link>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <Typography data-testid="pubchi-empty-query" size="sm">
                    Nobody has tagged you yet.
                  </Typography>
                )}
                <div data-testid="pubchi-tool-trace">
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost">
                        Sources:{' '}
                        {result.result.tool_trace_summary.tools.length > 0
                          ? `${result.result.tool_trace_summary.tools.join(', ')} · `
                          : 'none — answered from the model'}
                        {result.result.tool_trace_summary.tools.length > 0
                          ? `${result.result.tool_trace_summary.call_count} ${
                              result.result.tool_trace_summary.call_count === 1 ? 'call' : 'calls'
                            }`
                          : null}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Typography size="sm" data-testid="pubchi-run-id">
                          Run ID: {truncateMiddle(result.result.run_id, 40)}
                        </Typography>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid="pubchi-run-id-copy"
                          onClick={() => {
                            void copyToClipboard({ text: result.result.run_id }).then(
                              () => toast({ title: 'Copied', dismissButton: true }),
                              () => undefined,
                            );
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                      <Typography size="sm">
                        {result.result.tool_trace_summary.tools.join(', ') || 'none'} ·{' '}
                        {result.result.tool_trace_summary.call_count}{' '}
                        {result.result.tool_trace_summary.call_count === 1 ? 'call' : 'calls'}
                        {result.result.tool_trace_summary.truncated ? ' · truncated' : ''}
                      </Typography>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            ) : null}

            {!loading && result?.kind === 'feed-unsupported' ? (
              <div
                data-testid="pubchi-error"
                role="alert"
                className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3"
              >
                <Typography size="sm">{pubchiErrorCopy(result.code).message}</Typography>
                <Typography size="xs" className="text-muted-foreground">
                  Support code: {result.code}
                </Typography>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      <RingApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        onApproved={(session) => reapprove(session)}
      />
      {feedBuilderProposal ? (
        <PubchiFeedBuilder
          key={feedBuilderRevision}
          proposal={feedBuilderProposal}
          interpreting={loading}
          interpretationError={feedInterpretationError}
          open={feedBuilderOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              consumedFeedResultRef.current = undefined;
              PubchiController.closeFeedBuilder();
            }
          }}
          existingFeed={editFeed}
          initialQuestion={question.trim()}
          onInterpret={async (nextQuestion) => {
            const previousQuestion = question;
            form.setValue(QUERY_FORM_FIELDS.QUESTION, nextQuestion, { shouldValidate: true });
            const interpreted = await submit('build-feed', {
              proposalVersion: 2,
              ...(editFeed
                ? {
                    targetFeedId: editFeed.id,
                    currentFeed: editFeed,
                  }
                : {}),
            });
            if (!interpreted) {
              form.setValue(QUERY_FORM_FIELDS.QUESTION, previousQuestion, { shouldValidate: true });
            }
          }}
        />
      ) : null}
    </>
  );
}

function PubchiAnswerSkeleton({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div className="flex flex-col gap-2" data-testid="pubchi-answer-loading">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-1/3" />
        </CardContent>
      </Card>
      <Typography size="xs" className="text-muted-foreground">
        Reading the graph… {Math.floor(elapsedMs / 1000)}s
      </Typography>
    </div>
  );
}
