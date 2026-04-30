import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';

import { CircleHelp } from 'lucide-react';
import { cn } from '@/libs/utils/utils';
export function PopoverPublicKey({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Popover hover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('hover:bg-white/10', props.className)}>
          <CircleHelp className="h-4 w-4 text-white" data-testid="circle-help-icon" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[327px] p-6">
        <Container className="gap-2">
          <Heading level={4} size="sm" className="text-popover-foreground">
            Why not a normal user @handle?
          </Heading>
          <Typography size="sm" className="leading-light text-sm font-medium text-muted-foreground">
            This user handle is a cryptographic public key, making it unique and platform-independent. No need for a
            centralized username registry.
          </Typography>
        </Container>
      </PopoverContent>
    </Popover>
  );
}
