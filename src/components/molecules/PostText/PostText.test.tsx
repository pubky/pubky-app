import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TAG_MAX_LENGTH } from '@/config/posts';
import { PostText } from './PostText';
import { TRUNCATION_LIMIT } from './PostText.constants';

// Mock next/navigation
const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock @/atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      className,
      'aria-label': ariaLabel,
      overrideDefaults,
      ...rest
    }: {
      children: React.ReactNode;
      className?: string;
      'aria-label'?: string;
      overrideDefaults?: boolean;
      [key: string]: unknown;
    }) => (
      <button data-override-defaults={overrideDefaults} className={className} aria-label={ariaLabel} {...rest}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" data-override-defaults={overrideDefaults} className={className}>
        {children}
      </div>
    ),
  };
});

// Mock @/molecules
vi.mock('@/molecules/PostCodeBlock/PostCodeBlock', () => {
  return {
    PostCodeBlock: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <code data-testid="post-code-block" className={className}>
        {children}
      </code>
    ),
  };
});

vi.mock('@/molecules/PostHashtags/PostHashtags', () => {
  return {
    PostHashtags: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
      <a data-testid="post-hashtag" href={href}>
        {children}
      </a>
    ),
  };
});

// Mock @/organisms
vi.mock('@/organisms/PostMentions/PostMentions', () => {
  return {
    PostMentions: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
      <a data-testid="post-mention" href={href}>
        {children}
      </a>
    ),
  };
});

// Helper to generate content of specific length
const generateContent = (length: number): string => {
  const base = 'Lorem ipsum dolor sit amet. ';
  let result = '';
  while (result.length < length) {
    result += base;
  }
  return result.slice(0, length);
};

