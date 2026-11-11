export type TResyncOptions = {
  /**
   * Whether the account the resync started for is still the current one. Every private fetch (mutes,
   * feeds, bookmarks) checks it before its local write, so a resync that outlives a sign-out or an
   * account switch writes nothing into the next account's database.
   */
  isCurrent?: () => boolean;
};
