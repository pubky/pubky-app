import { createReplyConnectorPath } from '@/libs/svg/svg';

interface ReplyLineProps {
  height: number;
  isLast?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  'data-testid'?: string;
}

export const ReplyLine = ({
  height,
  isLast = false,
  strokeColor = 'rgb(96,96,96)',
  strokeWidth = 2,
  'data-testid': dataTestId,
}: ReplyLineProps) => {
  const { path, tailPath, width, height: svgHeight } = createReplyConnectorPath(height, isLast);

  return (
    <svg
      width={width}
      height={svgHeight}
      viewBox={`0 0 ${width} ${svgHeight}`}
      preserveAspectRatio="xMinYMin meet"
      data-testid={dataTestId}
    >
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      {tailPath && (
        <path
          d={tailPath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
};
