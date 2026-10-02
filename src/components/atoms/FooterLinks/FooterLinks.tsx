import { cn } from '@/libs/utils/utils';
import { Typography } from '../Typography/Typography';

export function FooterLinks({ children, className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <Typography className={cn('leading-light text-sm font-medium text-muted-foreground', className)} {...props}>
      {children}
    </Typography>
  );
}
