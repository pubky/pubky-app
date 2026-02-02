'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import { FEEDBACK_MAX_CHARACTER_LENGTH } from '@/config';
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
    feedback.length > 0 ? { count: Libs.getCharacterCount(feedback), max: FEEDBACK_MAX_CHARACTER_LENGTH } : undefined;

  return (
    <>
      <Atoms.DialogHeader>
        <Atoms.DialogTitle>{t('title')}</Atoms.DialogTitle>
        <Atoms.DialogDescription className="sr-only">{t('description')}</Atoms.DialogDescription>
      </Atoms.DialogHeader>
      <Atoms.Container className="gap-3">
        <Atoms.Container overrideDefaults className="rounded-md border border-dashed border-input p-6">
          <Atoms.Container className="gap-4 contain-inline-size" overrideDefaults>
            <Organisms.PostHeader
              postId={currentUserPubky}
              isReplyInput={true}
              characterLimit={characterLimit}
              showPopover={false}
            />

            <Atoms.Textarea
              placeholder={t('placeholder')}
              className="min-h-6 resize-none border-none bg-transparent px-0 py-2 text-base font-medium text-secondary-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={feedback}
              onChange={handleChange}
              maxLength={FEEDBACK_MAX_CHARACTER_LENGTH}
              rows={1}
              disabled={isSubmitting}
            />

            <Atoms.Container
              className={`flex items-center justify-end transition-all duration-300 ease-in-out ${
                hasContent ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
              }`}
              overrideDefaults
            >
              <Atoms.Button
                variant="secondary"
                size="sm"
                onClick={submit}
                disabled={!hasContent || isSubmitting}
                className="h-8 rounded-full border-none px-3 py-2 shadow-xs-dark"
              >
                {isSubmitting ? (
                  <Libs.Loader2 className="size-4 animate-spin text-secondary-foreground" strokeWidth={2} />
                ) : (
                  <Atoms.Container className="flex items-center gap-2" overrideDefaults>
                    <Libs.Send className="size-4 text-secondary-foreground" strokeWidth={2} />
                    <Atoms.Typography
                      as="span"
                      size="sm"
                      className="text-xs leading-4 font-bold text-secondary-foreground"
                    >
                      {tCommon('send')}
                    </Atoms.Typography>
                  </Atoms.Container>
                )}
              </Atoms.Button>
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Container>
    </>
  );
}
