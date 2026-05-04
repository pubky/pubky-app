import { Install } from '@/templates/Onboarding/Install/Install';
import { Metadata } from '@/molecules/Metadata/Metadata';

export const metadata = Metadata({
  title: 'Install - Onboarding',
  description: 'Onboarding install page on pubky app.',
});

export default function InstallPage() {
  return <Install />;
}
