interface DialogReplyBaseProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  /** Called with the new reply's id once it is written, before the dialog closes. */
  onReplySubmitted?: (replyId: string) => void;
}

/**
 * What the reply answers: a post (`postId`), or an external resource (`resourceUri`, its URI as
 * written: the reply's `parent`).
 */
export type DialogReplyProps = DialogReplyBaseProps &
  ({ postId: string; resourceUri?: never } | { resourceUri: string; postId?: never });
