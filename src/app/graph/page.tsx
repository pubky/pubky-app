import { Suspense } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { Graph } from '@/templates/Graph/Graph';

export const metadata = Metadata({
  title: 'Graph',
  description: 'Explore the Pubky social graph.',
});

function GraphLoadingFallback() {
  return (
    <Container className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </Container>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<GraphLoadingFallback />}>
      <Graph />
    </Suspense>
  );
}
