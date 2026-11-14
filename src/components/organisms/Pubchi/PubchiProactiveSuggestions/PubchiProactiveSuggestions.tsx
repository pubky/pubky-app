'use client';

import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import type { PubchiSuggestionV1 } from '@/libs/pubchi/schemas/suggestion';
import { pubkyUriToAppHref } from '@/libs/pubchi/uri';

export const PUBCHI_PROACTIVE_SURFACE = 'pubchi-proactive-suggestions';

type PubchiProactiveSuggestionsProps = {
  suggestions: PubchiSuggestionV1[];
  currentUserPubky?: string | null;
  onDismiss: (suggestionId: string) => void;
};

export function PubchiProactiveSuggestions({
  suggestions,
  currentUserPubky,
  onDismiss,
}: PubchiProactiveSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <Card data-surface={PUBCHI_PROACTIVE_SURFACE} data-testid={PUBCHI_PROACTIVE_SURFACE}>
      <CardHeader>
        <CardTitle>What you missed</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.suggestion_id}
            data-testid={`pubchi-proactive-${suggestion.suggestion_id}`}
            className="flex flex-col gap-2 rounded-md border p-3"
          >
            <Typography className="font-medium">{suggestion.title}</Typography>
            <Typography size="sm">{suggestion.summary}</Typography>
            <div className="flex flex-col gap-1">
              {suggestion.source_uris.map((uri) => {
                const href = pubkyUriToAppHref(uri, currentUserPubky);
                return href ? (
                  <Link key={uri} href={href} className="truncate text-sm underline">
                    {uri}
                  </Link>
                ) : (
                  <Typography key={uri} size="sm" className="truncate">
                    {uri}
                  </Typography>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid={`pubchi-proactive-dismiss-${suggestion.suggestion_id}`}
              onClick={() => onDismiss(suggestion.suggestion_id)}
            >
              Dismiss
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
