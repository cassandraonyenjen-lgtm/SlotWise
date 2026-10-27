"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Last-resort fallback when the root layout itself fails. Keeps its own <html>. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "3rem 1rem",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
        <p>Sorry, Slotwise hit a problem. We&apos;ve been notified. Please refresh to try again.</p>
        {error.digest && (
          <p style={{ fontSize: "0.75rem", color: "#666" }}>Reference: {error.digest}</p>
        )}
      </body>
    </html>
  );
}
