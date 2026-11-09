import type { Interception } from 'cypress/types/net-stubbing';
import { slowCypressDown } from 'cypress-slow-down';
import { backupDownloadFilePath, extendedTimeout, verifyNotificationCounter } from '../support/common';
import { goToProfilePageFromHeader } from '../support/header';
import {
  expectV1PostWrite,
  followGone,
  followIndexed,
  notificationsIndexed,
  parseRequestBody,
  postContentIndexed,
  postGone,
  postIdFromWriteUrl,
  postIndexed,
  postTagGone,
  postTagsIndexed,
  postVersionFromWriteUrl,
  userIndexed,
  waitForNexus,
} from '../support/nexus';
import { createQuickPost, deletePost, editPost, waitForFeedToLoad } from '../support/posts';
import { addProfileTags, unfollowUserByUsername } from '../support/profile';
import {
  bookmarkViaApi,
  createArticleViaApi,
  createCollectionViaApi,
  createImagePostViaApi,
  createPostViaApi,
  followUserViaApi,
  markNotificationsReadViaApi,
  muteViaApi,
  seedUserViaApi,
  tagPostViaApi,
  writeSettingsViaApi,
} from '../support/seed';
import { BackupType, CheckForNewPosts, HasBackedUp, OnboardingExperience } from '../support/types/enums';
import type { SeededPost, SeededUser } from '../support/types/seed';

const MIGRATION_SCREEN_HOLD_MS = 3000;

type MigrationFlag = { migrated: string[]; skipped: Record<string, string[]> };

// A tree this small migrates in a moment. The done flag is written last, so holding its answer
// back keeps the progress screen up long enough to see it.
const holdMigrationFlag = () => {
  cy.intercept('PUT', '**/priv/social/v1/_migrated.json', (req) => {
    req.on('response', (res) => {
      res.setDelay(MIGRATION_SCREEN_HOLD_MS);
    });
  }).as('migrationDone');
};

// What the run recorded, once its flag landed: the 0.x paths it copied and those it left, by reason
const migrationFlag = () =>
  cy.wait('@migrationDone').then(({ request, response }) => {
    expect(response?.statusCode, 'flag write').to.eq(201);
    return parseRequestBody(request.body) as MigrationFlag;
  });

const legacyPostPath = (post: SeededPost) => `pub/pubky.app/posts/${post.id}`;

const waitUntilStarterPackHasUsers = (tag: string) => {
  const deadline = Date.now() + 90_000;
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    const nexusOrigin = String(nexusUrl).replace(/\/$/, '');
    const poll = () => {
      cy.request({
        url: `${nexusOrigin}/v1/stream/users/ids?source=starter_pack&tags=${encodeURIComponent(tag)}&skip=0&limit=10`,
        failOnStatusCode: false,
      }).then((response) => {
        const ids = Array.isArray(response.body) ? response.body : [];
        if (ids.length > 0) return;
        if (Date.now() >= deadline) {
          throw new Error(`Nexus starter_pack did not index ${tag}`);
        }
        cy.wait(2000);
        poll();
      });
    };
    poll();
  });
};

