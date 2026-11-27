import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoThirdPartyLoads } from '@/test-utils/third-party';
import { ResourcePostPress } from './ResourcePostPress';

const LINK = 'https://www.instagram.com/p/DgB34vHhlaT/';

/** The site's post: rendered only once the press shows it. */
function Post({ onRender }: { onRender: () => void }) {
  onRender();
  return <iframe title="post" data-testid="site-post" src="https://www.instagram.com/p/DgB34vHhlaT/embed/" />;
}

function Press({ onPost = () => {} }: { onPost?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <ResourcePostPress link={LINK} siteName="instagram.com" isOpen={isOpen} onOpenChange={setIsOpen}>
      <Post onRender={onPost} />
    </ResourcePostPress>
  );
}

describe('ResourcePostPress', () => {
  it('is one button, "Show post" with the site’s mark from the app’s favicon route, and renders nothing of the site', () => {
    const onPost = vi.fn();
    render(<Press onPost={onPost} />);

    const press = screen.getByRole('button');
    expect(press).toHaveAccessibleName('Show post from instagram.com');
    expect(press).toHaveTextContent('Show postinstagram.com');
    expect(screen.getByTestId('post-press-glyph')).toBeInTheDocument();
    expect(screen.getByTestId('resource-source-favicon').getAttribute('src')).toContain('/api/favicon?');
    expect(onPost).not.toHaveBeenCalled();
    expectNoThirdPartyLoads();
  });

  it('shows the site’s post in its place on the press, Close beside it taking the focus; Close brings the press back', () => {
    render(<Press />);

    fireEvent.click(screen.getByRole('button', { name: 'Show post from instagram.com' }));
    expect(screen.getByTestId('site-post')).toBeInTheDocument();
    expect(screen.queryByTestId('post-press')).not.toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close the instagram.com post' });
    expect(close).toHaveFocus();

    fireEvent.click(close);
    expect(screen.queryByTestId('site-post')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-press')).toHaveFocus();
  });

  it('gives the focus back to the press when the post closes without Close (it could not be shown)', () => {
    const view = (isOpen: boolean) => (
      <ResourcePostPress link={LINK} siteName="instagram.com" isOpen={isOpen} onOpenChange={() => {}}>
        <button type="button">inside the post</button>
      </ResourcePostPress>
    );
    const { rerender } = render(view(true));
    screen.getByRole('button', { name: 'inside the post' }).focus();
    rerender(view(false));
    expect(screen.getByTestId('post-press')).toHaveFocus();
  });

  it('gives the focus to the card when it goes away open, with the focus in the post', () => {
    const card = (withPress: boolean) => (
      <div data-resource-card>
        <a href="/resource">Post on instagram.com</a>
        {withPress && (
          <ResourcePostPress link={LINK} siteName="instagram.com" isOpen onOpenChange={() => {}}>
            <p>post</p>
          </ResourcePostPress>
        )}
      </div>
    );
    const { rerender } = render(card(true));
    screen.getByTestId('post-press-close').focus();
    rerender(card(false));
    expect(screen.getByRole('link', { name: 'Post on instagram.com' })).toHaveFocus();
  });

  it('is no wider than the post frame while open, so Close stays at the post’s edge', () => {
    render(
      <ResourcePostPress link={LINK} siteName="instagram.com" isOpen onOpenChange={() => {}} maxWidth={658}>
        <p>post</p>
      </ResourcePostPress>,
    );
    expect(screen.getByTestId('post-press-open').style.maxWidth).toBe('658px');
  });

  it('leaves the focus alone when it is shown open or closed without a press', () => {
    const { rerender } = render(
      <ResourcePostPress link={LINK} siteName="instagram.com" isOpen={false} onOpenChange={() => {}}>
        <p>post</p>
      </ResourcePostPress>,
    );
    rerender(
      <ResourcePostPress link={LINK} siteName="instagram.com" isOpen onOpenChange={() => {}}>
        <p>post</p>
      </ResourcePostPress>,
    );
    expect(screen.getByTestId('post-press-close')).not.toHaveFocus();
  });
});
