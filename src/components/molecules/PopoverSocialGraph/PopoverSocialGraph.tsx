import { CircleHelp } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { SOCIAL_GRAPH_STATUS_META, SOCIAL_GRAPH_STATUS_ORDER } from '../SocialGraphBadge/SocialGraphBadge.constants';

/**
 * PopoverSocialGraph
 *
 * Help popover explaining the social graph status badge. Opens on click (and Enter/Space):
 * the Popover atom's hover mode blurs its trigger on focus, which would make this
 * icon-only button unreachable by keyboard.
 */
export function PopoverSocialGraph({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="About social graph status"
          data-cy="social-graph-help-btn"
          className={cn('size-8 hover:bg-white/10', className)}
        >
          <CircleHelp className="size-4 text-white" data-testid="circle-help-icon" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[327px] p-6">
        <Container className="gap-4">
          <Heading level={4} size="sm" className="text-popover-foreground">
            {'Social Graph Status'}
          </Heading>
          <Typography size="sm" className="text-muted-foreground">
            {
              "Shows how established an account is in Pubky's follow graph. It is based on network relationships and updated daily."
            }
          </Typography>
          <ul className="list-inside list-disc text-sm font-medium text-muted-foreground">
            {SOCIAL_GRAPH_STATUS_ORDER.map((status) => (
              <li key={status}>
                <Typography as="strong" size="sm" className="font-semibold text-secondary-foreground">
                  {SOCIAL_GRAPH_STATUS_META[status].label}
                </Typography>
                {`: ${SOCIAL_GRAPH_STATUS_META[status].description}`}
              </li>
            ))}
          </ul>
          <Typography as="em" size="sm" className="text-muted-foreground italic">
            {'This is not an endorsement or guarantee that an account is trustworthy.'}
          </Typography>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
