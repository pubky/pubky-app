import { PublicKey } from '@/templates/Onboarding/PublicKey/PublicKey';
import { Metadata } from '@/molecules/Metadata/Metadata';

export const metadata = Metadata({
  title: 'Pubky - Onboarding',
  description: 'Onboarding pubky page on pubky app.',
});

export default function PubkyPage() {
  return <PublicKey />;
}
