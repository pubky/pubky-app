import { TimelineLoadingMore } from './TimelineLoadingMore';
import { TimelineError } from './TimelineError';
import { TimelineEndMessage } from './TimelineEndMessage';

export interface TimelineVirtuosoContext {
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  itemCount: number;
}

export function TimelineVirtuosoFooter({ context }: { context?: TimelineVirtuosoContext }) {
  if (!context) return null;
  const { loadingMore, error, hasMore, itemCount } = context;
  return (
    <>
      {loadingMore && <TimelineLoadingMore />}
      {error && itemCount > 0 && <TimelineError message={error} />}
      {!hasMore && !loadingMore && itemCount > 0 && <TimelineEndMessage />}
    </>
  );
}
