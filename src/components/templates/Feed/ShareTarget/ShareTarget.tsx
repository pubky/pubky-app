'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { composeShareContent, getSharedFiles } from '@/libs/share/shareTarget';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { PostInput } from '@/organisms/PostInput/PostInput';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { ShareTargetSkeleton } from './ShareTarget.skeleton';

export function ShareTarget() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('share');

  const [initialContent, setInitialContent] = useState('');
  const [initialAttachments, setInitialAttachments] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Compose content from URL search params and retrieve cached files
  useEffect(() => {
    const title = searchParams.get('title') ?? undefined;
    const text = searchParams.get('text') ?? undefined;
    const url = searchParams.get('url') ?? undefined;
    const hasFiles = searchParams.get('hasFiles') === 'true';

    const content = composeShareContent({ title, text, url });
    setInitialContent(content);

    if (hasFiles) {
      getSharedFiles()
        .then((files) => {
          if (files.length > 0) {
            setInitialAttachments(files);
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [searchParams]);

  const handleSuccess = useCallback(() => {
    router.push(APP_ROUTES.HOME);
  }, [router]);

  const handleCancel = useCallback(() => {
    router.push(APP_ROUTES.HOME);
  }, [router]);

  if (isLoading) {
    return <ShareTargetSkeleton />;
  }

  return (
    <ContentLayout>
      <Container className="mx-auto w-full max-w-2xl gap-4 p-4">
        <Container className="flex-row items-center justify-between" overrideDefaults>
          <Typography as="h2" size="lg">
            {t('title')}
          </Typography>
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
        </Container>

        <PostInput
          dataCy="share-target-post-input"
          variant={POST_INPUT_VARIANT.POST}
          expanded={true}
          onSuccess={handleSuccess}
          initialContent={initialContent}
          initialAttachments={initialAttachments.length > 0 ? initialAttachments : undefined}
        />
      </Container>
    </ContentLayout>
  );
}
