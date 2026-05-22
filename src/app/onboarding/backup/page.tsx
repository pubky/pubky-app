import { Metadata } from '@/molecules/Metadata/Metadata';
import { BackupPage as TemplatesBackupPage } from '@/templates/Onboarding/BackupPage/BackupPage';

export const metadata = Metadata({
  title: 'Backup - Onboarding',
  description: 'Onboarding backup page on pubky app.',
});

export default function BackupPage() {
  return <TemplatesBackupPage />;
}
