import type { ComponentType } from 'react';

/**
 * Optional copy/icon overrides for repurposing the repost dialog as another
 * action (e.g. sharing a collection, which is a repost of the underlying post).
 * When omitted, the dialog renders the standard "Repost" copy.
 */
export interface DialogRepostConfig {
  /** Dialog title (also used for the accessible hidden title/description). */
  title?: string;
  /** Submit button label. */
  submitLabel?: string;
  /** Submit button icon. */
  submitIcon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Success toast title. */
  successToastTitle?: string;
}

export interface DialogRepostProps {
  postId: string;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  /** Copy/icon overrides — see {@link DialogRepostConfig}. */
  config?: DialogRepostConfig;
}
