'use client';
import { Lightbulb, Settings2 } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { cn } from '@/libs/utils/utils';

export interface ButtonFiltersProps {
  onClick?: () => void;
  className?: string;
  position?: 'left' | 'right';
}
export function ButtonFilters({ onClick, className, position = 'left' }: ButtonFiltersProps) {
  const isLeft = position === 'left';
  const positionClasses = isLeft ? 'left-0' : 'right-0';
  const roundedClasses = isLeft ? 'rounded-l-none rounded-r-full' : 'rounded-r-none rounded-l-full';
  const Icon = isLeft ? Settings2 : Lightbulb;
  return (
    <div className={cn('fixed top-[150px] z-10', positionClasses)}>
      <Button
        variant="secondary"
        size="icon"
        onClick={onClick}
        className={cn(
          'hidden bg-secondary px-4 py-3 shadow-xl hover:bg-secondary/90 lg:inline-flex',
          roundedClasses,
          className,
        )}
      >
        <Icon className="h-6 w-6" />
      </Button>
    </div>
  );
}