describe('Onboarding', () => {
  before(() => {
    slowCypressDown();
  });

  beforeEach(() => {
    cy.deleteDownloadsFolder();
    cy.visit('/');
    checkHeaderIsVisible();
  });

  const checkOwnProfile = (profileName: string, profileBio: string) => {
    goToProfilePageFromHeader();
    cy.location('pathname').should('eq', '/profile');
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileName);
    cy.get('[data-cy="profile-bio-header"]')
      .filter(':visible')
      .should(($bio) => {
        expect($bio.get(0).innerText.trim()).to.eq(profileBio);
      });
  };

  const checkHeaderIsVisible = () => {
    cy.get('header').should('exist').should('be.visible');
    cy.get('[data-cy="header-sign-in-btn"]').should('exist').should('be.visible');
  };

  it('can onboard as a new user backing up with encrypted file and recovery phrase, sign out, then sign in with both methods', () => {
    // profile name is also used for the backup file name
    const profileName = 'Test User';
    const profileBio = 'Test Bio';
    const backupWithFileAndPhrase = [BackupType.EncryptedFile, BackupType.RecoveryPhraseWithConfirmation];

    // A signup has nothing to move: it records that inline, and never passes through the gate's route
    // Kept as reported: Cypress also reports an empty URL between tests, and a listener that throws hangs the run
    const visitedUrls: string[] = [];
    cy.then(() => {
      cy.on('url:changed', (url) => {
        visitedUrls.push(url);
      });
    });
    cy.intercept('PUT', '**/priv/social/v1/_migrated.json').as('signupFlag');

    cy.onboardAsNewUser(profileName, profileBio, backupWithFileAndPhrase);

    cy.get('@signupFlag.all').should('have.length', 1);
    cy.then(() => {
      expect(
        visitedUrls.filter((url) => url.includes('/migration')),
        'visits to the gate during signup',
      ).to.deep.eq([]);
      expect(visitedUrls, 'routes during signup').to.not.deep.eq([]);
    });

    // confirm backup reminder is shown
    cy.get('#backup-btn').should('exist').click();
    // confirm backup dialog can be shown and closed
    cy.get('#backup-dialog-title').should('exist');
    cy.get('[data-testid="dialog-close"]').click();
    // confirm backup done button can be clicked
    cy.get('#backup-done-btn').click();
    // confirm backup confirmation dialog can be shown and dismissed
    cy.get('#backup-done-warning-text').should('exist');
    cy.get('#backup-done-confirm-btn').click();
    // confirm backup reminder is not shown
    cy.get('#backup-btn').should('not.exist');

    cy.signOut(HasBackedUp.Yes);

    cy.signInWithEncryptedFile(backupDownloadFilePath(profileName));
    checkOwnProfile(profileName, profileBio);

    cy.signOut(HasBackedUp.Yes);

    cy.get(`@recoveryPhrase-${profileName}`).then((recoveryPhrase) => {
      cy.signInWithRecoveryPhrase(recoveryPhrase.toString());
    });
    checkOwnProfile(profileName, profileBio);

    cy.signOut(HasBackedUp.Yes);
  });

  it('migrates a 0.x account on sign-in and lands on home with its content', () => {
    const profileName = `Unmigrated ${Cypress._.random(100_000)}`;
    const profileBio = 'Still in the old layout';
    const run = Date.now();
    const noteText = `Written before the migration ${run}`;
    const imageText = `Image from before the migration ${run}`;
    const articleTitle = `Article from before the migration ${run}`;
    const articleBody = `Its body, under a cover in its first attachment ${run}`;
    const collectionName = `Collection from before the migration ${run}`;
    const tagLabel = `premigration${Cypress._.random(100_000)}`;

    let user: SeededUser;
    let followee: SeededUser;
    let follower: SeededUser;
    let mutee: SeededUser;
    let note: SeededPost;
    let image: SeededPost;
    let article: SeededPost;
    let collection: SeededPost;
    let lastRead: number;

    seedUserViaApi(profileName, { bio: profileBio, legacy: true, withRecoveryFile: true }).then((seeded) => {
      user = seeded;
    });
    seedUserViaApi('Followed Before Migrating', { legacy: true }).then((seeded) => {
      followee = seeded;
    });
    seedUserViaApi('Following Before Migrating', { legacy: true }).then((seeded) => {
      follower = seeded;
    });
    seedUserViaApi('Muted Before Migrating', { legacy: true }).then((seeded) => {
      mutee = seeded;
    });
    cy.then(() => {
      createPostViaApi(user, noteText).then((post) => {
        note = post;
      });
      createImagePostViaApi(user, imageText).then((post) => {
        image = post;
      });
      createArticleViaApi(user, articleTitle, articleBody, { coverFixture: 'mustache-you.png' }).then((post) => {
        article = post;
      });
      followUserViaApi(user, followee);
      muteViaApi(user, mutee);
      writeSettingsViaApi(user, { notifications: { repost: false }, updatedAt: run, version: 1 });
      // Only what happens after this cursor counts as unread, so the counter below shows that it was carried over
      markNotificationsReadViaApi(user).then(({ timestamp }) => {
        lastRead = timestamp;
      });
      followUserViaApi(follower, user);
    });
    cy.then(() => {
      tagPostViaApi(user, note, [tagLabel]);
      bookmarkViaApi(user, note);
      createCollectionViaApi(user, collectionName, { items: [note] }).then((post) => {
        collection = post;
      });
    });
    cy.then(() => {
      waitForNexus(
        userIndexed(user),
        userIndexed(mutee),
        postIndexed(note),
        postIndexed(image),
        postIndexed(article),
        postIndexed(collection),
        postTagsIndexed(note, [tagLabel]),
        followIndexed(user, followee),
        notificationsIndexed(user, 'follow', { actor: follower }),
      );
    });

    cy.intercept('PUT', '**/{pub,priv}/social/v1/**').as('v1Write');
    cy.intercept('PUT', '**/priv/app.pubky/v1/settings.json').as('settingsCopied');
    cy.intercept('PUT', '**/priv/app.pubky/v1/last_read*').as('lastReadCopied');
    holdMigrationFlag();

    cy.signInWithEncryptedFile(backupDownloadFilePath(profileName), undefined, { migrates: true });

    migrationFlag().then((flag) => {
      // The app's own files are the only thing a clean run leaves behind: it imports those itself
      expect(Object.keys(flag.skipped), 'skipped outcomes').to.deep.equal(['not_migrated']);
      expect(flag.skipped['not_migrated']).to.have.members(['pub/pubky.app/last_read', 'pub/pubky.app/settings.json']);
      expect(flag.migrated).to.include.members([
        'pub/pubky.app/profile.json',
        legacyPostPath(note),
        legacyPostPath(image),
        legacyPostPath(article),
        legacyPostPath(collection),
        `pub/pubky.app/follows/${followee.id}`,
        `pub/pubky.app/mutes/${mutee.id}`,
      ]);
    });

    // Nexus still answers for a post from its 0.x copy under the same id, so only these writes show the data moved
    cy.get<Interception[]>('@v1Write.all').then((writes) => {
      const landed = writes.filter(({ response }) => response?.statusCode === 201);
      // Where a homeserver serves a user's tree from varies by stack, so a write is named from its root on
      const pathOf = ({ request }: Interception) => new URL(request.url).pathname.replace(/^.*?(?=\/(pub|priv)\/)/, '');
      const paths = landed.map(pathOf);
      [
        /^\/pub\/social\/v1\/profile\.json$/,
        new RegExp(`^/pub/social/v1/posts/${note.id}/[^/]+\\.json$`),
        new RegExp(`^/pub/social/v1/posts/${image.id}/[^/]+\\.json$`),
        new RegExp(`^/pub/social/v1/posts/${article.id}/[^/]+\\.json$`),
        new RegExp(`^/pub/social/v1/posts/${collection.id}/[^/]+\\.json$`),
        /^\/pub\/social\/v1\/files\/[^/]+\.png$/,
        /^\/pub\/social\/v1\/tags\/[^/]+\.json$/,
        new RegExp(`^/pub/social/v1/follows/${followee.id}\\.json$`),
        /^\/priv\/social\/v1\/bookmarks\/[^/]+\.json$/,
        new RegExp(`^/priv/social/v1/mutes/${mutee.id}\\.json$`),
      ].forEach((stored) => {
        expect(
          paths.some((path) => stored.test(path)),
          `a write to ${stored}`,
        ).to.eq(true);
      });
      // 0.x bookmarks and mutes were public; their copies are not
      expect(paths.filter((path) => /^\/pub\/social\/v1\/(bookmarks|mutes)\//.test(path))).to.deep.equal([]);

      const postCopies = landed.filter((write) => pathOf(write).startsWith('/pub/social/v1/posts/'));
      postCopies.forEach((write) => {
        expectV1PostWrite(write).then((post) => {
          if (postIdFromWriteUrl(write.request.url) !== article.id) return;
          // The first attachment of a 0.x article moves into the envelope as its cover
          expect(post.kind).to.eq('article');
          expect(post.attachments).to.deep.equal([]);
          expect(JSON.parse(post.content).cover_image, 'article cover').to.be.a('string');
        });
      });
    });

    // The 0.x cursor came over. Checked first: opening the profile below marks everything read.
    verifyNotificationCounter(1);
    cy.wait('@lastReadCopied').then(({ request }) => {
      expect(parseRequestBody(request.body)).to.deep.equal({ timestamp: lastRead });
    });

    checkOwnProfile(profileName, profileBio);
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-tab-content"]')
      .should('contain.text', noteText)
      .and('contain.text', imageText)
      .and('contain.text', articleTitle)
      .and('contain.text', articleBody);
    cy.get('[data-cy="profile-filter-item-collections"]').click();
    cy.contains('[data-cy="collection-card"]', collectionName).should('be.visible');

    // The 0.x settings came over too
    cy.get('[data-cy="header-settings-btn"]').click();
    cy.get('[data-cy="settings-menu-item-notifications"]').click();
    cy.get('#notification-switch-repost').should('have.attr', 'data-state', 'unchecked');
    cy.get('#notification-switch-follow').should('have.attr', 'data-state', 'checked');
    cy.wait('@settingsCopied').its('response.statusCode').should('eq', 201);

    // What moved to the private root reads back from there
    cy.get('[data-cy="settings-menu-item-mutedUsers"]').click();
    cy.get('[data-cy="muted-users-root"]').should('contain.text', 'Muted Before Migrating');
    cy.get('[data-cy="header-collections-btn"]').click();
    cy.get('[data-cy="collection-bookmark-card"]').click();
    cy.get('[data-cy="timeline-posts-cards"]').should('contain.text', noteText);

    // A second sign-in goes through the gate's route while it checks, finds the done flag and writes no
    // second one: the flag is the last write of a run, so a repeated migration would show here.
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(profileName));
    cy.get('@migrationDone.all').should('have.length', 1);
    cy.signOut(HasBackedUp.Yes);
  });

  // Nexus ignores a user's v1 writes until the migration flips them, and their 0.x writes after it, so this is
  // where the flip shows end to end.
  it('lets a migrated account change what it migrated and reaches Nexus with its new writes', () => {
    const profileName = `Migrating ${Cypress._.random(100_000)}`;
    const followeeName = 'Unfollowed After Migrating';
    const run = Date.now();
    const editableText = `Will be edited after the migration ${run}`;
    const editedText = `Edited after the migration ${run}`;
    const deletableText = `Will be deleted after the migration ${run}`;
    const taggedText = `Will lose a tag after the migration ${run}`;
    const newText = `Written after the migration ${run}`;
    const tagLabel = `premigration${Cypress._.random(100_000)}`;

    let user: SeededUser;
    let followee: SeededUser;
    let editable: SeededPost;
    let deletable: SeededPost;
    let tagged: SeededPost;

    seedUserViaApi(profileName, { legacy: true, withRecoveryFile: true }).then((seeded) => {
      user = seeded;
    });
    seedUserViaApi(followeeName, { legacy: true }).then((seeded) => {
      followee = seeded;
    });
    cy.then(() => {
      createPostViaApi(user, editableText).then((post) => {
        editable = post;
      });
      createPostViaApi(user, deletableText).then((post) => {
        deletable = post;
      });
      createPostViaApi(user, taggedText, { tags: [tagLabel] }).then((post) => {
        tagged = post;
      });
      followUserViaApi(user, followee);
    });
    cy.then(() => {
      waitForNexus(
        userIndexed(user),
        postIndexed(editable),
        postIndexed(deletable),
        postTagsIndexed(tagged, [tagLabel]),
        followIndexed(user, followee),
      );
    });

    holdMigrationFlag();
    cy.signInWithEncryptedFile(backupDownloadFilePath(profileName), undefined, { migrates: true });
    migrationFlag();

    // A new post has no 0.x copy for Nexus to answer from
    cy.intercept('PUT', '**/pub/social/v1/posts/*/*').as('postVersion');
    createQuickPost(newText);
    cy.wait('@postVersion').then(({ request }) => {
      waitForNexus(postIndexed({ authorId: user.id, id: postIdFromWriteUrl(request.url) }));
    });

    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-filter-item-posts"]').closest('[data-selected="true"]').should('exist');
    cy.get('[data-cy="profile-tab-content"]')
      .should('contain.text', editableText)
      .and('contain.text', deletableText)
      .and('contain.text', taggedText);

    editPost({ newPostContent: editedText, filterText: editableText });
    cy.wait('@postVersion').then(({ request }) => {
      const { postId, editId } = postVersionFromWriteUrl(request.url);
      expect(postId, 'edited post').to.eq(editable.id);
      expect(editId > postId, 'edit sorts after the post').to.eq(true);
    });
    cy.then(() => {
      waitForNexus(postContentIndexed(editable, editedText));
    });

    // Every copy goes: the 0.x one this account still holds, and the version the migration made
    cy.intercept('DELETE', '**/pub/pubky.app/posts/*').as('legacyCopyDeleted');
    cy.intercept('DELETE', '**/pub/social/v1/posts/*/*').as('versionDeleted');
    deletePost({ filterText: deletableText });
    cy.wait('@legacyCopyDeleted').then(({ request }) => {
      expect(request.url).to.include(deletable.id);
    });
    cy.wait('@versionDeleted').then(({ request }) => {
      expect(postIdFromWriteUrl(request.url)).to.eq(deletable.id);
    });
    cy.then(() => {
      waitForNexus(postGone(deletable));
    });

    cy.findFirstPostInFeedFiltered(taggedText).within(() => {
      cy.intercept('DELETE', '**/pub/social/v1/tags/**').as('tagDeleted');
      cy.contains('button', tagLabel).click();
      cy.wait('@tagDeleted').its('response.statusCode').should('eq', 204);
    });
    cy.then(() => {
      waitForNexus(postTagGone(tagged, tagLabel));
    });

    cy.intercept('DELETE', '**/pub/pubky.app/follows/*').as('legacyFollowDeleted');
    cy.intercept('DELETE', '**/pub/social/v1/follows/*').as('followDeleted');
    unfollowUserByUsername(followeeName);
    cy.wait('@legacyFollowDeleted');
    cy.wait('@followDeleted');
    cy.then(() => {
      waitForNexus(followGone(user, followee));
    });

    cy.signOut(HasBackedUp.Yes);
  });

  it('shows what a migration left behind and lets the account continue', () => {
    const profileName = `Partly Migrating ${Cypress._.random(100_000)}`;
    const profileBio = 'Leaves one thing behind';
    const noteText = `Migrates beside an article that cannot ${Date.now()}`;

    let user: SeededUser;
    let note: SeededPost;
    let untitled: SeededPost;

    seedUserViaApi(profileName, { bio: profileBio, legacy: true, withRecoveryFile: true }).then((seeded) => {
      user = seeded;
    });
    cy.then(() => {
      createPostViaApi(user, noteText).then((post) => {
        note = post;
      });
      // An article with no title and nothing a note could carry in its place has no v1 form
      createArticleViaApi(user, '', '').then((post) => {
        untitled = post;
      });
    });
    cy.then(() => {
      waitForNexus(userIndexed(user), postIndexed(note));
    });

    holdMigrationFlag();
    cy.signInWithEncryptedFile(backupDownloadFilePath(profileName), undefined, {
      migrates: true,
      acknowledgesSummary: true,
    });

    migrationFlag().then((flag) => {
      expect(flag.skipped['empty_title']).to.deep.equal([legacyPostPath(untitled)]);
      expect(flag.migrated).to.include(legacyPostPath(note));
    });

    checkOwnProfile(profileName, profileBio);
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-tab-content"]').should('contain.text', noteText);
    cy.signOut(HasBackedUp.Yes);
  });

  it('can sign up, sign out, then sign up again as a new user', () => {
    const firstProfileName = 'First User';
    const secondProfileName = 'Second User';

    // sign up as first user
    cy.onboardAsNewUser(firstProfileName);

    // sign out
    cy.signOut(HasBackedUp.Yes);

    // verify we're back at the home page and can sign up again
    cy.location('pathname').should('eq', '/');
    checkHeaderIsVisible();

    // sign up as second user
    cy.onboardAsNewUser(secondProfileName);
  });

  it('suggests people for a chosen interest, follows them all, and lands on the My network feed', () => {
    // Docker Nexus has no popular-tag chips. Seed a user who owns this tag so
    // starter_pack can return a match after the next signup types it in.
    const interestTag = `e2e${Date.now().toString().slice(-8)}`;

    cy.onboardAsNewUser('Tagged Seed');
    createQuickPost(`Seed post for ${interestTag}`, [interestTag]);
    cy.findFirstPostInFeed(CheckForNewPosts.Yes);
    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-filter-item-tagged"]').click();
    addProfileTags([interestTag]);
    waitUntilStarterPackHasUsers(interestTag);
    cy.signOut(HasBackedUp.Yes);

    cy.onboardAsNewUser('Interested User', '', undefined, undefined, OnboardingExperience.StopAtTags);

    cy.get('[data-testid="tags-of-interest-form"]').within(() => {
      cy.get('[data-testid="popular-interests-empty"], [data-testid^="popular-tag-"]', extendedTimeout()).should(
        'exist',
      );
      cy.get('[data-cy="add-tag-input"]').type(`${interestTag}{enter}`);
      // Seeded tags often land in Popular interests; otherwise they show as a custom chip
      cy.get(
        `[data-testid="popular-tag-${interestTag}"][aria-pressed="true"], [data-testid="interest-tag-${interestTag}"]`,
      ).should('be.visible');
      cy.get('#profile-finish-btn').click();
    });

    cy.location('pathname').should('eq', '/onboarding/follow');
    cy.get('[data-cy="follow-best-matches-form"]').should('be.visible');
    cy.get('[data-cy="suggested-user-card"]', extendedTimeout()).should('have.length.greaterThan', 0);

    // Follow all: every card flips to following and the button disappears once nothing is left to follow
    cy.get('[data-cy="follow-all-btn"]').should('contain.text', 'Follow all (').click();
    cy.get('[data-cy="follow-all-btn"]', extendedTimeout()).should('not.exist');
    cy.get('[data-cy="suggested-user-card"]').each(($card) => {
      cy.wrap($card)
        .find('[data-cy="user-list-item-follow-toggle-btn"]')
        .invoke('attr', 'aria-label')
        .should('match', /^Unfollow /);
    });

    cy.finishFollowBestMatchesStep();

    // With at least one follow the landing feed is My network
    cy.get('[data-cy="filter-reach-radiogroup"]')
      .find('[data-cy="network-reach-toggle"]')
      .should('have.attr', 'data-selected', 'true');

    // Choosing interests creates an Interests custom feed (#2508)
    cy.get('[data-cy="feed-navigation"]')
      .find('[data-cy="feed-navigation-custom-tab"][aria-label="Interests"]', { timeout: 15_000 })
      .should('be.visible');
  });

  it('shows most active people without interests and lands on the All feed after finishing', () => {
    cy.onboardAsNewUser('Undecided User', '', undefined, undefined, OnboardingExperience.StopAtTags);

    // Continue with zero tags
    cy.get('[data-testid="tags-of-interest-form"]').within(() => {
      cy.get('#profile-finish-btn').click();
    });

    cy.location('pathname').should('eq', '/onboarding/follow');
    cy.get('[data-cy="suggested-user-card"]', extendedTimeout()).should('have.length.greaterThan', 0);

    // Finish writes the Interests feed before it navigates, so any feed write happens before /home.
    cy.intercept('PUT', '**/{pub,priv}/**/feeds/**').as('feedPut');
    cy.finishFollowBestMatchesStep();

    // With zero follows the landing feed stays on All
    cy.get('[data-cy="filter-reach-radiogroup"]')
      .find('[data-cy="all-reach-toggle"]')
      .should('have.attr', 'data-selected', 'true');

    // No interest tags means no Interests feed (#2508)
    cy.get('@feedPut.all').should('have.length', 0);
    cy.get('[data-cy="feed-navigation"]').find('[data-cy="feed-navigation-home-tab"]').should('be.visible');
    cy.get('[data-cy="feed-navigation"]').find('[data-cy="feed-navigation-create-btn"]').should('be.visible');
    cy.get('[data-cy="feed-navigation"]')
      .find('[data-cy="feed-navigation-custom-tab"][aria-label="Interests"]')
      .should('not.exist');
  });

  it('can use Explore mode without signing in and shows Join Pubky dialog when clicking new post button', () => {
    // Explore lives in the navbar on desktop and in the hero action row below `md`
    const exploreBtn = Cypress.expose('isMobile') ? '[data-cy="explore-btn"]' : '#header-explore-btn';
    cy.get(exploreBtn).should('be.visible').click();

    waitForFeedToLoad();

    cy.location('pathname').should('eq', '/home');
    cy.get('[data-cy="timeline-container"]').should('be.visible');

    cy.get('[data-cy="new-post-btn"]').should('be.visible').click();
    cy.get('[data-cy="dialog-content"]').should('be.visible').and('contain.text', 'Join Pubky');
  });

  it('cannot proceed with unverified invite code', () => {
    // Intercept invite code verification (GET .../signup_tokens/<code>)
    cy.intercept('GET', '**/signup_tokens/*', { statusCode: 404 }).as('verifyInviteCode');

    // Start onboarding flow
    cy.get('#create-account-btn').click();
    cy.location('pathname').should('eq', '/onboarding/human');

    // Click 'enter invite code' button
    cy.get('[data-testid="human-dev-invite-code-btn"]').should('exist').click();

    // Enter invalid invite code - verification runs automatically when the full code is entered
    cy.get('[data-cy="human-invite-code-input"]').type('abcd-efgh-ijkl');

    cy.wait('@verifyInviteCode');

    // Assert invalid invite code toast is shown
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invalid invite code');

    // Continue stays disabled and the user remains on the invite code step
    cy.get('[data-cy="human-invite-code-continue-btn"]').should('be.disabled');
    cy.location('pathname').should('eq', '/onboarding/human');
  });

  it('cannot proceed with a reused invite code', () => {
    const profileName = 'Reused Invite User';
    const signupTokensPath = '/signup_tokens/';
    let capturedInviteCode = '';

    // Pass verification through to the homeserver and capture the invite code from the request URL.
    cy.intercept('GET', '**/signup_tokens/*', (req) => {
      const tokenStart = req.url.indexOf(signupTokensPath);
      if (tokenStart !== -1) {
        const encodedToken = req.url.slice(tokenStart + signupTokensPath.length).split('?')[0];
        capturedInviteCode = decodeURIComponent(encodedToken);
      }
      req.continue();
    }).as('verifyInviteCode');

    // First signup: homeserver verifies the fresh code as valid
    cy.onboardAsNewUser(profileName);
    cy.signOut(HasBackedUp.Yes);

    // Second signup: reuse the captured invite code; homeserver should report it as used
    cy.get('#create-account-btn').click();
    cy.location('pathname').should('eq', '/onboarding/human');
    cy.get('[data-testid="human-dev-invite-code-btn"]').should('exist').click();

    cy.then(() => {
      expect(capturedInviteCode, 'invite code captured from first verification').to.be.a('string').and.not.be.empty;
      cy.get('[data-cy="human-invite-code-input"]').type(capturedInviteCode);
      cy.wait('@verifyInviteCode');
      cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invite code already used');
      cy.get('[data-cy="human-invite-code-continue-btn"]').should('be.disabled');
      cy.location('pathname').should('eq', '/onboarding/human');
    });
  });

  it('can sign up via /invite/<code> URL', () => {
    const profileName = 'Invite URL User';

    cy.env(['homeserverAdminUrl', 'homeserverAdminPassword']).then(
      ({ homeserverAdminUrl, homeserverAdminPassword }) => {
        cy.request({
          method: 'GET',
          url: homeserverAdminUrl,
          headers: {
            'X-Admin-Password': homeserverAdminPassword,
          },
        }).then((response) => {
          const inviteCode = response.body as string;

          cy.visit(`/invite/${inviteCode}`);
          cy.location('pathname').should('eq', '/onboarding/install');
          cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invite code applied');
          cy.get('#create-keys-in-browser-btn').should('be.visible');

          cy.completeOnboardingFromInstall(profileName);
        });
      },
    );
  });

  it('redirects home when /invite/<code> verification returns 404', () => {
    cy.intercept('GET', '**/signup_tokens/*', { statusCode: 404 }).as('verifyInviteCode');

    cy.visit('/invite/abcd-efgh-ijkl');

    cy.wait('@verifyInviteCode');
    cy.location('pathname').should('eq', '/');
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invalid invite code');
    checkHeaderIsVisible();
  });
});
