'use client';

import { Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DialogDescription, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import { FEEDBACK_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { getCharacterCount } from '@/libs/utils/utils';
import { PostHeader } from '../../PostHeader/PostHeader';
import type { DialogFeedbackContentProps } from './DialogFeedbackContent.types';

export function DialogFeedbackContent({
  feedback,
  handleChange,
  submit,
  isSubmitting,
  hasContent,
  currentUserPubky,
}: DialogFeedbackContentProps) {
  const t = useTranslations('feedback');
  const tCommon = useTranslations('common');
  const characterLimit =
    feedback.length > 0
      ? {
          count: getCharacterCount(feedback),
          max: FEEDBACK_MAX_CHARACTER_LENGTH,
        }
      : undefined;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('description')}</DialogDescription>
      </DialogHeader>
      <Container className="gap-3">
        <Container overrideDefaults className="rounded-md border border-dashed border-input p-6">
          <Container className="gap-4 contain-inline-size" overrideDefaults>
            <PostHeader
              postId={currentUserPubky}
              isReplyInput={true}
              characterLimit={characterLimit}
              showPopover={false}
            />

            <Textarea
              placeholder={t('placeholder')}
              variant="inline"
              className="px-0 py-2 text-base"
              value={feedback}
              onChange={handleChange}
              maxLength={FEEDBACK_MAX_CHARACTER_LENGTH}
              rows={1}
              disabled={isSubmitting}
            />

            <Container
              className={`flex items-center justify-end transition-all duration-300 ease-in-out ${hasContent ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`}
              overrideDefaults
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={submit}
                disabled={!hasContent || isSubmitting}
                className="h-8 rounded-full border-none px-3 py-2 shadow-xs"
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin text-secondary-foreground" strokeWidth={2} />
                ) : (
                  <Container className="flex items-center gap-2" overrideDefaults>
                    <Send className="size-4 text-secondary-foreground" strokeWidth={2} />
                    <Typography as="span" size="sm" className="text-xs leading-4 font-bold text-secondary-foreground">
                      {tCommon('send')}
                    </Typography>
                  </Container>
                )}
              </Button>
            </Container>
          </Container>
        </Container>
      </Container>
    </>
  );
}
