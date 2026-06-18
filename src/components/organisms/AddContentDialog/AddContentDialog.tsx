'use client';

import * as React from 'react';
import { Library, MessageCircle, Plus, Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SyntheticEvent } from 'react';
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
import { ADD_CONTENT_FORM_FIELDS, type AddContentTarget } from '@/hooks/useAddContentForm/useAddContentForm.types';
import { cn } from '@/libs/utils/utils';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';

interface AddContentDialogProps {
  className?: string;
  dataCy?: string;
  target?: AddContentTarget;
}

const AddContentTrigger = React.forwardRef<
  React.ComponentRef<typeof Button>,
  React.ComponentPropsWithoutRef<typeof Button> & AddContentDialogProps
>(({ className, dataCy, ...props }, ref) => {
  const t = useTranslations('collections.single');

  return (
    <Button
      ref={ref}
      overrideDefaults
      type="button"
      aria-label={t('addContent')}
      data-cy={dataCy}
      className={cn(
        'flex h-39 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input p-6 text-muted-foreground transition-colors outline-none hover:border-foreground hover:text-foreground focus:outline-none focus-visible:ring-0 focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      <Plus className="size-3 shrink-0" />
      <Typography as="span" overrideDefaults className="text-sm font-bold">
        {t('addContent')}
      </Typography>
    </Button>
  );
});
AddContentTrigger.displayName = 'AddContentTrigger';

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
    <Card className="min-w-0 flex-1 gap-6 overflow-hidden rounded-md py-6 shadow-sm">
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
    <Card className="min-w-0 flex-1 gap-6 overflow-hidden rounded-md py-6 shadow-sm">
      <CardHeader className="px-6">
        <CardTitle className="text-base leading-none font-bold text-card-foreground">{t('pasteTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="px-6">
        <Typography overrideDefaults className="text-sm leading-5 font-medium text-muted-foreground">
          {t('pasteDescription')}
        </Typography>
      </CardContent>
      <CardFooter className="px-6">
        <ControlledInputField
          name={ADD_CONTENT_FORM_FIELDS.POST_URL}
          control={addContentForm.form.control}
          placeholder="https://"
          variant="dashed"
          size="lg"
          disabled={addContentForm.isPending}
          loading={addContentForm.isPending}
          loadingText={t('adding')}
          onPaste={addContentForm.handlePaste}
          className="mb-0 bg-black/10 text-base font-medium shadow-xs"
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
      <DialogHeader className="gap-1.5 pr-0">
        <DialogTitle className="text-xl leading-7 font-bold lg:text-2xl lg:leading-8">{t('title')}</DialogTitle>
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
  className,
  dataCy = 'add-content-cta',
  target = { type: 'bookmarks' },
}: AddContentDialogProps) {
  const [open, setOpen] = React.useState(false);
  const timelineFeed = useTimelineFeedContext();

  const handleSuccess = async (postId: string) => {
    timelineFeed?.prependOptimisticPosts(postId);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <AddContentTrigger className={className} dataCy={dataCy} />
      </DialogTrigger>
      <DialogContent
        overrideDefaults
        className="flex w-full max-w-xl flex-col items-end gap-6 overflow-hidden rounded-xl border border-border bg-popover p-6 shadow-2xl lg:p-8"
      >
        <AddContentDialogBody target={target} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  );
}
