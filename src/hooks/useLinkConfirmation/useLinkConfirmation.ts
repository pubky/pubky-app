'use client';

import { useState } from 'react';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { shouldBypassLinkConfirmation } from '@/libs/utils/utils';
import { useSettingsStore } from '@/stores/settings/settings.store';

interface UseLinkConfirmationReturn {
  /** Whether the confirmation dialog is open */
  dialogOpen: boolean;
  /** Setter for dialogOpen state (passed to dialog's onOpenChangeAction) */
  setDialogOpen: (open: boolean) => void;
  /** The URL that was clicked (passed to the dialog) */
  clickedLink: string;
  /** Click handler for intercepting link clicks. Call this from the anchor's onClick. */
  handleLinkClick: (url: string, e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Hook for managing external link confirmation dialog behavior.
 *
 * Reads the `privacy.showConfirm` setting from the settings store and
 * provides a click handler that either opens links directly or shows a
 * confirmation dialog for external links.
 *
 * Unsafe or malformed URLs are always blocked before either path.
 *
 * Links that use bypass protocols (mailto:, tel:) or point to the same
 * domain always open directly regardless of the setting.
 *
 * @returns Dialog state and a link click handler
 *
 * @example
 * ```tsx
 * const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();
 *
 * // In your link's onClick:
 * <a onClick={(e) => handleLinkClick(href, e)}>...</a>
 *
 * // Render the dialog:
 * <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
 * ```
 */
export function useLinkConfirmation(): UseLinkConfirmationReturn {
  const { privacy } = useSettingsStore();
  const checkLinkEnabled = privacy.showConfirm;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clickedLink, setClickedLink] = useState('');

  const handleLinkClick = (url: string, e: React.MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const safeUrl = getSafeExternalUrl(url);
    if (!safeUrl) return;

    // If link should bypass confirmation or setting is disabled, open directly
    if (shouldBypassLinkConfirmation(safeUrl) || !checkLinkEnabled) {
      window.open(safeUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Show confirmation dialog for external links
    setClickedLink(safeUrl);
    setDialogOpen(true);
  };

  return {
    dialogOpen,
    setDialogOpen,
    clickedLink,
    handleLinkClick,
  };
}
