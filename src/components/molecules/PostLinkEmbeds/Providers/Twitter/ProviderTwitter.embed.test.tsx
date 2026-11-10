import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Twitter } from './ProviderTwitter';

const tweet = vi.hoisted(() => ({ state: { data: null as unknown, error: null as unknown, isLoading: true } }));
vi.mock('react-tweet', () => ({
  useTweet: () => tweet.state,
  EmbeddedTweet: () => <div data-testid="twitter-tweet" />,
  TweetSkeleton: () => <div data-testid="twitter-tweet-skeleton" />,
  TweetNotFound: () => <div data-testid="twitter-tweet-not-found" />,
}));

const renderTweet = (onEmbedError: () => void) =>
  render(<>{Twitter.renderEmbed({ type: 'id', value: '123' }, { isPostEmbed: true, onEmbedError })}</>);

describe('Twitter embed errors', () => {
  beforeEach(() => {
    tweet.state = { data: null, error: null, isLoading: true };
  });

  it('says nothing while the post loads or once it shows', () => {
    const onError = vi.fn();
    const { rerender } = renderTweet(onError);
    expect(screen.getByTestId('twitter-tweet-skeleton')).toBeInTheDocument();

    tweet.state = { data: { id_str: '123' }, error: null, isLoading: false };
    rerender(<>{Twitter.renderEmbed({ type: 'id', value: '123' }, { isPostEmbed: true, onEmbedError: onError })}</>);
    expect(screen.getByTestId('twitter-tweet')).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ['an error', { data: null, error: new Error('gone'), isLoading: false }],
    ['no post', { data: null, error: null, isLoading: false }],
  ])('reports %s once', (_, state) => {
    tweet.state = state;
    const onError = vi.fn();
    const { rerender } = renderTweet(onError);
    rerender(<>{Twitter.renderEmbed({ type: 'id', value: '123' }, { isPostEmbed: true, onEmbedError: onError })}</>);

    expect(screen.getByTestId('twitter-tweet-not-found')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('Twitter embed in an external resource', () => {
  it('drops the phone width cap with `fill`, and keeps it otherwise', () => {
    tweet.state = { data: { id_str: '123' }, error: null, isLoading: false };
    const { unmount } = render(<>{Twitter.renderEmbed({ type: 'id', value: '123' }, { fill: true })}</>);
    expect(screen.getByTestId('twitter-container')).not.toHaveClass('max-w-70');
    unmount();

    // An error callback alone does not change the layout.
    render(<>{Twitter.renderEmbed({ type: 'id', value: '123' }, { onEmbedError: () => {} })}</>);
    expect(screen.getByTestId('twitter-container')).toHaveClass('max-w-70');
  });
});
