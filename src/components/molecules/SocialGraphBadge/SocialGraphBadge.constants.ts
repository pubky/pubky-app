import { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';

/**
 * Single source of the tier copy for every surface that renders a tier (badge label,
 * help popover legend), keyed by the enum so a new tier cannot be missed by one of them.
 */
export const SOCIAL_GRAPH_STATUS_META: Record<NexusSocialGraphStatus, { label: string; description: string }> = {
  [NexusSocialGraphStatus.NEW]: { label: 'New', description: 'little or no network presence' },
  [NexusSocialGraphStatus.NETWORKED]: { label: 'Networked', description: 'part of the broader network' },
  [NexusSocialGraphStatus.ESTABLISHED]: { label: 'Established', description: 'central to the network' },
};

/** Tiers from least to most established, the order the help popover lists them in. */
export const SOCIAL_GRAPH_STATUS_ORDER: readonly NexusSocialGraphStatus[] = [
  NexusSocialGraphStatus.NEW,
  NexusSocialGraphStatus.NETWORKED,
  NexusSocialGraphStatus.ESTABLISHED,
];
