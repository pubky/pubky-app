import { redirect } from 'next/navigation';
import { SETTINGS_ROUTES } from '@/app/routes';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { PubchiSettings } from '@/templates/Settings/Pubchi/Pubchi';

export default function PubchiSettingsPage() {
  if (!isPubchiEnabled()) {
    redirect(SETTINGS_ROUTES.ACCOUNT);
  }
  return <PubchiSettings />;
}
