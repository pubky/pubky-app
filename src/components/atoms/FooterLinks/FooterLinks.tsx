import { cn } from '@/libs';
import { Typography } from '../Typography';

export function FooterLinks({ children, className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <Typography
      className={cn('leading-light text-sm font-medium text-muted-foreground opacity-80', className)}
      {...props}
    >
      {children}
    </Typography>
  );
}
