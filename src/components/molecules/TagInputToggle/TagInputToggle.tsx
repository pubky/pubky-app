'use client';

import { AnimatePresence, motion, type Transition } from 'motion/react';
import { cn } from '@/libs/utils/utils';

const SUBTLE_ENTER_TRANSITION: Transition = { duration: 0.12, ease: 'easeOut' };
const SUBTLE_EXIT_TRANSITION: Transition = { duration: 0.12, ease: 'easeInOut' };

export interface TagInputToggleProps {
  /** Whether the input state is active (otherwise the add button state is shown). */
  showInput: boolean;
  /** Content rendered for the input state. */
  inputContent?: React.ReactNode;
  /** Content rendered for the add button state. */
  addButtonContent?: React.ReactNode;
  /** Optional fixed widths (px) for input and add button states. */
  widthByState?: {
    input: number;
    addButton: number;
  };
  /** Optional className applied to the outer wrapper container. */
  containerClassName?: string;
  /** Optional className applied to the input state wrapper. */
  inputWrapperClassName?: string;
  /** Optional className applied to the add button state wrapper. */
  addButtonWrapperClassName?: string;
}

export function TagInputToggle({
  showInput,
  inputContent,
  addButtonContent,
  widthByState,
  containerClassName,
  inputWrapperClassName,
  addButtonWrapperClassName,
}: TagInputToggleProps) {
  const currentContent = showInput ? inputContent : addButtonContent;
  if (!currentContent) return null;
  const hasWidthAnimation = Boolean(widthByState);

  const inputInitial = { opacity: 0 };
  const inputAnimate = { opacity: 1, transition: SUBTLE_ENTER_TRANSITION };
  const inputExit = { opacity: 0, transition: SUBTLE_EXIT_TRANSITION };

  const addButtonInitial = { opacity: 0 };
  const addButtonAnimate = { opacity: 1, transition: SUBTLE_ENTER_TRANSITION };
  const addButtonExit = { opacity: 0, transition: SUBTLE_EXIT_TRANSITION };

  const toggleContent = (
    <AnimatePresence initial={false}>
      {showInput ? (
        <motion.div
          key="tag-input"
          initial={inputInitial}
          animate={inputAnimate}
          exit={inputExit}
          className={cn('w-full', hasWidthAnimation ? 'absolute inset-0' : 'shrink-0', inputWrapperClassName)}
        >
          {inputContent}
        </motion.div>
      ) : (
        <motion.div
          key="add-button"
          initial={addButtonInitial}
          animate={addButtonAnimate}
          exit={addButtonExit}
          className={cn(
            'inline-flex h-full w-full items-center justify-center',
            hasWidthAnimation
              ? 'absolute inset-0 inline-flex items-center justify-center'
              : 'inline-flex h-full w-full items-center justify-center',
            addButtonWrapperClassName,
          )}
        >
          {addButtonContent}
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!widthByState) {
    return toggleContent;
  }

  return (
    <motion.div
      initial={false}
      animate={{ width: showInput ? widthByState.input : widthByState.addButton }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      style={{ originX: 0 }}
      className={cn(
        'relative h-8 overflow-hidden rounded-md border border-dashed border-input shadow-sm',
        containerClassName,
      )}
    >
      {toggleContent}
    </motion.div>
  );
}
