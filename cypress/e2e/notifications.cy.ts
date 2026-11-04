import { backupDownloadFilePath } from '../support/auth';
import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import {
  clickFollowButton,
  checkLatestNotification,
  checkNotificationAt,
  causeNotificationsToBeRead,
} from '../support/profile';
import { HasBackedUp, LatestNotificationReadState } from '../support/types/enums';
import type { SeededUser } from '../support/types/seed';
import { verifyNotificationCounter } from '../support/common';
import { goToProfilePageFromHeader } from '../support/header';
import { notificationsIndexed, postIndexed, userIndexed, waitForNexus } from '../support/nexus';
import {
  createPostViaApi,
  deletePostViaApi,
  editPostViaApi,
  followUserViaApi,
  markNotificationsReadViaApi,
  mentionOf,
  replyViaApi,
  repostViaApi,
  seedUserViaApi,
  tagPostViaApi,
  tagUserViaApi,
} from '../support/seed';

// Every name is unique per run (and per actor), so notification rows and @mentions never match stale accounts.
// Names contain a space to cover multiword mention lookup (https://github.com/pubky/pubky-app/issues/1638)
const uniqueName = (label: string) => `${label} ${String(Date.now()).slice(-6)}`;

// The actors that notify the receiver are seeded through the API, fresh in every test, so no test depends on
// another having read its notifications. Following, tagging, mentioning, replying, reposting, editing and
// deleting in the UI are covered by contacts.cy.ts, profile.cy.ts and posts.cy.ts.
const seedActorViaApi = (label: string) => seedUserViaApi(uniqueName(label));

