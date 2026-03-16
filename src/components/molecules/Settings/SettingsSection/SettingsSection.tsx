import * as Atoms from '@/atoms';
import type { SettingsSectionProps } from './SettingsSection.types';

export function SettingsSection({
  title,
  description,
  buttonText,
  buttonIcon: ButtonIcon,
  buttonId,
  buttonVariant = 'secondary',
  buttonDisabled = false,
  buttonOnClick,
}: SettingsSectionProps) {
  return (
    <Atoms.Container overrideDefaults className="flex w-full flex-col items-start justify-start gap-3">
      <Atoms.Heading level={4} size="md" className="text-xl leading-7">
        {title}
      </Atoms.Heading>
      <Atoms.Typography
        as="p"
        size="md"
        overrideDefaults
        className="text-base leading-6 font-medium text-secondary-foreground"
      >
        {description}
      </Atoms.Typography>
      <Atoms.Button
        id={buttonId}
        variant={buttonVariant}
        size="default"
        disabled={buttonDisabled}
        onClick={buttonOnClick}
      >
        <ButtonIcon size={16} />
        {buttonText}
      </Atoms.Button>
    </Atoms.Container>
  );
}
