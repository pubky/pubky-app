import { Container } from '@/atoms/Container/Container';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

interface TextareaFieldProps {
  id?: string;
  name?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onClick?: () => void;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  textareaClassName?: string;
  variant?: 'default' | 'dashed';
  status?: 'default' | 'success' | 'error';
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  maxLength?: number;
  rows?: number;
  maxRows?: number;
  message?: React.ReactNode;
  messageType?: 'default' | 'info' | 'alert' | 'error' | 'success';
}

export function TextareaField({
  id,
  name,
  value,
  placeholder,
  disabled = false,
  readOnly = false,
  onClick,
  className,
  textareaClassName,
  variant = 'default',
  status = 'default',
  onChange,
  onBlur,
  onKeyDown,
  maxLength,
  rows = 4,
  message,
  messageType = 'default',
}: TextareaFieldProps) {
  const statusClasses = {
    default: '',
    success: 'border-brand text-brand',
    error: 'border-red-500 text-red-500',
  };

  const textAreaClasses = cn('h-25 px-5 py-4', textareaClassName);
  const containerClasses = cn(
    'w-full flex-1 cursor-pointer flex-row items-center gap-0 rounded-md border font-medium',
    variant === 'dashed' && '!bg-alpha-90/10 border-dashed',
  );
  const messageClasses = {
    default: 'text-muted-foreground',
    info: 'text-blue-500',
    alert: 'text-yellow-500',
    error: 'text-red-500',
    success: 'text-brand',
  } as const;

  return (
    <>
      <Container className={cn(containerClasses, statusClasses[status], className)}>
        <Textarea
          id={id}
          name={name}
          variant="inline"
          className={textAreaClasses}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          onClick={onClick}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          maxLength={maxLength}
          rows={rows}
          aria-invalid={status === 'error'}
        />
      </Container>
      {message && (
        <Typography as="small" size="sm" className={cn('ml-1', messageClasses[messageType])}>
          {message}
        </Typography>
      )}
    </>
  );
}
