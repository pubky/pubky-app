import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { createCollection } from '../support/collections';
import { backupDownloadFilePath, userIdFromPubky } from '../support/common';
import { goToCollectionsPage } from '../support/header';
import {
  assertNoRepeatedStreamRequests,
  COLLECTIONS_PAGE_SIZE,
  keyMatchesPostId,
  postIdFromWriteUrl,
  recordStreamPages,
  waitForNexusStream,
} from '../support/pagination';
import { BackupType, HasBackedUp } from '../support/types/enums';

const username = 'Mr Collector';
const authorAlias = 'collectionsAuthor';
const runId = Date.now().toString();

// One more collection than the My Collections section shows before "Show more"
const COLLECTION_COUNT = COLLECTIONS_PAGE_SIZE + 1;

const SECTION_CARD = '[data-cy="my-collections-section"] [data-cy="collection-card"]:visible';
const SHOW_MORE = '[data-cy="my-collections-show-more"]:visible';

const collectionIds: string[] = [];
let authorId = '';
let collectionKeys: string[] = [];

// Collection ids in the order the section renders their cards
const cardIds = ($cards: JQuery<HTMLElement>) =>
  $cards.toArray().map((card) => {
    const href = card.getAttribute('href') ?? '';
    return href.split('/').pop() ?? '';
  });

const idsForKeys = (keys: string[]) => keys.map((key) => collectionIds.find((id) => keyMatchesPostId(key, id)) ?? key);

describe('collections pagination', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
    cy.onboardAsNewUser(username, 'I collect everything', [BackupType.EncryptedFile], authorAlias);
    cy.get<string>(`@${authorAlias}`).then((pubky) => {
      authorId = userIdFromPubky(pubky);
    });

    Cypress._.times(COLLECTION_COUNT, (index) => {
      goToCollectionsPage();
      createCollection(`Collection ${runId} ${String(index + 1).padStart(2, '0')}`);
      cy.get<{ request: { url: string } }>('@collectionCreated')
        .its('request.url')
        .then((url) => {
          collectionIds.push(postIdFromWriteUrl(url));
        });
    });

    // Signing out clears the local database, so the section below pages from Nexus
    cy.signOut(HasBackedUp.Yes);
    cy.then(() =>
      waitForNexusStream({ source: 'author', author_id: authorId, kind: 'collection' }, collectionIds).then((keys) => {
        collectionKeys = keys;
      }),
    );
  });

  it('my collections shows one page, then the rest on "Show more", once each', () => {
    expect(collectionKeys, 'authored collections').to.have.length(COLLECTION_COUNT);
    const expectedIds = idsForKeys(collectionKeys);
    // The section and the save picker share this stream, so the picker's larger first fetch can
    // serve both section pages from the local cache: up to three requests, never one repeated.
    const pages = recordStreamPages(
      (query) => query['source'] === 'author' && query['author_id'] === authorId && query['kind'] === 'collection',
    );

    cy.signInWithEncryptedFile(backupDownloadFilePath(username));
    goToCollectionsPage();

    cy.get(SECTION_CARD).should(($cards) => {
      expect(cardIds($cards), 'first page').to.deep.equal(expectedIds.slice(0, COLLECTIONS_PAGE_SIZE));
    });
    cy.get(SHOW_MORE).should('have.length', 1).and('not.be.disabled').click();

    cy.get(SECTION_CARD).should(($cards) => {
      expect(cardIds($cards), 'every collection once, newest first').to.deep.equal(expectedIds);
    });
    cy.get(SHOW_MORE).should('not.exist');
    assertNoRepeatedStreamRequests(pages, 3);
  });
});
