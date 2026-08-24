// import { CheckIndexed } from '../support/types/enums';

import { CheckForNewPosts } from './types/enums';

export const MAX_POST_LENGTH = 2000;

/**
 * Post or Reply type for delete operations
 */
export enum PostOrReply {
  Post = 0,
  Reply = 1,
}

// // verify that a post in the feed has the expected content, post is located by index
export const postInFeedContentEq = (postContent: string, idx: number) => {
  cy.get('[data-cy="timeline-posts"]')
    .find('[data-cy="post-card"]')
    .should(($posts) => {
      expect($posts.length).to.be.greaterThan(idx);

      const postText = $posts.eq(idx).find('[data-cy="post-text"]').text();
      expect(postText).to.eq(postContent);
    });
};

export const latestPostInFeedContentEq = (postContent: string) => {
  postInFeedContentEq(postContent, 0);
};

export const createQuickPost = (postContent: string, tags?: string[], expectedPostLength?: number) => {
  cy.get('[data-cy="home-post-input"]')
    .should('be.visible')
    .within(() => {
      // input post content within quick post area
      cy.get('textarea').should('have.value', '').type(postContent);

      // Add tags if provided
      if (tags) {
        // Click the add tag button to show the input
        cy.get('[data-cy="post-tag-add-button"]').click();

        tags.forEach((tag) => {
          cy.get('[data-cy="add-tag-input"]').type(`${tag}{enter}`);
        });
      }

      // verify displayed content length
      cy.get('[data-cy="post-header-character-count"]').then((counter) => {
        expectedPostLength
          ? expect(counter.text()).to.eq(`${expectedPostLength}/${MAX_POST_LENGTH}`)
          : expect(counter.text()).to.eq(`${Array.from(postContent).length}/${MAX_POST_LENGTH}`);
      });

      cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('postCreated');
      // submit the post
      cy.get('[data-cy="post-input-action-bar-post"]').click();
      cy.wait('@postCreated').its('response.statusCode').should('eq', 201);
      // verify textarea is empty
      cy.get('textarea').should('have.value', '');
    });
};

export const createQuickPostWithImage = (postContent: string) => {
  cy.get('[data-cy="home-post-input"]')
    .should('be.visible')
    .within(() => {
      cy.get('textarea').click();
      addImage();
      cy.get('textarea').type(postContent);
      cy.get('[data-cy="post-header-character-count"]').then((counter) => {
        expect(counter.text()).to.eq(`${Array.from(postContent).length}/${MAX_POST_LENGTH}`);
      });
      cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('postCreated');
      cy.get('[data-cy="post-input-action-bar-post"]').click();
      cy.wait('@postCreated').its('response.statusCode').should('eq', 201);
      cy.get('textarea').should('have.value', '');
    });
};

export const createQuickPostWithMention = (mentionUsername: string) => {
  cy.get('[data-cy="home-post-input"]')
    .should('be.visible')
    .within(() => {
      cy.get('textarea').should('have.value', '').type('Hey ');
      cy.get('textarea').type(`@${mentionUsername}`);
    });

  // MentionPopover portals to document.body to escape clipping ancestors, so it is
  // not a descendant of home-post-input and must be queried outside `.within()`.
  cy.get('[data-cy="mention-popover"]').should('be.visible').contains(mentionUsername).click();

  cy.get('[data-cy="home-post-input"]').within(() => {
    cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('postCreated');
    cy.get('[data-cy="post-input-action-bar-post"]').click();
    cy.wait('@postCreated').its('response.statusCode').should('eq', 201);
    cy.get('textarea').should('have.value', '');
  });
};

export const createPostFromDialog = (postContent: string, expectedPostLength?: number) => {
  // click button to display new post dialog
  cy.get('[data-cy="new-post-btn"]').click();

  // verify dialog is displayed
  cy.get('[data-cy="dialog-content"]')
    .should('be.visible')
    .find('h2')
    .should('contain.text', 'New Post')
    .get('[data-cy="new-post-input"]')
    .within(() => {
      // input post content
      cy.get('textarea').should('have.value', '').get('textarea').type(postContent);

      // verify displayed content length
      cy.get('[data-cy="post-header-character-count"]').then((counter) => {
        expectedPostLength
          ? expect(counter.text()).to.eq(`${expectedPostLength}/${MAX_POST_LENGTH}`)
          : expect(counter.text()).to.eq(`${postContent.length}/${MAX_POST_LENGTH}`);
      });

      cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('postCreated');
      // submit
      cy.get('[data-cy="post-input-action-bar-post"]').click();
      cy.wait('@postCreated').its('response.statusCode').should('eq', 201);
    });
  // verify dialog is closed
  cy.get('[data-cy="dialog-content"]').should('not.exist');
};

