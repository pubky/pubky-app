'use client';

import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef, type SyntheticEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Library, MessageCircle, Plus, Repeat, SquarePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { APP_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Card, CardFooter, CardHeader, CardTitle } from '@/atoms/Card/Card';
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
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useSaveCreatedPostToTarget } from '@/hooks/useSaveCreatedPostToTarget/useSaveCreatedPostToTarget';
import { cn } from '@/libs/utils/utils';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { GRID_DASHED_CTA_TRIGGER_CLASS } from '@/organisms/Collections/gridDashedCta.const';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed';
import type { DialogAddContentProps } from './DialogAddContent.types';

type DialogAddContentTriggerProps = ComponentPropsWithoutRef<typeof Button> & Pick<DialogAddContentProps, 'dataCy'>;

const DialogAddContentHeroTrigger = forwardRef<ComponentRef<typeof Button>, DialogAddContentTriggerProps>(
  function DialogAddContentHeroTrigger({ dataCy, ...props }, ref) {
    const t = useTranslations('collections.single');

    return (
      <Button
        ref={ref}
        variant="secondary"
        size="icon"
        type="button"
        aria-label={t('content')}
        data-cy={dataCy}
        className="lg:h-8 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:text-xs"
        {...props}
      >
        <SquarePlus className="size-4" />
        <Typography as="span" overrideDefaults className="hidden lg:inline">
          {t('content')}
        </Typography>
      </Button>
    );
  },
);

const DialogAddContentGridTrigger = forwardRef<ComponentRef<typeof Button>, DialogAddContentTriggerProps>(
  function DialogAddContentGridTrigger({ dataCy, ...props }, ref) {
    const t = useTranslations('collections.single');

    return (
      <Button
        ref={ref}
        overrideDefaults
        type="button"
        aria-label={t('addContent')}
        data-cy={dataCy}
        className={GRID_DASHED_CTA_TRIGGER_CLASS}
        {...props}
      >
        <Plus className="size-3 shrink-0" />
        <Typography as="span" overrideDefaults className="text-sm font-bold">
          {t('addContent')}
        </Typography>
      </Button>
    );
  },
);

