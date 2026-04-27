import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PostCodeBlock } from './PostCodeBlock';

// Mock only copyToClipboard from @/libs (uses browser Clipboard API)
// Keep real implementations of pure functions like cn
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    copyToClipboard: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock @/atoms
vi.mock('@/atoms', () => ({
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
  Button: ({
    children,
    onClick,
    variant,
    size,
    className,
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button data-testid="copy-button" data-variant={variant} data-size={size} className={className} onClick={onClick}>
      {children}
    </button>
  ),
  Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => (
    <span data-testid="typography" data-size={size} className={className}>
      {children}
    </span>
  ),
}));

// Using real react-syntax-highlighter to test actual rendering behavior
// This is a deterministic rendering library with no side effects

// Import the mocked module to access the mock function
import * as Libs from '@/libs';

describe('PostCodeBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Inline code (no language)', () => {
    it('renders inline code when no language class is provided', () => {
      render(<PostCodeBlock>const x = 1;</PostCodeBlock>);

      const codeElement = screen.getByText('const x = 1;');
      expect(codeElement.tagName).toBe('CODE');
    });

    it('renders inline code with correct styling classes', () => {
      render(<PostCodeBlock>inline code</PostCodeBlock>);

      const codeElement = screen.getByText('inline code');
      expect(codeElement).toHaveClass(
        'rounded',
        'border',
        'border-white/10',
        'bg-neutral-800',
        'px-1',
        'font-mono',
        'text-orange-500',
      );
    });

    it('preserves existing className for inline code', () => {
      render(<PostCodeBlock className="custom-class">code</PostCodeBlock>);

      const codeElement = screen.getByText('code');
      expect(codeElement).toHaveClass('custom-class');
    });

    it('passes additional props to inline code element', () => {
      render(<PostCodeBlock data-custom="value">code</PostCodeBlock>);

      const codeElement = screen.getByText('code');
      expect(codeElement).toHaveAttribute('data-custom', 'value');
    });
  });

  describe('Code block with language', () => {
    it('renders syntax highlighter when language class is provided', () => {
      const { container } = render(<PostCodeBlock className="language-javascript">const x = 1;</PostCodeBlock>);

      // With real syntax highlighter, code is rendered in a pre > code structure
      // Text is split across multiple span elements for syntax highlighting
      const codeElement = container.querySelector('code.language-javascript');
      expect(codeElement).toBeInTheDocument();
      expect(codeElement?.textContent).toContain('const');
      expect(codeElement?.textContent).toContain('x');
      expect(codeElement?.textContent).toContain('1');
    });

    it('renders code block with container wrapper', () => {
      const { container } = render(<PostCodeBlock className="language-typescript">const x: number = 1;</PostCodeBlock>);

      const containers = screen.getAllByTestId('container');
      expect(containers.length).toBeGreaterThan(0);

      // Text is split across spans, so check the code element's full text content
      const codeElement = container.querySelector('code');
      expect(codeElement?.textContent).toContain('const');
      expect(codeElement?.textContent).toContain('number');
    });

    it('displays language name in header', () => {
      render(<PostCodeBlock className="language-python">{'print("hello")'}</PostCodeBlock>);

      expect(screen.getByText('python')).toBeInTheDocument();
    });

    it('displays copy button with clipboard icon', () => {
      render(<PostCodeBlock className="language-rust">fn main() {}</PostCodeBlock>);

      const copyButton = screen.getByTestId('copy-button');
      expect(copyButton.querySelector('.lucide-clipboard')).toBeInTheDocument();
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('strips trailing newline from code content', () => {
      const { container } = render(<PostCodeBlock className="language-javascript">{'const x = 1;\n'}</PostCodeBlock>);

      // The trailing newline should be stripped
      const codeElement = container.querySelector('code');
      expect(codeElement?.textContent?.endsWith('\n')).toBe(false);
    });

    it('parses various language classes correctly', () => {
      const languages = ['javascript', 'typescript', 'python', 'rust', 'go', 'java', 'cpp'];

      languages.forEach((lang) => {
        const { unmount, container } = render(<PostCodeBlock className={`language-${lang}`}>code</PostCodeBlock>);

        // With real syntax highlighter, verify code block renders with proper structure
        // The syntax highlighter renders a div > code structure
        const codeElement = container.querySelector('code');
        expect(codeElement).toBeInTheDocument();
        expect(codeElement?.textContent).toContain('code');

        unmount();
      });
    });

    it('renders code block with responsive max-width classes', () => {
      render(<PostCodeBlock className="language-javascript">code</PostCodeBlock>);

      const containers = screen.getAllByTestId('container');
      const outerContainer = containers[0];
      expect(outerContainer).toHaveClass('max-w-69.5');
    });

    it('renders syntax highlighted code with proper structure', () => {
      const { container } = render(<PostCodeBlock className="language-javascript">const x = 1;</PostCodeBlock>);

      // Real syntax highlighter renders with div containing code element
      const codeElement = container.querySelector('code');
      expect(codeElement).toBeInTheDocument();

      // Should have syntax highlighting class applied
      expect(codeElement).toHaveClass('language-javascript');
    });

    it('applies syntax highlighting to code tokens', () => {
      const { container } = render(
        <PostCodeBlock className="language-javascript">{'const greeting = "hello";'}</PostCodeBlock>,
      );

      // Real syntax highlighter creates span elements for tokens inside code element
      const spans = container.querySelectorAll('code span');
      expect(spans.length).toBeGreaterThan(0);
    });
  });

  describe('Copy functionality', () => {
    it('calls copyToClipboard when copy button is clicked', async () => {
      render(<PostCodeBlock className="language-javascript">const x = 1;</PostCodeBlock>);

      const copyButton = screen.getByTestId('copy-button');
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(Libs.copyToClipboard).toHaveBeenCalledWith({ text: 'const x = 1;' });
    });

    it('shows check icon and "Copied!" text after successful copy', async () => {
      render(<PostCodeBlock className="language-javascript">code</PostCodeBlock>);

      const copyButton = screen.getByTestId('copy-button');
      await act(async () => {
        fireEvent.click(copyButton);
      });

      const copyBtnAfter = screen.getByTestId('copy-button');
      expect(copyBtnAfter.querySelector('.lucide-check')).toBeInTheDocument();
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    it('reverts to clipboard icon after 2 seconds', async () => {
      render(<PostCodeBlock className="language-javascript">code</PostCodeBlock>);

      const copyButton = screen.getByTestId('copy-button');
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(screen.getByTestId('copy-button').querySelector('.lucide-check')).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByTestId('copy-button').querySelector('.lucide-clipboard')).toBeInTheDocument();
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('does not call copyToClipboard again while in copied state', async () => {
      render(<PostCodeBlock className="language-javascript">code</PostCodeBlock>);

      const copyButton = screen.getByTestId('copy-button');

      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(Libs.copyToClipboard).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(Libs.copyToClipboard).toHaveBeenCalledTimes(1);
    });

    it('allows copying again after timeout resets state', async () => {
      render(<PostCodeBlock className="language-javascript">code</PostCodeBlock>);

      const copyButton = screen.getByTestId('copy-button');

      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(Libs.copyToClipboard).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(Libs.copyToClipboard).toHaveBeenCalledTimes(2);
    });

    it('stops event propagation when clicking copy button', async () => {
      const handleParentClick = vi.fn();

      render(
        <div onClick={handleParentClick}>
          <PostCodeBlock className="language-javascript">code</PostCodeBlock>
        </div>,
      );

      const copyButton = screen.getByTestId('copy-button');
      await act(async () => {
        fireEvent.click(copyButton);
      });

      expect(handleParentClick).not.toHaveBeenCalled();
    });

    it('handles copyToClipboard failure gracefully', async () => {
      vi.mocked(Libs.copyToClipboard).mockRejectedValueOnce(new Error('Copy failed'));

      render(<PostCodeBlock className="language-javascript">code</PostCodeBlock>);

      const copyButton = screen.getByTestId('copy-button');

      // Should not throw
      await act(async () => {
        fireEvent.click(copyButton);
      });

      // Should still show clipboard icon (not changed to check)
      expect(copyButton.querySelector('.lucide-clipboard')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles empty children', () => {
      const { container } = render(<PostCodeBlock className="language-javascript">{''}</PostCodeBlock>);

      // Even with empty content, syntax highlighter should render
      const codeElement = container.querySelector('code');
      expect(codeElement).toBeInTheDocument();
    });

    it('handles undefined className', () => {
      render(<PostCodeBlock>code</PostCodeBlock>);

      // Should render inline code
      const codeElement = screen.getByText('code');
      expect(codeElement.tagName).toBe('CODE');
    });

    it('handles multiline code content', () => {
      const multilineCode = `function hello() {
  console.log("Hello");
  return true;
}`;

      const { container } = render(<PostCodeBlock className="language-javascript">{multilineCode}</PostCodeBlock>);

      const codeElement = container.querySelector('code');
      expect(codeElement?.textContent).toContain('function');
      expect(codeElement?.textContent).toContain('hello');
      expect(codeElement?.textContent).toContain('console');
    });

    it('handles code with special characters', () => {
      const { container } = render(
        <PostCodeBlock className="language-markup">{'<div class="test">&amp;</div>'}</PostCodeBlock>,
      );

      // Real syntax highlighter should render the code element
      const codeElement = container.querySelector('code');
      expect(codeElement).toBeInTheDocument();
      expect(codeElement?.textContent).toContain('<div');
    });
  });
});

describe('PostCodeBlock - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for inline code', () => {
    const { container } = render(<PostCodeBlock>const x = 1;</PostCodeBlock>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for inline code with custom className', () => {
    const { container } = render(<PostCodeBlock className="custom-inline">code</PostCodeBlock>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for JavaScript code block', () => {
    const { container } = render(
      <PostCodeBlock className="language-javascript">{`const greeting = "Hello World";
console.log(greeting);`}</PostCodeBlock>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for TypeScript code block', () => {
    const { container } = render(
      <PostCodeBlock className="language-typescript">{`interface User {
  name: string;
  age: number;
}`}</PostCodeBlock>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Python code block', () => {
    const { container } = render(
      <PostCodeBlock className="language-python">{`def hello():
    print("Hello, World!")
    return True`}</PostCodeBlock>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for code block with single line', () => {
    const { container } = render(<PostCodeBlock className="language-rust">fn main() {}</PostCodeBlock>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for code block with trailing newline stripped', () => {
    const { container } = render(<PostCodeBlock className="language-go">{'package main\n'}</PostCodeBlock>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for empty code block', () => {
    const { container } = render(<PostCodeBlock className="language-javascript">{''}</PostCodeBlock>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for code with special characters', () => {
    const { container } = render(
      <PostCodeBlock className="language-html">{'<div class="container">&nbsp;</div>'}</PostCodeBlock>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for inline code with empty content', () => {
    const { container } = render(<PostCodeBlock>{''}</PostCodeBlock>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
