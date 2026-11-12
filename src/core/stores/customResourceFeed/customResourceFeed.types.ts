interface CustomResourceFeedState {
  /**
   * Id of the custom feed of external resources whose page's URL holds its saved types and filters,
   * or `null`: from then on the URL's filters are the viewer's (one cleared stays cleared until the
   * feed is opened again). The list (the page) writes them and the filter panel (the layout) reads
   * whether they are in, so this store is the channel that crosses that boundary.
   */
  readyFeedId: string | null;
  /** The URL search a feed's saved filters were written as, until the URL Next reports holds it. */
  pending: { feedId: string; search: string } | null;
  /**
   * The URL parameters the open feed's saved types and filters set (`toFeedResourceParams`), empty on
   * any other page. One the viewer sets back to its default stays in the URL as an empty parameter
   * (`when=`), so a reload, Back or a copied link keeps it cleared instead of seeding it again.
   */
  savedParams: readonly string[];
}

interface CustomResourceFeedActions {
  /**
   * A feed's saved filters were written to the URL as `search`; not ready until Next reports it.
   * `savedParams`: the parameters its saved types and filters set (none by default).
   */
  write: (feedId: string, search: string, savedParams?: readonly string[]) => void;
  /** The URL holds the feed's saved filters; `savedParams` as for `write`. */
  ready: (feedId: string, savedParams?: readonly string[]) => void;
  /** No feed's filters are in the URL (its page left). */
  reset: () => void;
}

export type CustomResourceFeedStore = CustomResourceFeedState & CustomResourceFeedActions;

export const customResourceFeedInitialState: CustomResourceFeedState = {
  readyFeedId: null,
  pending: null,
  savedParams: [],
};

export enum CustomResourceFeedActionTypes {
  WRITE = 'WRITE',
  READY = 'READY',
  RESET = 'RESET',
}
