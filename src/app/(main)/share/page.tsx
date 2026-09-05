import { Suspense } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { ShareTarget } from '@/templates/Feed/ShareTarget/ShareTarget';

export const metadata = Metadata({
  title: 'Share to Pubky',
  description: 'Share content to Pubky App.',
  robots: false,
});

function ShareLoadingFallback() {
  return (
    <Container className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </Container>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<ShareLoadingFallback />}>
      <ShareTarget />
    </Suspense>
  );
}
