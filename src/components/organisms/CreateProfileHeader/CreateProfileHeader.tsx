'use client';

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useTranslations } from 'next-intl';
import { PageTitle } from '@/molecules/Page/Page';
import { PopoverPublicKey } from '@/molecules/PopoverPublicKey/PopoverPublicKey';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';

import { Key } from 'lucide-react';
import { formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
import { useAuthStore } from '@/stores/auth/auth.store';
export const CreateProfileHeader = () => {
  const t = useTranslations('onboarding.createProfile');
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
        {t.rich('title', {
          highlight: (chunks) => <span className="text-brand">{chunks}</span>,
        })}
      </PageTitle>
      <Container className="m-0 w-auto flex-col gap-4 md:flex-row md:items-center">
        <PageSubtitle>{t('subtitle')}</PageSubtitle>
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
