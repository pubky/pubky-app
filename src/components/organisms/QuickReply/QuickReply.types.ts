import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';

export interface QuickReplyProps {
  parentPostId: string;
  /** Thread connector variant - defaults to LAST (for use after replies) */
  connectorVariant?: typeof POST_THREAD_CONNECTOR_VARIANTS.LAST | typeof POST_THREAD_CONNECTOR_VARIANTS.REGULAR;
  /** Callback when reply is successfully submitted */
  onReplySubmitted?: (replyId: string) => void;
}
