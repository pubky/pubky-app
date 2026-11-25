import type { SocialView } from '../social.view';

/** Whether the scope crawled the user's own records. */
export const inScope = (view: SocialView, user: string): boolean => view.authors.includes(user);

/** The users within `depth` follow links of `user`, nearest first, the user left out even through a cycle. */
export function webOfTrust(view: SocialView, user: string, depth: number): string[] {
  const seen = new Set([user]);
  const found: string[] = [];
  let frontier = [user];
  for (let hop = 0; hop < depth; hop += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const followee of view.following(current)) {
        if (seen.has(followee)) continue;
        seen.add(followee);
        next.push(followee);
      }
    }
    found.push(...next);
    frontier = next;
  }
  return found;
}

export const REACHES = ['followers', 'following', 'friends', 'wot', 'wot_1', 'wot_2', 'wot_3'] as const;
export type Reach = (typeof REACHES)[number];

/** The users a reach of `user` names; bare `wot` is depth 2. */
export function reachOf(view: SocialView, user: string, reach: Reach): readonly string[] {
  if (reach === 'followers') return view.followers(user);
  if (reach === 'following') return view.following(user);
  if (reach === 'friends') return view.friends(user);
  return webOfTrust(view, user, reach === 'wot' ? 2 : Number(reach.slice('wot_'.length)));
}
