import { placeholderParams } from '@/libs/static-export/placeholderParams';
import { InviteRedirect } from './InviteRedirect';

export const generateStaticParams = placeholderParams('inviteCode');

export default function InvitePage() {
  return <InviteRedirect />;
}
