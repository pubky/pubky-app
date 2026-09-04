'use client';

import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef, type SyntheticEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ClipboardPaste, Library, MessageCircle, Plus, Repeat, SquarePlus, UserRound } from 'lucide-react';
import { APP_ROUTES, PROFILE_ROUTES } from '@/app/routes';
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
import type { DialogAddContentProps, DialogAddContentTriggerVariant } from './DialogAddContent.types';

type DialogAddContentTriggerProps = ComponentPropsWithoutRef<typeof Button> & Pick<DialogAddContentProps, 'dataCy'>;

const DialogAddContentHeroTrigger = forwardRef<ComponentRef<typeof Button>, DialogAddContentTriggerProps>(
  function DialogAddContentHeroTrigger({ dataCy, ...props }, ref) {
    return (
      <Button
        ref={ref}
        variant="secondary"
        size="icon"
        type="button"
        aria-label={'Add Post'}
        data-cy={dataCy}
        className="lg:h-8 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:text-xs"
        {...props}
      >
        <SquarePlus className="size-4" />
        <Typography as="span" overrideDefaults className="hidden lg:inline">
          {'Add Post'}
        </Typography>
      </Button>
    );
  },
);

const DialogAddContentGridTrigger = forwardRef<ComponentRef<typeof Button>, DialogAddContentTriggerProps>(
  function DialogAddContentGridTrigger({ dataCy, ...props }, ref) {
    return (
      <Button
        ref={ref}
        overrideDefaults
        type="button"
        aria-label={'Add Post'}
        data-cy={dataCy}
        className={GRID_DASHED_CTA_TRIGGER_CLASS}
        {...props}
      >
        <Plus className="size-3 shrink-0" />
        <Typography as="span" overrideDefaults className="text-sm font-bold">
          {'Add Post'}
        </Typography>
      </Button>
    );
  },
);

const DialogAddContentListTrigger = forwardRef<ComponentRef<typeof Button>, DialogAddContentTriggerProps>(
  function DialogAddContentListTrigger({ dataCy, ...props }, ref) {
    return (
      <Button
        ref={ref}
        overrideDefaults
        type="button"
        aria-label={'Add Post'}
        data-cy={dataCy}
        className="flex h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-input text-foreground transition-colors outline-none hover:border-foreground focus:outline-none focus-visible:ring-0 focus-visible:outline-none"
        {...props}
      >
        <Plus className="size-3 shrink-0" />
        <Typography as="span" overrideDefaults className="text-sm font-bold">
          {'Add Post'}
        </Typography>
      </Button>
    );
  },
);

function renderDialogAddContentTrigger(variant: DialogAddContentTriggerVariant, props: DialogAddContentTriggerProps) {
  switch (variant) {
    case 'hero':
      return <DialogAddContentHeroTrigger {...props} />;
    case 'grid':
      return <DialogAddContentGridTrigger {...props} />;
    case 'list':
      return <DialogAddContentListTrigger {...props} />;
    case 'visual':
      // The Visual mosaic CTA fills an aspect-ratio cell, which the grid's
      // dashed h-full/w-full tile already does — no dedicated trigger needed.
      return <DialogAddContentGridTrigger {...props} />;
    default: {
      const exhaustiveCheck: never = variant;
      return exhaustiveCheck;
    }
  }
}

type ActionPillEmphasis = 'muted' | 'highlighted' | 'default';

function actionPillEmphasisClass(emphasis: ActionPillEmphasis): string {
  switch (emphasis) {
    case 'muted':
      return 'text-muted-foreground opacity-30';
    case 'highlighted':
      return 'text-muted-foreground drop-shadow-[0_0_8px_var(--brand)]';
    case 'default':
      return 'text-secondary-foreground';
    default: {
      const exhaustiveCheck: never = emphasis;
      return exhaustiveCheck;
    }
  }
}

function ActionPill({
  icon: Icon,
  label,
  emphasis = 'default',
  onClick,
  dataCy,
  ariaLabel,
}: {
  icon: typeof MessageCircle;
  label?: string | number;
  emphasis?: ActionPillEmphasis;
  onClick: () => void;
  dataCy: string;
  ariaLabel?: string;
}) {
  return (
    <Button
      overrideDefaults
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-cy={dataCy}
      className={cn(
        'flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-secondary px-3.5 py-2 shadow-xs',
        actionPillEmphasisClass(emphasis),
      )}
    >
      <Icon className="size-4 shrink-0" />
      {label !== undefined && (
        <Typography as="span" overrideDefaults className="text-xs leading-4 font-bold">
          {label}
        </Typography>
      )}
    </Button>
  );
}

