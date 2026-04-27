import { cn } from '@/libs/utils/utils';

export const ImageBackground = ({
  image,
  mobileImage,
  ...props
}: {
  image: string;
  mobileImage?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const baseClasses = 'fixed inset-0 bg-cover bg-center bg-no-repeat -z-10';

  if (!mobileImage) {
    return (
      <div
        {...props}
        data-testid="image-background"
        className={cn(baseClasses, props.className)}
        style={{
          backgroundImage: `url(${image})`,
        }}
      />
    );
  }

  return (
    <>
      <div
        {...props}
        className={cn(baseClasses, 'lg:hidden', props.className)}
        style={{
          backgroundImage: `url(${mobileImage})`,
        }}
      />

      <div
        {...props}
        className={cn(baseClasses, 'hidden lg:block', props.className)}
        style={{
          backgroundImage: `url(${image})`,
        }}
      />
    </>
  );
};
