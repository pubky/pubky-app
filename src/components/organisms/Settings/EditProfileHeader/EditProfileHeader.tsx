'use client';

import { Key } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { Typography } from '@/atoms/Typography/Typography';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { formatPublicKey, withPubkyPrefix } from '@/libs/utils/utils';
import { PageTitle } from '@/molecules/Page/Page';
import { PopoverPublicKey } from '@/molecules/PopoverPublicKey/PopoverPublicKey';

export const EditProfileHeader = () => {
  const t = useTranslations('forms.profile');
  const { currentUserPubky } = useCurrentUserProfile();
  const { copyToClipboard } = useCopyToClipboard();
  const displayPublicKey = formatPublicKey({
    key: currentUserPubky ?? '',
  });
  const handleCopyToClipboard = () => {
    if (currentUserPubky) {
      copyToClipboard(withPubkyPrefix(currentUserPubky));
    }
  };
  return (
    <PageHeader>
      <PageTitle size="large">
        {t('title')}{' '}
        <Typography as="span" overrideDefaults className="text-brand">
          {t('titleHighlight')}
        </Typography>
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
