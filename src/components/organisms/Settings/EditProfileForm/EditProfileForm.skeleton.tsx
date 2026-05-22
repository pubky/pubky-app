import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function EditProfileFormSkeleton() {
  return (
    <Container className="flex w-full flex-1 flex-col gap-6 lg:flex-none">
      <Card className="rounded-md bg-card p-6 md:p-12 lg:flex lg:flex-row lg:gap-12">
        {/* Profile fields */}
        <Container className="w-full gap-6">
          <Skeleton className="h-7 w-20 rounded-md" />
          <Container className="gap-6">
            <Container className="gap-2">
              <Skeleton className="h-3 w-12 rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </Container>
            <Container className="gap-2">
              <Skeleton className="h-3 w-8 rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
            </Container>
          </Container>
        </Container>

        {/* Links fields */}
        <Container className="mt-6 w-full gap-6 lg:mt-0">
          <Skeleton className="h-7 w-16 rounded-md" />
          <Container className="gap-6">
            <Container className="gap-2">
              <Skeleton className="h-3 w-16 rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </Container>
          </Container>
        </Container>

        {/* Avatar */}
        <Container className="mt-6 w-full gap-6 lg:mt-0">
          <Skeleton className="mx-auto h-7 w-16 rounded-md" />
          <Skeleton className="mx-auto size-48 rounded-full" />
          <Skeleton className="mx-auto h-8 w-28 rounded-full" />
        </Container>
      </Card>

      {/* Bottom buttons */}
      <Container className="mt-auto flex-row justify-between">
        <Skeleton className="h-10 w-28 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </Container>
    </Container>
  );
}
