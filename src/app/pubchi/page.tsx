import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { PubchiProfile } from '@/templates/Pubchi/PubchiProfile/PubchiProfile';

export default function PubchiPage() {
  if (!isPubchiEnabled()) {
    redirect(APP_ROUTES.HOME);
  }
  return <PubchiProfile />;
}