describe('PostText', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/home');
  });

  describe('Basic rendering', () => {
    it('renders plain text content', () => {
      render(<PostText content="Hello, world!" />);

      expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    });

    it('renders content inside a Container', () => {
      render(<PostText content="Test content" />);

      const container = screen.getByTestId('container');
      expect(container).toBeInTheDocument();
      expect(container).toHaveAttribute('data-override-defaults', 'true');
    });

    it('renders empty content without errors', () => {
      const { container } = render(<PostText content="" />);

      expect(container).toBeInTheDocument();
    });

    it('renders multiline content', () => {
      render(<PostText content={'Line 1\nLine 2\nLine 3'} />);

      expect(screen.getByText(/Line 1/)).toBeInTheDocument();
      expect(screen.getByText(/Line 2/)).toBeInTheDocument();
      expect(screen.getByText(/Line 3/)).toBeInTheDocument();
    });
  });

  describe('Markdown formatting', () => {
    it('renders bold text with **', () => {
      render(<PostText content="This is **bold** text" />);

      const strongElement = screen.getByText('bold');
      expect(strongElement.tagName).toBe('STRONG');
    });

    it('renders italic text with *', () => {
      render(<PostText content="This is *italic* text" />);

      const emElement = screen.getByText('italic');
      expect(emElement.tagName).toBe('EM');
    });

    it('renders italic text with _', () => {
      render(<PostText content="This is _italic_ text" />);

      const emElement = screen.getByText('italic');
      expect(emElement.tagName).toBe('EM');
    });

    it('renders strikethrough text with ~~', () => {
      render(<PostText content="This is ~~deleted~~ text" />);

      const delElement = screen.getByText('deleted');
      expect(delElement.tagName).toBe('DEL');
    });

    it('renders inline code', () => {
      render(<PostText content="Use `const x = 1` for variables" />);

      const codeBlock = screen.getByTestId('post-code-block');
      expect(codeBlock).toBeInTheDocument();
      expect(codeBlock).toHaveTextContent('const x = 1');
    });

    it('renders code blocks', () => {
      render(<PostText content={'```javascript\nconst hello = "world";\n```'} />);

      const codeBlock = screen.getByTestId('post-code-block');
      expect(codeBlock).toBeInTheDocument();
    });

    it('renders italic and strikethrough on same text', () => {
      render(<PostText content="This is *~~italic and strikethrough~~* text" />);

      const textElement = screen.getByText('italic and strikethrough');
      expect(textElement.tagName).toBe('DEL');
      const parent = textElement.parentElement;
      expect(parent?.tagName).toBe('EM');
    });

    it('renders strikethrough and italic on same text', () => {
      render(<PostText content="This is ~~*strikethrough and italic*~~ text" />);

      const textElement = screen.getByText('strikethrough and italic');
      expect(textElement.tagName).toBe('EM');
      const parent = textElement.parentElement;
      expect(parent?.tagName).toBe('DEL');
    });

    it('renders italic and bold on same text', () => {
      render(<PostText content="This is ***italic and bold*** text" />);

      const textElement = screen.getByText('italic and bold');
      expect(textElement.tagName).toBe('STRONG');
      const parent = textElement.parentElement;
      expect(parent?.tagName).toBe('EM');
    });

    it('renders bold and italic on same text', () => {
      render(<PostText content="This is **_bold and italic_** text" />);

      const textElement = screen.getByText('bold and italic');
      expect(textElement.tagName).toBe('EM');
      const parent = textElement.parentElement;
      expect(parent?.tagName).toBe('STRONG');
    });

    it('renders strikethrough and inline code on same text', () => {
      render(<PostText content="This is ~~`strikethrough and code`~~ text" />);

      const codeBlock = screen.getByTestId('post-code-block');
      expect(codeBlock).toBeInTheDocument();
      expect(codeBlock).toHaveTextContent('strikethrough and code');
      const parent = codeBlock.parentElement;
      expect(parent?.tagName).toBe('DEL');
    });
  });

  describe('Links', () => {
    describe('GFM autolinks (preserved)', () => {
      it('renders auto-linked URLs from GFM', () => {
        render(<PostText content="Visit https://example.com for more info" />);

        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', 'https://example.com');
      });

      it('renders www autolinks from GFM', () => {
        render(<PostText content="Visit www.example.com for more info" />);

        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', 'http://www.example.com');
      });

      it('renders email autolinks from GFM', () => {
        render(<PostText content="Contact user@example.com for help" />);

        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', 'mailto:user@example.com');
      });

      it('renders autolinks with brand color and hover classes', () => {
        render(<PostText content="Visit https://example.com" />);

        const link = screen.getByRole('link');
        expect(link).toHaveClass('text-brand');
        expect(link).toHaveClass('cursor-pointer');
        expect(link).toHaveClass('transition-colors');
      });

      it('stops event propagation on autolink click', () => {
        const handleParentClick = vi.fn();
        render(
          <div onClick={handleParentClick}>
            <PostText content="Click https://example.com" />
          </div>,
        );

        const link = screen.getByRole('link');
        fireEvent.click(link);

        expect(handleParentClick).not.toHaveBeenCalled();
      });

      it('calls onLinkClick handler when provided and link is clicked', () => {
        const handleLinkClick = vi.fn();
        render(<PostText content="Visit https://example.com" onLinkClick={handleLinkClick} />);

        const link = screen.getByRole('link');
        fireEvent.click(link);

        expect(handleLinkClick).toHaveBeenCalledTimes(1);
        expect(handleLinkClick).toHaveBeenCalledWith('https://example.com', expect.any(Object));
      });

      it('does not call onLinkClick when not provided', () => {
        render(<PostText content="Visit https://example.com" />);

        const link = screen.getByRole('link');
        // Should not throw
        fireEvent.click(link);
      });
    });

    describe('Markdown links (disallowed)', () => {
      it('converts markdown link to plaintext', () => {
        render(<PostText content="Check out [example](https://example.com)" />);

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByText(/\[example\]\(https:\/\/example\.com\)/)).toBeInTheDocument();
      });

      it('converts deceptive markdown link to plaintext', () => {
        render(<PostText content="Visit [facebook.com](https://badsite.com)" />);

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByText(/\[facebook\.com\]\(https:\/\/badsite\.com\)/)).toBeInTheDocument();
      });

      it('converts markdown link with title to plaintext including title', () => {
        render(<PostText content='Click [here](https://example.com "My Title")' />);

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByText(/\[here\]\(https:\/\/example\.com "My Title"\)/)).toBeInTheDocument();
      });

      it('preserves surrounding text when converting markdown links', () => {
        render(<PostText content="Before [link](https://example.com) after" />);

        expect(screen.getByText(/Before/)).toBeInTheDocument();
        expect(screen.getByText(/after/)).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
      });
    });

    describe('Mixed autolinks and markdown links', () => {
      it('preserves autolinks while converting markdown links', () => {
        render(<PostText content="Visit https://good.com or [click](https://other.com)" />);

        const links = screen.getAllByRole('link');
        expect(links).toHaveLength(1);
        expect(links[0]).toHaveAttribute('href', 'https://good.com');
        expect(screen.getByText(/\[click\]\(https:\/\/other\.com\)/)).toBeInTheDocument();
      });
    });
  });

  describe('Lists', () => {
    it('renders unordered lists', () => {
      render(<PostText content={'- Item 1\n- Item 2\n- Item 3'} />);

      const list = screen.getByRole('list');
      expect(list.tagName).toBe('UL');
      expect(list).toHaveClass('list-inside', 'list-disc');

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(3);
    });

    it('renders ordered lists', () => {
      render(<PostText content={'1. First\n2. Second\n3. Third'} />);

      const list = screen.getByRole('list');
      expect(list.tagName).toBe('OL');
      expect(list).toHaveClass('list-inside', 'list-decimal');

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(3);
    });
  });

  describe('Blockquotes', () => {
    it('renders blockquotes with correct styling', () => {
      render(<PostText content="> This is a quote" />);

      const blockquote = screen.getByText('This is a quote').closest('blockquote');
      expect(blockquote).toBeInTheDocument();
      expect(blockquote).toHaveClass('border-l-4', 'border-foreground', 'pl-4');
    });
  });

  describe('Horizontal rules', () => {
    it('renders horizontal rules', () => {
      const { container } = render(<PostText content={'Before\n\n---\n\nAfter'} />);

      const hr = container.querySelector('hr');
      expect(hr).toBeInTheDocument();
    });
  });

  describe('Unwrapped disallowed elements', () => {
    it('unwraps headings but keeps content when not an article', () => {
      render(<PostText content="# Heading text" />);

      // Heading should be unwrapped but text preserved when isArticle is false/undefined
      expect(screen.getByText('Heading text')).toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('unwraps images but handles gracefully', () => {
      const { container } = render(<PostText content="![alt text](https://example.com/image.png)" />);

      // Image should be unwrapped (not rendered as img)
      const img = container.querySelector('img');
      expect(img).not.toBeInTheDocument();
    });

    it('renders unsupported tables as literal markdown text', () => {
      render(<PostText content={'| Item | Category | Price |\n| :--- | :----: | ---: |\n| Apple | Fruit | $1.00 |'} />);

      const container = screen.getByTestId('container');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(container).toHaveTextContent('| Item | Category | Price |');
      expect(container).toHaveTextContent('| :--- | :---: | ---: |');
      expect(container).toHaveTextContent('| Apple | Fruit | $1.00 |');
    });
  });

  describe('Article mode (isArticle prop)', () => {
    it('renders feed preview copy with the secondary foreground color', () => {
      render(<PostText content="Article preview copy" isArticle />);

      expect(screen.getByTestId('container')).toHaveClass('text-secondary-foreground');
      expect(screen.getByTestId('container')).not.toHaveClass('text-muted-foreground');
    });

    it('renders h1 heading when isArticle is true', () => {
      render(<PostText content="# Heading 1" isArticle />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Heading 1');
    });

    it('renders h2 heading when isArticle is true', () => {
      render(<PostText content="## Heading 2" isArticle />);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Heading 2');
    });

    it('renders h3 heading when isArticle is true', () => {
      render(<PostText content="### Heading 3" isArticle />);

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Heading 3');
    });

    it('renders h4 heading when isArticle is true', () => {
      render(<PostText content="#### Heading 4" isArticle />);

      const heading = screen.getByRole('heading', { level: 4 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Heading 4');
    });

    it('renders h5 heading when isArticle is true', () => {
      render(<PostText content="##### Heading 5" isArticle />);

      const heading = screen.getByRole('heading', { level: 5 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Heading 5');
    });

    it('renders h6 heading when isArticle is true', () => {
      render(<PostText content="###### Heading 6" isArticle />);

      const heading = screen.getByRole('heading', { level: 6 });
      expect(heading).toBeInTheDocument();
      expect(heading).toHaveTextContent('Heading 6');
    });

    it('renders multiple heading levels in article', () => {
      render(<PostText content={'# Title\n## Section\n### Subsection'} isArticle />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Section');
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Subsection');
    });

    it('does not show "Show more" button in article mode when content exceeds the character limit', () => {
      const longContent = generateContent(600);
      render(<PostText content={longContent} isArticle />);

      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('truncates content in article mode without Show more', () => {
      const longContent = generateContent(600);
      const { container } = render(<PostText content={longContent} isArticle />);

      expect(container.textContent).toContain('...');
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('truncates article previews at 300 characters across paragraphs', () => {
      const firstParagraph = 'a'.repeat(160);
      const secondParagraph = 'b'.repeat(160);
      render(<PostText content={`${firstParagraph}\n\n${secondParagraph}\n\nhidden`} isArticle />);

      expect(screen.getByText(firstParagraph)).toBeInTheDocument();
      expect(screen.queryByText('hidden')).not.toBeInTheDocument();
      expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('shows heading and first paragraph of article in feed', () => {
      render(<PostText content={`# Title\n\nFirst paragraph text.\n\nSecond paragraph text.`} isArticle />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
      expect(screen.getByText('First paragraph text.')).toBeInTheDocument();
      expect(screen.getByText('Second paragraph text.')).toBeInTheDocument();
    });

    it('keeps article code blocks between paragraphs in feed previews', () => {
      render(<PostText content={`Para 1\n\n\`\`\`js\nconst value = 1;\n\`\`\`\n\nPara 2`} isArticle />);

      expect(screen.getByText('Para 1')).toBeInTheDocument();
      expect(screen.getByTestId('post-code-block')).toHaveTextContent('const value = 1;');
      expect(screen.getByText('Para 2')).toBeInTheDocument();
    });

    it('keeps article blockquotes between paragraphs in feed previews', () => {
      render(<PostText content={`Para 1\n\n> Quoted text\n\nPara 2`} isArticle />);

      expect(screen.getByText('Para 1')).toBeInTheDocument();
      expect(screen.getByText('Quoted text')).toBeInTheDocument();
      expect(screen.getByText('Para 2')).toBeInTheDocument();
    });

    it('does not show Show more when article blank separators exceed source lines but rendered blocks fit', () => {
      render(<PostText content={`# Title\n\nPara A\n\nPara B\n\nPara C`} isArticle />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
      expect(screen.getByText('Para C')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('does not show Show more when article markdown syntax pushes raw text over the character limit', () => {
      const content = `[${'a'.repeat(250)}](https://${'b'.repeat(120)}.com)`;
      render(<PostText content={content} isArticle />);

      expect(screen.getByText('a'.repeat(250))).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('shows full article content on post page', () => {
      mockUsePathname.mockReturnValue('/post/some-post-id');
      render(<PostText content={`# Title\n\nFirst paragraph text.\n\nSecond paragraph text.`} isArticle />);

      expect(screen.getByText('First paragraph text.')).toBeInTheDocument();
      expect(screen.getByText('Second paragraph text.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
    });

    it('does not truncate article content on post page', () => {
      mockUsePathname.mockReturnValue('/post/some-post-id');
      const longContent = generateContent(600);
      render(<PostText content={longContent} isArticle />);

      // On post page, the plugin is a no-op, so full content renders
      expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
    });

    it('truncates article paragraphs over the source-line limit in feed without Show more', () => {
      const content = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6', 'Line 7'].join('\n');
      const { container } = render(<PostText content={content} isArticle />);

      expect(container.textContent).toContain('Line 6...');
      expect(container.textContent).not.toContain('Line 7');
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('truncates list-only article previews to six top-level list items', () => {
      const content = ['- Item 1', '- Item 2', '- Item 3', '- Item 4', '- Item 5', '- Item 6', '- Item 7'].join('\n');
      render(<PostText content={content} isArticle />);

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(6);
      expect(items[5]).toHaveTextContent('Item 6...');
      expect(screen.queryByText('Item 7')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('truncates heading and list article previews without Show more', () => {
      const content = [
        '# Changelog 1.6.0',
        '- Feature 1',
        '- Feature 2',
        '- Feature 3',
        '- Feature 4',
        '- Feature 5',
        '- Feature 6',
      ].join('\n');
      render(<PostText content={content} isArticle />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Changelog 1.6.0');
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(5);
      expect(items[4]).toHaveTextContent('Feature 5...');
      expect(screen.queryByText('Feature 6')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('truncates article previews that only contain a long code block', () => {
      const content = ['```js', 'Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6', 'Line 7', '```'].join('\n');
      const { container } = render(<PostText content={content} isArticle />);

      expect(container.textContent).toContain('Line 6...');
      expect(container.textContent).not.toContain('Line 7');
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('does not truncate list-only article content on post page', () => {
      mockUsePathname.mockReturnValue('/post/some-post-id');
      const content = ['- Item 1', '- Item 2', '- Item 3', '- Item 4', '- Item 5', '- Item 6', '- Item 7'].join('\n');
      render(<PostText content={content} isArticle />);

      expect(screen.getAllByRole('listitem')).toHaveLength(7);
      expect(screen.getByText('Item 7')).toBeInTheDocument();
    });

    it('allows markdown links when isArticle is true', () => {
      render(<PostText content="Check out [example](https://example.com)" isArticle />);

      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveTextContent('example');
    });
  });

  describe('className prop', () => {
    it('passes custom className to Container', () => {
      render(<PostText content="Test content" className="custom-class" />);

      const container = screen.getByTestId('container');
      expect(container).toHaveClass('custom-class');
    });

    it('merges custom className with default classes', () => {
      render(<PostText content="Test content" className="my-custom-class" />);

      const container = screen.getByTestId('container');
      expect(container).toHaveClass('my-custom-class');
      // Should also have default classes
      expect(container.className).toContain('text-base');
    });
  });

  describe('Hashtags', () => {
    it('renders hashtag as PostHashtags component', () => {
      render(<PostText content="Check out #bitcoin" />);

      const hashtag = screen.getByTestId('post-hashtag');
      expect(hashtag).toHaveTextContent('#bitcoin');
      expect(hashtag).toHaveAttribute('href', '/search?tags=bitcoin');
    });

    it('renders hashtag at start of content', () => {
      render(<PostText content="#trending is popular" />);

      const hashtag = screen.getByTestId('post-hashtag');
      expect(hashtag).toHaveTextContent('#trending');
    });

    it('renders hashtag at end of content', () => {
      render(<PostText content="This is about #crypto" />);

      const hashtag = screen.getByTestId('post-hashtag');
      expect(hashtag).toHaveTextContent('#crypto');
    });

    it('renders multiple hashtags', () => {
      render(<PostText content="#one #two #three" />);

      const hashtags = screen.getAllByTestId('post-hashtag');
      expect(hashtags).toHaveLength(3);
      expect(hashtags[0]).toHaveTextContent('#one');
      expect(hashtags[1]).toHaveTextContent('#two');
      expect(hashtags[2]).toHaveTextContent('#three');
    });

    it('renders hashtags alongside autolinks', () => {
      render(<PostText content="Visit https://example.com and check #topic" />);

      const links = screen.getAllByRole('link');
      const autolink = links.find((link) => link.getAttribute('href') === 'https://example.com');
      expect(autolink).toBeInTheDocument();
      expect(screen.getByTestId('post-hashtag')).toHaveTextContent('#topic');
    });

    it('renders hashtags with underscores', () => {
      render(<PostText content="Check #hello_world tag" />);

      const hashtag = screen.getByTestId('post-hashtag');
      expect(hashtag).toHaveTextContent('#hello_world');
    });

    it('renders hashtags with hyphens', () => {
      render(<PostText content="Check #hello-world tag" />);

      const hashtag = screen.getByTestId('post-hashtag');
      expect(hashtag).toHaveTextContent('#hello-world');
    });

    it('renders hashtags with mixed hyphens and underscores', () => {
      render(<PostText content="Check #hello-world_test tag" />);

      const hashtag = screen.getByTestId('post-hashtag');
      expect(hashtag).toHaveTextContent('#hello-world_test');
    });

    it('renders hashtags with spec-allowed symbols (@ ? ; * ")', () => {
      render(<PostText content="Tags #foo@bar #what? #semi;colon #star*tag" />);

      const hashtags = screen.getAllByTestId('post-hashtag');
      expect(hashtags).toHaveLength(4);
      expect(hashtags[0]).toHaveTextContent('#foo@bar');
      expect(hashtags[1]).toHaveTextContent('#what?');
      expect(hashtags[2]).toHaveTextContent('#semi;colon');
      expect(hashtags[3]).toHaveTextContent('#star*tag');
    });

    it('renders hashtags with numbers', () => {
      render(<PostText content="Check #web3 tag" />);

      const hashtag = screen.getByTestId('post-hashtag');
      expect(hashtag).toHaveTextContent('#web3');
    });

    it('parses hashtag starting with number', () => {
      render(<PostText content="This is #123numeric" />);

      const hashtag = screen.getByTestId('post-hashtag');
      expect(hashtag).toHaveTextContent('#123numeric');
    });

    it('renders hashtags mixed with markdown formatting', () => {
      render(<PostText content="This is **bold** and #hashtag text" />);

      expect(screen.getByText('bold').tagName).toBe('STRONG');
      expect(screen.getByTestId('post-hashtag')).toHaveTextContent('#hashtag');
    });

    it('does not render overlong hashtag as PostHashtags link', () => {
      const label = 'a'.repeat(TAG_MAX_LENGTH + 1);
      const content = `Intro #${label} outro`;
      const { container } = render(<PostText content={content} />);

      expect(screen.queryByTestId('post-hashtag')).not.toBeInTheDocument();
      expect(container.textContent).toContain(`#${label}`);
    });

    it('does not render inline hash without whitespace boundary as PostHashtags link', () => {
      const { container } = render(<PostText content="Hello#Notatag" />);

      expect(screen.queryByTestId('post-hashtag')).not.toBeInTheDocument();
      expect(container.textContent).toBe('Hello#Notatag');
    });
  });

  describe('Mentions', () => {
    const validPkMention = 'pk:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';
    const validPubkyMention = 'pubky8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';

    it('renders mention as PostMentions component with pk: prefix', () => {
      render(<PostText content={`Check out ${validPkMention}`} />);

      const mention = screen.getByTestId('post-mention');
      expect(mention).toHaveTextContent(validPkMention);
      expect(mention).toHaveAttribute('href', '/profile/8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo');
    });

    it('renders mention as PostMentions component with pubky prefix', () => {
      render(<PostText content={`Check out ${validPubkyMention}`} />);

      const mention = screen.getByTestId('post-mention');
      expect(mention).toHaveTextContent(validPubkyMention);
      expect(mention).toHaveAttribute('href', '/profile/8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo');
    });

    it('renders mention at start of content', () => {
      render(<PostText content={`${validPkMention} is a great user`} />);

      const mention = screen.getByTestId('post-mention');
      expect(mention).toHaveTextContent(validPkMention);
    });

    it('renders mention at end of content', () => {
      render(<PostText content={`Check out this user ${validPkMention}`} />);

      const mention = screen.getByTestId('post-mention');
      expect(mention).toHaveTextContent(validPkMention);
    });

    it('renders multiple mentions', () => {
      const secondMention = 'pk:7qinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';
      render(<PostText content={`${validPkMention} and ${secondMention}`} />);

      const mentions = screen.getAllByTestId('post-mention');
      expect(mentions).toHaveLength(2);
      expect(mentions[0]).toHaveTextContent(validPkMention);
      expect(mentions[1]).toHaveTextContent(secondMention);
    });

    it('renders mentions alongside autolinks', () => {
      render(<PostText content={`Visit https://example.com and follow ${validPkMention}`} />);

      const links = screen.getAllByRole('link');
      const autolink = links.find((link) => link.getAttribute('href') === 'https://example.com');
      expect(autolink).toBeInTheDocument();
      expect(screen.getByTestId('post-mention')).toHaveTextContent(validPkMention);
    });

    it('renders mentions alongside hashtags', () => {
      render(<PostText content={`${validPkMention} loves #bitcoin`} />);

      expect(screen.getByTestId('post-mention')).toHaveTextContent(validPkMention);
      expect(screen.getByTestId('post-hashtag')).toHaveTextContent('#bitcoin');
    });

    it('does not parse invalid mention with short key', () => {
      render(<PostText content="This is pk:short not a mention" />);

      expect(screen.queryByTestId('post-mention')).not.toBeInTheDocument();
    });

    it('renders mentions mixed with markdown formatting', () => {
      render(<PostText content={`This is **bold** and ${validPkMention} text`} />);

      expect(screen.getByText('bold').tagName).toBe('STRONG');
      expect(screen.getByTestId('post-mention')).toHaveTextContent(validPkMention);
    });
  });

  describe('GFM (GitHub Flavored Markdown) features', () => {
    it('renders task lists as regular lists (checkboxes unwrapped)', () => {
      render(<PostText content={'- [ ] Todo\n- [x] Done'} />);

      // Task list items should render as list items (checkboxes unwrapped)
      const items = screen.getAllByRole('listitem');
      expect(items.length).toBeGreaterThan(0);
    });

    it('renders autolinked URLs', () => {
      render(<PostText content="Check out www.example.com" />);

      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
    });
  });

  describe('Content truncation and Show more button', () => {
    it('does not truncate content under TRUNCATION_LIMIT characters', () => {
      const shortContent = generateContent(TRUNCATION_LIMIT - 100);
      render(<PostText content={shortContent} />);

      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
      expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
    });

    it('truncates content over TRUNCATION_LIMIT characters and shows "Show more" button', () => {
      const longContent = generateContent(600);
      render(<PostText content={longContent} />);

      const showMoreButton = screen.getByRole('button', { name: 'Show full post content' });
      expect(showMoreButton).toBeInTheDocument();
    });

    it('shows truncated content with ellipsis when over TRUNCATION_LIMIT characters', () => {
      const longContent = generateContent(600);
      render(<PostText content={longContent} />);

      // The truncated content should be TRUNCATION_LIMIT chars + "..." + non-breaking space
      // Original content beyond TRUNCATION_LIMIT chars should not be present
      const originalEndText = longContent.slice(TRUNCATION_LIMIT - 5, TRUNCATION_LIMIT + 5);
      expect(screen.queryByText(originalEndText)).not.toBeInTheDocument();
    });

    it('truncates content under TRUNCATION_LIMIT characters when over the source-line limit', () => {
      const content = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6', 'Line 7'].join('\n');
      const { container } = render(<PostText content={content} />);

      expect(screen.getByRole('button', { name: 'Show full post content' })).toBeInTheDocument();
      expect(container.textContent).toContain('Line 6...');
      expect(container.textContent).not.toContain('Line 7');
    });

    it('does not truncate when normal post only exceeds the line limit through trailing blank lines', () => {
      const content = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6', '', ''].join('\n');
      render(<PostText content={content} />);

      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
      expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
    });

    it('does not show Show more when fenced code delimiters push raw lines over the line limit', () => {
      const content = ['This text', '', '```ad', '', '', 'da', '```'].join('\n');
      render(<PostText content={content} />);

      expect(screen.getByText('This text')).toBeInTheDocument();
      expect(screen.getByTestId('post-code-block')).toHaveTextContent('da');
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
      expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
    });

    it('does not show Show more when blank markdown separators push raw lines over the line limit', () => {
      const content = ['ad', '', '', '', '', '', 'da'].join('\n');
      render(<PostText content={content} />);

      expect(screen.getByText('ad')).toBeInTheDocument();
      expect(screen.getByText('da')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
      expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument();
    });

    it('does not truncate on post detail page', () => {
      mockUsePathname.mockReturnValue('/post/some-post-id');
      const longContent = generateContent(600);
      render(<PostText content={longContent} />);

      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('does not truncate line-heavy content on post detail page', () => {
      mockUsePathname.mockReturnValue('/post/some-post-id');
      const content = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6', 'Line 7'].join('\n');
      render(<PostText content={content} />);

      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
      expect(screen.getByText(/Line 7/)).toBeInTheDocument();
    });

    it('does not truncate on nested post routes', () => {
      mockUsePathname.mockReturnValue('/post/author/123');
      const longContent = generateContent(600);
      render(<PostText content={longContent} />);

      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
    });

    it('truncates on non-post pages like home', () => {
      mockUsePathname.mockReturnValue('/home');
      const longContent = generateContent(600);
      render(<PostText content={longContent} />);

      expect(screen.getByRole('button', { name: 'Show full post content' })).toBeInTheDocument();
    });

    it('truncates on search page', () => {
      mockUsePathname.mockReturnValue('/search');
      const longContent = generateContent(600);
      render(<PostText content={longContent} />);

      expect(screen.getByRole('button', { name: 'Show full post content' })).toBeInTheDocument();
    });

    it('truncates on profile page', () => {
      mockUsePathname.mockReturnValue('/profile/some-user-id');
      const longContent = generateContent(600);
      render(<PostText content={longContent} />);

      expect(screen.getByRole('button', { name: 'Show full post content' })).toBeInTheDocument();
    });

    it('renders "Show more" button with correct styling classes', () => {
      const longContent = generateContent(600);
      render(<PostText content={longContent} />);

      const showMoreButton = screen.getByRole('button', { name: 'Show full post content' });
      expect(showMoreButton).not.toHaveAttribute('data-allow-post-navigation');
      expect(showMoreButton).toHaveAttribute('type', 'button');
      expect(showMoreButton).toHaveClass('cursor-pointer');
      expect(showMoreButton).toHaveClass('text-brand');
      expect(showMoreButton).toHaveClass('mt-4');
    });

    it('expands truncated content in place and stops event propagation on "Show more" click', () => {
      const handleParentClick = vi.fn();
      const uniqueTail = ' UNIQUE_EXPAND_TAIL_MARKER';
      const longContent = `${generateContent(600)}${uniqueTail}`;
      const { container } = render(
        <div onClick={handleParentClick}>
          <PostText content={longContent} />
        </div>,
      );

      expect(container.textContent).not.toContain(uniqueTail);

      fireEvent.click(screen.getByRole('button', { name: 'Show full post content' }));

      expect(handleParentClick).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
      expect(container.textContent).toContain(uniqueTail);
    });

    it('expands line-truncated content in place on "Show more" click', () => {
      const content = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6', 'Line 7'].join('\n');
      const { container } = render(<PostText content={content} />);

      expect(container.textContent).not.toContain('Line 7');

      fireEvent.click(screen.getByRole('button', { name: 'Show full post content' }));

      expect(screen.queryByRole('button', { name: 'Show full post content' })).not.toBeInTheDocument();
      expect(container.textContent).toContain('Line 7');
    });

    it('truncates content exactly at TRUNCATION_LIMIT characters plus ellipsis', () => {
      const longContent = generateContent(600);
      const { container } = render(<PostText content={longContent} />);

      // The displayed text should contain the first 500 chars
      const expectedStart = longContent.slice(0, 100);
      expect(container.textContent).toContain(expectedStart);
    });
  });
});

describe('PostText - Snapshots', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/home');
  });

  it('matches snapshot for plain text', () => {
    const { container } = render(<PostText content="Simple plain text content" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for bold and italic text', () => {
    const { container } = render(<PostText content="This is **bold** and *italic* text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for strikethrough text', () => {
    const { container } = render(<PostText content="This is ~~strikethrough~~ text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for inline code', () => {
    const { container } = render(<PostText content="Use `console.log()` for debugging" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for code block', () => {
    const { container } = render(
      <PostText
        content={`\`\`\`javascript
const greeting = "Hello";
console.log(greeting);
\`\`\``}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for code block without language', () => {
    const { container } = render(
      <PostText
        content={`\`\`\`
plain code block
\`\`\``}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for autolinked URL', () => {
    const { container } = render(<PostText content="Check out https://example.com for more" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for markdown link converted to plaintext', () => {
    const { container } = render(<PostText content="Check out [Example](https://example.com) for more" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for deceptive link converted to plaintext', () => {
    const { container } = render(<PostText content="Visit [facebook.com](https://badsite.com) now" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for unordered list', () => {
    const { container } = render(<PostText content={'- Apple\n- Banana\n- Cherry'} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ordered list', () => {
    const { container } = render(<PostText content={'1. First item\n2. Second item\n3. Third item'} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for blockquote', () => {
    const { container } = render(<PostText content="> This is a quoted message" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for nested blockquote', () => {
    const { container } = render(<PostText content={'> Level 1\n>> Level 2'} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for horizontal rule', () => {
    const { container } = render(<PostText content={'Above the line\n\n---\n\nBelow the line'} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for combined markdown elements', () => {
    mockUsePathname.mockReturnValue('/post/some-post-id');
    const { container } = render(
      <PostText
        content={`# Welcome

This is **bold** and *italic* text with a link https://example.com here.

> A meaningful quote

- Item one
- Item two

\`\`\`js
const x = 42;
\`\`\`

Use \`inline code\` for variables.`}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for empty content', () => {
    const { container } = render(<PostText content="" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for content with special characters', () => {
    const { container } = render(<PostText content={'Special chars: <>&"\' and emoji: 🎉🚀'} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for multiline content with line breaks', () => {
    const { container } = render(
      <PostText
        content={`First line
Second line
Third line`}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for autolinked URL with path and query', () => {
    const { container } = render(<PostText content="Check out https://example.com/path?query=value" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for www autolink', () => {
    const { container } = render(<PostText content="Visit www.example.com today" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for email autolink', () => {
    const { container } = render(<PostText content="Contact user@example.com for help" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for italic and strikethrough combination', () => {
    const { container } = render(<PostText content="This is *~~italic and strikethrough~~* text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for strikethrough and italic combination', () => {
    const { container } = render(<PostText content="This is ~~*strikethrough and italic*~~ text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for italic and bold combination', () => {
    const { container } = render(<PostText content="This is ***italic and bold*** text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for bold and italic combination', () => {
    const { container } = render(<PostText content="This is **_bold and italic_** text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for strikethrough and inline code combination', () => {
    const { container } = render(<PostText content="This is ~~`strikethrough and code`~~ text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for single hashtag', () => {
    const { container } = render(<PostText content="Check out #bitcoin" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for multiple hashtags', () => {
    const { container } = render(<PostText content="#one #two #three" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for hashtag with text', () => {
    const { container } = render(<PostText content="This post is about #crypto and #blockchain technology" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for hashtag alongside autolink', () => {
    const { container } = render(<PostText content="Visit https://example.com and follow #trending" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for hashtag with markdown formatting', () => {
    const { container } = render(<PostText content="This is **bold** with #hashtag and *italic* text" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for long hashtag', () => {
    const { container } = render(
      <PostText content="Check out this #verylooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooonghashtagwithlotsofcharactersandnumbers123456789 tag" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for hashtag with underscores', () => {
    const { container } = render(<PostText content="Check out #hello_world tag" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for hashtag with hyphens', () => {
    const { container } = render(<PostText content="Check out #hello-world tag" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for hashtag with mixed hyphens and underscores', () => {
    const { container } = render(<PostText content="Check out #hello-world_test tag" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for single mention with pk: prefix', () => {
    const { container } = render(
      <PostText content="Check out pk:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for single mention with pubky prefix', () => {
    const { container } = render(
      <PostText content="Check out pubky8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for multiple mentions', () => {
    const { container } = render(
      <PostText content="pk:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo and pk:7qinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for mention with text', () => {
    const { container } = render(
      <PostText content="This post mentions pk:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo in the middle" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for mention alongside hashtag', () => {
    const { container } = render(
      <PostText content="pk:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo loves #bitcoin" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for mention alongside autolink', () => {
    const { container } = render(
      <PostText content={`Check pk:o1gg96ewuojmopcjbz8895478wench6tjmjh6kiwgbwycb35ory and https://example.com`} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for mention with markdown formatting', () => {
    const { container } = render(
      <PostText content="This is **bold** with pk:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo and *italic* text" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for truncated content with Show more button', () => {
    const longContent =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Extra text to make this longer than 500 characters for truncation testing purposes.';
    const { container } = render(<PostText content={longContent} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for non-truncated long content on post page', () => {
    mockUsePathname.mockReturnValue('/post/some-post-id');
    const longContent =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Extra text to make this longer than 500 characters for truncation testing purposes.';
    const { container } = render(<PostText content={longContent} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for article with h1 heading', () => {
    const { container } = render(<PostText content="# Main Title" isArticle />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for article preview with multiple headings', () => {
    const { container } = render(
      <PostText
        content={`# Article Title

## Introduction

Some introductory text here.

### Details

More detailed content.

#### Sub-details

Even more specific information.`}
        isArticle
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for article preview with long content', () => {
    const longContent =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Extra text to make this longer than 500 characters for truncation testing purposes.';
    const { container } = render(<PostText content={longContent} isArticle />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for article preview with headings and paragraphs', () => {
    const { container } = render(
      <PostText
        content={`# Article Title\n\nThis is the introduction paragraph.\n\n## Section\n\nMore content here.`}
        isArticle
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for article showing full content on post page', () => {
    mockUsePathname.mockReturnValue('/post/some-post-id');
    const { container } = render(
      <PostText
        content={`# Article Title\n\nThis is the introduction paragraph.\n\n## Section\n\nMore content here.`}
        isArticle
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<PostText content="Content with custom class" className="my-custom-class" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
