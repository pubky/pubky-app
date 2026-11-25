// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import { slowCypressDown } from 'cypress-slow-down';
import { waitForServiceWorker } from '../../support/common';
import { expectTimelineContains, revealPostInTimeline, selectFeedFilter } from '../../support/feeds';
import { goToHomePage, goToProfilePageFromHeader } from '../../support/header';
import {
  expectAppWithoutNexus,
  forbidNexusRequests,
  type LocalNetwork,
  NETWORK_NAMES,
  NETWORK_TEXTS,
  openPostFromTimeline,
  revisitHomeUntil,
  seedLocalNetwork,
  signInToLocalIndex,
} from '../../support/local-index';
import { createQuickPost, fastTagPostInFeed } from '../../support/posts';
import { clickFollowButton, clickUnfollowButton, openProfileTab } from '../../support/profile';

const VIEWER_TAG = 'viewertag';

describe('local index: writing without Nexus', () => {
  forbidNexusRequests();

  let network: LocalNetwork;

  before(() => {
    slowCypressDown();
    cy.visit('/');
    expectAppWithoutNexus();
    seedLocalNetwork().then((seeded) => {
      network = seeded;
    });
    waitForServiceWorker();
  });

  it('publishes a post that shows on Home and on the profile', () => {
    const postText = `local ${Date.now()} the viewer writes`;
    signInToLocalIndex(network.viewer);

    createQuickPost(postText);
    revealPostInTimeline(postText);

    goToProfilePageFromHeader();
    openProfileTab('posts');
    expectTimelineContains(postText);
  });

  it('tags a post of the network', () => {
    signInToLocalIndex(network.viewer);

    expectTimelineContains(NETWORK_TEXTS.bobNote);
    fastTagPostInFeed([VIEWER_TAG], NETWORK_TEXTS.bobNote);
    cy.findFirstPostInFeedFiltered(NETWORK_TEXTS.bobNote)
      .find(`[data-cy="post-tag"][data-tag-label="${VIEWER_TAG}"]`)
      .filter(':visible')
      .should('have.length.at.least', 1);

    openPostFromTimeline(NETWORK_TEXTS.bobNote);
    cy.get('[data-cy="single-post-card"]')
      .filter(':visible')
      .find('[data-cy="clickable-tags-list"]')
      .filter(':visible')
      .within(() => {
        cy.contains('button', VIEWER_TAG)
          .should('be.visible')
          .find('[data-cy="post-tag-count"]')
          .should('have.text', '1');
      });
  });

  it('follows and unfollows a user outside the network, and Following follows along', () => {
    signInToLocalIndex(network.viewer);
    // Following shows the viewer's follows only, so Olga's post appears there once she is followed and indexed
    selectFeedFilter('reach', 'following-reach-toggle');
    revisitHomeUntil(
      "Bob's post without Olga's",
      (timeline) => timeline.includes(NETWORK_TEXTS.bobNote) && !timeline.includes(NETWORK_TEXTS.olgaNote),
    );

    // Nobody in the network follows Olga, so her profile is loaded on demand
    cy.visit(`/profile/${network.olga.id}`);
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', NETWORK_NAMES.olga);
    cy.intercept('PUT', `**/pub/social/v1/follows/${network.olga.id}.json`).as('followCreated');
    clickFollowButton();
    cy.wait('@followCreated').its('response.statusCode').should('be.within', 200, 299);

    goToHomePage();
    revisitHomeUntil(
      "Olga's post beside Bob's",
      (timeline) => timeline.includes(NETWORK_TEXTS.bobNote) && timeline.includes(NETWORK_TEXTS.olgaNote),
    );

    cy.visit(`/profile/${network.olga.id}`);
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', NETWORK_NAMES.olga);
    cy.intercept('DELETE', `**/pub/social/v1/follows/${network.olga.id}.json`).as('followDeleted');
    clickUnfollowButton();
    cy.wait('@followDeleted').its('response.statusCode').should('eq', 204);

    goToHomePage();
    revisitHomeUntil(
      "Bob's post without Olga's",
      (timeline) => timeline.includes(NETWORK_TEXTS.bobNote) && !timeline.includes(NETWORK_TEXTS.olgaNote),
    );
  });
});
