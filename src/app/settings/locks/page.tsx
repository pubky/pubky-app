import { redirect } from 'next/navigation';
import { SETTINGS_ROUTES } from '@/app/routes';
import { isLocksConfigured } from '@/config/network';
import { Locks } from '@/templates/Settings/Locks/Locks';

export default function LocksSettingsPage() {
  // The Settings menu hides Locks where it is not configured; a typed URL goes to the first tab.
  if (!isLocksConfigured()) redirect(SETTINGS_ROUTES.ACCOUNT);
  return <Locks />;
}
