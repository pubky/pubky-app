'use client';
import './globals.css';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" dir="ltr">
      <body className="bg-background text-foreground antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col items-center justify-center p-6 text-center">
          <h1 className="m-0 text-[28px] leading-[1.2] font-semibold">Something went wrong</h1>
          <p className="mt-3 mb-0 text-destructive">{error.message || 'An unexpected error occurred'}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 cursor-pointer rounded-full border border-border bg-secondary px-4 py-2 font-semibold text-foreground"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
