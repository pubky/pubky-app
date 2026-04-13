import { Suspense } from 'react';
import * as Atoms from '@/atoms';
import * as Templates from '@/templates';
import * as Molecules from '@/molecules';

export const metadata = Molecules.Metadata({
  title: 'Fair Access - Onboarding',
  description: 'Onboarding fair access page on pubky app.',
});

function HumanLoadingFallback() {
  return (
    <Atoms.Container className="flex min-h-[50vh] items-center justify-center">
      <Atoms.Spinner />
    </Atoms.Container>
  );
}

export default function HumanPage() {
  return (
    <Suspense fallback={<HumanLoadingFallback />}>
      <Templates.Human />
    </Suspense>
  );
}
