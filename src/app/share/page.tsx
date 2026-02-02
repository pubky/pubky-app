import { Suspense } from 'react';
import * as Molecules from '@/molecules';
import * as Templates from '@/templates';

export const metadata = Molecules.Metadata({
  title: 'Share to Pubky',
  description: 'Share content to Pubky App.',
  robots: false,
});

export default function SharePage() {
  return (
    <Suspense>
      <Templates.ShareTarget />
    </Suspense>
  );
}
