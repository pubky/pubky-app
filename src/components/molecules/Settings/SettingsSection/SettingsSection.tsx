import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
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
    <Container overrideDefaults className="flex w-full flex-col items-start justify-start gap-3">
      <Heading level={4} size="md" className="text-xl leading-7">
        {title}
      </Heading>
      <Typography
        as="p"
        size="md"
        overrideDefaults
        className="text-base leading-6 font-medium text-secondary-foreground"
      >
        {description}
      </Typography>
      <Button id={buttonId} variant={buttonVariant} size="default" disabled={buttonDisabled} onClick={buttonOnClick}>
        <ButtonIcon size={16} />
        {buttonText}
      </Button>
    </Container>
  );
}
