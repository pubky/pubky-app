import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotMobileMenu, HOT_MOBILE_MENU_ITEMS } from './HotMobileMenu';
import { HotSection } from './HotMobileMenu.types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('HotMobileMenu', () => {
  it('renders all menu items', () => {
    render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    HOT_MOBILE_MENU_ITEMS.forEach((item) => {
      expect(screen.getByLabelText(item.section)).toBeInTheDocument();
    });
  });

  it('has correct structure with sticky positioning', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass(
      'sticky',
      'top-(--header-height-mobile)',
      'z-(--z-mobile-menu)',
      '-mx-6',
      '-mt-6',
      'mb-6',
      'bg-background',
      'lg:hidden',
    );
  });

  it('renders correct number of menu items', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(HOT_MOBILE_MENU_ITEMS.length);
  });

  it('marks the active item with aria-current="page"', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.USERS} onSectionChange={() => {}} />);
    const activeButton = container.querySelector('button[aria-current="page"]');
    expect(activeButton).toBeInTheDocument();
    expect(activeButton).toHaveAttribute('aria-label', 'users');
  });

  it('applies correct border classes to active and inactive items', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.USERS} onSectionChange={() => {}} />);
    const items = container.querySelectorAll('div[class*="border-b"]');

    const usersIndex = HOT_MOBILE_MENU_ITEMS.findIndex((item) => item.section === HotSection.USERS);
    const activeItem = items[usersIndex];
    expect(activeItem).toHaveClass('border-foreground');

    items.forEach((item, index) => {
      if (index !== usersIndex) {
        expect(item).toHaveClass('border-border');
      }
    });
  });

  it('applies correct text color classes to icons', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.USERS} onSectionChange={() => {}} />);
    const icons = container.querySelectorAll('svg');

    const usersIndex = HOT_MOBILE_MENU_ITEMS.findIndex((item) => item.section === HotSection.USERS);
    const activeIcon = icons[usersIndex];
    expect(activeIcon).toHaveClass('text-foreground');

    icons.forEach((icon, index) => {
      if (index !== usersIndex) {
        expect(icon).toHaveClass('text-muted-foreground');
      }
    });
  });

  it('has correct button structure with padding', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    const buttons = container.querySelectorAll('button');
    buttons.forEach((button) => {
      expect(button).toHaveClass('px-2.5', 'py-2');
    });
  });

  it('has correct container structure with flex and border', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    const items = container.querySelectorAll('div[class*="border-b"]');
    items.forEach((item) => {
      expect(item).toHaveClass('flex', 'flex-1', 'justify-center', 'border-b', 'px-0', 'py-1.5');
    });
  });

  it('calls onSectionChange with correct section when clicked', async () => {
    const user = userEvent.setup();
    const onSectionChange = vi.fn();

    render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={onSectionChange} />);

    await user.click(screen.getByLabelText('users'));
    expect(onSectionChange).toHaveBeenCalledWith(HotSection.USERS);

    await user.click(screen.getByLabelText('posts'));
    expect(onSectionChange).toHaveBeenCalledWith(HotSection.POSTS);

    await user.click(screen.getByLabelText('tags'));
    expect(onSectionChange).toHaveBeenCalledWith(HotSection.TAGS);

    expect(onSectionChange).toHaveBeenCalledTimes(3);
  });

  it('renders text labels alongside icons', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);

    HOT_MOBILE_MENU_ITEMS.forEach((item) => {
      expect(screen.getByText(item.section)).toBeInTheDocument();
    });

    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(HOT_MOBILE_MENU_ITEMS.length);
  });
});

describe('HotMobileMenu - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
