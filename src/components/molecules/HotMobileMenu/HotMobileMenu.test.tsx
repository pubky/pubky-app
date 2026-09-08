import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HOT_MOBILE_MENU_ITEMS, HotMobileMenu } from './HotMobileMenu';
import { HotSection } from './HotMobileMenu.types';

describe('HotMobileMenu', () => {
  it('renders all menu items', () => {
    render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    HOT_MOBILE_MENU_ITEMS.forEach((item) => {
      expect(screen.getByLabelText(item.label)).toBeInTheDocument();
    });
  });

  it('renders correct number of menu items', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(HOT_MOBILE_MENU_ITEMS.length);
  });

  it('renders text labels alongside icons (showLabels mode)', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);

    HOT_MOBILE_MENU_ITEMS.forEach((item) => {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    });

    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(HOT_MOBILE_MENU_ITEMS.length);
  });

  it('applies Hot-specific margin overrides via className passthrough', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass('-mx-4');
    expect(rootElement).not.toHaveClass('-mx-6');
    expect(rootElement).not.toHaveClass('-mt-6', 'mb-6');
  });

  it('renders with sticky positioning', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass('sticky', 'top-(--header-height-settings)');
  });

  it('exposes the hot-mobile-menu data-testid on the root', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveAttribute('data-testid', 'hot-mobile-menu');
  });

  it('marks the active item with aria-current="page"', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.USERS} onSectionChange={() => {}} />);
    const activeButton = container.querySelector('button[aria-current="page"]');
    expect(activeButton).toBeInTheDocument();
    expect(activeButton).toHaveAttribute('aria-label', 'Users');
  });

  it('calls onSectionChange with correct section when clicked', async () => {
    const user = userEvent.setup();
    const onSectionChange = vi.fn();

    render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={onSectionChange} />);

    await user.click(screen.getByLabelText('Users'));
    expect(onSectionChange).toHaveBeenCalledWith(HotSection.USERS);

    await user.click(screen.getByLabelText('Posts'));
    expect(onSectionChange).toHaveBeenCalledWith(HotSection.POSTS);

    await user.click(screen.getByLabelText('Tags'));
    expect(onSectionChange).toHaveBeenCalledWith(HotSection.TAGS);

    expect(onSectionChange).toHaveBeenCalledTimes(3);
  });
});

describe('HotMobileMenu - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<HotMobileMenu activeSection={HotSection.TAGS} onSectionChange={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
