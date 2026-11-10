import type { NexusCheck } from './types/nexus';

// Every size Nexus serves a file in (`FileVariant` in src/core/services/nexus/file/file.types.ts)
const VARIANT = '(small|feed|large|main)';

// A v1 file, on the route Nexus serves it under: `/v1/static/files/{owner}/{hash}.{ext}/{variant}`
export const V1_MEDIA_ROUTE = new RegExp(`/v1/static/files/[a-z0-9]{52}/[0-9A-Z]{26}\\.[a-z0-9]+/${VARIANT}$`);

// A 0.x file, on the route it has always had: `/static/files/{owner}/{id}/{variant}`, with no `/v1` before it
export const LEGACY_MEDIA_ROUTE = new RegExp(`(?<!/v1)/static/files/[a-z0-9]{52}/[0-9A-Z]{13}/${VARIANT}$`);

// A user's avatar, which stays on its own route whichever layout the profile image is stored in
export const avatarRoute = (userId: string) => new RegExp(`/static/avatar/${userId}(\\?v=[^/]+)?$`);

/**
 * The avatar route answering for `userId`. It is the CDN's, which is Nexus's `/static` on the local stack and in CI.
 * The avatar renders only once it loads, so this is what a spec waits on before it looks for one.
 */
export const avatarServed = (userId: string): NexusCheck => ({
  description: `avatar of ${userId}`,
  path: `/static/avatar/${userId}`,
  expect: { kind: 'found' },
});

const SERVED_TIMEOUT_MS = 60_000;
const SERVED_POLL_MS = 1000;

const sourceOf = (image: HTMLImageElement) => image.currentSrc || image.src;

// The images in the subject that are served from `route`: a query, so a chain ending in it retries
export const imagesFrom = (route: RegExp) => (_index: number, element: HTMLElement) =>
  route.test(sourceOf(element as HTMLImageElement));

// Polls `url` until it answers 200: Nexus serves a file only once it has indexed it
const waitUntilServed = (url: string, deadline = Date.now() + SERVED_TIMEOUT_MS): void => {
  cy.request({ url, failOnStatusCode: false, log: false }).then((response) => {
    if (response.status === 200) {
      expect(response.headers['content-type'], `content type of ${url}`).to.match(/^image\//);
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`${url} still answers ${response.status} after ${SERVED_TIMEOUT_MS / 1000}s`);
    }
    cy.wait(SERVED_POLL_MS, { log: false });
    waitUntilServed(url, deadline);
  });
};

/**
 * Checks the bytes behind an image, not only the element: its URL is on `route`, answers 200 with an image type,
 * and the browser decoded what it got. `findImage` must yield the one image, from the top of the command chain,
 * since a browser that met a 404 before Nexus had the file keeps the broken image until the page loads again.
 * `afterReload` runs after that reload, before `findImage` looks again: a page that settles in steps (a feed)
 * waits there the way the spec waits after its own reloads.
 */
export const expectImageServed = (
  findImage: () => Cypress.Chainable<JQuery<HTMLElement>>,
  route: RegExp,
  { afterReload }: { afterReload?: () => void } = {},
) => {
  findImage()
    .should('have.length', 1)
    .scrollIntoView()
    .should(($image) => expect(sourceOf($image[0] as HTMLImageElement), 'image URL').to.match(route))
    .then(($image) => {
      waitUntilServed(sourceOf($image[0] as HTMLImageElement));
    });
  findImage().then(($image) => {
    const image = $image[0] as HTMLImageElement;
    if (image.complete && image.naturalWidth === 0) {
      cy.reload();
      afterReload?.();
    }
  });
  findImage()
    .should('have.length', 1)
    .scrollIntoView()
    .should(($image) => {
      const image = $image[0] as HTMLImageElement;
      expect(sourceOf(image), 'image URL').to.match(route);
      expect(image.naturalWidth, 'decoded width').to.be.greaterThan(0);
    });
};
