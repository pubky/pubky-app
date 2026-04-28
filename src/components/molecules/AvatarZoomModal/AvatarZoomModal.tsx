'use client';

import { useBodyScrollLock } from '@/hooks/useBodyScrollLock/useBodyScrollLock';
import { useEffect, useRef } from 'react';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';

export interface AvatarZoomModalProps {
  open: boolean;
  onClose: () => void;
  avatarUrl?: string;
  name: string;
  fallbackSeed?: string;
}

/**
 * Modal component that displays an enlarged version of a user's avatar.
 * Handles backdrop clicks, escape key, and scroll locking with CSS animations.
 *
 * @param open - Controls modal visibility
 * @param onClose - Callback when user closes modal (backdrop click or Escape)
 * @param avatarUrl - Optional URL to avatar image
 * @param name - User's name for fallback initials and alt text
 */
export function AvatarZoomModal({ open, onClose, avatarUrl, name, fallbackSeed }: AvatarZoomModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  // Keep the ref up-to-date with the latest onClose
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useBodyScrollLock(open);

  // Focus management: move focus into modal when it opens
  useEffect(() => {
    if (open && modalRef.current) {
      modalRef.current.focus();
    }
  }, [open]);

  // Keyboard navigation: close on Escape
  useEffect(() => {
    if (!open) return; // Early return when closed - no cleanup needed

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!open) return null;

  return (
    <Atoms.Container
      ref={modalRef}
      overrideDefaults={true}
      role="dialog"
      aria-modal={true}
      aria-label={`${name}'s avatar enlarged`}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/60 duration-300 outline-none fade-in"
      onClick={onClose}
      data-testid="avatar-zoom-modal-overlay"
    >
      <Atoms.Container
        overrideDefaults={true}
        className="relative animate-in rounded-full shadow-2xl duration-300 ease-in-out zoom-in-95 fade-in"
        onClick={(e) => e.stopPropagation()}
        data-testid="avatar-zoom-modal-content"
      >
        <Organisms.AvatarWithFallback
          avatarUrl={avatarUrl}
          name={name}
          fallbackSeed={fallbackSeed}
          className="size-(--avatar-zoom-size) transition-transform hover:scale-105"
          fallbackClassName="text-6xl"
          alt={`${name}'s avatar`}
        />
      </Atoms.Container>
    </Atoms.Container>
  );
}