function ActionPill({
  icon: Icon,
  count,
  isHighlighted = false,
  onClick,
  dataCy,
  ariaLabel,
}: {
  icon: typeof MessageCircle;
  count?: number;
  isHighlighted?: boolean;
  onClick: () => void;
  dataCy: string;
  ariaLabel: string;
}) {
  return (
    <Button
      overrideDefaults
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-cy={dataCy}
      className={cn(
        'flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-secondary px-3.5 py-2 text-muted-foreground shadow-xs',
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
    </Button>
  );
}

function FeedInstructionCard({ onOpenFeed }: { onOpenFeed: () => void }) {
  const t = useTranslations('collections.addContentDialog');

  return (
    <Card className="min-w-0 gap-4 overflow-hidden rounded-md py-6 shadow-sm">
      <CardHeader className="px-6">
        <CardTitle className="text-base leading-none font-bold text-card-foreground">{t('fromFeedTitle')}</CardTitle>
      </CardHeader>
      <CardFooter className="justify-start px-6">
        <Container overrideDefaults className="flex w-full flex-wrap items-center justify-start gap-2">
          <ActionPill
            icon={MessageCircle}
            count={7}
            onClick={onOpenFeed}
            dataCy="add-content-feed-reply-pill"
            ariaLabel={t('fromFeedTitle')}
          />
          <ActionPill
            icon={Repeat}
            count={3}
            onClick={onOpenFeed}
            dataCy="add-content-feed-repost-pill"
            ariaLabel={t('fromFeedTitle')}
          />
          <ActionPill
            icon={Library}
            isHighlighted
            onClick={onOpenFeed}
            dataCy="add-content-feed-save-pill"
            ariaLabel={t('fromFeedTitle')}
          />
        </Container>
      </CardFooter>
    </Card>
  );
}

function UrlPasteCard({ addContentForm }: { addContentForm: ReturnType<typeof useAddContentForm> }) {
  const t = useTranslations('collections.addContentDialog');

  return (
    <Card className="min-w-0 gap-4 overflow-hidden rounded-md py-6 shadow-sm">
      <CardHeader className="px-6">
        <CardTitle className="text-base leading-none font-bold text-card-foreground">{t('pasteTitle')}</CardTitle>
      </CardHeader>
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

function CreatePostCard({ onCreatePost }: { onCreatePost: () => void }) {
  const t = useTranslations('collections.addContentDialog');
  const { currentUserPubky, userDetails } = useCurrentUserProfile();
  const avatarUrl = useAvatarUrl(userDetails);
  const displayName = userDetails?.name ?? currentUserPubky ?? t('createPostAvatarFallback');

  return (
    <Card className="min-w-0 gap-4 overflow-hidden rounded-md py-6 shadow-sm">
      <CardHeader className="px-6">
        <CardTitle className="text-base leading-none font-bold text-card-foreground">{t('createPostTitle')}</CardTitle>
      </CardHeader>
      <CardFooter className="flex-col items-stretch px-6">
        <Button
          overrideDefaults
          type="button"
          onClick={onCreatePost}
          data-cy="add-content-create-post"
          className="flex w-full cursor-pointer items-center gap-4 rounded-md border border-dashed border-input px-6 py-4 text-left outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <AvatarWithFallback
            avatarUrl={avatarUrl}
            name={displayName}
            fallbackSeed={currentUserPubky ?? displayName}
            size="default"
            alt={displayName}
          />
          <Typography overrideDefaults className="min-w-0 flex-1 truncate text-base font-medium text-input">
            {t('createPostPlaceholder')}
          </Typography>
        </Button>
      </CardFooter>
    </Card>
  );
}

function DialogAddContentBody({
  target,
  onSuccess,
  onCreatePost,
  onOpenFeed,
}: {
  target: NonNullable<DialogAddContentProps['target']>;
  onSuccess: (postId: string) => Promise<void>;
  onCreatePost: () => void;
  onOpenFeed: () => void;
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
        <DialogDescription className="sr-only">{t('description')}</DialogDescription>
      </DialogHeader>
      <Container overrideDefaults className="flex w-full flex-col gap-3">
        <FeedInstructionCard onOpenFeed={onOpenFeed} />
        <UrlPasteCard addContentForm={addContentForm} />
        <CreatePostCard onCreatePost={onCreatePost} />
      </Container>
    </form>
  );
}

export function DialogAddContent({
  dataCy = 'add-content',
  disabled = false,
  target = { type: 'bookmarks' },
  triggerVariant = 'hero',
}: DialogAddContentProps) {
  const t = useTranslations('collections.addContentDialog');
  const [open, setOpen] = useState(false);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const router = useRouter();
  const timelineFeed = useTimelineFeedContext();
  const saveCreatedPostToTarget = useSaveCreatedPostToTarget();

  const handleSuccess = async (postId: string) => {
    timelineFeed?.prependOptimisticPosts(postId);
    setOpen(false);
  };

  const handleCreatePost = () => {
    setOpen(false);
    setNewPostOpen(true);
  };

  const handleOpenFeed = () => {
    setOpen(false);
    router.push(APP_ROUTES.HOME);
  };

  const handlePostCreated = async (createdPostId: string) => {
    await saveCreatedPostToTarget({
      target,
      createdPostId,
      onSaved: (savedPostId) => timelineFeed?.prependOptimisticPosts(savedPostId),
    });
  };

  const trigger =
    triggerVariant === 'grid' ? (
      <DialogAddContentGridTrigger dataCy={dataCy} disabled={disabled} />
    ) : (
      <DialogAddContentHeroTrigger dataCy={dataCy} disabled={disabled} />
    );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          className="flex w-3xl flex-col overflow-hidden border-border bg-popover shadow-2xl outline-none focus:outline-none focus-visible:outline-none"
          hiddenTitle={t('title')}
        >
          <DialogAddContentBody
            target={target}
            onSuccess={handleSuccess}
            onCreatePost={handleCreatePost}
            onOpenFeed={handleOpenFeed}
          />
        </DialogContent>
      </Dialog>
      <DialogNewPost open={newPostOpen} onOpenChangeAction={setNewPostOpen} onPostCreated={handlePostCreated} />
    </>
  );
}
