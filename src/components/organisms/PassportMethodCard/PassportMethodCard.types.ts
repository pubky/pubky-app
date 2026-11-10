import type { ContinueWithPassportProps } from '@/molecules/ContinueWithPassport/ContinueWithPassport.types';

export type PassportMethodCardProps = Pick<ContinueWithPassportProps, 'onContinue' | 'isPending'> & {
  className?: string;
};

export type PassportMethodSectionProps = PassportMethodCardProps & {
  variant?: 'label' | 'card';
};
