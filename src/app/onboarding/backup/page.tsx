import * as Templates from '@/templates';
import * as Molecules from '@/molecules';

export const metadata = Molecules.Metadata({
  title: 'Backup - Onboarding',
  description: 'Onboarding backup page on pubky app.',
});

export default function BackupPage() {
  return <Templates.BackupPage />;
}
