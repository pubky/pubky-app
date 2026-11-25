'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { PubchiBrainEditor } from '@/components/organisms/Pubchi/PubchiBrainEditor/PubchiBrainEditor';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';

export function PubchiBrain() {
  const router = useRouter();
  const { context, contextEditable, reapprove, loading, saveContext } = usePubchiEnrollment();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Back to Pubchi
        </Button>
        <Typography size="xl" className="mt-2 font-semibold">
          Edit your Pubchi brain
        </Typography>
      </div>
      <PubchiBrainEditor
        context={context}
        contextEditable={contextEditable}
        saving={loading}
        onSaveContext={saveContext}
        onReapprove={reapprove}
      />
    </main>
  );
}
