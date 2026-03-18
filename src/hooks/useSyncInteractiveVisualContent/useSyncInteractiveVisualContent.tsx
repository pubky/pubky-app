'use client';

import { useEffect } from 'react';
import * as Core from '@/core';

/**
 * Persists visual-mode content coercion for interactive feeds that are backed by the home store.
 *
 * When visual layout is active, interactive feeds only support `all`, `images`, and `videos`.
 * The feed wrappers resolve unsupported content selections (for example `short` or `links`)
 * to `all` at runtime so the stream and filter UI stay usable in visual mode.
 *
 * This hook is the place where that resolved value is intentionally written back to the home
 * store, so the user's content filter preference is updated to the valid visual-mode value
 * instead of snapping back when they leave and re-enter the view.
 *
 * Custom/read-only feeds should not use this hook because their content comes from persisted
 * feed config, not from the interactive home store.
 */
export function useSyncInteractiveVisualContent(resolvedContent: Core.ContentType) {
  const { content, setContent } = Core.useHomeStore();

  useEffect(() => {
    if (resolvedContent === content) return;

    setContent(resolvedContent);
  }, [content, resolvedContent, setContent]);
}
