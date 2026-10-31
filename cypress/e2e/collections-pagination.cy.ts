import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { backupDownloadFilePath } from '../support/common';
import { goToCollectionsPage } from '../support/header';
import {
  assertNoRepeatedStreamRequests,
  COLLECTIONS_PAGE_SIZE,
  keyMatchesPostId,
  recordStreamPages,
  waitForNexusStream,
} from '../support/pagination';
import { createCollectionViaApi, seedUserViaApi } from '../support/seed';

const username = 'Mr Collector';
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
  // Seeded through the API: creating a collection in the UI is covered in collections.cy.ts. The author
  // only signs in for the test, so the section below pages from Nexus.
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
    // Installs the app while the seeds index; the sign-in below waits for the install to finish
    cy.visit('/');

    seedUserViaApi(username, { bio: 'I collect everything', withRecoveryFile: true }).then((author) => {
      authorId = author.id;
      Cypress._.times(COLLECTION_COUNT, (index) => {
        createCollectionViaApi(author, `Collection ${runId} ${String(index + 1).padStart(2, '0')}`).then(
          (collection) => {
            collectionIds.push(collection.id);
          },
        );
      });
    });

    // The section is checked against the stream Nexus returns, in Nexus's order
    cy.then(() =>
      waitForNexusStream({ source: 'author', author_id: authorId, kind: 'collection' }, collectionIds).then((keys) => {
        collectionKeys = keys;
      }),
    );
  });

  it('my collections shows one page, then the rest on "Show more", once each', () => {
    expect(collectionKeys, 'authored collections').to.have.length(COLLECTION_COUNT);
    const expectedIds = idsForKeys(collectionKeys);
    // `fetchAuthoredCollections` loads this shared `author:collection` stream at the 50-item
    // Nexus limit, so that fetch can serve both section pages from the local cache: up to
    // three requests, never one repeated.
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