describe('notifications', () => {
  // The one profile signed in through the UI: it receives and checks every notification.
  let receiver: SeededUser;

  const signInAsReceiver = () => cy.signInWithEncryptedFile(backupDownloadFilePath(receiver.name));

  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();

    seedUserViaApi(uniqueName('NotifReceiver'), { withRecoveryFile: true }).then((user) => {
      receiver = user;
    });
  });

  beforeEach(() => {
    // Only notifications this test seeds count as unread
    cy.then(() => markNotificationsReadViaApi(receiver));
  });

  it('can be notified for new follower and friend', () => {
    // * a new profile follows the receiver
    seedActorViaApi('Follower').then((follower) => {
      followUserViaApi(follower, receiver);
      waitForNexus(notificationsIndexed(receiver, 'follow', { actor: follower }));

      // * the receiver checks the notification for a new follower
      signInAsReceiver();
      verifyNotificationCounter(1);
      // Match the homeserver transport URL the same way as the other writes.
      // An exact `/priv/app.pubky/v1/last_read.json` url does not.
      cy.intercept('PUT', '**/priv/app.pubky/v1/last_read*').as('putLastRead');
      goToProfilePageFromHeader();
      cy.wait('@putLastRead').should('have.property', 'response').its('statusCode').should('eq', 201);
      verifyNotificationCounter(0);
      // check latest notification on profile page and navigate to the follower's profile page
      checkLatestNotification([follower.name, 'followed you'], LatestNotificationReadState.Unread, follower.name);

      // * the receiver follows back, which makes the follower their friend
      clickFollowButton();
      waitForNexus(notificationsIndexed(follower, 'new_friend', { actor: receiver }));
    });

    // * a profile the receiver already follows follows them back
    seedActorViaApi('Friend').then((friend) => {
      followUserViaApi(receiver, friend);
      followUserViaApi(friend, receiver);
      waitForNexus(notificationsIndexed(receiver, 'new_friend', { actor: friend }));

      // * the receiver, still signed in, checks the notification for a new friend
      verifyNotificationCounter(1);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      // check latest notification on profile page
      checkLatestNotification([friend.name, 'is now your friend'], LatestNotificationReadState.Unread);

      // * toggle tabs to check unread dot disappears
      causeNotificationsToBeRead();
      verifyNotificationCounter(0);
      checkLatestNotification([friend.name, 'is now your friend'], LatestNotificationReadState.Read);
    });
  });

  it('can be notified for tagged post and profile', () => {
    // helper function to verify the tag is visible on desktop and not on mobile
    const expectNotificationTagAt = (index: number, tagLabel: string) => {
      const isMobile = Cypress.expose('isMobile');
      cy.get('[data-cy="notifications-list"]')
        .children()
        .eq(index)
        .find('[data-cy="post-tag"]')
        .should(isMobile ? 'not.be.visible' : 'be.visible')
        .then(($tag) => {
          if (!isMobile) {
            cy.wrap($tag).should('contain', tagLabel);
          }
        });
    };

    const postContent = `I will be notified when this post is tagged! ${Date.now()}`;
    const profileTag = 'nice';
    const postTag = 'first-world-problem';

    // * one profile tags the receiver's profile, then another tags the receiver's post
    seedActorViaApi('ProfileTagger').then((profileTagger) => {
      seedActorViaApi('PostTagger').then((postTagger) => {
        tagUserViaApi(profileTagger, receiver, [profileTag]);
        createPostViaApi(receiver, postContent).then((post) => tagPostViaApi(postTagger, post, [postTag]));
        waitForNexus(
          notificationsIndexed(receiver, 'tag_profile', { actor: profileTagger }),
          notificationsIndexed(receiver, 'tag_post', { actor: postTagger }),
        );

        // * the receiver checks both notifications, newest first
        signInAsReceiver();
        verifyNotificationCounter(2);
        goToProfilePageFromHeader();
        verifyNotificationCounter(0);
        checkNotificationAt(0, [postTagger.name, 'tagged your post'], LatestNotificationReadState.Unread);
        checkNotificationAt(1, [profileTagger.name, 'tagged your profile'], LatestNotificationReadState.Unread);
        // verify both tags are visible on desktop and not on mobile
        expectNotificationTagAt(0, postTag);
        expectNotificationTagAt(1, profileTag);

        // * toggle tabs to check unread dot disappears
        causeNotificationsToBeRead();
        verifyNotificationCounter(0);
        checkNotificationAt(0, [postTagger.name, 'tagged your post'], LatestNotificationReadState.Read);
        checkNotificationAt(1, [profileTagger.name, 'tagged your profile'], LatestNotificationReadState.Read);
      });
    });

    // verify navigation to search page with tag on desktop post page on mobile
    if (Cypress.expose('isMobile')) {
      cy.get('[data-cy="notifications-list"]').children().first().contains('a', 'tagged your post').click();
      cy.location('pathname').should('match', /^\/post\/[^/]+\/[^/]+$/);
    } else {
      cy.get('[data-cy="notifications-list"]').children().first().find('[data-cy="post-tag"]').click();
      cy.location('pathname').should('eq', '/search');
      cy.location('search').should('eq', '?tags=first-world-problem');
    }
  });

  // TODO: https://github.com/pubky/pubky-nexus/issues/1149. Nexus sometimes falsely queues the
  // mention post as MissingDependency, and the retry's recovery path skips notifications, so the
  // mention notification is never created. Re-enable this test once #1149 is fixed.
  it.skip('can be notified for profile being mentioned in a post', () => {
    // * a profile creates a post mentioning the receiver
    seedActorViaApi('Mentioner').then((mentioner) => {
      createPostViaApi(mentioner, `Hello ${mentionOf(receiver)} ${Date.now()}`);
      waitForNexus(notificationsIndexed(receiver, 'mention', { actor: mentioner }));

      // * the receiver checks for notification for being mentioned
      signInAsReceiver();
      verifyNotificationCounter(1);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      checkLatestNotification([mentioner.name, 'mentioned you in post'], LatestNotificationReadState.Unread);

      // * toggle tabs to check unread dot disappears
      causeNotificationsToBeRead();
      verifyNotificationCounter(0);
      checkLatestNotification([mentioner.name, 'mentioned you in post'], LatestNotificationReadState.Read);
    });
  });

  it('can disable being notified for profile being mentioned in a post', () => {
    // A separate recipient, so turning mentions off leaves the receiver's settings alone for the other tests
    seedUserViaApi(uniqueName('NotifMuted'), { withRecoveryFile: true }).then((recipient) => {
      waitForNexus(userIndexed(recipient));

      // * the recipient signs in and disables mention notifications
      cy.signInWithEncryptedFile(backupDownloadFilePath(recipient.name));
      cy.get('[data-cy="header-settings-btn"]').click();
      cy.location('pathname').should('eq', '/settings/account');
      cy.get('[data-cy="settings-menu-item-notifications"]').click();
      cy.location('pathname').should('eq', '/settings/notifications');
      cy.get('#notification-switch-mention').click();
      cy.signOut(HasBackedUp.Yes);

      // * a profile creates a post mentioning the recipient
      seedActorViaApi('Mentioner').then((mentioner) => {
        createPostViaApi(mentioner, `Hello ${mentionOf(recipient)} ${Date.now()}`);
        waitForNexus(notificationsIndexed(recipient, 'mention', { actor: mentioner }));
      });

      // * the recipient checks for absence of notification for being mentioned
      cy.signInWithEncryptedFile(backupDownloadFilePath(recipient.name));
      verifyNotificationCounter(0);
      goToProfilePageFromHeader();
      cy.get('[data-cy="profile-tab-content"]').should('contain.text', 'No notifications yet');
    });
  });

  it('can be notified for your post being replied to', () => {
    // * a profile replies to the receiver's post
    seedActorViaApi('Replier').then((replier) => {
      createPostViaApi(receiver, `I will be notified when this post is replied to! ${Date.now()}`).then((post) =>
        replyViaApi(replier, post, 'I replied to your post!'),
      );
      waitForNexus(notificationsIndexed(receiver, 'reply', { actor: replier }));

      // * the receiver checks for notification for being replied to
      signInAsReceiver();
      verifyNotificationCounter(1);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      checkLatestNotification([replier.name, 'replied to your post'], LatestNotificationReadState.Unread);

      // * toggle tabs to check unread dot disappears
      causeNotificationsToBeRead();
      verifyNotificationCounter(0);
      checkLatestNotification([replier.name, 'replied to your post'], LatestNotificationReadState.Read);
    });
  });

  it('can be notified for your post being reposted', () => {
    // * a profile reposts the receiver's post
    seedActorViaApi('Reposter').then((reposter) => {
      createPostViaApi(receiver, `I will be notified when this post is reposted! ${Date.now()}`).then((post) =>
        repostViaApi(reposter, post, 'I reposted your post!'),
      );
      waitForNexus(notificationsIndexed(receiver, 'repost', { actor: reposter }));

      // * the receiver checks for notification for being reposted
      signInAsReceiver();
      verifyNotificationCounter(1);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      checkLatestNotification([reposter.name, 'reposted your post'], LatestNotificationReadState.Unread);

      // * toggle tabs to check unread dot disappears
      causeNotificationsToBeRead();
      verifyNotificationCounter(0);
      checkLatestNotification([reposter.name, 'reposted your post'], LatestNotificationReadState.Read);
    });
  });

  it('can be notified for a post being deleted that you replied to', () => {
    // * the receiver replies to a profile's post, which that profile then deletes
    seedActorViaApi('Deleter').then((author) => {
      createPostViaApi(
        author,
        `The one who replies to this post will be notified when it is deleted! ${Date.now()}`,
      ).then((post) => {
        replyViaApi(receiver, post, 'I replied to your post!').then((reply) => {
          waitForNexus(postIndexed(post), postIndexed(reply));
        });
        deletePostViaApi(author, post);
      });
      waitForNexus(notificationsIndexed(receiver, 'post_deleted', { actor: author }));

      // * the receiver checks for notification for the post being deleted
      signInAsReceiver();
      verifyNotificationCounter(1);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      checkLatestNotification([author.name, 'deleted a post'], LatestNotificationReadState.Unread);

      // * toggle tabs to check unread dot disappears
      causeNotificationsToBeRead();
      verifyNotificationCounter(0);
      checkLatestNotification([author.name, 'deleted a post'], LatestNotificationReadState.Read);
    });
  });

  it('groups notifications for posts being deleted that you reposted', () => {
    // * the receiver reposts two of a profile's posts, which that profile then deletes. A fresh author's
    // two deletions form a grouped row on their own, so the test also passes in isolation.
    const timestamp = Date.now();
    seedActorViaApi('Deleter').then((author) => {
      createPostViaApi(author, `The one who reposts this post will be notified when it is deleted! ${timestamp}`).then(
        (firstPost) => {
          createPostViaApi(author, `Repost this one too and hear about its deletion as well! ${timestamp}`).then(
            (secondPost) => {
              repostViaApi(receiver, firstPost, 'I reposted your post!').then((firstRepost) => {
                repostViaApi(receiver, secondPost, 'I reposted this one as well!').then((secondRepost) => {
                  waitForNexus(
                    postIndexed(firstPost),
                    postIndexed(secondPost),
                    postIndexed(firstRepost),
                    postIndexed(secondRepost),
                  );
                });
              });
              deletePostViaApi(author, firstPost);
              deletePostViaApi(author, secondPost);
            },
          );
        },
      );
      waitForNexus(notificationsIndexed(receiver, 'post_deleted', { actor: author, count: 2 }));

      // * the receiver checks for the grouped deletion notification
      // (see https://github.com/pubky/pubky-app/issues/1570)
      signInAsReceiver();
      verifyNotificationCounter(2);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      // 'posts you interacted with' is the grouped copy; a lone row says 'deleted a post'.
      checkLatestNotification(
        [author.name, 'deleted', 'posts you interacted with'],
        LatestNotificationReadState.Unread,
      );
      cy.get('[data-cy="notifications-list"]').children().first().should('have.attr', 'data-cy', 'notification-group');

      // * toggle tabs to check unread dot disappears
      causeNotificationsToBeRead();
      verifyNotificationCounter(0);
      checkLatestNotification([author.name, 'deleted', 'posts you interacted with'], LatestNotificationReadState.Read);
    });
  });

  it('can be notified for a post being edited that you replied to', () => {
    // * the receiver replies to a profile's post, which that profile then edits
    seedActorViaApi('Editor').then((author) => {
      createPostViaApi(
        author,
        `The one who replies to this post will be notified when it is edited! ${Date.now()}`,
      ).then((post) => {
        replyViaApi(receiver, post, 'I replied to your post!').then((reply) => {
          waitForNexus(postIndexed(post), postIndexed(reply));
        });
        editPostViaApi(author, post, `This post has been edited! ${Date.now()}`);
      });
      waitForNexus(notificationsIndexed(receiver, 'post_edited', { actor: author }));

      // * the receiver checks for notification for the post being edited
      signInAsReceiver();
      verifyNotificationCounter(1);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      checkLatestNotification([author.name, 'edited a post'], LatestNotificationReadState.Unread);

      // * toggle tabs to check unread dot disappears
      causeNotificationsToBeRead();
      verifyNotificationCounter(0);
      checkLatestNotification([author.name, 'edited a post'], LatestNotificationReadState.Read);
    });
  });

  it('groups notifications for posts being edited that you reposted', () => {
    // * the receiver reposts two of a profile's posts, which that profile then edits. Two distinct
    // posts form a grouped row on their own (repeated edits of one post deduplicate instead), and
    // a fresh author keeps the row to this test's edits.
    const timestamp = Date.now();
    seedActorViaApi('Editor').then((author) => {
      createPostViaApi(author, `The one who reposts this post will be notified when it is edited! ${timestamp}`).then(
        (firstPost) => {
          createPostViaApi(author, `Repost this one too and hear about its edit as well! ${timestamp}`).then(
            (secondPost) => {
              repostViaApi(receiver, firstPost, 'I reposted your post!').then((firstRepost) => {
                repostViaApi(receiver, secondPost, 'I reposted this one as well!').then((secondRepost) => {
                  waitForNexus(
                    postIndexed(firstPost),
                    postIndexed(secondPost),
                    postIndexed(firstRepost),
                    postIndexed(secondRepost),
                  );
                });
              });
              editPostViaApi(author, firstPost, `This post has been edited! ${timestamp}`);
              editPostViaApi(author, secondPost, `This post has also been edited! ${timestamp}`);
            },
          );
        },
      );
      waitForNexus(notificationsIndexed(receiver, 'post_edited', { actor: author, count: 2 }));

      // * the receiver checks for the grouped edit notification, which keeps a link to every
      // edited post (see issue #1570)
      signInAsReceiver();
      verifyNotificationCounter(2);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      // 'posts you interacted with' is the grouped copy; a lone row says 'edited a post'.
      checkLatestNotification([author.name, 'edited', 'posts you interacted with'], LatestNotificationReadState.Unread);

      // * every edited post sits behind the Show/Hide disclosure on desktop, while mobile
      // renders the title list permanently without a toggle
      cy.get('[data-cy="notifications-list"]').children().first().as('editedGroup');
      if (Cypress.expose('isMobile')) {
        cy.get('@editedGroup').find('[data-cy="notification-group-toggle"]').should('not.exist');
        cy.get('@editedGroup').find('[data-cy="notification-group-item"]').should('have.length.at.least', 2);
      } else {
        cy.get('@editedGroup').find('[data-cy="notification-group-toggle"]').should('contain.text', 'Show');
        cy.get('@editedGroup').find('[data-cy="notification-group-item"]').should('have.length', 0);
        cy.get('@editedGroup').find('[data-cy="notification-group-toggle"]').click();
        cy.get('@editedGroup').find('[data-cy="notification-group-item"]').should('have.length.at.least', 2);
        cy.get('@editedGroup').find('[data-cy="notification-group-toggle"]').should('contain.text', 'Hide');
      }

      // * toggle tabs to check unread dot disappears
      causeNotificationsToBeRead();
      verifyNotificationCounter(0);
      checkLatestNotification([author.name, 'edited', 'posts you interacted with'], LatestNotificationReadState.Read);
    });
  });

  it('can be notified by an un-migrated profile', () => {
    // * a 0.x account, which never signs in, follows the receiver, tags and replies to their post
    seedUserViaApi(uniqueName('Unmigrated'), { legacy: true }).then((actor) => {
      followUserViaApi(actor, receiver);
      createPostViaApi(receiver, `An un-migrated profile will notify me about this post! ${Date.now()}`).then(
        (post) => {
          tagPostViaApi(actor, post, ['old-layout']);
          replyViaApi(actor, post, 'Replying from the old layout!');
        },
      );
      waitForNexus(
        notificationsIndexed(receiver, 'follow', { actor }),
        notificationsIndexed(receiver, 'tag_post', { actor }),
        notificationsIndexed(receiver, 'reply', { actor }),
      );

      // * the receiver checks all three, newest first, with the actor's name read through Nexus
      signInAsReceiver();
      verifyNotificationCounter(3);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      checkNotificationAt(0, [actor.name, 'replied to your post'], LatestNotificationReadState.Unread);
      checkNotificationAt(1, [actor.name, 'tagged your post'], LatestNotificationReadState.Unread);
      checkNotificationAt(2, [actor.name, 'followed you'], LatestNotificationReadState.Unread);
    });
  });

  it('can be notified when an un-migrated profile edits and deletes a post you replied to', () => {
    // * the receiver replies to two posts by a 0.x account, which overwrites one and deletes the other in place
    const timestamp = Date.now();
    seedUserViaApi(uniqueName('Unmigrated'), { legacy: true }).then((author) => {
      createPostViaApi(author, `This post from the old layout will be edited! ${timestamp}`).then((edited) => {
        createPostViaApi(author, `This post from the old layout will be deleted! ${timestamp}`).then((deleted) => {
          replyViaApi(receiver, edited, 'I replied to the post you will edit!').then((firstReply) => {
            replyViaApi(receiver, deleted, 'I replied to the post you will delete!').then((secondReply) => {
              waitForNexus(
                postIndexed(edited),
                postIndexed(deleted),
                postIndexed(firstReply),
                postIndexed(secondReply),
              );
            });
          });
          editPostViaApi(author, edited, `This post from the old layout has been edited! ${timestamp}`);
          deletePostViaApi(author, deleted);
        });
      });
      waitForNexus(
        notificationsIndexed(receiver, 'post_edited', { actor: author }),
        notificationsIndexed(receiver, 'post_deleted', { actor: author }),
      );

      // * the receiver checks both, newest first
      signInAsReceiver();
      verifyNotificationCounter(2);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      checkNotificationAt(0, [author.name, 'deleted a post'], LatestNotificationReadState.Unread);
      checkNotificationAt(1, [author.name, 'edited a post'], LatestNotificationReadState.Unread);
    });
  });

  it('can display counter for multiple new notifications', () => {
    // * a profile tags the receiver's post, replies to it, and creates a post mentioning the receiver
    seedActorViaApi('Busy').then((actor) => {
      createPostViaApi(receiver, `I will get three notifications about this post! ${Date.now()}`).then((post) => {
        tagPostViaApi(actor, post, ['multi-notif']);
        replyViaApi(actor, post, 'Replying for a second notification!');
      });
      createPostViaApi(actor, `Hello ${mentionOf(receiver)} ${Date.now()}`);
      waitForNexus(
        notificationsIndexed(receiver, 'tag_post', { actor }),
        notificationsIndexed(receiver, 'reply', { actor }),
        notificationsIndexed(receiver, 'mention', { actor }),
      );

      // * the receiver checks the counter shows 3 and all three notifications are listed
      signInAsReceiver();
      verifyNotificationCounter(3);
      goToProfilePageFromHeader();
      verifyNotificationCounter(0);
      cy.get('[data-cy="notifications-list"]').children().should('have.length.at.least', 3);
      // newest first: mention, then reply, then tag
      checkNotificationAt(0, [actor.name, 'mentioned you in post'], LatestNotificationReadState.Unread);
      checkNotificationAt(1, [actor.name, 'replied to your post'], LatestNotificationReadState.Unread);
      checkNotificationAt(2, [actor.name, 'tagged your post'], LatestNotificationReadState.Unread);
    });
  });
});
