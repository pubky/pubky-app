// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import { slowCypressDown } from 'cypress-slow-down';
import { waitForServiceWorker } from '../../support/common';
import {
  expectPostOrder,
  expectTimelineContains,
  expectTimelineOmits,
  expectVisibleReachSelected,
  selectFeedFilter,
} from '../../support/feeds';
import { goToHomePage } from '../../support/header';
import {
  expectAppWithoutNexus,
  FIRST_SYNC_TIMEOUT,
  forbidNexusRequests,
  localIndexStat,
  type LocalNetwork,
  logPhase,
  NETWORK_NAMES,
  NETWORK_TAG,
  NETWORK_TEXTS,
  openLocalIndexStatus,
  openPostFromTimeline,
  seedLocalNetwork,
  signInToLocalIndex,
} from '../../support/local-index';
import { waitForFeedToLoad } from '../../support/posts';
import { openProfileTab } from '../../support/profile';
import { PostType } from '../../support/types/enums';

// A reload answers from what this browser stored; a new sync from scratch is not needed for it
const STORED_INDEX_TIMEOUT = { timeout: 10_000 };
// A local file is served by the worker once the page reads it from the homeserver
const LOCAL_MEDIA_TIMEOUT = { timeout: 30_000 };
const LOCAL_FILE_URL = /\/_pubky\/file\/[a-z0-9]{52}\/[^/]+$/;

