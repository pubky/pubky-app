'use client';

import { useRouter } from 'next/navigation';
import type React from 'react';
import { getCollectionRoute, POST_ROUTES } from '@/app/routes';
import { parseCompositeId } from '@/models/models.utils';
import type { UsePostNavigationResult } from './usePostNavigation.types';

const INTERACTIVE_SELECTOR = 'a,button,input,textarea,select,label,[role="button"],[role="link"]';
const POST_NAVIGATION_ALLOW_SELECTOR = '[data-allow-post-navigation]';

function getEventTargetElement(target: EventTarget | null): Element | null {
  if (!target) return null;
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const interactiveElement = getEventTargetElement(target)?.closest(INTERACTIVE_SELECTOR);
  return Boolean(interactiveElement && !interactiveElement.matches(POST_NAVIGATION_ALLOW_SELECTOR));
}

/**
 * usePostNavigation
 *
 * Shared hook for post navigation logic.
 * Handles routing to post detail pages, including new-tab opens
 * via Cmd/Ctrl/Shift+Click, middle-click, and Cmd/Ctrl/Shift+Enter
 * when a post wrapper is keyboard-focused.
 */
export function usePostNavigation(): UsePostNavigationResult {
  const router = useRouter();

  const getPostHref = (postId: string) => {
    const { pubky: userId, id: pId } = parseCompositeId(postId);
    return `${POST_ROUTES.POST}/${userId}/${pId}`;
  };

  const navigateToPost = (postId: string) => {
    router.push(getPostHref(postId));
  };

  const getCollectionHref = (postId: string) => {
    const { pubky, id } = parseCompositeId(postId);
    return getCollectionRoute(pubky, id);
  };

  const navigateToCollection = (postId: string) => {
    router.push(getCollectionHref(postId));
  };

  const handlePostClick = (postId: string, event: React.MouseEvent) => {
    if (isInteractiveTarget(event.target)) return;

    // Don't navigate if the user is selecting text inside the card.
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && selection.toString().length > 0) return;

    const href = getPostHref(postId);
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(href);
  };

  const handlePostAuxClick = (postId: string, event: React.MouseEvent) => {
    if (event.button !== 1) return;
    if (isInteractiveTarget(event.target)) return;
    event.preventDefault();
    window.open(getPostHref(postId), '_blank', 'noopener,noreferrer');
  };

  const handlePostKeyDown = (postId: string, event: React.KeyboardEvent) => {
    // Only act when the wrapper itself has focus, not a descendant (button, link, input).
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();

    const href = getPostHref(postId);
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(href);
  };

  return {
    getPostHref,
    navigateToPost,
    getCollectionHref,
    navigateToCollection,
    handlePostClick,
    handlePostAuxClick,
    handlePostKeyDown,
  };
}
