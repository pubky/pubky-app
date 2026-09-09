import { Metadata } from '@/molecules/Metadata/Metadata';
import { Install } from '@/templates/Onboarding/Install/Install';

export const metadata = Metadata({
  title: 'Install - Onboarding',
  description: 'Onboarding install page on pubky app.',
});

export default function InstallPage() {
  return <Install />;
}
