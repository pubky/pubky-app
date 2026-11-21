'use client';

import { useState } from 'react';
import { PageTitle } from '@/molecules/Page/Page';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { useAuthStore } from '@/stores/auth/auth.store';
import { WalletAccount } from './WalletAccount';

export function Wallet({ recipient, showTimings = false }: { recipient?: string; showTimings?: boolean }) {
  const account = useAuthStore((state) => (state.session ? state.currentUserPubky : null));
  const [revision, setRevision] = useState(0);
  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
    >
      <main className="sentry-block mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16" data-sentry-block>
        <PageTitle size="medium">Wallet</PageTitle>
        {account && (
          <WalletAccount
            key={`${account}-${revision}-${showTimings}`}
            account={account}
            recipient={recipient}
            showTimings={showTimings}
            reset={() => setRevision((n) => n + 1)}
          />
        )}
      </main>
    </ContentLayout>
  );
}
