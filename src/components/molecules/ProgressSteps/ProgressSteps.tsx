import * as Atoms from '@/components/atoms';
import * as Libs from '@/libs';
import { Check } from 'lucide-react';
interface ProgressStepsProps {
  currentStep: number;
  totalSteps: number;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
}
export function ProgressSteps({ currentStep, totalSteps, className }: ProgressStepsProps) {
  return (
    <>
      {/* Progress Steps - Desktop */}
      <Atoms.Container
        className={Libs.cn('sticky top-0 z-10 mt-1 hidden flex-1 items-center gap-4 bg-background lg:flex', className)}
      >
        <Atoms.Container className="flex-row items-center gap-0">
          {Array.from(
            {
              length: totalSteps,
            },
            (_, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isCompleted = stepNumber < currentStep;
              return (
                <Atoms.Container key={stepNumber} className="flex-row items-center">
                  <Atoms.Container
                    className={Libs.cn(
                      'h-8 w-8 transform items-center justify-center rounded-full font-bold transition-all duration-500 ease-in-out',
                      isActive ? 'bg-foreground text-background' : 'border text-muted-foreground',
                      isCompleted && 'border-white bg-transparent text-white',
                    )}
                  >
                    <Atoms.Container
                      className={Libs.cn(
                        'flex items-center justify-center transition-all duration-500 ease-in-out',
                        isCompleted ? 'animate-in duration-500 fade-in zoom-in' : '',
                      )}
                    >
                      {isCompleted ? <Check size={16} /> : stepNumber}
                    </Atoms.Container>
                  </Atoms.Container>
                  {stepNumber < totalSteps && (
                    <Atoms.Container className="relative h-px w-28 overflow-hidden xl:w-40">
                      {/* Base line (gray) */}
                      <Atoms.Container className="absolute inset-0 bg-border opacity-50" />

                      {/* Animated line (white) */}
                      <Atoms.Container
                        className={Libs.cn(
                          'absolute inset-0 transform bg-white transition-all duration-500 ease-out',
                          stepNumber < currentStep ? 'translate-x-0' : '-translate-x-full',
                        )}
                      />
                    </Atoms.Container>
                  )}
                </Atoms.Container>
              );
            },
          )}
        </Atoms.Container>
      </Atoms.Container>

      {/* Progress Steps - Mobile */}
      <Atoms.Container
        className={Libs.cn('mr-0 w-full max-w-[200px] flex-1 flex-row items-center gap-0 lg:hidden', className)}
      >
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
              <Atoms.Container
                key={stepNumber}
                className={Libs.cn(
                  'relative flex h-4 w-8 flex-1 items-center justify-center overflow-hidden bg-border',
                  isFirst && 'rounded-l-full',
                  isLast && 'rounded-r-full',
                )}
              >
                {/* Growing fill bar */}
                <Atoms.Container
                  className={Libs.cn(
                    'absolute inset-0 origin-left bg-brand transition-transform duration-800 ease-out',
                    isActive || isCompleted ? 'scale-x-100' : 'scale-x-0',
                  )}
                  style={{
                    transitionDelay: isActive || isCompleted ? `${stepNumber * 150}ms` : '0ms',
                  }}
                />
              </Atoms.Container>
            );
          },
        )}
      </Atoms.Container>
    </>
  );
}
