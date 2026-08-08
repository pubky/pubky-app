import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostThreadConnector } from './PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from './PostThreadConnector.constants';

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
      style,
      'data-testid': dataTestId,
      'data-variant': dataVariant,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
      style?: React.CSSProperties;
      'data-testid'?: string;
      'data-variant'?: string;
    }) => (
      <div
        data-testid={dataTestId}
        data-variant={dataVariant}
        className={className}
        style={style}
        data-override-defaults={overrideDefaults}
      >
        {children}
      </div>
    ),
  };
});

describe('PostThreadConnector', () => {
  describe('Functionality', () => {
    it('renders with regular variant by default', () => {
      const { container } = render(<PostThreadConnector height={100} data-testid="connector" />);
      const connector = container.querySelector('[data-testid="connector"]');
      expect(connector).toBeInTheDocument();
      expect(connector).toHaveAttribute('data-variant', POST_THREAD_CONNECTOR_VARIANTS.REGULAR);
    });

    it('renders with last variant', () => {
      const { container } = render(
        <PostThreadConnector height={100} variant={POST_THREAD_CONNECTOR_VARIANTS.LAST} data-testid="connector" />,
      );
      const connector = container.querySelector('[data-testid="connector"]');
      expect(connector).toHaveAttribute('data-variant', POST_THREAD_CONNECTOR_VARIANTS.LAST);
    });

    it('renders with dialog-reply variant', () => {
      const { container } = render(
        <PostThreadConnector variant={POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY} data-testid="connector" />,
      );
      const connector = container.querySelector('[data-testid="connector"]');
      expect(connector).toBeInTheDocument();
      expect(connector).toHaveAttribute('data-variant', POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY);
    });

    it('applies custom height', () => {
      const { container } = render(<PostThreadConnector height={200} data-testid="connector" />);
      const connector = container.querySelector('[data-testid="connector"]');
      expect(connector).toHaveStyle({ height: '200px' });
    });

    it('applies custom styles to dialog-reply connectors', () => {
      const { container } = render(
        <PostThreadConnector
          variant={POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY}
          style={{ transition: 'height 200ms ease' }}
          data-testid="connector"
        />,
      );
      const connector = container.querySelector('[data-testid="connector"]');
      expect(connector).toHaveStyle({ transition: 'height 200ms ease' });
    });

    it('uses default height when height is 0', () => {
      const { container } = render(<PostThreadConnector height={0} data-testid="connector" />);
      const connector = container.querySelector('[data-testid="connector"]');
      expect(connector).toHaveStyle({ height: '96px' });
    });
  });

  describe('Snapshots', () => {
    it('matches snapshot with regular variant', () => {
      const { container } = render(
        <PostThreadConnector height={100} variant={POST_THREAD_CONNECTOR_VARIANTS.REGULAR} />,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with last variant', () => {
      const { container } = render(<PostThreadConnector height={100} variant={POST_THREAD_CONNECTOR_VARIANTS.LAST} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with dialog-reply variant', () => {
      const { container } = render(<PostThreadConnector variant={POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with small height', () => {
      const { container } = render(<PostThreadConnector height={50} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot with large height', () => {
      const { container } = render(<PostThreadConnector height={300} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
