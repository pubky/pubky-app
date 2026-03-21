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

// select an emoji using the emoji picker by its data-full-name attribute
// export const selectEmojis = (emojiName: string[]) => {
//   // open emoji picker
//   cy.get('#emoji-btn').click();
//   // select each emoji
//   emojiName.forEach((emoji) => {
//     cy.get('em-emoji-picker')
//       .shadow()
//       .find(`button[aria-label*="${emoji}"]`)
//       .should('be.visible')
//       .click({ force: true });
//   });

//   // close emoji picker by clicking outside of it
//   cy.get('#emoji-picker').parent().click('left');
// };

// // check if post at index has two green ticks
// export const checkPostIsIndexed = (postIdx: number, t = 50) => {
//   if (t === 0) assert(false, `findPostInFeed: Post not indexed`);
//   cy.log(`findPostInFeed: Checking if post ${postIdx} is indexed`);
//   cy.get('#posts-feed')
//     .find('#timeline')
//     .children()
//     .eq(postIdx)
//     .then(($post) => {
//       // if post has the status checkmarks then wait for it to have two green ticks
//       if ($post.find('#post-status').length > 0) {
//         if ($post.find('#post-status #post-status-indexed').length === 0) {
//           cy.log('findPostInFeed: Post not indexed; waiting 200ms and checking again');
//           cy.wait(200);
//           checkPostIsIndexed(postIdx, t - 1);
//         }
//       } else {
//         cy.log(`findPostInFeed: Post ${postIdx} was already indexed`);
//       }
//     });
//   cy.log(`findPostInFeed: Post ${postIdx} is indexed`);
// };

// export const checkLatestPostIsIndexed = () => {
//   checkPostIsIndexed(0);
// };

// // wait for latest post to be a repost
// export const waitForRepost = (t = 10, text?: string) => {
//   if (t === 0) assert(false, `waitForRepost: Latest post is not a repost. text=${text}`);
//   cy.get('#posts-feed')
//     .find('#timeline')
//     .children()
//     .eq(0)
//     .invoke('text')
//     .then((text) => {
//       if (text.includes('Undo repost')) {
//         cy.log('waitForRepost: Latest post is a repost');
//       } else {
//         cy.log('waitForRepost: Latest post is not a repost; waiting 200ms and checking again');
//         cy.wait(200);
//         waitForRepost(t - 1, text);
//       }
//     });
// };

// // verify that a post in the feed has the expected content, post is located by index
export const postInFeedContentEq = (postContent: string, idx: number) => {
  cy.get('[data-cy="timeline-posts"]')
    .children()
    .should('have.length.gte', 1)
    .eq(idx)
    .within(() => {
      cy.get('[data-cy="post-text"]').should('have.text', postContent);
    });
};

export const latestPostInFeedContentEq = (postContent: string) => {
  postInFeedContentEq(postContent, 0);
};

// // check how many images are in a post
// export const checkNumberOfImagesInPost = (expectedNumberOfImages: number, idx: number) => {
//   cy.get('#posts-feed')
//     .find('#timeline')
//     .children()
//     .should('have.length.gte', 1)
//     .eq(idx)
//     .within(() => {
//       cy.get('#post-content-text').find('img').should('have.length', expectedNumberOfImages);
//     });
// };

// export const latestPostHasAnImage = () => {
//   checkNumberOfImagesInPost(1, 0);
// };

// export const latestPostHasImages = (expectedNumberOfImages: number) => {
//   checkNumberOfImagesInPost(expectedNumberOfImages, 0);
// };

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

// export const createQuickPostWithTags = (postContent: string, tags: string[], expectedPostLength?: number) => {
//   cy.get('[data-cy="home-post-input"]').within(() => {
//     cy.get('textarea').should('have.value', '');
//     // type the post
//     cy.get('textarea').type(postContent);

//     // add tags to the post
//     fastTagWhilstCreatingPost(tags);

//     // check displayed content length
//     expectedPostLength
//       ? cy.get('#content-length').innerTextShouldEq(`${expectedPostLength} / ${MAX_POST_LENGTH}`)
//       : cy.get('#content-length').innerTextShouldEq(`${postContent.length} / ${MAX_POST_LENGTH}`);

//     // submit the post
//     cy.get('#post-btn').click();
//   });
// };

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

// // tag whilst creating post
// export const fastTagWhilstCreatingPost = (tags: string[]) => {
//   // add the tags
//   cy.get('#add-tag-container').within(() => {
//     cy.get('#show-add-tag-input-btn').click();
//     tags.forEach((tag) => {
//       cy.get('input').type(tag);
//       cy.get('#add-tag-btn').click();
//     });
//   });
//   // verify the tags are displayed in the quick post area
//   cy.get('#tags').children().should('have.length', tags.length);
//   tags.forEach((tag, idx) => {
//     cy.get('#tags').children().eq(idx).contains(tag);
//   });
// };

