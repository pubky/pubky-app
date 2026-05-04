import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import type { MDXEditorMethods } from '@mdxeditor/editor';
import { MarkdownEditor } from './MarkdownEditor';

interface DynamicOptions {
  ssr?: boolean;
  loading?: () => React.ReactNode;
}

interface MockEditorProps {
  editorRef?: React.Ref<MDXEditorMethods>;
  className?: string;
  markdown?: string;
  placeholder?: string;
  onChange?: (markdown: string) => void;
  [key: string]: unknown;
}

// Mock next/dynamic to test the loading state and dynamic import behavior
vi.mock('next/dynamic', () => ({
  default: vi.fn((_importFn: () => Promise<unknown>, options?: DynamicOptions) => {
    // Return a component that renders the loading state for testing
    const MockDynamicComponent = (props: MockEditorProps) => {
      // Filter out non-DOM props to prevent React warnings
      const { editorRef, onChange, markdown, placeholder, ...domProps } = props;

      // For testing purposes, we render the loading component
      // In actual usage, this would be replaced by the dynamically imported component
      if (options?.loading) {
        return (
          <div data-testid="dynamic-wrapper" data-ssr={options.ssr}>
            <div data-testid="loading-state">{options.loading()}</div>
            <div
              data-testid="editor-placeholder"
              data-has-ref={!!editorRef}
              data-markdown={markdown}
              data-placeholder={placeholder}
              data-has-onchange={!!onChange}
              {...domProps}
            >
              Mock Editor
            </div>
          </div>
        );
      }
      return (
        <div
          data-testid="editor-placeholder"
          data-has-ref={!!editorRef}
          data-markdown={markdown}
          data-placeholder={placeholder}
          data-has-onchange={!!onChange}
          {...domProps}
        >
          Mock Editor
        </div>
      );
    };
    return MockDynamicComponent;
  }),
}));

// Mock Atoms for Container component
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => (
      <div data-testid="container" className={className} {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Skeleton/Skeleton', () => {
  return {
    Skeleton: ({ className, ...props }: { className?: string }) => (
      <div data-testid="skeleton" data-slot="skeleton" className={className} {...props} />
    ),
  };
});

describe('MarkdownEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the editor component', () => {
    render(<MarkdownEditor markdown="" />);

    expect(screen.getByTestId('dynamic-wrapper')).toBeInTheDocument();
  });

  it('renders with SSR disabled', () => {
    render(<MarkdownEditor markdown="" />);

    const wrapper = screen.getByTestId('dynamic-wrapper');
    expect(wrapper).toHaveAttribute('data-ssr', 'false');
  });

  it('renders loading state with skeleton', () => {
    render(<MarkdownEditor markdown="" />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBe(2);
    expect(skeletons[0]).toHaveClass('h-11');
    expect(skeletons[1]).toHaveClass('h-4');
  });

  it('passes props to the editor', () => {
    render(<MarkdownEditor markdown="# Hello World" />);

    const editor = screen.getByTestId('editor-placeholder');
    expect(editor).toHaveAttribute('data-markdown', '# Hello World');
  });

  it('passes multiple props to the editor', () => {
    render(<MarkdownEditor markdown="# Test" placeholder="Write here..." />);

    const editor = screen.getByTestId('editor-placeholder');
    expect(editor).toHaveAttribute('data-markdown', '# Test');
    expect(editor).toHaveAttribute('data-placeholder', 'Write here...');
  });

  it('accepts a ref for editor methods', () => {
    const editorRef = createRef<MDXEditorMethods>();
    render(<MarkdownEditor ref={editorRef} markdown="" />);

    const editor = screen.getByTestId('editor-placeholder');
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveAttribute('data-has-ref', 'true');
  });

  it('has correct displayName', () => {
    expect(MarkdownEditor.displayName).toBe('MarkdownEditor');
  });

  it('passes onChange handler to editor', () => {
    const handleChange = vi.fn();
    render(<MarkdownEditor markdown="" onChange={handleChange} />);

    const editor = screen.getByTestId('editor-placeholder');
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveAttribute('data-has-onchange', 'true');
  });

  it('passes className to editor', () => {
    render(<MarkdownEditor markdown="" className="custom-class" />);

    const editor = screen.getByTestId('editor-placeholder');
    expect(editor).toHaveClass('custom-class');
  });
});

describe('MarkdownEditor - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot with default props', () => {
    const { container } = render(<MarkdownEditor markdown="" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with markdown content', () => {
    const { container } = render(<MarkdownEditor markdown="# Test Heading" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<MarkdownEditor markdown="" className="custom-editor" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with placeholder', () => {
    const { container } = render(<MarkdownEditor markdown="" placeholder="Start typing..." />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
