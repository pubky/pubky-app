import { backupDownloadFilePath } from '../support/auth';
import { slowCypressDown } from 'cypress-slow-down';
// registers the cy.slowDown and cy.slowDownEnd commands
import 'cypress-slow-down/commands';
import {
  latestPostInFeedContentEq,
  createQuickPost,
  createPostFromDialog,
  deletePost,
  editPost,
  fastTagPostInFeed,
  replyToPost,
  repostPost,
  MAX_POST_LENGTH,
  createQuickPostWithImage,
  PostOrReply,
  waitForFeedToLoad,
} from '../support/posts';
import { defaultMs } from '../support/slow-down';
import { BackupType, CheckForNewPosts, HasBackedUp, WaitForNewPosts } from '../support/types/enums';

const username = 'Poster';

describe('posts', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();

    // create profile to post from
    cy.onboardAsNewUser(username, 'Big on posting.', [BackupType.EncryptedFile]);
    waitForFeedToLoad();
  });

  beforeEach(() => {
    // in case it gets changed by a test and not reset
    cy.slowDown(defaultMs);

    // sign in if not already
    cy.location('pathname').then((currentPath) => {
      if (currentPath !== '/home') {
        cy.signInWithEncryptedFile(backupDownloadFilePath(username));
      }
    });
  });

  it('can post from quick post box', () => {
    const postContent = `I can post using the quick post box! ${Date.now()}`;
    createQuickPost(postContent);

    // verify the post is displayed correctly in feed
    latestPostInFeedContentEq(postContent);

    // reload and check post is still displayed correctly
    cy.reload();
    latestPostInFeedContentEq(postContent);
  });

  it('can post from new post', () => {
    const postContent = `I can make a new post! ${Date.now()}`;
    createPostFromDialog(postContent);

    // wait and click 'see new posts' button
    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.Yes);

    // verify the post is displayed correctly in feed
    latestPostInFeedContentEq(postContent);

    // reload and check post is still displayed correctly
    cy.reload();
    latestPostInFeedContentEq(postContent);
  });

  it('can edit a post', () => {
    const postContent = `I can edit this post! ${Date.now()}`;
    const editedContent = `I have edited this post! ${Date.now()}`;

    createQuickPost(postContent);
    latestPostInFeedContentEq(postContent);

    editPost({ newPostContent: editedContent, filterText: postContent });

    latestPostInFeedContentEq(editedContent);

    // Reload and check post is still displayed with edited content
    cy.reload();
    latestPostInFeedContentEq(editedContent);
  });

  it('can post with maximum character limit (2000)', () => {
    const prefix = `I can make a max length post! ${Date.now()} `;
    const fillerLength = Math.max(0, MAX_POST_LENGTH - prefix.length);
    const postContent = `${prefix}${'o'.repeat(fillerLength)}`;

    createQuickPost(postContent, [], MAX_POST_LENGTH);

    cy.findFirstPostInFeed().within(() => {
      cy.get('[data-cy="post-text"]').should('contain.text', prefix.trim());
      cy.contains('Show more').should('be.visible');
    });
  });

  it('can post with emojis', () => {
    const postContent = `🥋🗾⛩️ I can post with emojis! ${Date.now()}`;
    const expectedLength = Array.from(postContent).length;

    createQuickPost(postContent, []);

    latestPostInFeedContentEq(postContent);
  });

  it('can post with image upload', () => {
    const postContent = `I can post with an image! ${Date.now()}`;
    createQuickPostWithImage(postContent);

    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-text"]').should('contain.text', postContent);
      cy.get('img').should('be.visible');
    });
  });

  it('can post with embedded link', () => {
    const link = 'https://www.youtube.com/watch?v=989-7xsRLR4';
    const embedId = '989-7xsRLR4';
    const postContent = `I can post with an embedded link! ${link} ${Date.now()}`;

    cy.get('[data-cy="home-post-input"]').within(() => {
      cy.get('textarea').click().type(postContent);
      cy.get('iframe[data-testid="YouTube video player"]')
        .should('be.visible')
        .should('have.attr', 'src')
        .and('include', `youtube-nocookie.com/embed/${embedId}`);
      cy.get('[data-cy="post-input-action-bar-post"]').click();
    });

    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-text"]').should('contain.text', postContent);
      cy.get('iframe[data-testid="YouTube video player"]')
        .should('be.visible')
        .should('have.attr', 'src')
        .and('include', `youtube-nocookie.com/embed/${embedId}`);
    });
  });

  it('can post with profile reference', () => {
    const uniquePrefix = Cypress._.uniqueId(Date.now().toString().slice(-2));
    const otherUsername = 'Jeremy The Poser';
    const fullUsername = `${uniquePrefix}-${otherUsername}`;
    const pubkyAlias = 'mention_pubky';

    cy.signOut(HasBackedUp.Yes);
    cy.onboardAsNewUser(
      fullUsername,
      'My account will be referenced in a post.',
      [BackupType.EncryptedFile],
      pubkyAlias,
    );
    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(username));

    cy.get(`@${pubkyAlias}`).then((pubky) => {
      const pubkyText = String(pubky);
      const mention = pubkyText.startsWith('pk:') || pubkyText.startsWith('pubky') ? pubkyText : `pk:${pubkyText}`;
      const postContent = `I can post with a profile reference! ${Date.now()}`;

      createQuickPost(`${postContent} ${mention}`);

      cy.findFirstPostInFeed().within(() => {
        cy.get('[data-cy="post-text"]').should('contain.text', postContent);
        cy.get('[data-cy="post-text"]').find('a[href^="/profile/"]').should('contain.text', '@');
        cy.get('[data-cy="post-text"]').should('contain.text', otherUsername);
      });
    });
  });

  it('can delete a post', () => {
    const postContent = `I can delete this post! ${Date.now()}`;
    createQuickPost(postContent);

    latestPostInFeedContentEq(postContent);

    deletePost({ type: PostOrReply.Post });

    cy.get('[data-cy="timeline-posts"]').should('not.contain.text', postContent);

    // Reload and check post is still deleted
    cy.reload();
    cy.get('[data-cy="timeline-posts"]').should('not.contain.text', postContent);
  });

  it("cannot delete other profile's post", () => {
    cy.signOut(HasBackedUp.Yes);
    cy.onboardAsNewUser('Del Boy', 'Try delete my post.', [BackupType.EncryptedFile]);

    const postContent = `No one else can delete this post! ${Date.now()}`;
    createQuickPost(postContent);

    cy.signOut(HasBackedUp.Yes);
    cy.signInWithEncryptedFile(backupDownloadFilePath(username));

    cy.findPostInFeed(0, postContent, CheckForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-more-btn"]').click();
    });
    cy.get('[data-cy="post-menu-action-copy-pubky"]').should('be.visible');
    cy.get('[data-cy="post-menu-action-delete"]').should('not.exist');
  });

  it('can report a post', () => {
    const canReportPostContent = `This post will be reported! ${Date.now()}`;
    const cannotReportPostContent = `This post will not be reported! ${Date.now()}`;
    const reportReason = 'E2e test report reason.';

    createQuickPost(canReportPostContent);
    cy.signOut(HasBackedUp.Yes);
    cy.onboardAsNewUser('Reporter', 'I can report a post.', [BackupType.EncryptedFile]);

    createQuickPost(cannotReportPostContent);

    cy.findFirstPostInFeedFiltered(cannotReportPostContent, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-more-btn"]').click();
    });
    cy.get('[data-cy="post-menu-action-report"]').should('not.exist');
    // click copy link option to dismiss post menu
    cy.get('[data-cy="post-menu-action-copy-link"]').click();

    cy.findFirstPostInFeedFiltered(canReportPostContent, CheckForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-more-btn"]').click();
    });
    cy.get('[data-cy="post-menu-action-report"]').click();

    cy.get('[data-cy="dialog-content"]').should('be.visible');
    cy.get('[data-cy="report-issue-harassment"]').click();
    cy.get('[data-cy="report-issue-step-next"]').click();

    cy.get('[data-cy="report-reason-input"]').type(reportReason);
    cy.intercept('POST', '/api/report', { statusCode: 200 }).as('reportPost');
    cy.get('[data-cy="report-reason-step-submit"]').click();

    cy.wait('@reportPost').its('response.statusCode').should('eq', 200);

    cy.get('[data-cy="dialog-content"]')
      .should('be.visible')
      .within(() => {
        cy.contains('Report Sent').should('be.visible');
        cy.contains('Your report will be reviewed soon. Thank you.').should('be.visible');
      });

    cy.get('[data-cy="report-success-close"]').click();
    cy.get('[data-cy="dialog-content"]').should('not.exist');
  });

  it('can tag whilst creating post', () => {
    const postContent = `I can post with tags! ${Date.now()}`;
    const tags = ['alpacas', 'llamas', 'vicuñas'];

    cy.get('[data-cy="home-post-input"]').within(() => {
      cy.get('textarea').click().type(postContent);
      cy.get('[data-cy="post-tag-add-button"]').click();
      tags.forEach((tag) => {
        cy.get('[data-cy="add-tag-input"]').type(`${tag}{enter}`);
        cy.contains(tag).should('be.visible');
      });
      cy.get('[data-cy="post-input-action-bar-post"]').click();
    });

    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-text"]').should('contain.text', postContent);
      tags.forEach((tag) => {
        cy.contains('button', tag).should('be.visible').find('[data-cy="post-tag-count"]').should('have.text', '1');
      });
    });
  });

  it('can tag and remove tags from existing post on feed page', () => {
    const postContent = `I can add and remove tags from my existing post on the feed page! ${Date.now()}`;
    const tag1 = 'bananas';
    const tag2 = 'pyjamas';
    const tag3 = 'rastas';

    createQuickPost(postContent);

    fastTagPostInFeed([tag1, tag2, tag3], postContent);

    // todo: remove wait workaround once bug is fixed, see https://github.com/pubky/pubky-app/issues/805
    cy.wait(Cypress.expose('ci') ? 3_000 : 500);

    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      [tag1, tag2, tag3].forEach((tag) => {
        cy.contains('button', tag).should('be.visible').find('[data-cy="post-tag-count"]').should('have.text', '1');
      });
      cy.intercept('DELETE', '**/pub/pubky.app/tags/**').as('deleteTag');
      cy.contains('button', tag2).click();
      cy.wait('@deleteTag').its('response.statusCode').should('eq', 204);
      cy.contains('button', tag2).should('be.visible').find('[data-cy="post-tag-count"]').should('have.text', '0');
      cy.intercept('PUT', '**/pub/pubky.app/tags/**').as('putTag');
      cy.contains('button', tag2).click();
      cy.wait('@putTag').its('response.statusCode').should('eq', 201);
      cy.contains('button', tag2).should('be.visible').find('[data-cy="post-tag-count"]').should('have.text', '1');
    });

    cy.reload();

    cy.findFirstPostInFeed().within(() => {
      [tag1, tag2, tag3].forEach((tag) => {
        cy.contains('button', tag).should('be.visible').find('[data-cy="post-tag-count"]').should('have.text', '1');
      });
    });
  });

  it('can tag and remove tags from existing post on post page (columns layout)', () => {
    const postContent = `I can add and remove tags from my existing post on the post page! ${Date.now()}`;
    const tag1 = 'açorda';
    const tag2 = 'cassava';
    const tag3 = 'feijoada';

    createQuickPost(postContent);

    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-text"]').click();
    });

    cy.location('pathname').should('contain', '/post/');

    // add three tags to post
    cy.intercept('PUT', '**/pub/pubky.app/tags/**').as('putTag');
    cy.get('[data-cy="single-post-card"]').within(() => {
      cy.get('[data-cy="post-tag-add-button"]').click();
      [tag1, tag2, tag3].forEach((tag) => {
        cy.get('[data-cy="add-tag-input"]').filter(':visible').type(`${tag}{enter}`);
        cy.wait('@putTag').its('response.statusCode').should('eq', 201);
      });
    });
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Tag added');

    // check tags are added to post with count of 1
    cy.intercept('DELETE', '**/pub/pubky.app/tags/**').as('deleteTag');
    cy.get('[data-cy="single-post-card"]').within(() => {
      cy.get('[data-cy="clickable-tags-list"]')
        .filter(':visible')
        .within(() => {
          [tag1, tag2, tag3].forEach((tag) => {
            cy.contains('button', tag).should('be.visible').find('[data-cy="post-tag-count"]').should('have.text', '1');
          });

          // click tag 2 to remove it
          cy.contains('button', tag2).click();
          cy.wait('@deleteTag').its('response.statusCode').should('eq', 204);
          cy.contains('button', tag2).should('be.visible').find('[data-cy="post-tag-count"]').should('have.text', '0');
        });
    });
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Tag removed');

    cy.reload();

    // check tag 2 is removed from post after page reload
    cy.get('[data-cy="single-post-card"]').within(() => {
      cy.get('[data-cy="clickable-tags-list"]')
        .filter(':visible')
        .within(() => {
          cy.contains('button', tag2).should('not.exist');
        });
    });

    // untag tag 1 after page reload to cover bug https://github.com/pubky/pubky-app/issues/1721
    cy.intercept('DELETE', '**/pub/pubky.app/tags/**').as('deleteTag1');
    cy.get('[data-cy="clickable-tags-list"]').within(() => {
      cy.contains('button', tag1).click();
      cy.wait('@deleteTag1').its('response.statusCode').should('eq', 204);
    });
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Tag removed');
  });

  it('can tag and remove tags from existing post on post page (wide layout)', () => {
    const postContent = `I can add and remove tags from my existing post on the post page! ${Date.now()}`;
    const tag1 = 'açorda';
    const tag2 = 'cassava';
    const tag3 = 'feijoada';

    createQuickPost(postContent);

    cy.findFirstPostInFeedFiltered(postContent, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-text"]').click();
    });

    cy.location('pathname').should('contain', '/post/');

    // switch to wide layout
    cy.get('[data-cy="wide-layout-toggle"]').filter(':visible').click();

    // add three tags to post
    cy.intercept('PUT', '**/pub/pubky.app/tags/**').as('putTag');
    cy.get('[data-cy="single-post-card"]').within(() => {
      [tag1, tag2, tag3].forEach((tag) => {
        cy.get('[data-cy="add-tag-input"]').filter(':visible').type(`${tag}{enter}`);
        cy.wait('@putTag').its('response.statusCode').should('eq', 201);
      });
    });
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Tag added');

    // check tags are added to post with count of 1
    cy.intercept('DELETE', '**/pub/pubky.app/tags/**').as('deleteTag');
    cy.get('[data-cy="single-post-card"]').within(() => {
      cy.get('[data-cy="post-tags-panel"]')
        .filter(':visible')
        .within(() => {
          [tag1, tag2, tag3].forEach((tag) => {
            cy.contains('p', tag).should('be.visible').parent().find('[data-cy="tag-count"]').should('have.text', '1');
          });

          // click tag 2 to remove it
          cy.contains('p', tag2).parent().click();
          cy.wait('@deleteTag').its('response.statusCode').should('eq', 204);
          cy.contains('p', tag2).should('be.visible').parent().find('[data-cy="tag-count"]').should('have.text', '0');
        });
    });
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Tag removed');

    cy.reload();

    // check tag 2 is removed from post after page reload
    cy.get('[data-cy="single-post-card"]').within(() => {
      cy.get('[data-cy="post-tags-panel"]')
        .filter(':visible')
        .within(() => {
          cy.contains('p', tag2).should('not.exist');
        });
    });

    // untag tag 1 after page reload to cover bug https://github.com/pubky/pubky-app/issues/1721
    cy.intercept('DELETE', '**/pub/pubky.app/tags/**').as('deleteTag1');
    cy.get('[data-cy="single-post-card"]').within(() => {
      cy.get('[data-cy="post-tags-panel"]')
        .filter(':visible')
        .within(() => {
          cy.contains('p', tag1).parent().click();
          cy.wait('@deleteTag1').its('response.statusCode').should('eq', 204);
        });
    });
    cy.get('[data-cy="toast"]').should('be.visible').and('contain', 'Tag removed');
  });

  it('can bookmark multiple posts then remove bookmarks', () => {
    const postContent1 = `This post will be bookmarked! ${Date.now()}`;
    const postContent2 = `This post will also be bookmarked! ${Date.now()}`;

    createQuickPost(postContent1);
    cy.findFirstPostInFeedFiltered(postContent1, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-bookmark-btn"]').click();
    });

    createQuickPost(postContent2);
    cy.findFirstPostInFeedFiltered(postContent2, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-bookmark-btn"]').click();
    });

    cy.get('a[href="/bookmarks"]').first().click();
    cy.location('pathname').should('eq', '/bookmarks');

    cy.get('[data-cy="timeline-posts"]').should('contain.text', postContent1);
    cy.get('[data-cy="timeline-posts"]').should('contain.text', postContent2);

    // unbookmark both posts
    cy.get('[data-cy="timeline-posts"]')
      .find('[data-cy="post-card"]')
      .should('have.length', 2)
      .then(($posts) => {
        $posts.each((_idx, element) => {
          cy.wrap(element).find('[data-cy="post-bookmark-btn"]').click();
        });
      });

    cy.reload();
    cy.contains('No posts found').should('be.visible');
  });

  it('can repost with content then delete the repost', () => {
    const postContent = `This post will be reposted with content! ${Date.now()}`;
    const repostContent = `Reposted with content! ${Date.now()}`;

    createQuickPost(postContent);

    repostPost({ repostContent, filterText: postContent });

    cy.findFirstPostInFeed(CheckForNewPosts.Yes).within(() => {
      cy.contains('[data-cy="post-text"]', repostContent).should('be.visible');
      cy.contains('[data-cy="post-text"]', postContent).should('be.visible');
    });

    deletePost({ type: PostOrReply.Post });

    cy.findFirstPostInFeed().within(() => {
      cy.contains('[data-cy="post-text"]', postContent).should('be.visible');
      cy.contains('Undo repost').should('not.exist');
    });
  });

  it('can repost without content then undo via toast', () => {
    const postContent = `This post will be reposted without content! ${Date.now()}`;
    createQuickPost(postContent);

    repostPost({ filterText: postContent });

    // After repost, the toast should appear with "Reposted!" and an Undo button
    cy.get('[data-cy="toast"]')
      .should('be.visible')
      .and('contain', 'Reposted!')
      .and('contain', 'Undo')
      .within(() => {
        cy.contains('button', 'Undo').click();
      });

    // After clicking Undo, the repost should be removed from the feed
    cy.findFirstPostInFeed().within(() => {
      cy.contains('You reposted').should('not.exist');
      cy.contains('[data-cy="post-text"]', postContent).should('be.visible');
    });
  });

  it('can see repost of a deleted post', () => {
    const postContent = `This post will be reposted and deleted! ${Date.now()}`;
    const repostContent = `Reposted with this content! ${Date.now()}`;

    createQuickPost(postContent);
    repostPost({ repostContent, filterText: postContent });

    deletePost({ postIdx: 1, type: PostOrReply.Post });

    cy.findFirstPostInFeed(CheckForNewPosts.Yes).within(() => {
      cy.contains('[data-cy="post-text"]', repostContent).should('be.visible');
    });

    cy.findFirstPostInFeed().within(() => {
      cy.contains('This post has been deleted by its author.').should('be.visible');
      cy.contains('[data-cy="post-text"]', repostContent).should('be.visible');
    });
  });

  it('cannot see reply of a deleted post in feed', () => {
    const postContent = `This post will be replied to! ${Date.now()}`;
    const replyContent = `This is my reply! ${Date.now()}`;

    createQuickPost(postContent);
    replyToPost({ replyContent, filterText: postContent });

    cy.findFirstPostInFeed(CheckForNewPosts.Yes).within(() => {
      cy.contains(replyContent).should('be.visible');
    });

    deletePost({ type: PostOrReply.Post });

    cy.get('[data-cy="timeline-posts"]').should('not.contain.text', replyContent);
    cy.get('[data-cy="timeline-posts"]').should('not.contain.text', postContent);
  });

  it('can edit a reply', () => {
    const postContent = `This post will receive a reply! ${Date.now()}`;
    const replyContent = `This reply will be edited! ${Date.now()}`;
    const editedReplyContent = `This reply has been edited! ${Date.now()}`;

    createQuickPost(postContent);
    replyToPost({ replyContent, filterText: postContent });

    cy.findFirstPostInFeedFiltered(replyContent, CheckForNewPosts.No, WaitForNewPosts.Yes).should('be.visible');
    editPost({ newPostContent: editedReplyContent, filterText: replyContent, type: PostOrReply.Reply });

    cy.findFirstPostInFeedFiltered(editedReplyContent).should('be.visible');
    cy.reload();
    waitForFeedToLoad();
    cy.findFirstPostInFeedFiltered(editedReplyContent).should('be.visible');
  });

  it('can edit a repost', () => {
    const postContent = `This post will be reposted! ${Date.now()}`;
    const repostContent = `This repost will be edited! ${Date.now()}`;
    const editedRepostContent = `This repost has been edited! ${Date.now()}`;

    createQuickPost(postContent);
    repostPost({ repostContent, filterText: postContent });

    cy.findFirstPostInFeedFiltered(repostContent, CheckForNewPosts.No, WaitForNewPosts.Yes).should('be.visible');
    editPost({ newPostContent: editedRepostContent, filterText: repostContent, type: PostOrReply.Post });

    cy.findFirstPostInFeedFiltered(editedRepostContent).should('be.visible');
    cy.reload();
    waitForFeedToLoad();
    cy.findFirstPostInFeedFiltered(editedRepostContent).should('be.visible');
  });

  // todo, covers bug https://github.com/pubky/franky/issues/993
  it('"see new posts" button does not appear after deleting new post that has a reply');

  // todo: implement when articles are implemented, see https://github.com/pubky/franky/issues/756
  it.skip('can create an article from quick post box');
  it.skip('can create an article from new post');
  it.skip('new article modal is shown infront of new post modal'); // cover bug from pubky-app

  // todo: check if we want this functionality
  it.skip('signout when 401 response from homeserver when creating new post');
  it.skip('signout when 401 response from homeserver when creating new article');
  it.skip('signout when 401 response from homeserver when tagging a post');

  //todo: implement once retaining scroll position is implemented, see https://github.com/pubky/franky/issues/416
  it.skip('can navigate back to feed from post view');
});
