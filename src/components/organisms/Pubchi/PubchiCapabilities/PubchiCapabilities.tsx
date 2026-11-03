'use client';

import { Bot, ChevronDown, CircleHelp, Rss, Search, Sparkles, Users } from 'lucide-react';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Typography } from '@/atoms/Typography/Typography';
import type { Phase0Purpose } from '@/libs/pubchi/schemas/request';

export type PubchiCapabilitiesProps = {
  tier: 'read-only' | 'assisted' | 'autonomous';
  compact?: boolean;
  disabled?: boolean;
  onSelect: (question: string, purpose: Phase0Purpose) => void;
  onBuildFeed: () => void;
  onAsk?: () => void;
  quickQuestionsOpen?: boolean;
  onQuickQuestionsOpenChange?: (open: boolean) => void;
};

const quickQuestions: Array<{ label: string; question: string; purpose: Phase0Purpose; icon: typeof Search }> = [
  { label: 'What did I miss?', question: 'What did I miss?', purpose: 'ask', icon: CircleHelp },
  { label: 'Who tagged me?', question: 'Who tagged me?', purpose: 'who-tagged-me', icon: Users },
  { label: 'Most followed users', question: 'Who are the most followed users on Pubky?', purpose: 'ask', icon: Search },
  { label: 'Most tagged users', question: 'Who has the most tags?', purpose: 'ask', icon: Search },
  { label: 'Top taggers', question: 'Who are the top taggers?', purpose: 'ask', icon: Users },
  { label: 'Active threads', question: 'What are the most active threads right now?', purpose: 'ask', icon: Sparkles },
  { label: 'Trending tags', question: 'What tags are trending this week?', purpose: 'ask', icon: Search },
  { label: 'Who should I follow?', question: 'Who should I follow?', purpose: 'ask', icon: Users },
  { label: 'Quiet follows', question: 'Which accounts I follow have gone quiet?', purpose: 'ask', icon: CircleHelp },
];

export function PubchiCapabilities({
  tier,
  compact = false,
  disabled = false,
  onSelect,
  onBuildFeed,
  onAsk,
  quickQuestionsOpen = false,
  onQuickQuestionsOpenChange,
}: PubchiCapabilitiesProps) {
  const [dailyQuestion, ...otherQuestions] = quickQuestions;
  const DailyQuestionIcon = dailyQuestion?.icon;
  const content = (
    <>
      <div className={compact ? 'flex w-full flex-wrap gap-2 pb-1' : 'grid gap-2 sm:grid-cols-2'}>
        {compact && dailyQuestion ? (
          <Button
            type="button"
            variant="ghost"
            data-testid="pubchi-daily-question"
            className="shrink-0"
            disabled={disabled}
            onClick={() => onSelect(dailyQuestion.question, dailyQuestion.purpose)}
          >
            {DailyQuestionIcon ? <DailyQuestionIcon aria-hidden="true" /> : null}
            {dailyQuestion.label}
          </Button>
        ) : null}
        {compact && onAsk ? (
          <Button type="button" data-testid="pubchi-ask" disabled={disabled} onClick={onAsk}>
            Ask
          </Button>
        ) : null}
        {compact ? (
          <Button
            type="button"
            data-testid="pubchi-build-feed"
            variant="secondary"
            disabled={disabled}
            onClick={onBuildFeed}
          >
            <Rss aria-hidden="true" />
            Build feed
          </Button>
        ) : null}
        {!compact
          ? quickQuestions.map(({ label, question, purpose, icon: Icon }) => (
              <Button
                key={question}
                data-testid={purpose === 'who-tagged-me' ? 'pubchi-who-tagged-me' : undefined}
                type="button"
                variant="secondary"
                className={compact ? 'shrink-0' : 'justify-start'}
                disabled={disabled}
                onClick={() => onSelect(question, purpose)}
              >
                <Icon aria-hidden="true" />
                {label}
              </Button>
            ))
          : null}
        {!compact ? (
          <Button
            type="button"
            data-testid="pubchi-build-feed"
            variant="secondary"
            className="justify-start"
            disabled={disabled}
            onClick={onBuildFeed}
          >
            <Rss aria-hidden="true" />
            Build feed
          </Button>
        ) : null}
      </div>
      {compact ? (
        <Collapsible open={quickQuestionsOpen} onOpenChange={onQuickQuestionsOpenChange}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="w-full justify-between">
              Quick questions
              <ChevronDown className="size-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-wrap gap-2 pt-2">
            {otherQuestions.map(({ label, question, purpose, icon: Icon }) => (
              <Button
                key={question}
                data-testid={purpose === 'who-tagged-me' ? 'pubchi-who-tagged-me' : undefined}
                type="button"
                variant="secondary"
                className="shrink-0"
                disabled={disabled}
                onClick={() => onSelect(question, purpose)}
              >
                <Icon aria-hidden="true" />
                {label}
              </Button>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      {!compact ? (
        <div className="rounded-lg border border-dashed border-border p-3 opacity-60" aria-disabled="true">
          <div className="flex items-center gap-2">
            <Bot aria-hidden="true" className="size-4" />
            <Typography size="sm" className="font-medium">
              Coming with Autonomous
            </Typography>
            <Badge variant="outline">Not available</Badge>
          </div>
          <Typography size="sm" className="mt-1">
            Posting, replying, and proactive digests — not in this version.
          </Typography>
        </div>
      ) : null}
    </>
  );

  if (compact) return <div data-testid="pubchi-capabilities-compact">{content}</div>;

  return (
    <Card data-surface="pubchi-capabilities" data-testid="pubchi-capabilities">
      <CardHeader>
        <CardTitle>What it can do</CardTitle>
        <Typography size="sm" className="text-muted-foreground">
          {tier === 'assisted'
            ? 'Your Pubchi can prepare changes for your review.'
            : 'Read-only questions and feed previews.'}
        </Typography>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{content}</CardContent>
    </Card>
  );
}
