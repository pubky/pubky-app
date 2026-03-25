import * as Atoms from '@/atoms';

export function PostPageHeaderSkeleton() {
  return (
    <Atoms.PageHeader data-testid="post-page-header-loading">
      <Atoms.Container className="flex items-center justify-between" overrideDefaults>
        <Atoms.Skeleton className="h-8 w-48 rounded-md" />
        <Atoms.Skeleton className="h-5 w-32 rounded-md" />
      </Atoms.Container>
    </Atoms.PageHeader>
  );
}
