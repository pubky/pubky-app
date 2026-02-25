'use client';

import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Core from '@/core';

export function PrivacySettings() {
  const t = useTranslations('privacy');
  const {
    privacy,
    setShowConfirm,
    setBlurCensored,
    setSignOutInactive,
    setRequirePin,
    setHideWhoToFollow,
    setHideActiveFriends,
    setHideSearch,
    setNeverShowPosts,
  } = Core.useSettingsStore();

  const handleConfirmationToggle = (checked: boolean) => {
    setShowConfirm(checked);
  };

  const handleBlurToggle = (checked: boolean) => {
    setBlurCensored(checked);
  };

  const handleSignOutInactiveToggle = (checked: boolean) => {
    setSignOutInactive(checked);
  };

  const handleRequirePinToggle = (checked: boolean) => {
    setRequirePin(checked);
  };

  const handleHideWhoToFollowToggle = (checked: boolean) => {
    setHideWhoToFollow(checked);
  };

  const handleHideActiveFriendsToggle = (checked: boolean) => {
    setHideActiveFriends(checked);
  };

  const handleHideSearchToggle = (checked: boolean) => {
    setHideSearch(checked);
  };

  const handleNeverShowPostsToggle = (checked: boolean) => {
    setNeverShowPosts(checked);
  };

  return (
    <Molecules.SettingsSwitchGroup>
      <Molecules.SettingsSwitchItem
        id="show-confirmation-switch"
        label={t('showConfirmation')}
        checked={privacy.showConfirm}
        onChange={handleConfirmationToggle}
      />
      <Molecules.SettingsSwitchItem
        id="blur-censored-switch"
        label={t('blurCensored')}
        checked={privacy.blurCensored}
        onChange={handleBlurToggle}
      />
      <Molecules.SettingsSwitchItem
        id="sign-out-inactive-switch"
        label={t('signOutInactive')}
        checked={privacy.signOutInactive}
        onChange={handleSignOutInactiveToggle}
        disabled
      />
      <Molecules.SettingsSwitchItem
        id="require-pin-switch"
        label={t('requirePin')}
        checked={privacy.requirePin}
        onChange={handleRequirePinToggle}
        disabled
      />
      <Molecules.SettingsSwitchItem
        id="hide-who-to-follow-switch"
        label={t('hideWhoToFollow')}
        checked={privacy.hideWhoToFollow}
        onChange={handleHideWhoToFollowToggle}
        disabled
      />
      <Molecules.SettingsSwitchItem
        id="hide-active-friends-switch"
        label={t('hideActiveFriends')}
        checked={privacy.hideActiveFriends}
        onChange={handleHideActiveFriendsToggle}
        disabled
      />
      <Molecules.SettingsSwitchItem
        id="hide-search-switch"
        label={t('hideSearch')}
        checked={privacy.hideSearch}
        onChange={handleHideSearchToggle}
        disabled
      />
      <Molecules.SettingsSwitchItem
        id="never-show-posts-switch"
        label={t('neverShowPosts')}
        checked={privacy.neverShowPosts}
        onChange={handleNeverShowPostsToggle}
        disabled
      />
    </Molecules.SettingsSwitchGroup>
  );
}
