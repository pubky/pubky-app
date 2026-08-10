import * as React from 'react';

export enum HotSection {
  TAGS = 'tags',
  USERS = 'users',
  POSTS = 'posts',
}

export interface HotMobileMenuItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  section: HotSection;
  label: string;
}

export interface HotMobileMenuProps {
  activeSection: HotSection;
  onSectionChange: React.Dispatch<React.SetStateAction<HotSection>>;
}
