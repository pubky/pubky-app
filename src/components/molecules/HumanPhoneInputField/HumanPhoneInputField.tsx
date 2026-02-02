import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Libs from '@/libs';
import type { HumanPhoneInputProps } from './HumanPhoneInputField.types';

export const HumanPhoneInputField = ({
  value,
  onChange,
  placeholder,
  isValid = false,
  onEnter,
}: HumanPhoneInputProps) => {
  const t = useTranslations('onboarding.phone');
  const defaultPlaceholder = t('placeholder');

  return (
    <Atoms.Card data-testid="human-phone-input-card" className="gap-0 p-6 lg:p-12">
      <Atoms.Container className="flex-col gap-8 lg:flex-row lg:items-center">
        <Atoms.Container className="flex hidden h-full w-full flex-1 items-center lg:block lg:w-auto">
          <Atoms.Image
            priority={true}
            src="/images/sms-verification-phone.webp"
            alt="Pubky phone representing phone number verification"
            className="h-auto w-[192px] max-w-full"
          />
        </Atoms.Container>

        <Atoms.Container className="mr-6 w-full flex-3 gap-6">
          <Atoms.Container className="gap-3">
            <Atoms.Typography as="h3" className="text-2xl leading-[32px] font-semibold text-foreground sm:text-[28px]">
              {t('phoneNumber')}
            </Atoms.Typography>

            <Atoms.Typography as="p" className="text-base leading-6 font-medium text-secondary-foreground/80">
              {t('phoneHint')}
            </Atoms.Typography>
          </Atoms.Container>

          <Atoms.Container className="gap-2">
            <Atoms.Container
              data-testid="human-phone-input-wrapper"
              className="ml-0 flex max-w-128 flex-row items-center rounded-md border border-dashed border-brand px-5 py-2 shadow-xs-dark"
            >
              <Atoms.Input
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

              {isValid && <Libs.CheckCircle2 className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />}
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Card>
  );
};
