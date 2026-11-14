import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { PubchiBrain } from '@/templates/Pubchi/PubchiBrain/PubchiBrain';

export default function PubchiBrainPage() {
  if (!isPubchiEnabled()) redirect(APP_ROUTES.HOME);
  return <PubchiBrain />;
}
