const NEXUS_POLL_INTERVAL_MS = 1_000;
const NEXUS_POLL_ATTEMPTS = 60;

type IndexedTag = { label: string };

// Homeserver write bodies reach the intercept as a string, raw bytes or parsed JSON depending on the browser.
const parseRequestBody = (body: unknown): unknown => {
  if (typeof body === 'string') return JSON.parse(body);
  if (body instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(body));
  if (ArrayBuffer.isView(body)) return JSON.parse(new TextDecoder().decode(body));
  return body;
};

// Reads the tagged post's author and id from a homeserver tag PUT interception.
export const taggedPostFromInterception = (interception: { request: { body: unknown } }) => {
  const { uri } = parseRequestBody(interception.request.body) as { uri: string };
  const match = /^pubky:\/\/([^/]+)\/pub\/pubky\.app\/posts\/([^/]+)$/.exec(uri);
  expect(match, `tagged uri ${uri}`).to.not.equal(null);
  return { authorId: match![1], postId: match![2] };
};

// Polls Nexus until the post's indexed tags include every expected label.
export const waitForNexusPostTags = (authorId: string, postId: string, labels: string[]) => {
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    const url = `${String(nexusUrl).replace(/\/$/, '')}/v0/post/${authorId}/${postId}`;
    const poll = (attemptsLeft: number) => {
      cy.request({ url, failOnStatusCode: false }).then((response) => {
        const tags: IndexedTag[] = response.status === 200 ? (response.body?.tags ?? []) : [];
        const indexed = tags.map((tag) => tag.label);
        if (labels.every((label) => indexed.includes(label))) return;
        if (attemptsLeft <= 1) {
          throw new Error(`Nexus did not index tags ${labels.join(', ')} on ${authorId}:${postId}`);
        }
        cy.wait(NEXUS_POLL_INTERVAL_MS);
        poll(attemptsLeft - 1);
      });
    };
    poll(NEXUS_POLL_ATTEMPTS);
  });
};
