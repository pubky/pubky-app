import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Link } from '@/atoms/Link/Link';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';

import { EMAIL_URL, TWITTER_URL, TELEGRAM_URL } from '@/config/externalLinks';
import { Gift, Mail } from 'lucide-react';
import { XTwitter, Telegram } from '@/icons';
interface PopoverInviteProps {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
}
export function PopoverInvite({ className = 'hover:bg-brand/10' }: PopoverInviteProps) {
  return (
    <Popover hover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={className}>
          <Gift className="h-4 w-4 text-brand" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[327px]">
        <Container className="flex-col gap-6 px-3 py-2">
          <Container className="flex-col gap-2">
            <Heading level={4} size="sm" className="text-popover-foreground">
              Don&apos;t have an invite yet?
            </Heading>
            <Typography size="sm" className="font-normal text-muted-foreground">
              Ask the Pubky team!
            </Typography>
          </Container>
          <Container className="flex-row gap-4">
            <Link href={EMAIL_URL} className="text-muted-foreground hover:text-brand">
              <Mail className="h-6 w-6" />
            </Link>
            <Link href={TWITTER_URL} className="text-muted-foreground hover:text-brand">
              <XTwitter className="h-6 w-6" />
            </Link>
            <Link href={TELEGRAM_URL} className="text-muted-foreground hover:text-brand">
              <Telegram className="h-6 w-6" />
            </Link>
          </Container>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
