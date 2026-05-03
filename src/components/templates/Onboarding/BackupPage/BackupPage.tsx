import { OnboardingLayout } from '@/molecules/OnboardingLayout/OnboardingLayout';
import { BackupNavigation, BackupPageHeader } from '@/organisms/Backup/Backup';
import { BackupMethodCard } from '@/organisms/BackupMethodCard/BackupMethodCard';

export function BackupPage() {
  return (
    <OnboardingLayout testId="backup-content" navigation={<BackupNavigation />}>
      <BackupPageHeader />
      <BackupMethodCard />
    </OnboardingLayout>
  );
}
