interface DialogReplyBaseProps {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}

/**
 * What the reply answers: a post (`postId`), or an external resource (`resourceUri`, its URI as
 * written: the reply's `parent`).
 */
export type DialogReplyProps = DialogReplyBaseProps &
  ({ postId: string; resourceUri?: never } | { resourceUri: string; postId?: never });
