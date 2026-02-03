import { Suspense } from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Templates from '@/templates';

export const metadata = Molecules.Metadata({
  title: 'Share to Pubky',
  description: 'Share content to Pubky App.',
  robots: false,
});

function ShareLoadingFallback() {
  return (
    <Atoms.Container className="flex min-h-[50vh] items-center justify-center">
      <Atoms.Spinner />
    </Atoms.Container>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<ShareLoadingFallback />}>
      <Templates.ShareTarget />
    </Suspense>
  );
}
