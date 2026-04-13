const DIALOG_CONTENT_SELECTOR = '[data-slot="dialog-content"]';

function getDialogTextarea(textareaSelector: string): HTMLTextAreaElement | null {
  if (typeof document === 'undefined') return null;

  const openDialogTextareaSelector = `${DIALOG_CONTENT_SELECTOR}[data-state="open"] ${textareaSelector}`;

  return (
    document.querySelector<HTMLTextAreaElement>(openDialogTextareaSelector) ??
    document.querySelector<HTMLTextAreaElement>(textareaSelector)
  );
}

export function scrollDialogTextareaIntoDialog(textareaSelector: string, behavior: ScrollBehavior = 'auto') {
  const textarea = getDialogTextarea(textareaSelector);
  if (!textarea) return;

  const dialogContent = textarea.closest<HTMLElement>(DIALOG_CONTENT_SELECTOR);

  if (!dialogContent) {
    textarea.scrollIntoView({ block: 'center', behavior });
    return;
  }

  const textareaRect = textarea.getBoundingClientRect();
  const dialogRect = dialogContent.getBoundingClientRect();
  const targetTop =
    dialogContent.scrollTop +
    (textareaRect.top - dialogRect.top) -
    dialogContent.clientHeight / 2 +
    textareaRect.height / 2;

  dialogContent.scrollTo({ top: Math.max(0, targetTop), behavior });
}
