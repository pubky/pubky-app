import { HasBackedUp, BackupType, CheckForNewPosts, PostType, WaitForNewPosts } from './enums';

declare global {
  namespace Cypress {
    interface Chainable<Subject = any> {
      signOut(hasBackedUp: HasBackedUp): Chainable<void>;
      signInWithEncryptedFile(backupFilepath: string, passcode?: string): Chainable<void>;
      signInWithRecoveryPhrase(recoveryPhrase: string): Chainable<void>;
      onboardAsNewUser(
        profileName: string,
        profileBio?: string,
        backup?: BackupType[],
        pubkyAlias?: string,
      ): Chainable<void>;
      backupRecoveryFile(passcode?: string): Chainable<void>;
      deleteDownloadsFolder(): Chainable<void>;
      waitForFileExistsWithSuffix(folder: string, suffix: string): Chainable<void>;
      deleteFile(filePath: string): Chainable<void>;
      renameFile(fromPath: string, toPath: string): Chainable<void>;
      innerTextShouldEq(text: string): Chainable<Subject>;
      innerTextShouldContain(text: string): Chainable<Subject>;
      innerTextContains(text: string): Chainable<Subject>;
      innerTextShouldNotContain(text: string): Chainable<Subject>;
      innerTextShouldNotEq(text: string): Chainable<Subject>;
      saveStringToAlias(text: string, alias: string): Chainable<void>;
      saveElementValueToAlias(selector: string, alias: string): Chainable<void>;
      saveCopiedPubkyToAlias(alias: string): Chainable<void>;
      saveCopiedTextToAlias(alias: string): Chainable<void>;
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
