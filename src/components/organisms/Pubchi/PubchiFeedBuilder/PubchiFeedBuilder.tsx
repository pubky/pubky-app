'use client';

import { useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { usePubchiFeedBuilder } from '@/hooks/usePubchiFeedBuilder/usePubchiFeedBuilder';
import type { FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { CustomFeedDialog } from '@/organisms/CustomFeedDialog/CustomFeedDialog';

export type PubchiFeedBuilderProps = {
  proposal: FeedProposalV2;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInterpret: (question: string, replaceAll: boolean) => Promise<void>;
  existingFeed?: FeedModelSchema;
  initialQuestion?: string;
  interpreting?: boolean;
  interpretationError?: string;
};

export function PubchiFeedBuilder({
  proposal,
  open,
  onOpenChange,
  onInterpret,
  existingFeed,
  initialQuestion = '',
  interpreting = false,
  interpretationError,
}: PubchiFeedBuilderProps) {
  const [question, setQuestion] = useState(initialQuestion);
  const [replaceAll, setReplaceAll] = useState(false);
  const { mapped, initialValues, preview, save, setDraft } = usePubchiFeedBuilder({
    proposal,
    existingFeed,
    onOpenChange,
  });
  const hasFollowers = proposal.feed.feed.reach === 'followers';

  const notices = proposal.mapping.unmapped.map((entry) => (
    <Typography key={`${entry.request}-${entry.reason}`} size="xs" className="text-muted-foreground">
      {entry.reason === 'likes_unavailable'
        ? "Feeds can't filter by likes because Pubky doesn't model likes; closest: Popularity or Recent"
        : entry.reason === 'followers_not_authorable'
          ? 'Followers reach is not available in this App'
          : (entry.suggestion ?? entry.request)}
    </Typography>
  ));

  return (
    <CustomFeedDialog
      {...(existingFeed ? { mode: 'edit' as const, feed: existingFeed } : { mode: 'create' as const })}
      open={open}
      onOpenChange={onOpenChange}
      initialValues={initialValues}
      onSubmitOverride={save}
      canSave={mapped.canApply && !interpreting}
      surfaceId="pubchi-feed-builder"
      onValuesChange={setDraft}
      saveLabel={mapped.canApply ? (existingFeed ? 'Update feed' : 'Apply feed') : 'Choose supported settings'}
      extraContent={
        <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
          <div>
            <Typography className="font-medium">How feeds work</Typography>
            <Typography size="xs" className="text-muted-foreground">
              Set the filters below, or describe the feed and let Pubchi fill them in.
            </Typography>
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <Typography size="xs">
              Reach: Following = people you follow; Friends = mutual follows; All = everyone; WoT = within two hops of
              your follows; Me = only you; Followers = not available in this App.
            </Typography>
            <Typography size="xs">Sort: Recent or Popularity (bookmarks, reposts, replies).</Typography>
            <Typography size="xs">Layout: Columns, Wide, Visual, or List.</Typography>
            <Typography size="xs">Content: All, Short, Long, Image, Video, Link, File, or Collection.</Typography>
          </div>
          {notices}
          {interpretationError ? (
            <Typography role="alert" size="sm">
              {interpretationError}
            </Typography>
          ) : null}
          <label htmlFor="pubchi-feed-interpret-input" className="text-xs font-medium">
            {existingFeed ? 'Changes to make' : 'Feed description'}
          </label>
          <textarea
            id="pubchi-feed-interpret-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={existingFeed ? 'Describe what to change…' : 'Describe the feed you want to create…'}
            className="min-h-20 rounded-md border bg-background p-2 text-sm"
            data-testid="pubchi-feed-interpret-input"
          />
          <div className="flex items-center gap-2">
            <input
              id="pubchi-feed-replace"
              type="checkbox"
              checked={replaceAll}
              onChange={(event) => setReplaceAll(event.target.checked)}
            />
            <label htmlFor="pubchi-feed-replace" className="text-sm">
              Replace all settings
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onInterpret(question, replaceAll)}
              disabled={interpreting || !question.trim()}
            >
              Interpret
            </Button>
          </div>
          {hasFollowers ? (
            <Typography size="xs" role="alert" className="text-destructive">
              Followers was requested but is not available in this App — choose another reach.
            </Typography>
          ) : null}
          <Typography size="xs" className="text-muted-foreground">
            Preview from this device — the installed feed may differ
          </Typography>
          {preview.error ? (
            <Typography size="xs" role="status">
              Preview unavailable; your settings are still editable
            </Typography>
          ) : preview.ids.length === 0 ? (
            <Typography size="xs" role="status">
              Preview: no cached posts match yet — the feed will fill as posts arrive
            </Typography>
          ) : (
            <ul data-testid="pubchi-feed-preview-results" className="flex flex-col gap-1">
              {preview.ids.map((id) => (
                <li key={id} className="truncate text-xs">
                  {id}
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    />
  );
}
