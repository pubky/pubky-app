import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function PostPageHeaderSkeleton() {
  return (
    <PageHeader data-testid="post-page-header-loading">
      <Container className="flex items-center justify-between" overrideDefaults>
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-5 w-32 rounded-md" />
      </Container>
    </PageHeader>
  );
}
