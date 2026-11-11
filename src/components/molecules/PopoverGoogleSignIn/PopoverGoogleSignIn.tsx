import { CircleHelp } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';
import { isPassportAppleEnabled } from '@/config/network';
import { cn } from '@/libs/utils/utils';

const PASSPORT_README_URL = 'https://github.com/pubky/pubky-passport/blob/main/README.md';

/**
 * PopoverGoogleSignIn
 *
 * Help popover for Passport sign-in: where the keys and their encrypted backup live, and what
 * recovery requires. Opens on click (and Enter/Space) rather than hover, so an icon-only trigger
 * stays reachable by keyboard, and on touch devices.
 */
export function PopoverGoogleSignIn({ className }: { className?: string }) {
  const appleEnabled = isPassportAppleEnabled();
  const points = [
    {
      term: 'Your keys:',
      text: appleEnabled
        ? 'Created in your browser, with an encrypted backup stored in your iCloud or Google Drive.'
        : 'Created in your browser, with an encrypted backup stored in your Google Drive.',
    },
    {
      term: 'Recovery:',
      text: 'Restoring your pubky requires your encrypted backup and a separate key from Passport.',
    },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={appleEnabled ? 'About signing in with Apple or Google' : 'About signing in with Google'}
          data-cy="passport-google-help-btn"
          className={cn(
            'size-8 text-secondary-foreground/70 hover:bg-secondary-foreground/10 hover:text-foreground',
            className,
          )}
        >
          <CircleHelp className="size-4" data-testid="circle-help-icon" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        collisionPadding={16}
        className="mx-0 max-h-(--radix-popover-content-available-height) w-80 overflow-y-auto p-6"
      >
        <Container className="gap-4">
          <Heading level={4} size="sm" className="text-popover-foreground">
            {appleEnabled ? 'Sign in with Apple or Google' : 'Sign in with Google'}
          </Heading>
          <Typography size="sm" className="text-muted-foreground">
            {'Use an existing account to create or access your pubky with Pubky Passport.'}
          </Typography>
          {points.map((point) => (
            <Typography key={point.term} size="sm" className="text-muted-foreground">
              <Typography as="strong" size="sm" className="font-semibold text-secondary-foreground">
                {point.term}
              </Typography>
              {` ${point.text}`}
            </Typography>
          ))}
          <Link href={PASSPORT_README_URL} className="font-semibold">
            {'Learn more'}
          </Link>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
