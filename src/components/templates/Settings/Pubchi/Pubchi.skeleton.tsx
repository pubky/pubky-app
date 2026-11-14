import { Skeleton } from '@/atoms/Skeleton/Skeleton';

export function PubchiSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-6" data-testid="pubchi-settings-loading" role="status">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-24" />
    </div>
  );
}
