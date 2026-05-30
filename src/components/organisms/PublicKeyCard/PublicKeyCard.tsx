'use client';

import { useEffect } from 'react';
import { Copy, Key, Share } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { ProfileController } from '@/controllers/profile/profile';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { Logger } from '@/libs/logger/logger';
import { shareWithFallback } from '@/libs/share/share';
import { withPubkyPrefix } from '@/libs/utils/utils';
import { ActionSection } from '@/molecules/ActionSection/ActionSection';
import { ContentCard } from '@/molecules/Content/Content';
import { InputField } from '@/molecules/InputField/InputField';
import { PopoverPublicKey } from '@/molecules/PopoverPublicKey/PopoverPublicKey';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

export function PublicKeyCard() {
  const t = useTranslations('onboarding.pubky');
  const secretKey = useOnboardingStore((state) => state.secretKey);
  const pubky = useAuthStore((state) => state.currentUserPubky);
  const displayPubky = pubky ? withPubkyPrefix(pubky) : '';
  const { copyToClipboard } = useCopyToClipboard();
  const { toast } = useToast();
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
  const handleShare = async () => {
    if (!displayPubky) return;
    try {
      await shareWithFallback(
        {
          title: t('myPubky'),
          text: t('shareText', {
            displayPubky,
          }),
        },
        {
          onFallback: async () => {
            const copied = await copyToClipboard(displayPubky);
            if (!copied) {
              throw new Error('Unable to copy pubky to clipboard');
            }
          },
          onSuccess: (result) => {
            if (result.method === 'fallback') {
              toast({
                title: t('shareUnavailable'),
                description: t('shareUnavailableDescription'),
              });
            }
          },
          onError: () => {
            toast({
              title: t('shareFailed'),
              description: t('shareFailedDescription'),
            });
          },
        },
      );
    } catch (error) {
      // Error handling is done in the onError callback
      // This catch block is here for any unexpected errors
      Logger.error('Unexpected share error', {
        error,
      });
    }
  };
  const actions = [
    {
      id: 'copy-to-clipboard-action-btn',
      label: t('copy'),
      icon: <Copy className="mr-2 h-4 w-4" />,
      onClick: handleCopyToClipboard,
      variant: 'secondary' as const,
      disabled: !displayPubky,
    },
    // Share button is always rendered on mobile (hidden on md+ screens via CSS).
    // When Web Share API is unavailable, it falls back to clipboard copy.
    // See issue #265: visibility based on screen size, not Web Share API support.
    {
      label: t('share'),
      icon: <Share className="mr-2 h-4 w-4" />,
      onClick: handleShare,
      variant: 'secondary' as const,
      disabled: !displayPubky,
      className: 'md:hidden',
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
          {t('title')}
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
          loadingText={t('generating')}
          icon={<Key className="h-4 w-4 text-brand" />}
          status={displayPubky ? 'success' : 'default'}
          className="w-full max-w-[576px]"
          dataCy="pubky-display"
        />
      </ActionSection>
    </ContentCard>
  );
}
