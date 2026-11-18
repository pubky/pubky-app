import type { Interception } from 'cypress/types/net-stubbing';
import { slowCypressDown } from 'cypress-slow-down';
import { SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS } from '../../src/config/social-migration';
import { extendedTimeout, verifyNotificationCounter } from '../support/common';
import { goToProfilePageFromHeader } from '../support/header';
import { expectImageServed, v1FileRoute } from '../support/media';
import {
  holdMigrationFlag,
  holdMigrationProbe,
  legacyPostPath,
  MIGRATION_FLAG_GLOB,
  migrationFlag,
  waitForMigrationCopying,
} from '../support/migration';
import {
  expectV1PostWrite,
  followGone,
  followIndexed,
  NEXUS_DELETE_SETTLE_MS,
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
import { expectFeedTab, expectVisibleReachSelected, getFeedNavigationItem } from '../support/feeds';
import {
  addProfileTags,
  openEditProfile,
  openProfileTab,
  showProfileHeader,
  unfollowUserByUsername,
} from '../support/profile';
import { itMobile } from '../support/mobile';
import { confirmLogoutBackupBeforeNavigation } from '../support/logout';
import {
  bookmarkViaApi,
  createArticleViaApi,
  createCollectionViaApi,
  createImagePostViaApi,
  createPostViaApi,
  followUserViaApi,
  listHomeserverPathsViaApi,
  markNotificationsReadViaApi,
  muteViaApi,
  readStoredPostViaApi,
  replyViaApi,
  repostViaApi,
  seedUserViaApi,
  signUpViaApi,
  type StoredV1Post,
  tagPostViaApi,
  writeSettingsViaApi,
} from '../support/seed';
import { CheckForNewPosts, HasBackedUp, OnboardingExperience } from '../support/types/enums';
import type { SeededPost, SeededUser } from '../support/types/seed';

// Records every route the tab visits from here on into the test's own list, which an assertion reads later. Kept as
// reported: Cypress also reports an empty URL between tests, and a listener that throws hangs the run.
const recordRoutes = (visited: string[]) => {
  cy.then(() => {
    cy.on('url:changed', (url) => {
      visited.push(url);
    });
  });
};

// Records each title the gate's screen shows from here on, in order, into the test's own list, so a test can tell
// every screen a run passed through, however briefly. The app's window survives every stage change of the gate.
const recordGateTitles = (titles: string[]) => {
  cy.window().then((win) => {
    const record = () => {
      const title = win.document.querySelector('[data-testid="social-migration"] h1')?.textContent;
      if (title && titles[titles.length - 1] !== title) titles.push(title);
    };
    record();
    new win.MutationObserver(record).observe(win.document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
};

// A sign-out during an interrupted run would show as a visit to /sign-in or /logout
const expectNoSignOutRoutes = (visited: string[], label: string) => {
  cy.then(() => {
    expect(
      visited.filter((url) => /\/(sign-in|logout)(\?|$)/.test(url)),
      label,
    ).to.deep.eq([]);
  });
};

// A migrated post is one version file, `posts/{id}/{id}.json`: a run that copied anything twice shows here. Yields
// every URL under the public v1 root, for what else a test checks there.
const expectOneVersionPerPost = (user: SeededUser, posts: SeededPost[]) =>
  listHomeserverPathsViaApi(user, '/pub/social/v1/').then((urls) => {
    const versions = urls.filter((url) => url.includes('/pub/social/v1/posts/'));
    expect(versions, 'v1 post versions').to.have.length(posts.length);
    posts.forEach((post) => {
      expect(
        versions.filter((url) => url.includes(`/posts/${post.id}/`)),
        `versions of ${post.id}`,
      ).to.have.length(1);
    });
    return cy.wrap(urls, { log: false });
  });

// A fresh signup token from the homeserver admin API, as the suite hands them out to testers
const fetchInviteCode = () =>
  cy.env(['homeserverAdminUrl', 'homeserverAdminPassword']).then(({ homeserverAdminUrl, homeserverAdminPassword }) =>
    cy
      .request({
        method: 'GET',
        url: homeserverAdminUrl,
        headers: {
          'X-Admin-Password': homeserverAdminPassword,
        },
      })
      .then((response) => response.body as string),
  );

// The Install step only offers Pubky Ring now that the browser no longer creates keys
const expectInstallStepOffersPubkyRingOnly = () => {
  cy.location('pathname').should('eq', '/onboarding/install');
  cy.get('#continue-with-pubky-ring-btn').should('be.visible');
  cy.get('#create-keys-in-browser-btn').should('not.exist');
};

const waitUntilStarterPackHasUsers = (tag: string) => {
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    // The deadline starts when the poll runs: this wait is queued behind a full onboarding,
    // so a Date.now() at the call can be spent before the first request.
    const deadline = Date.now() + 90_000;
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
    cy.visit('/');
    checkHeaderIsVisible();
  });

  // The migration lock the waiting test holds from this spec's frame, which outlives the test: let go of it even when
  // the test failed before it did
  let releaseMigrationLock = () => {};
  afterEach(() => {
    releaseMigrationLock();
  });

  const checkOwnProfile = (profileName: string, profileBio: string) => {
    goToProfilePageFromHeader();
    cy.location('pathname').should('eq', '/profile');
    showProfileHeader();
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

  itMobile(
    'can onboard a new Pubky Ring key from the profile step, sign out, then sign back in with Pubky Ring',
    () => {
      const profileName = 'Test User';
      const profileBio = 'Test Bio';

      // A new key has nothing to move: its first sign-in records that once, on its empty tree
      cy.intercept('PUT', MIGRATION_FLAG_GLOB).as('firstSignInFlag');

      cy.onboardAsNewUser(profileName, profileBio);

      cy.get('@firstSignInFlag.all').should('have.length', 1);

      // a key held in Pubky Ring is not reminded to back up on the home feed
      cy.location('pathname').should('eq', '/home');
      cy.get('[data-cy="timeline-container"]').should('be.visible');
      cy.get('#backup-btn').should('not.exist');
      checkOwnProfile(profileName, profileBio);

      cy.signOut(HasBackedUp.Yes);

      cy.signInWithPubkyRing(profileName, '/home', { asked: false });
      checkOwnProfile(profileName, profileBio);

      cy.signOut(HasBackedUp.Yes);
    },
  );

  it('migrates a 0.x account on sign-in and lands on home with its content', () => {
    const profileName = `Unmigrated ${Cypress._.random(100_000)}`;
    const profileBio = 'Still in the old layout';
    const run = Date.now();
    const noteText = `Written before the migration ${run}`;
    const imageText = `Image from before the migration ${run}`;
    const articleTitle = `Article from before the migration ${run}`;
    const articleBody = `Its body, under a cover in its first attachment ${run}`;
    const articleInlineAlt = `Inline image from before the migration ${run}`;
    const collectionName = `Collection from before the migration ${run}`;
    const tagLabel = `premigration${Cypress._.random(100_000)}`;
    const replyText = `A reply from before the migration ${run}`;
    const quoteText = `A quote from before the migration ${run}`;

    let user: SeededUser;
    let followee: SeededUser;
    let follower: SeededUser;
    let mutee: SeededUser;
    let note: SeededPost;
    let reply: SeededPost;
    let quote: SeededPost;
    let image: SeededPost;
    let article: SeededPost;
    let collection: SeededPost;
    let lastRead: number;
    let articleMedia: { cover: string; inline: string };

    seedUserViaApi(profileName, { bio: profileBio, legacy: true }).then((seeded) => {
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
        // Both reference the note in its 0.x spelling. Nexus does not notify an author of their own reply or
        // repost, so neither moves the notification counter checked below.
        replyViaApi(user, post, replyText).then((seeded) => {
          reply = seeded;
        });
        repostViaApi(user, post, quoteText).then((seeded) => {
          quote = seeded;
        });
      });
      createImagePostViaApi(user, imageText).then((post) => {
        image = post;
      });
      // The 0.x composer's numbering: the cover at slot 0, the inline image at slot 1
      createArticleViaApi(user, articleTitle, `${articleBody}\n\n![${articleInlineAlt}](attachment:1)`, {
        coverFixture: 'mustache-you.png',
        inlineFixtures: ['mustache-edit.png'],
      }).then((post) => {
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
        postIndexed(reply),
        postIndexed(quote),
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

    cy.signInWithPubkyRing(profileName, '/home', {
      migrates: true,
      // Asked first: nothing is copied before Continue
      beforeContinue: () => {
        cy.get('@v1Write.all').should('have.length', 0);
        cy.get('@settingsCopied.all').should('have.length', 0);
        cy.get('@lastReadCopied.all').should('have.length', 0);
      },
    });

    migrationFlag().then((flag) => {
      // The app's own files are the only thing a clean run leaves behind: it imports those itself
      expect(Object.keys(flag.skipped), 'skipped outcomes').to.deep.equal(['not_migrated']);
      expect(flag.skipped['not_migrated']).to.have.members(['pub/pubky.app/last_read', 'pub/pubky.app/settings.json']);
      expect(flag.migrated).to.include.members([
        'pub/pubky.app/profile.json',
        legacyPostPath(note),
        legacyPostPath(reply),
        legacyPostPath(quote),
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
        new RegExp(`^/pub/social/v1/posts/${reply.id}/[^/]+\\.json$`),
        new RegExp(`^/pub/social/v1/posts/${quote.id}/[^/]+\\.json$`),
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
      // A reference to a post names the post, not one of its versions, under the v1 root
      const v1Note = note.uri.replace('/pub/pubky.app/', '/pub/social/v1/');
      postCopies.forEach((write) => {
        expectV1PostWrite(write).then((post) => {
          const postId = postIdFromWriteUrl(write.request.url);
          if (postId === reply.id) expect(post.parent, 'reply parent').to.eq(v1Note);
          if (postId === quote.id) expect(post.embed, 'quoted post').to.eq(v1Note);
          if (postId === article.id) expect(post.kind).to.eq('article');
        });
      });

      // The first attachment of a 0.x article, an image the body does not reference, moves into the envelope as its
      // cover; the inline image moves up to slot 0 and the body's reference follows it (transform revision 4)
      readStoredPostViaApi(article).then((stored) => {
        expect(stored, 'stored article').to.not.equal(null);
        const { content, attachments } = stored as StoredV1Post;
        const { body, cover_image: cover } = JSON.parse(content) as { body: string; cover_image: string | null };
        expect(cover, 'article cover').to.be.a('string');
        expect(attachments.map(({ name }) => name)).to.deep.equal(['mustache-edit.png']);
        expect(attachments[0]!.uri, 'inline image').to.not.eq(cover);
        expect(body, 'article body').to.eq(`${articleBody}\n\n![${articleInlineAlt}](attachment:0)`);
        // Both files were copied in this run
        [cover!, attachments[0]!.uri].forEach((uri) =>
          expect(paths, `the copy of ${uri}`).to.include(uri.replace(/^pubky:\/\/[^/]+/, '')),
        );
        articleMedia = { cover: cover!, inline: attachments[0]!.uri };
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

    // The migrated article shows its cover and its inline image, each the file the 0.x article meant there
    cy.then(() => {
      const cover = v1FileRoute(articleMedia.cover);
      const inline = v1FileRoute(articleMedia.inline);
      // An inline image that meets a 404 shows its fallback for good, so the page opens once Nexus serves both
      waitForNexus(cover.served, inline.served);
      cy.visit(`/post/${user.id}/${article.id}`);
      cy.contains('h1', articleTitle).should('be.visible');
      // Only the article's cover is a <picture>
      expectImageServed(() => cy.get('picture img'), cover.route);
      expectImageServed(
        () => cy.get(`img[data-testid="article-inline-image"][alt="${articleInlineAlt}"]`),
        inline.route,
      );
    });

    // A second sign-in passes on this browser's record (or the done flag) without the gate's route and writes no
    // second flag: the flag is the last write of a run, so a repeated migration would show here.
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithPubkyRing(profileName);
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

    seedUserViaApi(profileName, { legacy: true }).then((seeded) => {
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
    cy.signInWithPubkyRing(profileName, '/home', { migrates: true });
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
    // Nothing reads this post between the DELETEs and the waiter, whose own polls are the only reads left and start
    // once the delete race has settled (see NEXUS_DELETE_SETTLE_MS); a timeout on a 200 is that race. The waiter
    // stays at 404: the stale copy says `deleted: false` too.
    cy.wait(NEXUS_DELETE_SETTLE_MS);
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

  // The record of an admitted grant resumes a run the tab lost (ADR-0026): the restore after the reload finds no
  // flag yet and runs the engine again, which skips every copy that already landed.
  it('resumes a migration interrupted by a reload without signing the account out', () => {
    const profileName = `Reloading ${Cypress._.random(100_000)}`;
    const run = Date.now();
    // Enough posts that the Copying step is on screen to reload into, once each copy is slowed down below: the engine
    // copies two at a time, so 40 posts at 300 ms each is about 6 s of Copying. Were Copying ever over before the
    // reload, the held flag PUT would already have reached the homeserver, the restore would find the flag and the
    // test would fail on the resumed screen below, never pass by accident.
    const postCount = 40;
    const copyDelayMs = 300;
    // Copies that must have landed before the reload, so the resumed run has something to skip
    const copiesBeforeReload = 8;

    let user: SeededUser;
    const posts: SeededPost[] = [];
    const visited: string[] = [];
    let copiesAtReload = 0;

    seedUserViaApi(profileName, { legacy: true }).then((seeded) => {
      user = seeded;
    });
    cy.then(() => {
      for (let index = 0; index < postCount; index += 1) {
        createPostViaApi(user, `Copied across a reload ${index} ${run}`).then((post) => {
          posts.push(post);
        });
      }
    });
    cy.then(() => {
      waitForNexus(userIndexed(user), ...posts.map(postIndexed));
    });

    // Each copied version answers late, so the run is still copying when the tab reloads
    cy.intercept('PUT', '**/pub/social/v1/posts/**', (req) => {
      req.on('response', (res) => {
        res.setDelay(copyDelayMs);
      });
    }).as('postCopied');
    holdMigrationFlag();

    cy.signInWithPubkyRing(profileName, '/home', {
      migrates: true,
      whileMigrating: () => {
        recordRoutes(visited);
        waitForMigrationCopying();
        Cypress._.times(copiesBeforeReload, () => cy.wait('@postCopied'));
        cy.get<Interception[]>('@postCopied.all').then((copies) => {
          copiesAtReload = copies.length;
        });
        holdMigrationProbe();
        cy.reload();
        // The restored grant was admitted by this build, so the run resumes where the record left it
        cy.location('pathname').should('eq', '/migration');
        cy.get('[data-testid="social-migration"]')
          .should('contain.text', 'Updating your account')
          .and('contain.text', 'Continuing from an earlier run');
      },
    });

    // One flag for the two runs, naming every post, and no sign-out in between
    migrationFlag().then((flag) => {
      expect(flag.migrated).to.include.members(posts.map(legacyPostPath));
    });
    cy.get('@migrationDone.all').should('have.length', 1);
    expectNoSignOutRoutes(visited, 'sign-out routes during the resumed run');

    // The resumed run copied only what the first had not: it sent fewer post copies than there are posts (the engine
    // writes each object once, to one URL, and skips one that is already there), and every post has one version
    cy.get<Interception[]>('@postCopied.all').then((copies) => {
      expect(copies.length - copiesAtReload, 'post copies by the resumed run')
        .to.be.greaterThan(0)
        .and.lessThan(postCount);
    });
    cy.then(() => {
      expectOneVersionPerPost(user, posts);
    });

    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileName);
    cy.signOut(HasBackedUp.Yes);
  });

  // A homeserver that stops answering writes ends a run `incomplete`; the gate retries three times on its own
  // (SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS), then blocks on Retry, and the retried run writes each object once.
  // The other interruption the gate handles, a second tab waiting on the first one's run ("Another tab is updating
  // your account"), is the waiting test below: this spec's own frame holds the migrator's Web Lock in that tab's place.
  it('retries a migration the homeserver stops answering, blocks on Retry and finishes without duplicates', () => {
    const profileName = `Interrupted ${Cypress._.random(100_000)}`;
    const run = Date.now();
    // Every object that cannot be written costs the engine its three retries (1, 2 and 4 s), so few of them
    const postCount = 2;
    // Four runs of those retries plus the gate's own waits between them
    const blockedScreenTimeoutMs = 180_000;
    // Both timestamps are taken in this frame as the requests pass the proxy, so a little apart from the app's own timers
    const clockSlackMs = 250;

    let user: SeededUser;
    const posts: SeededPost[] = [];
    // The homeserver "goes away" for the v1 writes, then comes back for Retry
    let writesFail = true;
    // When each refused write was sent: a run ends right after its last one, with no backoff after the last try
    const failedWritesAt: number[] = [];
    // Every run opens with one HEAD of the done flag: the probes say how many runs the gate started, and when
    const runsStartedAt: number[] = [];
    const visited: string[] = [];

    seedUserViaApi(profileName, { legacy: true }).then((seeded) => {
      user = seeded;
    });
    cy.then(() => {
      for (let index = 0; index < postCount; index += 1) {
        createPostViaApi(user, `Copied once the homeserver is back ${index} ${run}`).then((post) => {
          posts.push(post);
        });
      }
    });
    cy.then(() => {
      waitForNexus(userIndexed(user), ...posts.map(postIndexed));
    });

    // Only the Copying step writes under the public v1 root, so this bites once copying starts and nowhere else
    cy.intercept('PUT', '**/pub/social/v1/**', (req) => {
      if (!writesFail) {
        req.continue();
        return;
      }
      failedWritesAt.push(Date.now());
      req.reply({ forceNetworkError: true });
    }).as('v1Write');
    cy.intercept({ method: 'HEAD', url: MIGRATION_FLAG_GLOB }, () => {
      runsStartedAt.push(Date.now());
    });
    holdMigrationFlag();

    cy.signInWithPubkyRing(profileName, '/home', {
      migrates: true,
      whileMigrating: () => {
        recordRoutes(visited);
        cy.get('[data-testid="social-migration"]', { timeout: blockedScreenTimeoutMs })
          .should('contain.text', 'We could not reach your homeserver for some of your data')
          .and('contain.text', 'Nothing was lost. Retry to continue where it stopped.');
        cy.then(() => {
          expect(failedWritesAt, 'writes the homeserver never answered').to.not.be.empty;
          // The first run and the three automatic retries, each after its configured wait: from the last refused
          // write of one run (its end) to the probe that opens the next
          expect(runsStartedAt, 'runs before the blocked screen').to.have.length(
            SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS.length + 1,
          );
          SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS.forEach((delay, index) => {
            const nextRunAt = runsStartedAt[index + 1];
            const refusedBefore = failedWritesAt.filter((at) => at < nextRunAt);
            expect(refusedBefore, `refused writes before retry ${index + 1}`).to.not.be.empty;
            expect(nextRunAt - Math.max(...refusedBefore), `wait before retry ${index + 1}`).to.be.gte(
              delay - clockSlackMs,
            );
          });
          writesFail = false;
        });
        cy.get('#social-migration-blocked-navigation-continue-btn').click();
        cy.get('[data-testid="social-migration"]').should('contain.text', 'Updating your account');
      },
    });

    migrationFlag().then((flag) => {
      expect(flag.migrated).to.include.members(['pub/pubky.app/profile.json', ...posts.map(legacyPostPath)]);
    });
    cy.get('@migrationDone.all').should('have.length', 1);
    cy.then(() => {
      expect(runsStartedAt, 'runs in all').to.have.length(SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS.length + 2);
    });
    expectNoSignOutRoutes(visited, 'sign-out routes during the retried run');

    // The refused writes never landed, so the retried run is the one that wrote the posts: one landed copy per post
    // on the wire, and one version per post on the homeserver
    cy.get<Interception[]>('@v1Write.all').then((writes) => {
      const landedPostCopies = writes.filter(
        ({ request, response }) => response?.statusCode === 201 && request.url.includes('/pub/social/v1/posts/'),
      );
      expect(landedPostCopies, 'post copies the homeserver accepted').to.have.length(postCount);
    });
    cy.then(() => {
      expectOneVersionPerPost(user, posts).then((urls) => {
        expect(
          urls.filter((url) => url.endsWith('/profile.json')),
          'v1 profile',
        ).to.have.length(1);
      });
    });

    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileName);
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-tab-content"]').should('contain.text', `Copied once the homeserver is back 0 ${run}`);
    cy.signOut(HasBackedUp.Yes);
  });

  // A homeserver that rate-limits the copy (429) only slows a run down: the migrator's engine backs off on its own
  // (1 s, doubling to a minute, with no attempt limit) and the run finishes in one go, without the gate's retries above
  // and without a blocked screen. A 429 the port misread as a network error would get the same waits but only three
  // retries: its fourth refusal ends the run `incomplete`, which the gate retries, so a second run. The engine ignores
  // Retry-After (its port errors carry no headers), so the waits below are lower bounds only.
  it('slows a rate-limited migration down without blocking it and finishes in one run', () => {
    const profileName = `Rate Limited ${Cypress._.random(100_000)}`;
    const run = Date.now();
    const postCount = 2;
    // One more refusal than the engine's network-retry budget (NETWORK_RETRIES = 3 in pubky-social-migrator's
    // engine.ts): a `rate_limited` copy is tried a fifth time and lands, a 429 read as `network` fails on its fourth
    // refusal. Each 429 is one engine attempt; a dropped connection is not (something below the engine resends it), so
    // forceNetworkError does not stand in for a misread 429. All on one URL, because the engine's back-off is per call
    // and restarts at 1 s for every other object.
    const RATE_LIMITED = 4;
    // The engine's wait before each retry of a rate-limited call (FIRST_BACKOFF_MS, doubling; engine.ts)
    const backoffMs = [1000, 2000, 4000, 8000];
    // Every timestamp is taken in this frame as the requests pass the proxy, so a little apart from the engine's timers
    const clockSlackMs = 250;
    // The refusals and their back-off, about 15 s, then the copy that lands
    const landedCopyTimeoutMs = 60_000;

    let user: SeededUser;
    const posts: SeededPost[] = [];
    // When each refused profile copy was sent, and when and how the one that went through was answered
    const refusedAt: number[] = [];
    let landedAt = 0;
    let landedStatus: number | undefined;
    // Every run opens with one HEAD of the done flag: the probes say how many runs the gate started
    const runsStartedAt: number[] = [];
    const visited: string[] = [];
    const titles: string[] = [];

    seedUserViaApi(profileName, { legacy: true }).then((seeded) => {
      user = seeded;
    });
    cy.then(() => {
      for (let index = 0; index < postCount; index += 1) {
        createPostViaApi(user, `Copied past a rate limit ${index} ${run}`).then((post) => {
          posts.push(post);
        });
      }
    });
    cy.then(() => {
      waitForNexus(userIndexed(user), ...posts.map(postIndexed));
    });

    // Refused with a reply of its own, never passed on: a refused copy that landed would be found by the retry's
    // HEAD and counted as already there. The header is what a homeserver sends; the engine does not read it.
    cy.intercept('PUT', '**/pub/social/v1/profile.json', (req) => {
      if (refusedAt.length < RATE_LIMITED) {
        refusedAt.push(Date.now());
        req.reply({ statusCode: 429, headers: { 'retry-after': '1' }, body: 'Too Many Requests' });
        return;
      }
      landedAt = Date.now();
      req.continue((res) => {
        landedStatus = res.statusCode;
      });
    }).as('profileCopy');
    cy.intercept({ method: 'HEAD', url: MIGRATION_FLAG_GLOB }, () => {
      runsStartedAt.push(Date.now());
    });
    holdMigrationFlag();

    cy.signInWithPubkyRing(profileName, '/home', {
      migrates: true,
      whileMigrating: () => {
        recordRoutes(visited);
        recordGateTitles(titles);
        cy.wrap(refusedAt, { timeout: landedCopyTimeoutMs }).should('have.length', RATE_LIMITED);
        // Backing off, the run is still under way on its progress screen
        cy.get('[data-testid="social-migration"]').should('contain.text', 'Updating your account');
        cy.get<Interception[]>('@profileCopy.all', { timeout: landedCopyTimeoutMs }).should((copies) => {
          expect(copies.filter(({ response }) => response?.statusCode === 201)).to.have.length(1);
        });
      },
    });

    migrationFlag().then((flag) => {
      expect(flag.migrated).to.include.members(['pub/pubky.app/profile.json', ...posts.map(legacyPostPath)]);
      // A 429 read as a refusal would leave the profile behind in a run that otherwise looks clean
      expect(Object.values(flag.skipped).flat(), 'skipped').to.not.include('pub/pubky.app/profile.json');
    });
    // Read before anything else can write the profile: the four refusals and the one copy, nothing retried elsewhere
    cy.get<Interception[]>('@profileCopy.all').should('have.length', RATE_LIMITED + 1);
    cy.get('@migrationDone.all').should('have.length', 1);
    cy.then(() => {
      expect(runsStartedAt, 'runs in all').to.have.length(1);
      expect(landedStatus, 'the profile copy that went through').to.eq(201);
      const sentAt = [...refusedAt, landedAt];
      backoffMs.forEach((backoff, index) => {
        expect(sentAt[index + 1] - sentAt[index], `wait before retry ${index + 1}`).to.be.gte(backoff - clockSlackMs);
      });
      // Only the progress screen, never a blocked one, from the first refusal to the landing route
      expect(
        titles.filter((title) => title !== 'Updating your account'),
        'screens of the rate-limited run',
      ).to.deep.equal([]);
    });
    expectNoSignOutRoutes(visited, 'sign-out routes during the rate-limited run');
    cy.then(() => {
      expectOneVersionPerPost(user, posts).then((urls) => {
        expect(
          urls.filter((url) => url.endsWith('/profile.json')),
          'v1 profile',
        ).to.have.length(1);
      });
    });

    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileName);
    cy.signOut(HasBackedUp.Yes);
  });

  // A run holds the migrator's Web Lock for its account, so a second tab of the same origin waits on "Another tab is
  // updating your account" and runs once the first lets go. Web Locks are shared by every frame of an origin, and this
  // spec's frame is served from the app's, so it holds the lock in the first tab's place; it also outlives every
  // navigation of the app's frame.
  it('waits for another holder of the migration lock, then migrates once it is released', () => {
    const profileName = `Waiting ${Cypress._.random(100_000)}`;
    const noteText = `Migrated once the other tab is done ${Date.now()}`;
    const waitingTitle = 'Another tab is updating your account';
    // Longer than the gate's first automatic retry (SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS), so a gate that gave up on
    // the lock instead of waiting for it would show another screen in the meantime
    const lockHeldMs = SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS[0] + 1000;

    let user: SeededUser;
    let note: SeededPost;
    const visited: string[] = [];
    const titles: string[] = [];
    // The engine names the lock after the owner's raw z32 key (`user.id`), not its `pubky`-prefixed form
    const lockName = () => `pubky-social-migrator:${user.id}`;
    const lockState = () => cy.then(() => window.navigator.locks.query());

    seedUserViaApi(profileName, { legacy: true }).then((seeded) => {
      user = seeded;
    });
    cy.then(() => {
      createPostViaApi(user, noteText).then((post) => {
        note = post;
      });
    });
    cy.then(() => {
      waitForNexus(userIndexed(user), postIndexed(note));
    });

    cy.intercept({ method: 'HEAD', url: MIGRATION_FLAG_GLOB }).as('migrationProbe');
    cy.intercept({ method: /^(PUT|DELETE)$/, url: '**/{pub,priv}/social/v1/**' }).as('v1Write');
    holdMigrationFlag();

    // Granted before the sign-in: the app looks for a holder once, before it asks for the lock. The promise that
    // keeps the lock stays out of Cypress's hands, which would wait for it.
    cy.then(() => {
      const held = new Promise<void>((resolve) => {
        releaseMigrationLock = resolve;
      });
      return new Cypress.Promise<void>((granted) => {
        void window.navigator.locks.request(lockName(), () => {
          granted();
          return held;
        });
      });
    });
    lockState().then(({ held = [] }) => {
      expect(
        held.map(({ name }) => name),
        'held by this frame',
      ).to.include(lockName());
    });

    cy.signInWithPubkyRing(profileName, '/home', {
      migrates: true,
      beforeRun: () => {
        recordRoutes(visited);
        recordGateTitles(titles);
        // The engine's chunk loads before the app looks for a holder
        cy.get('[data-testid="social-migration"]', extendedTimeout())
          .should('contain.text', waitingTitle)
          .and('contain.text', 'Keep that tab open. This page continues when it finishes.');
        cy.get('#social-migration-blocked-navigation-continue-btn').should('not.exist');
        cy.get('#social-migration-blocked-navigation-back-btn').should('not.exist');
        // The app's own request waits behind the holder: a gate that only looked at the lock would show this screen too
        lockState().then(({ pending = [] }) => {
          expect(
            pending.map(({ name }) => name),
            "the app's request, queued",
          ).to.include(lockName());
        });
        cy.wait(lockHeldMs);
        cy.then(() => {
          expect(titles.slice(titles.indexOf(waitingTitle)), 'screens while the lock is held').to.deep.equal([
            waitingTitle,
          ]);
        });
        lockState().then(({ pending = [] }) => {
          expect(
            pending.map(({ name }) => name),
            "the app's request, still queued",
          ).to.include(lockName());
        });
        // The whole run happens under the lock, the probe of the done flag included
        cy.get('@migrationProbe.all').should('have.length', 0);
        cy.get('@v1Write.all').should('have.length', 0);
        cy.location('pathname').should('eq', '/migration');
        cy.then(() => {
          releaseMigrationLock();
        });
      },
    });

    migrationFlag().then((flag) => {
      expect(flag.migrated).to.include(legacyPostPath(note));
    });
    cy.get('@migrationDone.all').should('have.length', 1);
    cy.get('@migrationProbe.all').should('have.length', 1);
    expectNoSignOutRoutes(visited, 'sign-out routes while waiting for the lock');

    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileName);
    cy.signOut(HasBackedUp.Yes);
  });

  // A full homeserver (507) pauses a run at once: no engine retry, no automatic retry by the gate, and a screen that
  // waits for Retry. The figure on it is the declared size of the media not yet copied, which this e2e cannot check:
  // the screen never shows less than 1 MB, so the seeded 20 KB image and a missing figure both read "About 1 MB".
  // The figure is pinned by the template's and the controller's unit tests.
  it('pauses a migration on a full homeserver and finishes it on Retry', () => {
    const profileName = `Full Homeserver ${Cypress._.random(100_000)}`;
    const run = Date.now();
    const imageText = `Media copied once there is space ${run}`;
    const noteText = `Copied once there is space ${run}`;
    // The refusal answers late, so the progress screen the sign-in waits for is up before the run pauses
    const refusalDelayMs = 3000;
    // Waited after the pause, past the gate's first automatic retry, to see that none comes
    const autoRetryWindowMs = SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS[0] + 1000;

    let user: SeededUser;
    let image: SeededPost;
    let note: SeededPost;
    let full = true;
    const runsStartedAt: number[] = [];
    const visited: string[] = [];

    seedUserViaApi(profileName, { legacy: true }).then((seeded) => {
      user = seeded;
    });
    cy.then(() => {
      createImagePostViaApi(user, imageText).then((post) => {
        image = post;
      });
      createPostViaApi(user, noteText).then((post) => {
        note = post;
      });
    });
    cy.then(() => {
      waitForNexus(userIndexed(user), postIndexed(image), postIndexed(note));
    });

    // The first write of a run is the image's media, under the public v1 root
    cy.intercept('PUT', '**/pub/social/v1/**', (req) => {
      if (!full) {
        req.continue();
        return;
      }
      req.reply({ statusCode: 507, body: 'Insufficient Storage', delay: refusalDelayMs });
    }).as('v1Write');
    cy.intercept({ method: 'HEAD', url: MIGRATION_FLAG_GLOB }, () => {
      runsStartedAt.push(Date.now());
    });
    holdMigrationFlag();

    cy.signInWithPubkyRing(profileName, '/home', {
      migrates: true,
      whileMigrating: () => {
        recordRoutes(visited);
        cy.get('[data-testid="social-migration"]', extendedTimeout())
          .should('contain.text', 'Your homeserver is out of space')
          .and('contain.text', 'About 1 MB more is needed for your media');
        cy.get('#social-migration-blocked-navigation-back-btn').should('contain.text', 'Sign out');
        cy.get('#social-migration-blocked-navigation-continue-btn').should('contain.text', 'Retry');
        cy.wait(autoRetryWindowMs);
        // One run, stopped by its first refused write, and nothing retried until Retry
        cy.then(() => {
          expect(runsStartedAt, 'runs before Retry').to.have.length(1);
        });
        cy.get('@v1Write.all').should('have.length', 1);
        cy.get('[data-testid="social-migration"]').should('contain.text', 'Your homeserver is out of space');
        cy.then(() => {
          full = false;
        });
        cy.get('#social-migration-blocked-navigation-continue-btn').click();
        cy.get('[data-testid="social-migration"]').should('contain.text', 'Updating your account');
      },
    });

    migrationFlag().then((flag) => {
      expect(flag.migrated).to.include.members([legacyPostPath(image), legacyPostPath(note)]);
    });
    cy.get('@migrationDone.all').should('have.length', 1);
    cy.then(() => {
      expect(runsStartedAt, 'runs in all').to.have.length(2);
    });
    // The retried run copied the media the first one was refused
    cy.get<Interception[]>('@v1Write.all').then((writes) => {
      expect(
        writes.filter(({ response }) => response?.statusCode === 507),
        'refused writes',
      ).to.have.length(1);
      expect(
        writes.filter(
          ({ request, response }) => response?.statusCode === 201 && request.url.includes('/pub/social/v1/files/'),
        ),
        'media copied on Retry',
      ).to.not.be.empty;
    });
    expectNoSignOutRoutes(visited, 'sign-out routes during the paused run');
    cy.then(() => {
      expectOneVersionPerPost(user, [image, note]);
    });

    goToProfilePageFromHeader();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileName);
    cy.signOut(HasBackedUp.Yes);
  });

  // A homeserver from before private storage refuses every path outside /pub/ with a 403 naming it, the first one
  // being the run's HEAD of the done flag under /priv/. A HEAD answer has no body, so the port asks again with a GET
  // and reads the reason from that one: both are stubbed. A bare 403 on the GET would be an expired session instead,
  // which signs the account out, and a 403 on the HEAD alone falls through to the real GET's 404 and a normal run.
  it('stops on a homeserver without private storage and signs out from the gate', () => {
    const profileName = `Old Homeserver ${Cypress._.random(100_000)}`;
    const noteText = `Never copied to an old homeserver ${Date.now()}`;
    // What such a homeserver answers; the port looks for "other than '/pub/' is forbidden" in it
    const privateStorageRefused = "Writing to directories other than '/pub/' is forbidden";

    let user: SeededUser;
    let note: SeededPost;
    const visited: string[] = [];

    seedUserViaApi(profileName, { legacy: true }).then((seeded) => {
      user = seeded;
    });
    cy.then(() => {
      createPostViaApi(user, noteText).then((post) => {
        note = post;
      });
    });
    cy.then(() => {
      waitForNexus(userIndexed(user), postIndexed(note));
    });

    cy.intercept({ method: 'HEAD', url: MIGRATION_FLAG_GLOB }, { statusCode: 403 }).as('flagProbe');
    cy.intercept({ method: 'GET', url: MIGRATION_FLAG_GLOB }, { statusCode: 403, body: privateStorageRefused }).as(
      'flagRead',
    );
    cy.intercept({ method: 'PUT', url: '**/{pub,priv}/social/v1/**' }).as('v1Write');

    // The sign-in's own flag read is refused too, so it asks and the run starts on Continue; a run stopped at its
    // first request never shows the progress screen, so the sign-in only reaches the gate
    cy.signInWithPubkyRing(profileName, '/migration');
    recordRoutes(visited);
    cy.get('[data-testid="social-migration"]', extendedTimeout())
      .should('contain.text', 'Your homeserver needs an upgrade')
      .and('contain.text', 'It does not support private storage yet, which the update needs.');
    cy.get('#social-migration-blocked-navigation-back-btn').should('contain.text', 'Sign out');
    cy.get('#social-migration-blocked-navigation-continue-btn').should('contain.text', 'Retry');
    cy.wait('@flagProbe').its('response.statusCode').should('eq', 403);
    cy.wait('@flagRead').its('response.statusCode').should('eq', 403);
    // The sign-in's own read before the screen, then the port's read of the refusal
    cy.wait('@flagRead').its('response.statusCode').should('eq', 403);
    cy.get('@v1Write.all').should('have.length', 0);
    expectNoSignOutRoutes(visited, 'no forced sign-out on a homeserver without private storage');

    cy.get('#social-migration-blocked-navigation-back-btn').click();
    cy.location('pathname').should('eq', '/logout');
    confirmLogoutBackupBeforeNavigation(HasBackedUp.Yes, '#logout-navigation-back-btn');
    cy.get('#logout-navigation-back-btn').click();
    cy.location('pathname').should('eq', '/');
    checkHeaderIsVisible();
    cy.get('@flagProbe.all').should('have.length', 1);
  });

  // A 0.x profile value v1 refuses is dropped and the profile still migrates; the summary says so, and the profile
  // form says it once more, until it is dismissed
  it('shows what a migration left behind and lets the account continue', () => {
    const profileName = `Partly Migrating ${Cypress._.random(100_000)}`;
    const profileBio = 'Leaves one thing behind';
    const noteText = `Migrates beside an article that cannot ${Date.now()}`;
    // Values the 0.x reader accepts and v1 refuses (the migrator's own vector for dropped profile values): an image
    // that is not a file of the owner's, and a link that is not http(s)
    const droppedImage = 'data:image/png;base64,AAAA';
    const droppedLink = { title: 'FTP', url: 'ftp://files.example' };

    let user: SeededUser;
    let note: SeededPost;
    let untitled: SeededPost;

    seedUserViaApi(profileName, {
      bio: profileBio,
      legacy: true,
      image: droppedImage,
      links: [droppedLink],
    }).then((seeded) => {
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

    cy.intercept('PUT', '**/pub/social/v1/profile.json').as('profileCopy');
    holdMigrationFlag();
    cy.signInWithPubkyRing(profileName, '/home', {
      migrates: true,
      acknowledgesSummary:
        'Some items could not be carried over: 1 skipped. ' +
        'Your profile picture and 1 profile link need to be set again in Settings.',
    });

    migrationFlag().then((flag) => {
      expect(flag.skipped['empty_title']).to.deep.equal([legacyPostPath(untitled)]);
      expect(flag.migrated).to.include.members([legacyPostPath(note), 'pub/pubky.app/profile.json']);
    });
    // Dropped from the copy, not only reported
    cy.wait('@profileCopy').then(({ request, response }) => {
      expect(response?.statusCode, 'profile copy').to.eq(201);
      const profile = parseRequestBody(request.body) as { name: string; image?: string | null; links?: unknown };
      expect(profile.name).to.eq(profileName);
      expect(profile.image ?? null, 'copied image').to.eq(null);
      expect(JSON.stringify(profile.links ?? []), 'copied links').to.not.include(droppedLink.url);
    });

    checkOwnProfile(profileName, profileBio);
    cy.get('[data-cy="profile-filter-item-posts"]').click();
    cy.get('[data-cy="profile-tab-content"]').should('contain.text', noteText);

    // The note shows on the loaded form only, so each check waits for the form first
    openEditProfile();
    cy.get('#profile-name-input').should('have.value', profileName);
    cy.get('[data-testid="edit-profile-migration-notice"]')
      .should('be.visible')
      .and('contain.text', 'Your profile picture could not be carried over by the account update. Set it again.')
      .and('contain.text', 'One of your profile links could not be carried over. Check your links.');
    cy.get('[data-testid="edit-profile-migration-notice-dismiss"]').click();
    cy.get('[data-testid="edit-profile-migration-notice"]').should('not.exist');
    // Dismissed for good: a reload shows the form without it
    cy.reload();
    cy.get('#profile-name-input').should('have.value', profileName);
    cy.get('[data-testid="edit-profile-form"]').should('be.visible');
    cy.get('[data-testid="edit-profile-migration-notice"]').should('not.exist');
    cy.signOut(HasBackedUp.Yes);
  });

  // The cut-over worker reloads a tab to its creation URL, not its current route, so a tab the gate signed out at
  // /migration boots again on the page it was opened on (/home, say); the sessionStorage notice the gate left is the
  // reason the explanation is still owed, and the route guard brings the signed-out tab back to it from any route.
  it('shows the explanation when a signed-out tab reloads onto another route after the gate signed it out', () => {
    cy.visit('/home', {
      onBeforeLoad: (win) => {
        win.sessionStorage.setItem('social-migration:signed-out', JSON.stringify({ reason: 'missing-scopes' }));
      },
    });

    cy.location('pathname').should('eq', '/migration');
    cy.get('[data-testid="social-migration"]')
      .should('contain.text', 'Your account needs an update')
      .and('contain.text', 'did not include the new permissions');
    cy.get('#social-migration-signed-out-navigation-continue-btn').should('be.visible').and('contain.text', 'Sign in');
    cy.get('#social-migration-signed-out-navigation-back-btn').should('be.visible').and('contain.text', 'Homepage');

    // Leaving settles the notice: the landing page shows as a guest and the tab is not sent back
    cy.get('#social-migration-signed-out-navigation-back-btn').click();
    cy.location('pathname').should('eq', '/');
    checkHeaderIsVisible();
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem('social-migration:signed-out'), 'signed-out notice').to.be.null;
    });
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
    openProfileTab('tagged');
    addProfileTags([interestTag]);
    waitUntilStarterPackHasUsers(interestTag);
    cy.signOut(HasBackedUp.Yes);

    cy.onboardAsNewUser('Interested User', '', undefined, OnboardingExperience.StopAtTags);

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
    expectVisibleReachSelected('network-reach-toggle');

    // Choosing interests creates an Interests custom feed (#2508)
    expectFeedTab('Interests');
  });

  it('shows most active people without interests and lands on the All feed after finishing', () => {
    cy.onboardAsNewUser('Undecided User', '', undefined, OnboardingExperience.StopAtTags);

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
    expectVisibleReachSelected('all-reach-toggle');

    // No interest tags means no Interests feed (#2508)
    cy.get('@feedPut.all').should('have.length', 0);
    getFeedNavigationItem('[data-cy="feed-navigation-home-tab"]').should('be.visible');
    getFeedNavigationItem('[data-cy="feed-navigation-create-btn"]').should('be.visible');
    cy.get('[data-cy="feed-navigation"]')
      .find('[data-cy="feed-navigation-custom-tab"][aria-label="Interests"]')
      .should('not.exist');
  });

  itMobile('can use Explore mode without signing in and shows Join Pubky dialog when clicking new post button', () => {
    // A fresh stack has no posts until a test makes one, and phones skip the tests that do
    seedUserViaApi('Explore Poster').then((poster) => {
      createPostViaApi(poster, 'A post to explore before joining').then((post) => {
        waitForNexus(postIndexed(post));
      });
    });

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

  itMobile('signs up a new Pubky Ring key with an invite code through the scan QR and completes onboarding', () => {
    const profileName = 'Ring Signup User';
    const visitedUrls: string[] = [];

    cy.get('#create-account-btn').click();
    cy.location('pathname').should('eq', '/onboarding/human');

    // Click 'enter invite code' button
    cy.get('[data-cy="invite-code-link"]').should('exist').click();

    fetchInviteCode().then((inviteCode) => {
      cy.get('[data-cy="human-invite-code-input"]').type(inviteCode);
    });
    cy.get('[data-cy="human-invite-code-continue-btn"]').should('not.be.disabled').click();

    expectInstallStepOffersPubkyRingOnly();
    cy.get('#continue-with-pubky-ring-btn').click();

    // A signup has nothing to move: it records that inline, and never passes through the gate's route
    recordRoutes(visitedUrls);
    cy.intercept('PUT', MIGRATION_FLAG_GLOB).as('signupFlag');

    // Pubky Ring creates the key and signs it up with the invite code carried by the scan request
    cy.completeSignUpWithPubkyRing(profileName);

    cy.get('@signupFlag.all').should('have.length', 1);
    cy.then(() => {
      expect(
        visitedUrls.filter((url) => url.includes('/migration')),
        'visits to the gate during signup',
      ).to.deep.eq([]);
      expect(visitedUrls, 'routes during signup').to.not.deep.eq([]);
    });

    goToProfilePageFromHeader();
    showProfileHeader();
    cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', profileName);

    // the key Ring signed up is the account: signing back in with it lands on the home feed, never asked to update
    // (this browser's record saw the flag) and without a second flag
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithPubkyRing(profileName, '/home', { asked: false });
    cy.get('@signupFlag.all').should('have.length', 1);

    // Another browser of the same account: without this browser's record the gate reads the flag on the homeserver,
    // passes on it and is never asked either
    cy.signOut(HasBackedUp.Yes);
    cy.window().then((win) => {
      // `social-migration:<pubky>` (`SOCIAL_MIGRATION_RECORD_KEY_PREFIX` in src/libs/social-migration/record.ts)
      const records = Object.keys(win.localStorage).filter(
        (key) => key.startsWith('social-migration:') && key !== 'social-migration:signed-out',
      );
      expect(records, "the account's migration record").to.have.length(1);
      win.localStorage.removeItem(records[0]);
    });
    cy.intercept('GET', MIGRATION_FLAG_GLOB).as('flagRead');
    cy.signInWithPubkyRing(profileName, '/home', { asked: false });
    cy.get<Interception[]>('@flagRead.all').then((reads) => {
      expect(
        reads.filter(({ response }) => response?.statusCode === 200),
        'flag reads answered from the homeserver',
      ).to.not.be.empty;
    });
    cy.get('@signupFlag.all').should('have.length', 1);
  });

  it('cannot proceed with a reused invite code', () => {
    cy.intercept('GET', '**/signup_tokens/*').as('verifyInviteCode');

    // A sign-up consumes its invite code (here through the homeserver API, as Pubky Ring would)
    signUpViaApi('Reused Invite User').then(({ inviteCode }) => {
      // Reuse that invite code; homeserver should report it as used
      cy.get('#create-account-btn').click();
      cy.location('pathname').should('eq', '/onboarding/human');
      cy.get('[data-testid="human-dev-invite-code-btn"]').should('exist').click();

      cy.get('[data-cy="human-invite-code-input"]').type(inviteCode);
      cy.wait('@verifyInviteCode');
      cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invite code already used');
      cy.get('[data-cy="human-invite-code-continue-btn"]').should('be.disabled');
      cy.location('pathname').should('eq', '/onboarding/human');
    });
  });

  itMobile('applies the invite code from an /invite/<code> URL and continues to the Pubky Ring install step', () => {
    fetchInviteCode().then((inviteCode) => {
      cy.visit(`/invite/${inviteCode}`);
    });

    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Invite code applied');
    expectInstallStepOffersPubkyRingOnly();
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
