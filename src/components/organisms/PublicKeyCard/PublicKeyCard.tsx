'use client';

import { useEffect } from 'react';
import { Copy, Key } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { ProfileController } from '@/controllers/profile/profile';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { withPubkyPrefix } from '@/libs/utils/utils';
import { ActionSection } from '@/molecules/ActionSection/ActionSection';
import { ContentCard } from '@/molecules/Content/Content';
import { InputField } from '@/molecules/InputField/InputField';
import { PopoverPublicKey } from '@/molecules/PopoverPublicKey/PopoverPublicKey';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

export function PublicKeyCard() {
  const secretKey = useOnboardingStore((state) => state.secretKey);
  const pubky = useAuthStore((state) => state.currentUserPubky);
  const displayPubky = pubky ? withPubkyPrefix(pubky) : '';
  const { copyToClipboard } = useCopyToClipboard();
  useEffect(() => {
    if (!secretKey) {
      ProfileController.generateSecrets();
    }
  }, [secretKey]);
  const handleCopyToClipboard = () => {
    if (displayPubky) {
      copyToClipboard(displayPubky);
    }
  };
  const actions = [
    {
      id: 'copy-to-clipboard-action-btn',
      label: 'Copy to clipboard',
      icon: <Copy className="mr-2 h-4 w-4" />,
      onClick: handleCopyToClipboard,
      variant: 'secondary' as const,
      disabled: !displayPubky,
    },
  ];
  return (
    <ContentCard
      image={{
        src: '/images/key.webp',
        alt: 'Key',
        width: 192,
        height: 192,
      }}
    >
      <Container className="flex-row items-center gap-1">
        <Heading level={3} size="lg">
          {'Your pubky'}
        </Heading>
        <PopoverPublicKey />
      </Container>
      <ActionSection actions={actions} className="w-full flex-col items-start justify-start gap-3">
        <InputField
          value={displayPubky}
          variant="dashed"
          readOnly
          onClick={handleCopyToClipboard}
          loading={!displayPubky}
          loadingText={'Generating pubky...'}
          icon={<Key className="h-4 w-4 text-brand" />}
          status={displayPubky ? 'success' : 'default'}
          className="w-full max-w-[576px]"
          dataCy="pubky-display"
        />
      </ActionSection>
    </ContentCard>
  );
}
