'use client';

import type { DiscoveredTagSuggestion } from '@/application/pubchi/pubchi.types';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Typography } from '@/atoms/Typography/Typography';

type PubchiAppliedTagSuggestionsProps = {
  suggestions: DiscoveredTagSuggestion[];
  onRevert: (applicationId: string) => void;
  onReconcile: (applicationId: string) => void;
};

export function PubchiAppliedTagSuggestions({ suggestions, onRevert, onReconcile }: PubchiAppliedTagSuggestionsProps) {
  const visible = suggestions.filter(
    (suggestion) => suggestion.status !== 'reverted' && suggestion.status !== 'failed',
  );
  if (visible.length === 0) return null;

  return (
    <Card data-surface="pubchi-applied-section" data-testid="pubchi-applied-section">
      <CardHeader>
        <CardTitle>Applied by Pubchi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {visible.map((suggestion) => (
          <div
            key={suggestion.applicationId}
            data-testid={`pubchi-applied-row-${suggestion.applicationId}`}
            className="flex flex-col gap-2 rounded-md border p-3"
          >
            <Typography className="font-medium">{suggestion.label}</Typography>
            {suggestion.status === 'superseded' ? (
              <Typography size="sm" data-testid={`pubchi-tag-already-applied-${suggestion.applicationId}`}>
                Already applied
              </Typography>
            ) : suggestion.status === 'reverted-outside' ? (
              <Typography size="sm">Removed outside Pubchi</Typography>
            ) : suggestion.status === 'applied' && suggestion.alreadyExisted === false ? (
              <Button
                type="button"
                data-testid={`pubchi-tag-revert-${suggestion.applicationId}`}
                onClick={() => onRevert(suggestion.applicationId)}
              >
                Revert
              </Button>
            ) : (
              <Button
                type="button"
                data-testid={`pubchi-tag-check-again-${suggestion.applicationId}`}
                onClick={() => onReconcile(suggestion.applicationId)}
              >
                Check again
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
