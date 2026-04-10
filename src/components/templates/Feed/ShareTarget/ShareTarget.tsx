'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { APP_ROUTES } from '@/app/routes';
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

    const content = Libs.composeShareContent({ title, text, url });
    setInitialContent(content);

    if (hasFiles) {
      Libs.getSharedFiles()
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
    <Organisms.ContentLayout>
      <Atoms.Container className="mx-auto w-full max-w-2xl gap-4 p-4">
        <Atoms.Container className="flex-row items-center justify-between" overrideDefaults>
          <Atoms.Typography as="h2" size="lg">
            {t('title')}
          </Atoms.Typography>
          <Atoms.Button variant="ghost" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Atoms.Button>
        </Atoms.Container>

        <Organisms.PostInput
          dataCy="share-target-post-input"
          variant={POST_INPUT_VARIANT.POST}
          expanded={true}
          onSuccess={handleSuccess}
          initialContent={initialContent}
          initialAttachments={initialAttachments.length > 0 ? initialAttachments : undefined}
        />
      </Atoms.Container>
    </Organisms.ContentLayout>
  );
}
