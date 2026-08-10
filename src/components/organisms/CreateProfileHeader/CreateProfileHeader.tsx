'use client';

import { Key } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
import { PageTitle } from '@/molecules/Page/Page';
import { PopoverPublicKey } from '@/molecules/PopoverPublicKey/PopoverPublicKey';
import { useAuthStore } from '@/stores/auth/auth.store';

export const CreateProfileHeader = () => {
  const authStore = useAuthStore();
  const pubky = authStore.selectCurrentUserPubky();
  const { copyToClipboard } = useCopyToClipboard();
  const displayPublicKey = formatPublicKey({
    key: pubky,
  });
  const handleCopyToClipboard = () => {
    copyToClipboard(withPubkyPrefix(pubky));
  };
  return (
    <PageHeader>
      <PageTitle size="large">
        {'Create your '}
        <span className="text-brand">{'profile.'}</span>
      </PageTitle>
      <Container className="m-0 w-auto flex-col gap-4 md:flex-row md:items-center">
        <PageSubtitle>{'Add your name, bio, links, and avatar.'}</PageSubtitle>
        <Container className="mx-0 w-auto flex-row items-center gap-2">
          <Button
            variant="secondary"
            className="h-8 w-fit gap-2 rounded-full uppercase"
            onClick={handleCopyToClipboard}
          >
            <Key className="h-4 w-4" />
            {displayPublicKey || '...'}
          </Button>
          <PopoverPublicKey className="-ml-1" />
        </Container>
      </Container>
    </PageHeader>
  );
};
