const REPLY_TEXTAREA_SELECTOR = '#reply-post-input [data-slot="textarea"]';
const OPEN_DIALOG_REPLY_TEXTAREA_SELECTOR = `[data-slot="dialog-content"][data-state="open"] ${REPLY_TEXTAREA_SELECTOR}`;
const DIALOG_CONTENT_SELECTOR = '[data-slot="dialog-content"]';

function getReplyTextarea(): HTMLTextAreaElement | null {
  if (typeof document === 'undefined') return null;

  return (
    document.querySelector<HTMLTextAreaElement>(OPEN_DIALOG_REPLY_TEXTAREA_SELECTOR) ??
    document.querySelector<HTMLTextAreaElement>(REPLY_TEXTAREA_SELECTOR)
  );
}

export function scrollReplyTextareaIntoDialog(behavior: ScrollBehavior = 'auto') {
  const replyTextarea = getReplyTextarea();
  if (!replyTextarea) return;

  const dialogContent = replyTextarea.closest<HTMLElement>(DIALOG_CONTENT_SELECTOR);

  if (!dialogContent) {
    replyTextarea.scrollIntoView({ block: 'center', behavior });
    return;
  }

  const textareaRect = replyTextarea.getBoundingClientRect();
  const dialogRect = dialogContent.getBoundingClientRect();
  const targetTop =
    dialogContent.scrollTop +
    (textareaRect.top - dialogRect.top) -
    dialogContent.clientHeight / 2 +
    textareaRect.height / 2;

  dialogContent.scrollTo({ top: Math.max(0, targetTop), behavior });
}
