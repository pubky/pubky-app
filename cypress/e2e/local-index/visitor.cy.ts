// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import { slowCypressDown } from 'cypress-slow-down';
import { waitForServiceWorker } from '../../support/common';
import { expectTimelineContains } from '../../support/feeds';
import {
  expectAppWithoutNexus,
  forbidNexusRequests,
  type LocalNetwork,
  logAppMarks,
  logPhase,
  NETWORK_NAMES,
  NETWORK_TEXTS,
  seedLocalNetwork,
} from '../../support/local-index';
import { createImagePostViaApi, seedUserViaApi } from '../../support/seed';

const LEGACY_IMAGE_TEXT = `An un-migrated author's image ${Date.now()}`;
// Longer than the list takes to show, so a list waiting for the quoted post would show it too
const QUOTED_POST_DELAY_MS = 15_000;

// Nothing signs in here, as a shared link opens: the visitor's index loads the post or profile on demand
describe('local index: signed-out visitor without Nexus', () => {
  forbidNexusRequests();

  let network: LocalNetwork;

  before(() => {
    slowCypressDown();
    logPhase('opening the app');
    cy.visit('/');
    expectAppWithoutNexus();
    seedLocalNetwork().then((seeded) => {
      network = seeded;
    });
    logPhase('network seeded');
    waitForServiceWorker();
    logPhase('service worker ready');
  });

  it('opens a shared post', () => {
    let openedAt = 0;
    cy.then(() => {
      openedAt = Date.now();
    });
    logPhase('opening a shared post');
    cy.visit(`/post/${network.olga.id}/${network.posts.olgaNote.id}`);

    cy.get('[data-cy="single-post-card"]')
      .filter(':visible')
      .should('have.length', 1)
      .find('[data-cy="post-text"]')
      .first()
      .should('contain.text', NETWORK_TEXTS.olgaNote);
    cy.get('[data-cy="post-page-title"]').should('contain.text', NETWORK_NAMES.olga);
    logPhase('shared post shown');
    cy.then(() => logAppMarks('opening a shared post', openedAt));
  });

  it('opens a shared profile', () => {
    cy.visit(`/profile/${network.olga.id}`);

    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', NETWORK_NAMES.olga);
    expectTimelineContains(NETWORK_TEXTS.olgaNote);
  });

  // The list waits for its own posts only: a quoted post of another author loads in its card, after the list shows
  it("shows a profile's posts before the post it quotes, then the quoted post without a reload", () => {
    cy.intercept({ method: 'GET', url: new RegExp(`/posts/${network.posts.aliceTagged.id}`) }, (req) => {
      req.on('response', (res) => {
        res.setDelay(QUOTED_POST_DELAY_MS);
      });
    });
    cy.visit(`/profile/${network.bob.id}`);

    expectTimelineContains(NETWORK_TEXTS.bobRepost);
    expectTimelineContains(NETWORK_TEXTS.bobNote);
    cy.get('[data-cy="timeline-container"]').should('not.contain.text', NETWORK_TEXTS.aliceTagged);
    cy.get('[data-cy="timeline-container"]', { timeout: QUOTED_POST_DELAY_MS + 30_000 }).should(
      'contain.text',
      NETWORK_TEXTS.aliceTagged,
    );
  });

  // The e2e workflow turns the older tree on for this spec: the card's type and name come from the file record the
  // index reads there, and the bytes from the blob it points at
  it("shows the image card of an un-migrated author's post", () => {
    seedUserViaApi('Legacy Lena', { legacy: true }).then((author) => {
      createImagePostViaApi(author, LEGACY_IMAGE_TEXT).then((post) => {
        cy.visit(`/post/${author.id}/${post.id}`);

        cy.get('[data-cy="single-post-card"]')
          .filter(':visible')
          .should('contain.text', LEGACY_IMAGE_TEXT)
          .find('[data-cy="post-attachment-image"]')
          .should('have.length', 1)
          .scrollIntoView()
          .should(($image) => {
            const image = $image[0] as HTMLImageElement;
            expect(image.currentSrc || image.src, 'image URL').to.match(
              new RegExp(`/_pubky/file/${author.id}/[0-9A-Z]{13}(\\?|$)`),
            );
            expect(image.naturalWidth, 'decoded width').to.be.greaterThan(0);
          });
      });
    });
  });

  it('asks to sign in on Home', () => {
    cy.visit('/home');

    cy.get('[data-cy="local-index-signed-out"]')
      .filter(':visible')
      .should('have.length', 1)
      .and('contain.text', 'Sign in to see your feed');
    cy.get('[data-cy="timeline-posts"]').should('not.exist');
  });
});
