import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SinglePostRoute } from './SinglePostRoute';

const mockPathname = vi.hoisted(() => ({ current: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.current,
}));

vi.mock('@/templates/Post/SinglePost/SinglePostPage', () => ({
  SinglePostPage: ({ postId }: { postId: string }) => <div data-testid="single-post-page" data-post-id={postId} />,
}));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

describe('SinglePostRoute', () => {
  it('builds the composite id from the URL path', () => {
    mockPathname.current = `/post/${AUTHOR}/0034BBBDFK83G`;

    render(<SinglePostRoute />);

    expect(screen.getByTestId('single-post-page')).toHaveAttribute('data-post-id', `${AUTHOR}:0034BBBDFK83G`);
  });

  it('renders nothing off a post path', () => {
    mockPathname.current = '/home';

    render(<SinglePostRoute />);

    expect(screen.queryByTestId('single-post-page')).toBeNull();
  });
});
