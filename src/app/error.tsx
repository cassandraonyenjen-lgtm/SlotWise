"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Friendly fallback for anything that throws while rendering a page; reported to Sentry. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        Sorry, we hit a problem loading this page. We&apos;ve been notified. Please try again in a
        moment.
      </p>
      {error.digest && <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>}
      <div className="flex gap-3">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
