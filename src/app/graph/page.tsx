import { Suspense } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Spinner } from '@/atoms/Spinner/Spinner';
import { Metadata } from '@/molecules/Metadata/Metadata';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
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
    // The canvas card lives in the shell's container like every other page, so
    // it lines up with the header gutter; phones keep the full-bleed canvas
    // (no mobile header on this route) and fullscreen escapes the box anyway.
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      renderMobileHeader={false}
      className="px-0 pb-0 lg:px-6 lg:pb-12 xl:px-0"
    >
      <Suspense fallback={<GraphLoadingFallback />}>
        <Graph />
      </Suspense>
    </ContentLayout>
  );
}
