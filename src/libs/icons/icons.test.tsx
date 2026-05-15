import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Bitkit,
  Blocktank,
  BTCIcon,
  Github2,
  LineHorizontal,
  MarkdownMark,
  PubkyIcon,
  RoundedCorner,
  Synonym,
  Telegram,
  Tether,
  UsersRound2,
  XTwitter,
} from './icons';

describe('Custom Icons', () => {
  describe('XTwitter', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<XTwitter />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<XTwitter size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<XTwitter className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<XTwitter data-testid="twitter-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'twitter-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<XTwitter />);
      const path = container.querySelector('path');
      const g = container.querySelector('g');

      expect(g).toBeInTheDocument();
      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute('opacity', '0.8');
      expect(path).toHaveAttribute('fill', 'currentColor');
    });

    it('should have the correct clip path', () => {
      const { container } = render(<XTwitter />);
      const g = container.querySelector('g');
      const clipPath = container.querySelector('clipPath');

      expect(g).toHaveAttribute('clip-path', 'url(#clip0_18345_202114)');
      expect(clipPath).toHaveAttribute('id', 'clip0_18345_202114');
    });
  });

  describe('Telegram', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<Telegram />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<Telegram size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<Telegram className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<Telegram data-testid="telegram-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'telegram-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<Telegram />);
      const path = container.querySelector('path');

      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute('stroke', 'currentColor');
      expect(path).toHaveAttribute('stroke-width', '1.5');
      expect(path).toHaveAttribute('stroke-linecap', 'round');
      expect(path).toHaveAttribute('stroke-linejoin', 'round');
    });
  });

  describe('Github', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<Github2 />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<Github2 size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<Github2 className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<Github2 data-testid="github-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'github-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<Github2 />);
      const path = container.querySelector('path');

      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute('stroke', 'currentColor');
      expect(path).toHaveAttribute('stroke-width', '1.5');
      expect(path).toHaveAttribute('stroke-linecap', 'round');
      expect(path).toHaveAttribute('stroke-linejoin', 'round');
    });
  });

  describe('UsersRound2', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<UsersRound2 />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 20 20');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<UsersRound2 size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<UsersRound2 className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<UsersRound2 data-testid="users-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'users-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<UsersRound2 />);
      const path = container.querySelector('path');

      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute('stroke', 'currentColor');
      expect(path).toHaveAttribute('stroke-width', '1.5');
      expect(path).toHaveAttribute('stroke-linecap', 'round');
      expect(path).toHaveAttribute('stroke-linejoin', 'round');
    });
  });

  describe('LineHorizontal', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<LineHorizontal />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '12');
      expect(svg).toHaveAttribute('height', '12');
      expect(svg).toHaveAttribute('viewBox', '0 0 12 12');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<LineHorizontal size={16} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '16');
      expect(svg).toHaveAttribute('height', '16');
    });

    it('should have fill-secondary class hardcoded', () => {
      const { container } = render(<LineHorizontal />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('fill-secondary');
    });

    it('should apply additional props', () => {
      const { container } = render(<LineHorizontal data-testid="line-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'line-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<LineHorizontal />);
      const path = container.querySelector('path');

      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute('fill-rule', 'evenodd');
      expect(path).toHaveAttribute('clip-rule', 'evenodd');
      // Note: fill is handled via CSS classes, not as an attribute
    });
  });

  describe('RoundedCorner', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<RoundedCorner />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '12');
      expect(svg).toHaveAttribute('height', '12');
      expect(svg).toHaveAttribute('viewBox', '0 0 12 12');
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<RoundedCorner size={16} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '16');
      expect(svg).toHaveAttribute('height', '16');
    });

    it('should have hardcoded classes', () => {
      const { container } = render(<RoundedCorner />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('block');
      expect(svg).toHaveClass('size-full');
      expect(svg).toHaveClass('fill-secondary');
    });

    it('should apply additional props', () => {
      const { container } = render(<RoundedCorner data-testid="rounded-corner-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'rounded-corner-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<RoundedCorner />);
      const path = container.querySelector('path');

      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute('d', 'M1 0C1 6.07513 5.92487 11 12 11V12C5.37258 12 0 6.62742 0 0H1Z');
    });
  });

  describe('Synonym', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<Synonym />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 200 200');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<Synonym size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<Synonym className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<Synonym data-testid="synonym-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'synonym-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<Synonym />);
      const paths = container.querySelectorAll('path');

      expect(paths.length).toBe(2);
      expect(paths[0]).toHaveAttribute('fill', 'white');
      expect(paths[1]).toHaveAttribute('fill', '#FF6600');
      expect(paths[1]).toHaveAttribute('fill-rule', 'evenodd');
      expect(paths[1]).toHaveAttribute('clip-rule', 'evenodd');
    });
  });

  describe('Blocktank', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<Blocktank />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 200 200');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<Blocktank size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<Blocktank className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<Blocktank data-testid="blocktank-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'blocktank-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<Blocktank />);
      const paths = container.querySelectorAll('path');

      expect(paths.length).toBe(3);
      expect(paths[0]).toHaveAttribute('fill', '#FFAE00');
      expect(paths[1]).toHaveAttribute('fill', 'white');
      expect(paths[2]).toHaveAttribute('fill', '#FFAE00');
    });
  });

  describe('Bitkit', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<Bitkit />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 200 184');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<Bitkit size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<Bitkit className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<Bitkit data-testid="bitkit-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'bitkit-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<Bitkit />);
      const paths = container.querySelectorAll('path');

      expect(paths.length).toBe(4);
      expect(paths[0]).toHaveAttribute('fill', 'black');
      expect(paths[1]).toHaveAttribute('fill', 'black');
      expect(paths[2]).toHaveAttribute('fill', 'white');
      expect(paths[3]).toHaveAttribute('fill', '#FF4400');
    });
  });

  describe('BTCIcon', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<BTCIcon />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0.004 0 64 64');
    });

    it('should apply custom size', () => {
      const { container } = render(<BTCIcon size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<BTCIcon className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<BTCIcon data-testid="btc-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'btc-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<BTCIcon />);
      const paths = container.querySelectorAll('path');

      expect(paths.length).toBe(2);
      expect(paths[0]).toHaveAttribute('fill', '#f7931a');
      expect(paths[1]).toHaveAttribute('fill', '#ffffff');
    });
  });

  describe('Tether', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<Tether />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 2000 2000');
    });

    it('should apply custom size', () => {
      const { container } = render(<Tether size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<Tether className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<Tether data-testid="tether-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'tether-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<Tether />);
      const paths = container.querySelectorAll('path');

      expect(paths.length).toBe(2);
      expect(paths[0]).toHaveAttribute('fill', '#53ae94');
      expect(paths[1]).toHaveAttribute('fill', '#fff');
    });
  });

  describe('MarkdownMark', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<MarkdownMark />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 208 128');
    });

    it('should apply custom size', () => {
      const { container } = render(<MarkdownMark size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<MarkdownMark className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<MarkdownMark data-testid="markdown-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'markdown-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<MarkdownMark />);
      const paths = container.querySelectorAll('path');

      expect(paths.length).toBe(2);
      expect(paths[0]).toHaveAttribute('fill', 'currentColor');
      expect(paths[1]).toHaveAttribute('fill', 'currentColor');
    });
  });

  describe('PubkyIcon', () => {
    it('should render correctly with default props', () => {
      const { container } = render(<PubkyIcon />);
      const svg = container.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
      expect(svg).toHaveAttribute('viewBox', '0 0 22 33');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('should apply custom size', () => {
      const { container } = render(<PubkyIcon size={32} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('width', '32');
      expect(svg).toHaveAttribute('height', '32');
    });

    it('should apply custom className', () => {
      const { container } = render(<PubkyIcon className="custom-class" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveClass('custom-class');
    });

    it('should apply additional props', () => {
      const { container } = render(<PubkyIcon data-testid="pubky-icon" />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('data-testid', 'pubky-icon');
    });

    it('should render the correct SVG content', () => {
      const { container } = render(<PubkyIcon />);
      const path = container.querySelector('path');

      expect(path).toBeInTheDocument();
      expect(path).toHaveAttribute('fill', '#C8FF00');
      expect(path).toHaveAttribute('fill-rule', 'evenodd');
      expect(path).toHaveAttribute('clip-rule', 'evenodd');
    });
  });
});
