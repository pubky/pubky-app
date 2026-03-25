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

// can use only one of RecoveryPhraseWithConfirmation or RecoveryPhraseWithoutConfirmation
export enum BackupType {
  EncryptedFile = 'encryptedFile',
  RecoveryPhraseWithConfirmation = 'recoveryPhraseWithConfirmation',
  RecoveryPhraseWithoutConfirmation = 'recoveryPhraseWithoutConfirmation',
  PubkyRing = 'pubkyRing',
}
