'use client';

import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef, type SyntheticEvent, useState } from 'react';
import { Library, MessageCircle, Plus, Repeat, SquarePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useAddContentForm } from '@/hooks/useAddContentForm/useAddContentForm';
import { ADD_CONTENT_FORM_FIELDS } from '@/hooks/useAddContentForm/useAddContentForm.types';
import { cn } from '@/libs/utils/utils';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { GRID_DASHED_CTA_TRIGGER_CLASS } from '@/organisms/Collections/gridDashedCta.const';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import type { AddContentDialogProps } from './AddContentDialog.types';

const AddContentHeroTrigger = forwardRef<
  ComponentRef<typeof Button>,
  ComponentPropsWithoutRef<typeof Button> & Pick<AddContentDialogProps, 'dataCy'>
>(function AddContentHeroTrigger({ className, dataCy, ...props }, ref) {
  const t = useTranslations('collections.single');

  return (
    <Button
      ref={ref}
      variant="secondary"
      size="icon"
      type="button"
      aria-label={t('content')}
      data-cy={dataCy}
      className={cn('lg:h-8 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:text-xs', className)}
      {...props}
    >
      <SquarePlus className="size-4" />
      <Typography as="span" overrideDefaults className="hidden lg:inline">
        {t('content')}
      </Typography>
    </Button>
  );
});

const AddContentGridTrigger = forwardRef<
  ComponentRef<typeof Button>,
  ComponentPropsWithoutRef<typeof Button> & Pick<AddContentDialogProps, 'dataCy'>
>(function AddContentGridTrigger({ className, dataCy, ...props }, ref) {
  const t = useTranslations('collections.single');

  return (
    <Button
      ref={ref}
      overrideDefaults
      type="button"
      aria-label={t('addContent')}
      data-cy={dataCy}
      className={cn(GRID_DASHED_CTA_TRIGGER_CLASS, className)}
      {...props}
    >
      <Plus className="size-3 shrink-0" />
      <Typography as="span" overrideDefaults className="text-sm font-bold">
        {t('addContent')}
      </Typography>
    </Button>
  );
});

function ActionPill({
  icon: Icon,
  count,
  isHighlighted = false,
}: {
  icon: typeof MessageCircle;
  count?: number;
  isHighlighted?: boolean;
}) {
  return (
    <Container
      overrideDefaults
      className={cn(
        'flex h-8 items-center justify-center gap-1.5 rounded-full bg-secondary px-3.5 py-2 text-muted-foreground shadow-xs',
        !isHighlighted && 'opacity-30',
        isHighlighted && 'drop-shadow-[0_0_8px_var(--brand)]',
      )}
    >
      <Icon className="size-4 shrink-0" />
      {count !== undefined && (
        <Typography as="span" overrideDefaults className="text-xs leading-4 font-bold">
          {count}
        </Typography>
      )}
    </Container>
  );
}

function FeedInstructionCard() {
  const t = useTranslations('collections.addContentDialog');

  return (
    <Card className="min-w-0 flex-1 overflow-hidden rounded-md py-6 shadow-sm">
      <CardHeader className="px-6">
        <CardTitle className="text-base leading-none font-bold text-card-foreground lg:text-brand">
          {t('fromFeedTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6">
        <Typography overrideDefaults className="text-sm leading-5 font-medium text-muted-foreground">
          <Typography
            as="span"
            overrideDefaults
            className="font-bold text-brand lg:font-medium lg:text-muted-foreground"
          >
            {t('fromFeedLead')}
          </Typography>
          {t('fromFeedRest')}
        </Typography>
      </CardContent>
      <CardFooter className="justify-start px-6">
        <Container overrideDefaults className="flex flex-wrap items-center justify-start gap-2">
          <ActionPill icon={MessageCircle} count={7} />
          <ActionPill icon={Repeat} count={3} />
          <ActionPill icon={Library} isHighlighted />
        </Container>
      </CardFooter>
    </Card>
  );
}

function UrlPasteCard({ addContentForm }: { addContentForm: ReturnType<typeof useAddContentForm> }) {
  const t = useTranslations('collections.addContentDialog');

  return (
    <Card className="min-w-0 flex-1 overflow-hidden rounded-md py-6 shadow-sm">
      <CardHeader className="px-6">
        <CardTitle className="text-base leading-none font-bold text-card-foreground">{t('pasteTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="px-6">
        <Typography overrideDefaults className="text-sm leading-5 font-medium text-muted-foreground">
          {t('pasteDescription')}
        </Typography>
      </CardContent>
      <CardFooter className="flex-col items-stretch px-6">
        <ControlledInputField
          name={ADD_CONTENT_FORM_FIELDS.POST_URL}
          control={addContentForm.form.control}
          placeholder="https://"
          variant="dashed"
          size="md"
          disabled={addContentForm.isPending}
          loading={addContentForm.isPending}
          loadingText={t('adding')}
          onPaste={addContentForm.handlePaste}
          className="mb-0 h-auto gap-2 border-input bg-background/10! px-6 py-4 font-medium shadow-xs has-[input[aria-invalid=true]]:border-red-500"
          inputClassName="h-auto p-0 shadow-none"
          dataCy="add-content-url-input"
        />
      </CardFooter>
    </Card>
  );
}

function AddContentDialogBody({
  target,
  onSuccess,
}: {
  target: NonNullable<AddContentDialogProps['target']>;
  onSuccess: (postId: string) => Promise<void>;
}) {
  const t = useTranslations('collections.addContentDialog');
  const addContentForm = useAddContentForm({
    target,
    onSuccess,
  });

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    await addContentForm.submit();
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
      <DialogHeader className="pr-0">
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      <Container overrideDefaults className="flex w-full flex-col gap-3 lg:flex-row">
        <FeedInstructionCard />
        <UrlPasteCard addContentForm={addContentForm} />
      </Container>
    </form>
  );
}

export function AddContentDialog({
  dataCy = 'add-content',
  target = { type: 'bookmarks' },
  triggerVariant = 'hero',
}: AddContentDialogProps) {
  const t = useTranslations('collections.addContentDialog');
  const [open, setOpen] = useState(false);
  const timelineFeed = useTimelineFeedContext();

  const handleSuccess = async (postId: string) => {
    timelineFeed?.prependOptimisticPosts(postId);
    setOpen(false);
  };

  const trigger =
    triggerVariant === 'grid' ? <AddContentGridTrigger dataCy={dataCy} /> : <AddContentHeroTrigger dataCy={dataCy} />;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="flex max-w-xl flex-col overflow-hidden bg-popover shadow-2xl outline-none focus:outline-none focus-visible:outline-none"
        hiddenTitle={t('title')}
      >
        <AddContentDialogBody target={target} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  );
}
