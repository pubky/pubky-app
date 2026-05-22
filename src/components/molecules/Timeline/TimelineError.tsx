import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

interface TimelineErrorProps {
  message: string;
}

/**
 * TimelineError
 *
 * Error message display for timeline loading errors.
 */
export function TimelineError({ message }: TimelineErrorProps) {
  return (
    <Container className="flex items-center justify-center py-4">
      <Typography size="sm" className="text-destructive">
        Error loading more posts: {message}
      </Typography>
    </Container>
  );
}