function FeedInstructionCard({
  onOpenFeed,
  onSelectFromPosts,
}: {
  onOpenFeed: () => void;
  onSelectFromPosts: () => void;
}) {
  return (
    <Card className="min-w-0 gap-4 overflow-hidden rounded-md py-6 shadow-sm">
      <CardHeader className="px-6">
        <CardTitle className="text-base leading-none font-bold text-card-foreground">{'Add from feed'}</CardTitle>
      </CardHeader>
      <CardFooter className="px-6">
        <Container overrideDefaults className="flex w-full flex-wrap items-center justify-between gap-2">
          <Container overrideDefaults className="flex items-center gap-2" data-cy="add-content-feed-pills">
            <ActionPill
              icon={MessageCircle}
              label={7}
              emphasis="muted"
              onClick={onOpenFeed}
              dataCy="add-content-feed-reply-pill"
              ariaLabel={'Add from feed'}
            />
            <ActionPill
              icon={Repeat}
              label={3}
              emphasis="muted"
              onClick={onOpenFeed}
              dataCy="add-content-feed-repost-pill"
              ariaLabel={'Add from feed'}
            />
            <ActionPill
              icon={Library}
              emphasis="highlighted"
              onClick={onOpenFeed}
              dataCy="add-content-feed-save-pill"
              ariaLabel={'Add from feed'}
            />
          </Container>
          <Container overrideDefaults className="flex items-center gap-2">
            <ActionPill icon={Activity} label={'Feed'} onClick={onOpenFeed} dataCy="add-content-feed-button" />
            <ActionPill
              icon={UserRound}
              label={'My posts'}
              onClick={onSelectFromPosts}
              dataCy="add-content-my-posts-button"
            />
          </Container>
        </Container>
      </CardFooter>
    </Card>
  );
}

function UrlPasteCard({ addContentForm }: { addContentForm: ReturnType<typeof useAddContentForm> }) {
  return (
    <Card className="min-w-0 gap-4 overflow-hidden rounded-md py-6 shadow-sm">
      <CardHeader className="px-6">
        <CardTitle className="text-base leading-none font-bold text-card-foreground">{'Paste post url'}</CardTitle>
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
          loadingText={'Adding...'}
          onPaste={addContentForm.handlePaste}
          icon={<ClipboardPaste className="size-4" />}
          iconPosition="right"
          iconAriaLabel="Paste"
          onClickIcon={() => void addContentForm.pasteFromClipboard()}
          iconClassName="mr-0 size-6 shrink-0 rounded-full text-foreground hover:bg-accent/50 hover:text-accent-foreground"
          className="mb-0 h-auto gap-3 border-input bg-background/10! px-6 py-4 font-medium shadow-xs has-[input[aria-invalid=true]]:border-red-500"
          inputClassName="h-auto p-0 shadow-none"
          dataCy="add-content-url-input"
        />
      </CardFooter>
    </Card>
  );
}

function CreatePostCard({ onCreatePost }: { onCreatePost: () => void }) {
  const { currentUserPubky, userDetails } = useCurrentUserProfile();
  const avatarUrl = useAvatarUrl(userDetails);
  const displayName = userDetails?.name ?? currentUserPubky ?? 'You';

  return (
    <Card className="min-w-0 gap-4 overflow-hidden rounded-md py-6 shadow-sm">
      <CardHeader className="px-6">
        <CardTitle className="text-base leading-none font-bold text-card-foreground">{'Create new post'}</CardTitle>
      </CardHeader>
      <CardFooter className="flex-col items-stretch px-6">
        <Button
          overrideDefaults
          type="button"
          onClick={onCreatePost}
          data-cy="add-content-create-post"
          className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-dashed border-input px-4 py-3 text-left outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <AvatarWithFallback
            avatarUrl={avatarUrl}
            name={displayName}
            fallbackSeed={currentUserPubky ?? displayName}
            size="md"
            alt={displayName}
          />
          <Typography overrideDefaults className="min-w-0 flex-1 truncate text-base font-medium text-input">
            {'Start writing'}
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
  onSelectFromPosts,
}: {
  target: NonNullable<DialogAddContentProps['target']>;
  onSuccess: (postId: string) => Promise<void>;
  onCreatePost: () => void;
  onOpenFeed: () => void;
  onSelectFromPosts: () => void;
}) {
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
        <DialogTitle>{'Add Post'}</DialogTitle>
        <DialogDescription className="text-muted-foreground">
          <span className="sm:hidden">{'Choose how to add posts to your collection.'}</span>
          <span className="hidden sm:inline">{'There are several ways to add posts to your collection.'}</span>
        </DialogDescription>
      </DialogHeader>
      <Container overrideDefaults data-cy="add-content-options" className="flex w-full flex-col gap-3">
        <FeedInstructionCard onOpenFeed={onOpenFeed} onSelectFromPosts={onSelectFromPosts} />
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

  const handleSelectFromPosts = () => {
    setOpen(false);
    router.push(PROFILE_ROUTES.POSTS);
  };

  const handlePostCreated = async (createdPostId: string) => {
    await saveCreatedPostToTarget({
      target,
      createdPostId,
      onSaved: (savedPostId) => timelineFeed?.prependOptimisticPosts(savedPostId),
    });
  };

  const trigger = renderDialogAddContentTrigger(triggerVariant, { dataCy, disabled });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          className="flex w-xl flex-col border-border bg-popover shadow-2xl outline-none focus:outline-none focus-visible:outline-none"
          hiddenTitle={'Add Post'}
        >
          <DialogAddContentBody
            target={target}
            onSuccess={handleSuccess}
            onCreatePost={handleCreatePost}
            onOpenFeed={handleOpenFeed}
            onSelectFromPosts={handleSelectFromPosts}
          />
        </DialogContent>
      </Dialog>
      <DialogNewPost open={newPostOpen} onOpenChangeAction={setNewPostOpen} onPostCreated={handlePostCreated} />
    </>
  );
}
