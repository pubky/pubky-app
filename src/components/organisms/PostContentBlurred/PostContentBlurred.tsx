import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { ModerationController } from '@/controllers/moderation/moderation';
import { cn } from '@/libs/utils/utils';
import { ModerationBlurOverlay } from '@/molecules/ModerationBlurOverlay/ModerationBlurOverlay';

interface PostContentBlurredProps {
  postId: string;
  className?: string;
}
export const PostContentBlurred = ({ postId, className }: PostContentBlurredProps) => {
  const t = useTranslations('moderation');
  return (
    <Button
      overrideDefaults
      onClick={(e) => {
        e.stopPropagation();
        ModerationController.unBlur(postId);
      }}
      className={cn('group relative w-full cursor-pointer', className)}
    >
      {/* Blurred background content to simulate hidden post */}
      <Typography
        overrideDefaults
        as="p"
        className="p-4 text-base leading-6 font-medium text-secondary-foreground blur-2xl select-none"
        aria-hidden="true"
      >
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
        magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
        consequat.
      </Typography>

      {/* Overlay with icon and message */}
      <ModerationBlurOverlay label={t('postContentModerated')} />
    </Button>
  );
};
