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

// What a response must hold for the record to count as indexed: a 200 with this, or for `gone` a 404
export type NexusExpectation =
  | { kind: 'found' }
  | { kind: 'gone' }
  | { kind: 'content'; text: string }
  | { kind: 'includes'; value: string }
  | { kind: 'excludes'; value: string }
  | { kind: 'tags'; labels: string[] }
  | { kind: 'noTag'; label: string }
  | { kind: 'notifications'; type: NexusNotificationType; actorId?: string; count: number }
  | { kind: 'streamKeys'; postIds: string[] };

export type NexusCheck = {
  // Names the record in a timeout, so a seed that never indexes says which write it was
  description: string;
  path: string;
  qs?: Record<string, string>;
  expect: NexusExpectation;
};

export type NexusWaitArgs = { checks: NexusCheck[]; timeoutMs: number };
