// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import { slowCypressDown } from 'cypress-slow-down';
import { waitForServiceWorker } from '../../support/common';
import {
  expectAppWithoutNexus,
  forbidNexusRequests,
  HISTORY_NAMES,
  HISTORY_PREFIX,
  type HistoryNetwork,
  localIndexWindowMs,
  logPhase,
  seedOlderHistory,
  signInToLocalIndex,
} from '../../support/local-index';
import { assertSeededTextsInOrder, scrollTimelineToEnd } from '../../support/pagination';
import { openProfileTab } from '../../support/profile';

const TIMELINE = '[data-cy="timeline-posts"]:visible';

// Runs with a window of minutes (PUBKY_RUNTIME_INDEXER_WINDOW_MS in the e2e workflow), so the seeds can put posts on
// both sides of it in real time
describe('local index: older history loads as a feed scrolls', () => {
  forbidNexusRequests();

  let network: HistoryNetwork;

  before(() => {
    slowCypressDown();
    logPhase('opening the app');
    cy.visit('/');
    expectAppWithoutNexus();
    localIndexWindowMs()
      .then((windowMs) => seedOlderHistory(windowMs))
      .then((seeded) => {
        network = seeded;
      });
    logPhase('history seeded');
    waitForServiceWorker();
    logPhase('service worker ready');
  });

  it('shows a followed author’s posts from before the window once their profile scrolls past it', () => {
    signInToLocalIndex(network.viewer);

    cy.visit(`/profile/${network.author.id}`);
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', HISTORY_NAMES.author);
    openProfileTab('posts');
    scrollTimelineToEnd(TIMELINE, network.texts.length);
    logPhase('profile scrolled to its end');
    assertSeededTextsInOrder(TIMELINE, HISTORY_PREFIX, network.texts);
  });
});
