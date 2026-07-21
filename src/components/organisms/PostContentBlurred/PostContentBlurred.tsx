import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { ModerationController } from '@/controllers/moderation/moderation';
import { cn } from '@/libs/utils/utils';
import { ModerationBlurOverlay } from '@/molecules/ModerationBlurOverlay/ModerationBlurOverlay';

interface PostContentBlurredProps {
  postId: string;
  className?: string;
  variant?: 'default' | 'compact';
}
export const PostContentBlurred = ({ postId, className, variant = 'default' }: PostContentBlurredProps) => {
  const t = useTranslations('moderation');
  const isCompact = variant === 'compact';
  return (
    <Button
      overrideDefaults
      onClick={(e) => {
        e.stopPropagation();
        ModerationController.unBlur(postId);
      }}
      className={cn('group relative w-full cursor-pointer', isCompact && 'h-6 overflow-hidden rounded-sm', className)}
    >
      {/* Blurred background content to simulate hidden post */}
      <Typography
        overrideDefaults
        as="p"
        className={cn(
          'p-4 text-base leading-6 font-medium text-secondary-foreground blur-2xl select-none',
          isCompact && 'p-2 text-sm leading-5 opacity-0',
        )}
        aria-hidden="true"
      >
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
        magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
        consequat.
      </Typography>

      {/* Overlay with icon and message */}
      <ModerationBlurOverlay
        label={t('postContentModerated')}
        className={isCompact ? 'flex-row justify-start gap-2 [&_svg]:size-4' : undefined}
      />
    </Button>
  );
};