// // menuBtnIdx: 0 for original post, 1 for reply
// export const editPost = ({
//   newPostContent,
//   filterText = '',
//   postIdx = 0,
//   menuBtnIdx = 0
// }: {
//   newPostContent: string;
//   filterText?: string;
//   postIdx?: number;
//   menuBtnIdx?: number;
// }) => {
//   // find post and click menu button
//   cy.findPostInFeed(postIdx, filterText).within(() => {
//     // '[id="menu-btn"]' finds all with id
//     cy.get('[id="menu-btn"]').eq(menuBtnIdx).should('be.visible').click();
//     cy.get('#post-tooltip-menu')
//       .should('be.visible')
//       .within(() => {
//         cy.get('#edit-post').should('be.visible').innerTextShouldEq('Edit post').get('#edit-post').click();
//       });
//   });

//   // input edited post content in modal and submit
//   cy.get('#modal-root')
//     .should('be.visible')
//     .within(() => {
//       cy.get('h1').contains('Edit Post');
//       cy.get('textarea').clear().type(newPostContent);
//       cy.get('#post-btn').click();
//     });
// };

// edit any post in the feed that contains the filterText by index
export const editPost = ({
  newPostContent,
  filterText,
  postIdx = 0,
  type = PostOrReply.Post,
}: {
  newPostContent: string;
  filterText?: string;
  postIdx?: number;
  type?: PostOrReply;
}) => {
  cy.findPostInFeed(postIdx, filterText, CheckForNewPosts.Yes).within(() => {
    cy.get('[data-cy="post-more-btn"]').eq(type).should('be.visible').click();
  });

  cy.get('[data-cy="post-menu-action-edit"]').should('be.visible').click();

  cy.get('[data-cy="edit-post-input"]')
    .should('be.visible')
    .within(() => {
      cy.get('textarea').clear().type(newPostContent);
      cy.get('[data-cy="post-input-action-bar-edit"]').click();
    });

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

  // click delete menu item (no confirmation dialog needed)
  cy.get('[data-cy="post-menu-action-delete"]').should('be.visible').click();
};

// reloads the page until the post is no longer displayed in the feed
const waitForPostToBeDeleted = (postContent: string, attempts: number = 5, firstCheck: boolean = true) => {
  if (attempts <= 0) assert(false, 'Post still exists with content: ' + postContent);

  cy.get('[data-cy="timeline-posts"]')
    .invoke('text')
    .then((text) => {
      // handle whitespace consistently
      const normalisedText = text.replace(/\s+/g, ' ').trim();
      if (normalisedText.includes(postContent)) {
        firstCheck ? cy.wait(200) : cy.wait(1000);
        cy.reload();
        waitForPostToBeDeleted(postContent, attempts - 1, false);
      }
    });
};

export const checkPostIsNotAtTopOfFeed = ({
  postContent,
  refreshIfPostExists = false,
}: {
  postContent: string;
  refreshIfPostExists?: boolean;
}) => {
  if (refreshIfPostExists) waitForPostToBeDeleted(postContent);
  cy.get('#posts-feed')
    .find('#timeline')
    .children()
    .its('length')
    .then((length) => {
      // if at least 1 post still exists, check it doesn't match the text of the deleted post
      if (length > 0) {
        cy.get('#posts-feed')
          .find('#timeline')
          .children()
          .should('have.length.gte', 1)
          .eq(0)
          .within(() => {
            cy.get('#post-content-text').innerTextShouldNotEq(postContent);
          });
      }
    });
};

export const checkPostIsAtIndexInFeed = (postContent: string, index: number) => {
  cy.get('[data-cy="timeline-posts"]')
    .children()
    .should('have.length.gte', 1)
    .eq(index)
    .within(() => {
      cy.get('[data-cy="post-text"]').innerTextShouldEq(postContent);
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
      const isLoading = normalisedFeedText.includes('Loading posts...');

      cy.log('hasTimelinePosts: ', String(hasTimelinePosts));
      cy.log('hasEmptyState: ', String(hasEmptyState));
      cy.log('isLoading: ', String(isLoading));

      // Feed has loaded if:
      // 1. Not loading anymore AND
      // 2. Either timeline-posts exists (has posts) OR empty state is shown (no posts)
      if (!isLoading && (hasTimelinePosts || hasEmptyState)) {
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

const findAndCountPostsInFeed = (filterText: string, expectedCount: number) => {
  cy.get('body').then(($body) => {
    // If timeline-posts doesn't exist (empty feed state), assert expectedCount is 0
    if ($body.find('[data-cy="timeline-posts"]').length === 0) {
      expect(expectedCount, `Expected ${expectedCount} posts with "${filterText}" but timeline is empty`).to.eq(0);
      return;
    }

    cy.get('[data-cy="timeline-posts"]')
      .children()
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
export const addImage = () => {
  // upload image
  const imagePath = Cypress.config('fixturesFolder') + '/mustache-you.png';
  cy.get('input[type="file"]').selectFile(
    imagePath,
    { force: true }, // force to bypass visibility check of hidden input field
  );
};
