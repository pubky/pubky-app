import { Metadata } from '@/molecules/Metadata/Metadata';
import { Human } from '@/templates/Onboarding/Human/Human';

export const metadata = Metadata({
  title: 'Fair Access - Onboarding',
  description: 'Onboarding fair access page on pubky app.',
});

export default function HumanPage() {
  return <Human />;
}
