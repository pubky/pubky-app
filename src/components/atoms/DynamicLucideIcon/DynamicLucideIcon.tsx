'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Activity as ActivityFallback, Icon, type IconNode, type LucideIcon, type LucideProps } from 'lucide-react';
import {
  getLucideIconState,
  requestLucideIcon,
  subscribeToLucideIcons,
  toLucideIconName,
} from '@/libs/lucide/lucideIcons';
import { cn } from '@/libs/utils/utils';

const EMPTY_ICON_NODE: IconNode = [];

interface DynamicLucideIconProps extends Omit<LucideProps, 'name'> {
  name?: string | null;
  /** Rendered for a missing/unknown/failed name — never while a valid icon is loading. */
  fallback?: LucideIcon | null;
}

/**
 * Renders a Lucide icon by its dynamic (kebab-case) name without bundling the
 * full icon set. Icon state lives in a module-level store read through
 * useSyncExternalStore, so: a resolved icon renders synchronously everywhere
 * for the rest of the session, hydration is correct by construction (the
 * server snapshot is always "nothing known"), and a failed chunk heals every
 * mounted instance the moment any retry succeeds. While a valid icon is
 * genuinely loading it renders an empty, size-preserving svg — never a wrong
 * icon.
 */
export function DynamicLucideIcon({ name, fallback, className, ...iconProps }: DynamicLucideIconProps) {
  const FallbackIcon = fallback === undefined ? ActivityFallback : fallback;
  // Normalized shape only — the catalog is lazy-loaded, so a name that looks
  // like a Lucide name but is absent resolves to `unknown` and falls back.
  const validName = toLucideIconName(name);
  const state = useSyncExternalStore(
    subscribeToLucideIcons,
    () => (validName ? getLucideIconState(validName) : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (validName) requestLucideIcon(validName);
  }, [validName]);

  if (!validName || state?.status === 'unknown' || state?.status === 'error') {
    return FallbackIcon ? <FallbackIcon className={className} {...iconProps} /> : null;
  }

  if (state?.status === 'loaded') {
    // Carry the `lucide-<name>` class statically-imported icons get, so CSS
    // rules and test selectors match dynamic icons too.
    return <Icon iconNode={state.node} className={cn(`lucide-${validName}`, className)} {...iconProps} />;
  }

  return <Icon iconNode={EMPTY_ICON_NODE} className={className} {...iconProps} />;
}
