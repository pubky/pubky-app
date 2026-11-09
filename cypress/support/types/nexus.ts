// Shapes shared by the Node wait task (cypress/plugins/nexus.ts) and the spec-side checks
// (cypress/support/nexus.ts). Everything here crosses `cy.task`, so it stays plain JSON.

export type NexusNotificationType =
  | 'follow'
  | 'new_friend'
  | 'tag_post'
  | 'tag_profile'
  | 'reply'
  | 'repost'
  | 'mention'
  | 'post_deleted'
  | 'post_edited';

// What a 200 response must hold for the record to count as indexed
export type NexusExpectation =
  | { kind: 'found' }
  | { kind: 'includes'; value: string }
  | { kind: 'tags'; labels: string[] }
  | { kind: 'notifications'; type: NexusNotificationType; actorId?: string; count: number }
  | { kind: 'bookmark' }
  | { kind: 'streamKeys'; postIds: string[] };

export type NexusCheck = {
  // Names the record in a timeout, so a seed that never indexes says which write it was
  description: string;
  path: string;
  qs?: Record<string, string>;
  expect: NexusExpectation;
};

export type NexusWaitArgs = { checks: NexusCheck[]; timeoutMs: number };
