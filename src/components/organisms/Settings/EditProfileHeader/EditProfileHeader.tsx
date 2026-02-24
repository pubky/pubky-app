'use client';

import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';

export const EditProfileHeader = () => {
  const t = useTranslations('forms.profile');
  const { currentUserPubky } = Hooks.useCurrentUserProfile();
  const { copyToClipboard } = Hooks.useCopyToClipboard();

  const displayPublicKey = Libs.formatPublicKey({
    key: currentUserPubky ?? '',
  });

  const handleCopyToClipboard = () => {
    if (currentUserPubky) {
      copyToClipboard(Libs.withPubkyPrefix(currentUserPubky));
    }
  };

  return (
    <Atoms.PageHeader>
      <Molecules.PageTitle size="large">
        {t('title')}{' '}
        <Atoms.Typography as="span" overrideDefaults className="text-brand">
          {t('titleHighlight')}
        </Atoms.Typography>
      </Molecules.PageTitle>
      <Atoms.Container className="m-0 w-auto flex-col gap-4 md:flex-row md:items-center">
        <Atoms.PageSubtitle>{t('subtitle')}</Atoms.PageSubtitle>
        <Atoms.Container className="mx-0 w-auto flex-row items-center gap-2">
          <Atoms.Button
            variant="secondary"
            className="h-8 w-fit gap-2 rounded-full uppercase"
            onClick={handleCopyToClipboard}
          >
            <Libs.Key className="h-4 w-4" />
            {displayPublicKey || '...'}
          </Atoms.Button>
          <Molecules.PopoverPublicKey className="-ml-1" />
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.PageHeader>
  );
};
