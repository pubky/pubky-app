import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';

export function OnboardingScanPage() {
  return (
    <Molecules.OnboardingLayout testId="scan-page-content" navigation={<Organisms.ScanNavigation />}>
      <Organisms.ScanContent />
      <Organisms.ScanFooter />
    </Molecules.OnboardingLayout>
  );
}