describe('local index: reading the network without Nexus', () => {
  forbidNexusRequests();

  let network: LocalNetwork;

  before(() => {
    slowCypressDown();
    logPhase('opening the app');
    // Installs the app and its service worker while the network is seeded
    cy.visit('/');
    expectAppWithoutNexus();
    seedLocalNetwork().then((seeded) => {
      network = seeded;
    });
    logPhase('network seeded');
    waitForServiceWorker();
    logPhase('service worker ready');
  });

  it('shows the network on Home, newest first, with edits and deletes applied', () => {
    signInToLocalIndex(network.viewer);

    // All is the default reach for a viewer who follows fewer than three users: the whole index
    [
      NETWORK_TEXTS.bobRepost,
      NETWORK_TEXTS.carolNote,
      NETWORK_TEXTS.bobNote,
      NETWORK_TEXTS.aliceImage,
      NETWORK_TEXTS.aliceAfterEdit,
      NETWORK_TEXTS.viewerRoot,
    ].forEach(expectTimelineContains);
    logPhase('Home shows the network');
    // Not Alice's tagged post: Bob's quote above it holds its text too
    expectPostOrder(NETWORK_TEXTS.bobRepost, NETWORK_TEXTS.carolNote);
    expectPostOrder(NETWORK_TEXTS.carolNote, NETWORK_TEXTS.bobNote);
    expectPostOrder(NETWORK_TEXTS.bobNote, NETWORK_TEXTS.aliceImage);
    expectPostOrder(NETWORK_TEXTS.aliceImage, NETWORK_TEXTS.aliceAfterEdit);
    expectPostOrder(NETWORK_TEXTS.aliceAfterEdit, NETWORK_TEXTS.viewerRoot);
    cy.findFirstPostInFeedFilteredByType(NETWORK_TEXTS.bobRepost, PostType.Repost).should(
      'contain.text',
      NETWORK_TEXTS.aliceTagged,
    );

    expectTimelineOmits(NETWORK_TEXTS.aliceBeforeEdit);
    expectTimelineOmits(NETWORK_TEXTS.aliceDeleted);
    // Nobody in the network follows Olga, so her homeserver is never read
    expectTimelineOmits(NETWORK_TEXTS.olgaNote);

    // Following holds the viewer's follows only, so Carol, two hops out, drops out
    selectFeedFilter('reach', 'following-reach-toggle');
    waitForFeedToLoad();
    expectVisibleReachSelected('following-reach-toggle');
    expectTimelineContains(NETWORK_TEXTS.bobNote);
    expectTimelineContains(NETWORK_TEXTS.aliceImage);
    expectTimelineOmits(NETWORK_TEXTS.carolNote);
  });

  it('opens a post with its thread and tags', () => {
    signInToLocalIndex(network.viewer);

    openPostFromTimeline(NETWORK_TEXTS.viewerRoot);
    cy.get('[data-cy="post-page-title"]').should('contain.text', 'Post by').and('contain.text', NETWORK_NAMES.viewer);
    cy.contains('[data-cy="thread-reply"]', NETWORK_TEXTS.aliceReply).should('exist');
    cy.contains('[data-cy="post-text"]', NETWORK_TEXTS.bobReply).should('exist');
    // Olga is outside the network: the index never reads her homeserver, so her reply is unknown here
    cy.get('body').should('not.contain.text', NETWORK_TEXTS.olgaReply);

    goToHomePage();
    openPostFromTimeline(NETWORK_TEXTS.aliceTagged);
    cy.get('[data-cy="post-page-title"]').should('contain.text', NETWORK_NAMES.alice);
    cy.get('[data-cy="single-post-card"]')
      .filter(':visible')
      .find('[data-cy="clickable-tags-list"]')
      .filter(':visible')
      .within(() => {
        cy.contains('button', NETWORK_TAG)
          .should('be.visible')
          .find('[data-cy="post-tag-count"]')
          .should('have.text', '2');
      });
  });

  it('opens the profile of a followed user', () => {
    signInToLocalIndex(network.viewer);

    cy.visit(`/profile/${network.alice.id}`);
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', NETWORK_NAMES.alice);
    cy.get('[data-cy="profile-follow-toggle-btn"]')
      .filter(':visible')
      .invoke('text')
      .should('match', /Following/);

    openProfileTab('posts');
    expectTimelineContains(NETWORK_TEXTS.aliceTagged);
    expectTimelineContains(NETWORK_TEXTS.aliceImage);
    expectTimelineContains(NETWORK_TEXTS.aliceAfterEdit);
    expectTimelineOmits(NETWORK_TEXTS.aliceDeleted);
    expectTimelineOmits(NETWORK_TEXTS.bobNote);
  });

  it('shows the network status with a working sync button', () => {
    signInToLocalIndex(network.viewer);

    openLocalIndexStatus();
    localIndexStat('Users at hop 1').should(($value) => {
      expect(Number($value.text()), 'users the viewer follows').to.be.at.least(2);
    });
    localIndexStat('Users at hop 2').should(($value) => {
      expect(Number($value.text()), 'users two hops out').to.be.at.least(1);
    });

    cy.get('#local-index-sync-btn').filter(':visible').should('not.be.disabled');
    // The card counts the requests of the last sync alone, the same for two syncs of an unchanged network, so the
    // button's sync shows in the homeserver reads it sends
    const streamReads: string[] = [];
    cy.intercept({ url: /\/events-stream(\?|$)/ }, (req) => {
      streamReads.push(req.url);
    });
    cy.get('#local-index-sync-btn').filter(':visible').click();
    cy.wrap(streamReads, FIRST_SYNC_TIMEOUT).should('have.length.greaterThan', 0);
    localIndexStat('Stream requests').should(($value) => {
      expect(Number($value.text()), 'stream requests of the last sync').to.be.greaterThan(0);
    });
    localIndexStat('State').should('have.text', 'Idle');
    cy.get('#local-index-sync-btn').filter(':visible').should('not.be.disabled').and('contain.text', 'Sync now');
  });

  it('loads an attachment through the service worker', function () {
    // Under Cypress, Firefox never activates the worker (support/common.ts), so nothing would answer /_pubky/
    if (Cypress.browser.family !== 'chromium') this.skip();

    signInToLocalIndex(network.viewer);
    cy.window().should((win) => {
      expect(win.navigator.serviceWorker.controller, 'service worker controlling the page').to.not.equal(null);
    });

    expectTimelineContains(NETWORK_TEXTS.aliceImage);
    cy.findFirstPostInFeedFilteredByType(NETWORK_TEXTS.aliceImage, PostType.Post)
      .find('[data-cy="post-attachment-image"]')
      .should('have.length', 1)
      .scrollIntoView();
    cy.contains('[data-cy="timeline-container"] [data-cy="post-card"]', NETWORK_TEXTS.aliceImage, LOCAL_MEDIA_TIMEOUT)
      .find('[data-cy="post-attachment-image"]', LOCAL_MEDIA_TIMEOUT)
      .should(($image) => {
        const image = $image[0] as HTMLImageElement;
        expect(image.currentSrc || image.src, 'image URL').to.match(LOCAL_FILE_URL);
        expect(image.complete, 'image loaded').to.equal(true);
        expect(image.naturalWidth, 'decoded width').to.be.greaterThan(0);
      });
  });

  it('shows the network after a reload from what the browser stored', () => {
    signInToLocalIndex(network.viewer);
    expectTimelineContains(NETWORK_TEXTS.bobNote);

    // With every crawl read of a homeserver failing, only what this browser stored can answer
    cy.intercept({ url: /\/events-stream(\?|$)/ }, { statusCode: 503 });
    cy.reload();
    cy.contains(
      '[data-cy="timeline-container"] [data-cy="post-card"]',
      NETWORK_TEXTS.bobNote,
      STORED_INDEX_TIMEOUT,
    ).should('be.visible');

    // No test opens Carol's profile before this, so no cached feed answers it: only the stored index
    cy.visit(`/profile/${network.carol.id}`);
    cy.get('[data-cy="profile-username-header"]', STORED_INDEX_TIMEOUT)
      .filter(':visible')
      .should('have.text', NETWORK_NAMES.carol);
    cy.contains(
      '[data-cy="timeline-container"] [data-cy="post-card"]',
      NETWORK_TEXTS.carolNote,
      STORED_INDEX_TIMEOUT,
    ).should('be.visible');
  });
});
