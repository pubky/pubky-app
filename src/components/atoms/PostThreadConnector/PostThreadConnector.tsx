import { LineHorizontal, RoundedCorner } from '@/icons';
import { cn } from '@/libs/utils/utils';
import { Container } from '../Container/Container';
import { POST_THREAD_CONNECTOR_VARIANTS } from './PostThreadConnector.constants';
import type { PostThreadConnectorVariant } from './PostThreadConnector.types';

interface PostThreadConnectorProps {
  height?: number;
  variant?: PostThreadConnectorVariant;
  style?: React.CSSProperties;
  'data-testid'?: string;
}
const DEFAULT_HEIGHT = 96; // Default height in pixels (6rem = 96px)

/**
 * Encapsulates the vertical thread line functionality
 * Used as a building block for thread connectors
 */
const ThreadLine = () => {
  return (
    <Container className="min-h-px w-full min-w-px shrink-0 grow basis-0 border-l border-border" overrideDefaults />
  );
};

// Base container props shared by height-based variants
const getBaseContainerProps = (
  effectiveHeight: number,
  variant: PostThreadConnectorVariant,
  dataTestId?: string,
  style?: React.CSSProperties,
) => ({
  className: 'flex w-3 flex-col items-start',
  style: {
    ...style,
    height: `${effectiveHeight}px`,
  } as React.CSSProperties,
  overrideDefaults: true as const,
  'data-testid': dataTestId,
  'data-variant': variant,
});

// Common inner container structure
const InnerContainer = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <Container
    className={cn('relative flex min-h-px w-full min-w-px shrink-0 grow basis-0 flex-col items-start', className)}
    overrideDefaults
  >
    {children}
  </Container>
);

// Spacer container
const Spacer = () => <Container className="min-h-px w-3 min-w-px shrink-0 grow basis-0" overrideDefaults />;

// Dialog reply variant - completely different structure, doesn't need height
const DialogReplyVariant = ({ dataTestId, style }: { dataTestId?: string; style?: React.CSSProperties }) => (
  <Container
    overrideDefaults
    style={style}
    data-testid={dataTestId}
    data-variant={POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY}
  >
    {/* Vertical line - 35px long from the post-card edge to the horizontal connector */}
    <Container className="absolute top-[-13px] -left-3 h-[35px] w-px border-l border-secondary" overrideDefaults />
    {/* Horizontal connector at avatar level */}
    <Container className="absolute top-[22px] -left-3" overrideDefaults>
      <LineHorizontal />
    </Container>
  </Container>
);
export const PostThreadConnector = ({
  height,
  variant = POST_THREAD_CONNECTOR_VARIANTS.REGULAR,
  style,
  'data-testid': dataTestId,
}: PostThreadConnectorProps) => {
  // Dialog reply is special - doesn't need height calculation
  if (variant === POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY) {
    return <DialogReplyVariant dataTestId={dataTestId} style={style} />;
  }

  // Calculate effective height for variants that need it
  const effectiveHeight = height || DEFAULT_HEIGHT;
  const baseProps = getBaseContainerProps(effectiveHeight, variant, dataTestId, style);
  switch (variant) {
    case POST_THREAD_CONNECTOR_VARIANTS.LAST:
      // Last variant - shows a rounded corner at the end, aligned with action buttons
      return (
        <Container {...baseProps}>
          <InnerContainer>
            <ThreadLine />
            <Container className="relative size-3 shrink-0" overrideDefaults>
              <RoundedCorner />
            </Container>
          </InnerContainer>
          {/* Fixed spacer so the curve aligns with action buttons */}
          <Container className="h-[28px] w-3 shrink-0" overrideDefaults />
        </Container>
      );
    case POST_THREAD_CONNECTOR_VARIANTS.REGULAR:
    default:
      // Regular variant (default) - shows a rounded corner in the middle
      // TODO: Remove -ml-px to have a seamless connection between the thread connector and the post card
      return (
        <Container {...baseProps} className={cn(baseProps.className, 'border-l border-border')}>
          <InnerContainer className="min-w-3">
            <Container className="min-h-px w-full min-w-px shrink-0 grow basis-0" overrideDefaults />
            <Container className="relative -ml-px size-3 shrink-0" overrideDefaults>
              <RoundedCorner />
            </Container>
          </InnerContainer>
          <Spacer />
        </Container>
      );
  }
};
