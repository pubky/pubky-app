import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostBody } from './PostBody';

vi.mock('@/molecules/PostText/PostText', () => ({
  PostText: ({ content }: { content: string }) => <p data-testid="post-text">{content}</p>,
}));
vi.mock('@/molecules/PostLinkEmbeds/PostLinkEmbeds', () => ({
  PostLinkEmbeds: ({ content }: { content: string }) => <div data-testid="link-embeds" data-content={content} />,
}));
vi.mock('../PostAttachments/PostAttachments', () => ({
  PostAttachments: ({ attachments }: { attachments: string[] | null }) => (
    <div data-testid="attachments" data-count={attachments?.length ?? 0} />
  ),
}));

describe('PostBody', () => {
  it('renders text + link embeds + attachments when content has a body', () => {
    render(
      <PostBody
        content="hello https://x.com/a"
        attachments={['pubky://author/files/a.png']}
        localAttachments={undefined}
      />,
    );

    expect(screen.getByTestId('post-text')).toHaveTextContent('hello');
    expect(screen.getByTestId('link-embeds')).toHaveAttribute('data-content', 'hello https://x.com/a');
    expect(screen.getByTestId('attachments')).toHaveAttribute('data-count', '1');
  });

  it('skips text + link embeds for empty content but still renders attachments', () => {
    render(<PostBody content="   " attachments={['pubky://author/files/a.png']} localAttachments={undefined} />);

    expect(screen.queryByTestId('post-text')).not.toBeInTheDocument();
    expect(screen.queryByTestId('link-embeds')).not.toBeInTheDocument();
    expect(screen.getByTestId('attachments')).toBeInTheDocument();
  });
});
