'use client';

import { PageTitle } from '@/molecules/Page/Page';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { useAuthStore } from '@/stores/auth/auth.store';
import { WalletSurface } from './WalletTab';

export function Wallet({ recipient }: { recipient?: string }) {
  const account = useAuthStore((state) => (state.session ? state.currentUserPubky : null));
  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
    >
      <main className="sentry-block mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16" data-sentry-block>
        <PageTitle size="medium">Wallet</PageTitle>
        {account && <WalletSurface account={account} recipient={recipient} />}
      </main>
    </ContentLayout>
  );
}
