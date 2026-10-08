'use client';

import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

interface TimelineErrorStateProps {
  message: string;
}

/**
 * TimelineErrorState
 *
 * Error shown where a timeline's first load would have rendered posts.
 */
export function TimelineErrorState({ message }: TimelineErrorStateProps) {
  return (
    <Container className="flex items-center justify-center py-8">
      <Typography size="md" className="text-destructive">
        Error: {message}
      </Typography>
    </Container>
  );
}
