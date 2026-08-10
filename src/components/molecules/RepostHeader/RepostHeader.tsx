'use client';

import { Repeat } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

/**
 * RepostHeader
 *
 * Header bar displayed on top of reposts made by the current user.
 * Shows "You reposted" with a repeat icon.
 * Only shown on simple reposts (no content) by current user.
 */
export function RepostHeader() {
  return (
    <Container
      className="flex items-center gap-3 rounded-t-md bg-muted px-4 py-3"
      overrideDefaults
      data-testid="repost-header"
    >
      <Repeat className="size-5" aria-label="Repeat" />
      <Typography as="span" className="text-base font-bold text-foreground" overrideDefaults>
        {'You reposted'}
      </Typography>
    </Container>
  );
}
