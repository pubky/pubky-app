import { OnboardingScanPage } from '@/templates/Onboarding/OnboardingScanPage/OnboardingScanPage';
import { Metadata } from '@/molecules/Metadata/Metadata';

export const metadata = Metadata({
  title: 'Scan - Onboarding',
  description: 'Onboarding scan page on pubky app.',
});

export default function ScanPage() {
  return <OnboardingScanPage />;
}
