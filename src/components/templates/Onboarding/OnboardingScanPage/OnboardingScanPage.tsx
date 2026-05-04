import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { ScanContent, ScanFooter, ScanNavigation } from '@/organisms/Scan/Scan';

export function OnboardingScanPage() {
  return (
    <OnboardingLayout testId="scan-page-content" navigation={<ScanNavigation />}>
      <ScanContent />
      <ScanFooter />
    </OnboardingLayout>
  );
}
