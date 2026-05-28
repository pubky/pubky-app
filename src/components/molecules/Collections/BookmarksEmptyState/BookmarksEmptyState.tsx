import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

interface BookmarksEmptyStateProps {
  title: string;
  description: string;
}

export function BookmarksEmptyState({ title, description }: BookmarksEmptyStateProps) {
  return (
    <Container
      data-testid="bookmarks-empty-state"
      overrideDefaults
      className="flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-md px-6 py-12 text-center"
    >
      <Typography as="h2" overrideDefaults className="text-xl leading-7 font-bold text-foreground">
        {title}
      </Typography>
      <Typography overrideDefaults className="max-w-md text-base leading-6 font-medium text-muted-foreground">
        {description}
      </Typography>
    </Container>
  );
}
