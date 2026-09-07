import { Badge } from '@/atoms/Badge/Badge';
import { cn } from '@/libs/utils/utils';
import { SOCIAL_GRAPH_STATUS_META } from './SocialGraphBadge.constants';
import type { SocialGraphBadgeProps } from './SocialGraphBadge.types';
import { socialGraphBadgeVariants } from './SocialGraphBadge.variants';

/**
 * SocialGraphBadge
 *
 * Outline badge showing how established an account is in the follow graph.
 * Render only when a tier is known; the caller hides it on `null`.
 */
export function SocialGraphBadge({ status, className }: SocialGraphBadgeProps) {
  return (
    <Badge
      variant="outline"
      data-cy="social-graph-badge"
      data-status={status}
      className={cn(socialGraphBadgeVariants({ status }), className)}
    >
      {SOCIAL_GRAPH_STATUS_META[status].label}
    </Badge>
  );
}
