'use client';

import * as React from 'react';
import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import type { PostInputActionBarProps, ActionButtonConfig } from './PostInputActionBar.types';

export function PostInputActionBar({
  onEmojiClick,
  onImageClick,
  onArticleClick,
  onPostClick,
  isPostDisabled = false,
  isSubmitting = false,
  postButtonLabel = 'Post',
  postButtonAriaLabel = 'Post',
  postButtonIcon,
  hideArticleButton,
  isArticle,
  isEdit,
}: PostInputActionBarProps) {
  const commonButtonProps = React.useMemo(
    () => ({
      variant: 'secondary' as const,
      size: 'sm' as const,
      className: 'h-8 px-3 py-2 rounded-full border-none shadow-xs',
    }),
    [],
  );

  const actionButtons: ActionButtonConfig[] = React.useMemo(() => {
    const buttons: ActionButtonConfig[] = [
      ...(isArticle
        ? []
        : [
            {
              icon: Libs.Smile,
              onClick: onEmojiClick,
              ariaLabel: 'Add emoji',
              disabled: !onEmojiClick || isSubmitting,
            },
            ...(isEdit
              ? []
              : [
                  {
                    icon: Libs.Image,
                    onClick: onImageClick,
                    ariaLabel: 'Add image',
                    disabled: !onImageClick || isSubmitting,
                  },
                ]),
          ]),
    ];

    // Only add article button if not hidden
    if (!hideArticleButton) {
      buttons.push({
        icon: Libs.Newspaper,
        onClick: onArticleClick,
        ariaLabel: 'Add article',
        disabled: !onArticleClick || isSubmitting,
      });
    }

    buttons.push({
      icon: isSubmitting ? Libs.Loader2 : postButtonIcon || Libs.Send,
      onClick: onPostClick,
      disabled: isPostDisabled || !onPostClick,
      ariaLabel: isSubmitting ? 'Posting...' : postButtonAriaLabel,
      showLabel: true,
      labelText: isSubmitting ? 'Posting...' : postButtonLabel,
      iconClassName: isSubmitting ? 'animate-spin' : undefined,
    });

    return buttons;
  }, [
    isArticle,
    isEdit,
    onEmojiClick,
    onImageClick,
    onArticleClick,
    onPostClick,
    isPostDisabled,
    isSubmitting,
    postButtonLabel,
    postButtonAriaLabel,
    postButtonIcon,
    hideArticleButton,
  ]);

  return (
    <Atoms.Container className="flex items-center gap-2" overrideDefaults>
      {actionButtons.map(
        ({
          icon: Icon,
          onClick,
          ariaLabel,
          disabled,
          className: buttonClassName,
          iconClassName,
          showLabel,
          labelText,
        }) => (
          <Atoms.Button
            data-cy={`post-input-action-bar-${ariaLabel.toLowerCase().replace(' ', '-')}`}
            key={ariaLabel}
            {...commonButtonProps}
            onClick={onClick}
            disabled={disabled}
            className={Libs.cn(commonButtonProps.className, buttonClassName)}
            aria-label={ariaLabel}
          >
            {showLabel && labelText ? (
              <Atoms.Container className="flex items-center gap-2" overrideDefaults>
                <Icon className={Libs.cn('size-4 text-secondary-foreground', iconClassName)} strokeWidth={2} />
                <Atoms.Typography as="span" size="sm" className="text-xs leading-4 font-bold text-secondary-foreground">
                  {labelText}
                </Atoms.Typography>
              </Atoms.Container>
            ) : (
              <Icon className={Libs.cn('size-4 text-secondary-foreground', iconClassName)} strokeWidth={2} />
            )}
          </Atoms.Button>
        ),
      )}
    </Atoms.Container>
  );
}
