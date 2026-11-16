import { HasBackedUp, CheckForNewPosts, OnboardingExperience, PostType, WaitForNewPosts } from './enums';

declare global {
  namespace Cypress {
    interface Chainable<Subject = any> {
      signOut(hasBackedUp: HasBackedUp): Chainable<void>;
      signInWithPubkyRing(
        name: string,
        landingPath?: string,
        options?: {
          /** The account has a 0.x tree: wait on the gate's progress screen, then up to an extended timeout for the landing route. */
          migrates?: boolean;
          /** Runs on /migration before the run is under way, e.g. while another holder has the migration lock; with `migrates` only. */
          beforeRun?: () => void;
          /** Runs on the gate's progress screen, before the command waits for the landing route; with `migrates` only. */
          whileMigrating?: () => void;
          /** Clicks through the summary of a run that left something behind; a string is the summary text to expect first. */
          acknowledgesSummary?: boolean | string;
        },
      ): Chainable<void>;
      onboardAsNewUser(
        profileName: string,
        profileBio?: string,
        pubkyAlias?: string,
        experience?: OnboardingExperience,
      ): Chainable<void>;
      completeSignUpWithPubkyRing(profileName: string): Chainable<void>;
      finishFollowBestMatchesStep(): Chainable<void>;
      waitForFileExistsWithSuffix(folder: string, suffix: string): Chainable<void>;
      innerTextShouldEq(text: string): Chainable<Subject>;
      innerTextShouldContain(text: string): Chainable<Subject>;
      innerTextContains(text: string): Chainable<Subject>;
      innerTextShouldNotContain(text: string): Chainable<Subject>;
      innerTextShouldNotEq(text: string): Chainable<Subject>;
      saveStringToAlias(text: string, alias: string): Chainable<void>;
      saveElementValueToAlias(selector: string, alias: string): Chainable<void>;
      saveCopiedPubkyToAlias(alias: string): Chainable<void>;
      copyAuthLinkFromQr(): Chainable<string>;
      assertElementDoesNotExist(selector: string): Chainable<void>;
      waitReload(time?: number): Chainable<void>;
      waitReloadWhileElementDoesNotExist(selector: string, attempts?: number): Chainable<void>;
      findPostInBookmarks(postIdx: number, expectedCount?: number): Chainable<JQuery<HTMLElement>>;
      countPostsInBookmarks(expectedCount: number): Chainable<void>;
      findPostInSearchResults(filterText?: string, postIdx?: number): Chainable<JQuery<HTMLElement>>;
      findFirstPostInFeed(checkForNewPosts?: CheckForNewPosts): Chainable<JQuery<HTMLElement>>;
      findFirstPostInFeedFiltered(
        filterText: string,
        checkForNewPosts?: CheckForNewPosts,
        waitForNewPosts?: WaitForNewPosts,
      ): Chainable<JQuery<HTMLElement>>;
      findFirstPostInFeedFilteredByType(
        filterText: string,
        postType?: PostType,
        checkForNewPosts?: CheckForNewPosts,
        waitForNewPosts?: WaitForNewPosts,
      ): Chainable<JQuery<HTMLElement>>;
      findPostInFeed(
        postIdx?: number,
        filterText?: string,
        checkForNewPosts?: CheckForNewPosts,
        waitForNewPosts?: WaitForNewPosts,
      ): Chainable<JQuery<HTMLElement>>;
      findPostInFeedByType(
        postType?: PostType,
        filterText?: string,
        checkForNewPosts?: CheckForNewPosts,
        waitForNewPosts?: WaitForNewPosts,
      ): Chainable<JQuery<HTMLElement>>;
    }
  }
}
