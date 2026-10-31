import { Check } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';

interface ProgressStepsProps {
  currentStep: number;
  totalSteps: number;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
}
export function ProgressSteps({ currentStep, totalSteps, className }: ProgressStepsProps) {
  return (
    <>
      {/* Progress Steps - Desktop */}
      <Container
        className={cn('sticky top-0 z-10 mt-1 hidden flex-1 items-center gap-4 bg-background lg:flex', className)}
      >
        <Container className="flex-row items-center gap-0">
          {Array.from(
            {
              length: totalSteps,
            },
            (_, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isCompleted = stepNumber < currentStep;
              return (
                <Container key={stepNumber} className="flex-row items-center">
                  <Container
                    className={cn(
                      'h-8 w-8 transform items-center justify-center rounded-full font-bold transition-all duration-500 ease-in-out',
                      isActive ? 'bg-foreground text-background' : 'border text-muted-foreground',
                      isCompleted && 'border-foreground bg-transparent text-foreground',
                    )}
                  >
                    <Container
                      className={cn(
                        'flex items-center justify-center transition-all duration-500 ease-in-out',
                        isCompleted ? 'animate-in duration-500 fade-in zoom-in' : '',
                      )}
                    >
                      {isCompleted ? <Check size={16} /> : stepNumber}
                    </Container>
                  </Container>
                  {stepNumber < totalSteps && (
                    <Container className="relative h-px w-28 overflow-hidden xl:w-40">
                      {/* Base line (gray) */}
                      <Container className="absolute inset-0 bg-border opacity-50" />

                      {/* Animated line */}
                      <Container
                        className={cn(
                          'absolute inset-0 transform bg-foreground transition-all duration-500 ease-out',
                          stepNumber < currentStep ? 'translate-x-0' : '-translate-x-full',
                        )}
                      />
                    </Container>
                  )}
                </Container>
              );
            },
          )}
        </Container>
      </Container>

      {/* Progress Steps - Mobile */}
      <Container className={cn('mr-0 w-full max-w-[200px] flex-1 flex-row items-center gap-0 lg:hidden', className)}>
        {Array.from(
          {
            length: totalSteps,
          },
          (_, index) => {
            const stepNumber = index + 1;
            const isActive = stepNumber === currentStep;
            const isCompleted = stepNumber < currentStep;
            const isFirst = stepNumber === 1;
            const isLast = stepNumber === totalSteps;
            return (
              <Container
                key={stepNumber}
                className={cn(
                  'relative flex h-4 w-8 flex-1 items-center justify-center overflow-hidden bg-border',
                  isFirst && 'rounded-l-full',
                  isLast && 'rounded-r-full',
                )}
              >
                {/* Growing fill bar */}
                <Container
                  className={cn(
                    'absolute inset-0 origin-left bg-brand transition-transform duration-800 ease-out',
                    isActive || isCompleted ? 'scale-x-100' : 'scale-x-0',
                  )}
                  style={{
                    transitionDelay: isActive || isCompleted ? `${stepNumber * 150}ms` : '0ms',
                  }}
                />
              </Container>
            );
          },
        )}
      </Container>
    </>
  );
}
