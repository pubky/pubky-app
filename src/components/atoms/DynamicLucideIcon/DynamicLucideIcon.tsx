'use client';

import { useEffect, useState } from 'react';
import { Activity, Icon, type IconNode, type LucideIcon, type LucideProps } from 'lucide-react';
import type { IconName } from 'lucide-react/dynamic.js';
import { getLoadedLucideIconNode, isLucideIconName, loadLucideIconNode } from '@/libs/utils/lucideIcons';

const EMPTY_ICON_NODE: IconNode = [];

export interface DynamicLucideIconProps extends Omit<LucideProps, 'name'> {
  name?: string | null;
  /** Rendered only for a missing/invalid name — never while a valid icon is loading. */
  fallback?: LucideIcon | null;
}

interface ResolvedIcon {
  name: IconName | null;
  node: IconNode | null;
  /** The chunk load failed; render the fallback and retry only on remount. */
  failed?: boolean;
}

function resolveFromCache(name: IconName | null): ResolvedIcon {
  return { name, node: name ? (getLoadedLucideIconNode(name) ?? null) : null };
}

/**
 * Renders a Lucide icon by its dynamic (kebab-case) name without bundling the
 * full icon set. Icon chunks resolve through a module-level cache, so an icon
 * renders synchronously on first paint once it has loaded anywhere in the
 * session. While a valid icon is genuinely loading it renders an empty,
 * size-preserving svg — never a wrong icon.
 */
export function DynamicLucideIcon({ name, fallback, ...iconProps }: DynamicLucideIconProps) {
  const FallbackIcon = fallback === undefined ? Activity : fallback;
  const validName = isLucideIconName(name) ? name : null;
  const [resolved, setResolved] = useState<ResolvedIcon>(() => resolveFromCache(validName));

  // Adjust state during render when the requested icon changes, so a cached
  // icon swaps in synchronously instead of after an effect roundtrip.
  if (resolved.name !== validName) {
    setResolved(resolveFromCache(validName));
  }

  useEffect(() => {
    if (!validName || (resolved.name === validName && (resolved.node || resolved.failed))) return;
    let cancelled = false;
    void loadLucideIconNode(validName).then((node) => {
      if (cancelled) return;
      setResolved((current) => {
        if (current.name !== validName) return current;
        if (node) return current.node === node ? current : { name: validName, node };
        return current.failed ? current : { name: validName, node: null, failed: true };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [validName, resolved]);

  if (!validName) {
    return FallbackIcon ? <FallbackIcon {...iconProps} /> : null;
  }

  if (resolved.failed && !resolved.node) {
    return FallbackIcon ? <FallbackIcon {...iconProps} /> : null;
  }

  return <Icon iconNode={resolved.node ?? EMPTY_ICON_NODE} {...iconProps} />;
}
