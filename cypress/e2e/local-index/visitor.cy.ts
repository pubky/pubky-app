// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import { slowCypressDown } from 'cypress-slow-down';
import { waitForServiceWorker } from '../../support/common';
import { expectTimelineContains } from '../../support/feeds';
import {
  expectAppWithoutNexus,
  forbidNexusRequests,
  type LocalNetwork,
  NETWORK_NAMES,
  NETWORK_TEXTS,
  seedLocalNetwork,
} from '../../support/local-index';

// Nothing signs in here, as a shared link opens: the visitor's index loads the post or profile on demand
describe('local index: signed-out visitor without Nexus', () => {
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

  it('opens a shared post', () => {
    cy.visit(`/post/${network.olga.id}/${network.posts.olgaNote.id}`);

    cy.get('[data-cy="single-post-card"]')
      .filter(':visible')
      .should('have.length', 1)
      .find('[data-cy="post-text"]')
      .first()
      .should('contain.text', NETWORK_TEXTS.olgaNote);
    cy.get('[data-cy="post-page-title"]').should('contain.text', NETWORK_NAMES.olga);
  });

  it('opens a shared profile', () => {
    cy.visit(`/profile/${network.olga.id}`);

    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', NETWORK_NAMES.olga);
    expectTimelineContains(NETWORK_TEXTS.olgaNote);
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
