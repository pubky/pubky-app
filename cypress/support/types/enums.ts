export enum SkipOnboardingSlides {
  No = 0,
  Yes = 1,
}

export enum HasBackedUp {
  No = 0,
  Yes = 1,
}

export enum CheckIndexed {
  No = 0,
  Yes = 1,
}

export enum CheckForNewPosts {
  No = 0,
  Yes = 1,
}

export enum WaitForNewPosts {
  No = 0,
  Yes = 1,
}

export enum LatestNotificationReadState {
  Unread = 'unread',
  Read = 'read',
}

export enum PostType {
  Post = 'post',
  Repost = 'repost',
  Any = 'any',
}

// How the onboarding Experience steps (tags of interest + follow best matches) are driven
export enum OnboardingExperience {
  // Click through both steps with zero tags and zero follows (landing feed stays on All)
  Skip = 'skip',
  // Stop on /onboarding/tags and let the spec drive the Experience steps itself
  StopAtTags = 'stopAtTags',
}

// can use only one of RecoveryPhraseWithConfirmation or RecoveryPhraseWithoutConfirmation
export enum BackupType {
  EncryptedFile = 'encryptedFile',
  RecoveryPhraseWithConfirmation = 'recoveryPhraseWithConfirmation',
  RecoveryPhraseWithoutConfirmation = 'recoveryPhraseWithoutConfirmation',
  PubkyRing = 'pubkyRing',
}
