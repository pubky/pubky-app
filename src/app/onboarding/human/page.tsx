import { Human } from '@/templates/Onboarding/Human/Human';
import { Metadata } from '@/molecules/Metadata/Metadata';

export const metadata = Metadata({
  title: 'Fair Access - Onboarding',
  description: 'Onboarding fair access page on pubky app.',
});

export default function HumanPage() {
  return <Human />;
}
