import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeStore } from '@/stores/home/home.store';
import { homeInitialState } from '@/stores/home/home.types';
import { TaggedAsHeadline } from './TaggedAsHeadline';

const { mockCurrentUserPubky } = vi.hoisted(() => ({
  mockCurrentUserPubky: { value: 'viewer-pubky' as string | null },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky.value }),
}));
describe('TaggedAsHeadline', () => {
  beforeEach(() => {
    mockCurrentUserPubky.value = 'viewer-pubky';
    useHomeStore.setState({ ...homeInitialState, hasHydrated: true });
  });

  it('renders a single active profile tag', () => {
    useHomeStore.setState({ taggedAsActive: true, profileTags: ['bitcoiner'] });

    render(<TaggedAsHeadline />);

    const headline = screen.getByTestId('tagged-as-headline');
    expect(headline).toHaveTextContent('Posts from people tagged as ‘bitcoiner’ by my network');
    expect(headline).toHaveClass('text-muted-foreground');
  });

  it('uses disjunction formatting for multiple tags', () => {
    useHomeStore.setState({ taggedAsActive: true, profileTags: ['bitcoin', 'developer'] });

    render(<TaggedAsHeadline />);

    expect(screen.getByTestId('tagged-as-headline')).toHaveTextContent(
      'Posts from people tagged as ‘bitcoin’ or ‘developer’ by my network',
    );
  });

  it('stays hidden when Tagged as is inactive', () => {
    useHomeStore.setState({ taggedAsActive: false, profileTags: ['bitcoin'] });

    render(<TaggedAsHeadline />);

    expect(screen.queryByTestId('tagged-as-headline')).not.toBeInTheDocument();
  });

  it('stays hidden without profile tags', () => {
    useHomeStore.setState({ taggedAsActive: true, profileTags: [] });

    render(<TaggedAsHeadline />);

    expect(screen.queryByTestId('tagged-as-headline')).not.toBeInTheDocument();
  });

  it('stays hidden for unauthenticated visitors', () => {
    mockCurrentUserPubky.value = null;
    useHomeStore.setState({ taggedAsActive: true, profileTags: ['bitcoin'] });

    render(<TaggedAsHeadline />);

    expect(screen.queryByTestId('tagged-as-headline')).not.toBeInTheDocument();
  });
});
