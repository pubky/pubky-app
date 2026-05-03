import type * as React from 'react';

import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Input } from '@/atoms/Input/Input';
import { Typography } from '@/atoms/Typography/Typography';

type HumanPhoneInputFieldProps = {
  /** Current phone number value (including country code). Example: "+316XXXXXXXX" */
  value: string;
  /** Callback fired when the phone number input changes. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** Whether to show the validation checkmark. */
  isValid?: boolean;
  onEnter?: () => void;
};

export const HumanPhoneInputField = ({
  value,
  onChange,
  placeholder,
  isValid = false,
  onEnter,
}: HumanPhoneInputFieldProps) => {
  const t = useTranslations('onboarding.phone');
  const defaultPlaceholder = t('placeholder');
  return (
    <Card data-testid="human-phone-input-card" className="gap-0 p-6 lg:p-12">
      <Container className="flex-col gap-8 lg:flex-row lg:items-center">
        <Container className="flex hidden h-full w-full flex-1 items-center lg:block lg:w-auto">
          <Image
            priority={true}
            src="/images/sms-verification-phone.webp"
            alt="Pubky phone representing phone number verification"
            className="h-auto w-[192px] max-w-full"
          />
        </Container>

        <Container className="mr-6 w-full flex-3 gap-6">
          <Container className="gap-3">
            <Typography as="h3" className="text-2xl leading-[32px] font-semibold text-foreground sm:text-[28px]">
              {t('phoneNumber')}
            </Typography>

            <Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
              {t('phoneHint')}
            </Typography>
          </Container>

          <Container className="gap-2">
            <Container
              data-testid="human-phone-input-wrapper"
              className="ml-0 flex max-w-128 flex-row items-center rounded-md border border-dashed border-brand px-5 py-2 shadow-xs"
            >
              <Input
                data-testid="human-phone-input"
                type="tel"
                autoFocus
                value={value}
                onChange={onChange}
                placeholder={placeholder ?? defaultPlaceholder}
                className="border-none bg-transparent text-base font-medium text-brand placeholder:text-brand/50 focus:ring-0 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValid) {
                    onEnter?.();
                  }
                }}
              />

              {isValid && <CheckCircle2 className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />}
            </Container>
          </Container>
        </Container>
      </Container>
    </Card>
  );
};