// reply to any post in the feed that contains the filterText by index
export const replyToPost = ({
  replyContent,
  filterText,
  postIdx = 0,
}: {
  replyContent: string;
  filterText?: string;
  postIdx?: number;
}) => {
  cy.findPostInFeed(postIdx, filterText, CheckForNewPosts.Yes).within(() => {
    cy.get('[data-cy="post-reply-btn"]').click();
  });

  // Wait for dialog to open and type reply
  cy.get('[data-cy="reply-post-input"]').should('be.visible');
  cy.get('[data-cy="reply-post-input"]').within(() => {
    cy.get('textarea').should('have.value', '').type(replyContent);
    cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('replyCreated');
    cy.get('[data-cy="post-input-action-bar-reply"]').click();
    cy.wait('@replyCreated').its('response.statusCode').should('eq', 201);
  });

  // Wait for dialog to close
  cy.get('[data-cy="reply-post-input"]').should('not.exist');
};

// repost any post in the feed that contains the filterText by index
export const repostPost = ({
  repostContent,
  filterText,
  postIdx = 0,
}: {
  repostContent?: string;
  filterText?: string;
  postIdx?: number;
} = {}) => {
  cy.findPostInFeed(postIdx, filterText, CheckForNewPosts.Yes).within(() => {
    cy.get('[data-cy="post-repost-btn"]').click();
  });

  // Wait for dialog to open
  cy.get('[data-cy="repost-post-input"]').should('be.visible');
  cy.get('[data-cy="repost-post-input"]').within(() => {
    // Optionally type repost content
    if (repostContent) {
      cy.get('textarea').should('have.value', '').type(repostContent);
    }
    cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('repostCreated');
    // Submit the repost
    cy.get('[data-cy="post-input-action-bar-repost"]').click();
    cy.wait('@repostCreated').its('response.statusCode').should('eq', 201);
  });

  // Wait for dialog to close
  cy.get('[data-cy="repost-post-input"]').should('not.exist');
};

// tag a post by clicking the add button, typing the tag, and pressing Enter
export const fastTagPost = (tags: string[]) => {
  // Click the add tag button to show the input
  cy.get('[data-cy="post-tag-add-button"]').first().click();
  cy.intercept('PUT', '**/pub/pubky.app/tags/**').as('putTag');
  tags.forEach((tag) => {
    cy.get('[data-cy="add-tag-input"]').first().type(`${tag}{enter}`);
    cy.wait('@putTag').its('response.statusCode').should('eq', 201);
  });
};

// tag a post in feed with any number of tags, finding the post by its content
export const fastTagPostInFeed = (tags: string[], postContent: string) => {
  cy.findFirstPostInFeedFiltered(postContent).within(() => {
    fastTagPost(tags);
  });
};

// edit any post in the feed that contains the filterText by index
export const editPost = ({
  newPostContent,
  filterText,
  postIdx = 0,
  type = PostOrReply.Post,
  imageAction,
}: {
  newPostContent?: string;
  filterText?: string;
  postIdx?: number;
  type?: PostOrReply;
  imageAction?: { action: 'replace' } | { action: 'remove' };
}) => {
  cy.findPostInFeed(postIdx, filterText, CheckForNewPosts.Yes).within(() => {
    cy.get('[data-cy="post-more-btn"]').eq(type).should('be.visible').click();
  });

  cy.get('[data-cy="post-menu-action-edit"]').should('be.visible').click();

  cy.get('[data-cy="edit-post-input"]')
    .should('be.visible')
    .within(() => {
      if (newPostContent !== undefined) {
        cy.get('textarea').clear().type(newPostContent);
      }

      if (imageAction) {
        cy.get('[data-cy="post-input-attachment-remove"]').should('be.visible').click();
        cy.get('img[alt="Image preview"]').should('not.exist');
        if (imageAction.action === 'replace') {
          addImage('mustache-edit.png');
          cy.get('img[alt="Image preview"]').should('be.visible');
        }
        cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('postEdited');
      }

      cy.get('[data-cy="post-input-action-bar-edit"]').click();
    });

  if (imageAction) {
    cy.wait('@postEdited').its('response.statusCode').should('be.oneOf', [200, 201, 204]);
  }

  cy.get('[data-cy="edit-post-input"]').should('not.exist');
};

// delete any post or reply in the feed that contains the filterText by index
// type: PostOrReply.Post (0) for original post, PostOrReply.Reply (1) for reply
export const deletePost = ({
  filterText,
  postIdx = 0,
  type = PostOrReply.Post,
}: {
  filterText?: string;
  postIdx?: number;
  type?: PostOrReply;
}) => {
  // find post or reply and click more menu button
  // use type enum value (0 for post, 1 for reply) to select the correct menu button
  cy.findPostInFeed(postIdx, filterText, CheckForNewPosts.Yes).within(() => {
    cy.get('[data-cy="post-more-btn"]').eq(type).should('be.visible').click();
  });

  // click delete menu item
  cy.get('[data-cy="post-menu-action-delete"]').should('be.visible').click();

  // confirm deletion in dialog
  cy.get('[data-cy="dialog-content"]')
    .should('be.visible')
    .within(() => {
      cy.get('[data-cy="dialog-confirm-delete-btn"]').click();
    });
  cy.get('[data-cy="dialog-content"]').should('not.exist');
};

