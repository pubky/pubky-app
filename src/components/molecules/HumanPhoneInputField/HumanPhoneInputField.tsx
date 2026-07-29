import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { Image } from '@/atoms/Image/Image';
import { Input } from '@/atoms/Input/Input';
import { Typography } from '@/atoms/Typography/Typography';
import { IllustratedCard } from '../IllustratedCard/IllustratedCard';

const PHONE_INPUT_ERROR_ID = 'human-phone-input-error';

type HumanPhoneInputFieldProps = {
  /** Current phone number value (including country code). Example: "+316XXXXXXXX" */
  value: string;
  /** Callback fired when the phone number input changes. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** Whether to show the validation checkmark. */
  isValid?: boolean;
  /** Inline validation error shown below the input. */
  error?: string;
  onEnter?: () => void;
};

export const HumanPhoneInputField = ({
  value,
  onChange,
  placeholder,
  isValid = false,
  error,
  onEnter,
}: HumanPhoneInputFieldProps) => {
  const t = useTranslations('onboarding.phone');
  const defaultPlaceholder = t('placeholder');
  return (
    <IllustratedCard
      data-testid="human-phone-input-card"
      visual={
        <Image
          priority={true}
          src="/images/phone-number.webp"
          alt="Pubky phone representing phone number entry"
          className="size-48"
        />
      }
    >
      <div className="flex flex-col gap-3">
        <Typography as="h3" className="text-2xl leading-[32px] font-semibold text-foreground sm:text-[28px]">
          {t('phoneNumber')}
        </Typography>

        <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
          {t('phoneHint')}
        </Typography>
      </div>

      <div className="flex w-full max-w-128 flex-col gap-2">
        <div
          data-testid="human-phone-input-wrapper"
          className="flex w-full flex-row items-center rounded-md border border-dashed border-brand px-5 py-2 shadow-xs"
        >
          <Input
            data-testid="human-phone-input"
            type="tel"
            autoFocus
            value={value}
            onChange={onChange}
            placeholder={placeholder ?? defaultPlaceholder}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? PHONE_INPUT_ERROR_ID : undefined}
            className="border-none bg-transparent text-base font-medium text-brand placeholder:text-brand/50 focus:ring-0 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onEnter?.();
              }
            }}
          />

          {isValid && <CheckCircle2 className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />}
        </div>

        {error && (
          <Typography
            as="p"
            id={PHONE_INPUT_ERROR_ID}
            data-testid="human-phone-input-error"
            className="text-sm font-medium text-destructive"
          >
            {error}
          </Typography>
        )}
      </div>
    </IllustratedCard>
  );
};
