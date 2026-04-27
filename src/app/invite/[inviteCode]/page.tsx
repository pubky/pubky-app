import { redirect } from 'next/navigation';

import { ONBOARDING_ROUTES } from '@/app';
import * as Libs from '@/libs';

interface InvitePageProps {
  params: Promise<{
    inviteCode: string;
  }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { inviteCode } = await params;
  const formattedInviteCode = Libs.formatInviteCode(inviteCode);
  const searchParams = new URLSearchParams();
  searchParams.set('inviteCode', formattedInviteCode);

  redirect(`${ONBOARDING_ROUTES.INSTALL}?${searchParams.toString()}`);
}
