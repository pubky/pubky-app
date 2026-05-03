import type React from 'react';
import { asOpaque } from './type-assertions';

/**
 * Build a partial React synthetic event double for tests.
 *
 * Synthetic events have dozens of fields but tests usually only need a
 * `preventDefault` / `stopPropagation` plus whatever shape the code under
 * test actually reads. Each factory provides sensible defaults for the two
 * common methods and accepts a `Partial<T>` override.
 */
const buildEvent = <TEvent>(partial: Partial<TEvent>): TEvent =>
  asOpaque<TEvent>({
    preventDefault: () => {},
    stopPropagation: () => {},
    ...partial,
  });

export const mockDragEvent = (partial: Partial<React.DragEvent> = {}): React.DragEvent => buildEvent(partial);

export const mockClipboardEvent = (partial: Partial<React.ClipboardEvent> = {}): React.ClipboardEvent =>
  buildEvent(partial);

export const mockKeyboardEvent = <TElement extends Element = Element>(
  partial: Partial<React.KeyboardEvent<TElement>> = {},
): React.KeyboardEvent<TElement> => buildEvent(partial);

export const mockMouseEvent = <TElement extends Element = Element>(
  partial: Partial<React.MouseEvent<TElement>> = {},
): React.MouseEvent<TElement> => buildEvent(partial);

export const mockAnimationEvent = <TElement extends Element = Element>(
  partial: Partial<React.AnimationEvent<TElement>> = {},
): React.AnimationEvent<TElement> => buildEvent(partial);
