import { placeholderParams } from '@/libs/static-export/placeholderParams';
import { InviteRedirect } from './InviteRedirect';

export function generateStaticParams() {
  return placeholderParams('inviteCode');
}

export default function InvitePage() {
  return <InviteRedirect />;
}