export const checkPostIsAtIndexInFeed = (postContent: string, index: number, repostContent?: string) => {
  cy.get('[data-cy="timeline-posts"]')
    .find('[data-cy="post-card"]')
    .should(($posts) => {
      expect($posts.length).to.be.greaterThan(index);

      const postText = $posts.eq(index).find('[data-cy="post-text"]').first().text();
      expect(postText).to.eq(postContent);

      if (repostContent) {
        const repostText = $posts.eq(index).find('[data-cy="post-text"]').eq(1).text();
        expect(repostText).to.eq(repostContent);
      }
    });
};

// wait for feed timeline to not show placeholder text
// Scopes checks to the main feed container only so sidebar/drawer content (e.g. "Loading posts...", "No posts found") does not affect readiness.
export const waitForFeedToLoad = () => {
  const checkTimelineRecursively = (attempts: number, firstCheck: boolean = true) => {
    if (attempts <= 0)
      assert(false, "Timeline still shows either no posts, 'No posts found' or 'Loading...' after 10 seconds");

    cy.get('body').then(($body) => {
      const $feed = $body.find('[data-cy="timeline-container"]');
      if ($feed.length === 0) {
        firstCheck ? cy.wait(200) : cy.wait(1000);
        checkTimelineRecursively(attempts - 1, false);
        return;
      }

      const feedText = $feed.text();
      const normalisedFeedText = feedText.replace(/\s+/g, ' ').trim();
      const hasTimelinePosts = $feed.find('[data-cy="timeline-posts"]').length > 0;
      const hasEmptyState = normalisedFeedText.includes('No posts found');
      const isLoadingPosts = normalisedFeedText.includes('Loading posts...');
      const isLoadingHeader = normalisedFeedText.includes('Loading header...');
      const isLoadingContent = normalisedFeedText.includes('Loading content...');

      cy.log('hasTimelinePosts: ', String(hasTimelinePosts));
      cy.log('hasEmptyState: ', String(hasEmptyState));
      cy.log('isLoadingPosts: ', String(isLoadingPosts));
      cy.log('isLoadingHeader: ', String(isLoadingHeader));
      cy.log('isLoadingContent: ', String(isLoadingContent));

      // Feed has loaded if:
      // 1. Not loading anymore AND
      // 2. Either timeline-posts exists (has posts) OR empty state is shown (no posts)
      if (!isLoadingPosts && !isLoadingHeader && !isLoadingContent && (hasTimelinePosts || hasEmptyState)) {
        // Feed has loaded successfully
        return;
      }

      // Still waiting for feed to load
      firstCheck ? cy.wait(200) : cy.wait(1000);
      checkTimelineRecursively(attempts - 1, false);
    });
  };

  checkTimelineRecursively(10);
};

// wait for bookmarks to not show "Save posts for later" or "Loading"
export const waitForBookmarksToLoad = (seconds: number = 6) => {
  const checkBookmarksRecursively = (attempts: number, firstCheck: boolean = true) => {
    if (attempts <= 0) assert(false, "Bookmarks still show 'Save posts for later' or 'Loading' after 5 seconds");

    cy.get('#bookmarked-posts')
      .invoke('text')
      .then((text) => {
        if (text.includes('Save posts for later') || text.includes('Loading')) {
          firstCheck ? cy.wait(200) : cy.wait(1000);
          checkBookmarksRecursively(attempts - 1, false);
        }
      });
  };
  checkBookmarksRecursively(seconds);
};

// todo: consider using PostType enum
const findAndCountPostsInFeed = (filterText: string, expectedCount: number) => {
  cy.get('body').then(($body) => {
    // If timeline-posts doesn't exist (empty feed state), assert expectedCount is 0
    if ($body.find('[data-cy="timeline-posts"]').length === 0) {
      expect(expectedCount, `Expected ${expectedCount} posts with "${filterText}" but timeline is empty`).to.eq(0);
      return;
    }

    cy.get('[data-cy="timeline-posts"]')
      .find('[data-cy="post-card"]')
      .then(($posts) => {
        // Filter posts by text
        const matchingPosts = $posts.filter((_idx, element) => element.innerText.includes(filterText));

        // Assert that the correct number of posts are found with the provided text
        expect(matchingPosts).to.have.length(expectedCount);
      });
  });
};

export const cannotFindPostInFeed = (filterText: string) => {
  findAndCountPostsInFeed(filterText, 0);
};

export const countPostsInFeed = (filterText: string, expectedCount: number) => {
  findAndCountPostsInFeed(filterText, expectedCount);
};

// can be used in post or article creation
export const addImage = (fileName = 'mustache-you.png') => {
  const imagePath = Cypress.config('fixturesFolder') + `/${fileName}`;
  cy.get('input[type="file"]').selectFile(
    imagePath,
    { force: true }, // force to bypass visibility check of hidden input field
  );
};
