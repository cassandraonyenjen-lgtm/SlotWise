"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/features/booking-page/components/field";
import { deleteAccountAction } from "../actions";

/** Download your data, or delete your account (PRD §8 Privacy). */
export function AccountCard() {
  const [confirming, setConfirming] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Your data</h2>
        </CardTitle>
        <CardDescription>
          Download everything Slotwise stores about you and your bookings, or delete your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button asChild variant="outline" className="self-start">
          <a href="/api/account/export" download>
            Download my data
          </a>
        </Button>

        {!confirming ? (
          <Button
            type="button"
            variant="outline"
            className="text-destructive self-start"
            onClick={() => setConfirming(true)}
          >
            Delete my account
          </Button>
        ) : (
          <form
            className="border-destructive/40 flex max-w-md flex-col gap-3 rounded-md border p-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(undefined);
              startTransition(async () => {
                const result = await deleteAccountAction(confirm);
                if (!result.ok) setError(result.fieldErrors?.confirm ?? result.error);
              });
            }}
          >
            <p className="text-sm">
              This permanently deletes your account, meeting types, availability and booking
              history. Clients with upcoming meetings will get a cancellation email. This can&apos;t
              be undone.
            </p>
            <Field id="confirm" label="Type DELETE to confirm" error={error}>
              <Input
                id="confirm"
                value={confirm}
                autoComplete="off"
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "confirm-error" : undefined}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="destructive"
                disabled={pending || confirm !== "DELETE"}
              >
                {pending ? "Deleting…" : "Delete account permanently"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Keep my account
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
