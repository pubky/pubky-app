import * as Templates from '@/templates';
import * as Molecules from '@/molecules';

export const metadata = Molecules.Metadata({
  title: 'Scan - Onboarding',
  description: 'Onboarding scan page on pubky app.',
});

export default function ScanPage() {
  return <Templates.OnboardingScanPage />;
}
