import { cva } from 'class-variance-authority';
import { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';

/**
 * Per-tier colours from the Figma "Pubky / Badge" component:
 * new → chart-6 (orange), networked → brand, established → chart-3 (cyan).
 */
export const socialGraphBadgeVariants = cva('font-semibold uppercase', {
  variants: {
    status: {
      [NexusSocialGraphStatus.NEW]: 'border-chart-6 text-chart-6',
      [NexusSocialGraphStatus.NETWORKED]: 'border-brand text-brand',
      [NexusSocialGraphStatus.ESTABLISHED]: 'border-chart-3 text-chart-3',
    },
  },
});
