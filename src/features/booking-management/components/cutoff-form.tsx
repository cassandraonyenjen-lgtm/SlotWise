"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, selectClass } from "@/features/booking-page/components/field";
import { saveCutoffAction } from "../actions";
import { CUTOFF_OPTIONS } from "../schemas";

export function CutoffForm({ initial }: { initial: number }) {
  const known = CUTOFF_OPTIONS.some((o) => o.minutes === initial);
  const [value, setValue] = useState(known ? initial : 0);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Changes and cancellations</h2>
        </CardTitle>
        <CardDescription>
          Clients can reschedule or cancel from their email. Closer to the meeting than this,
          they&apos;re asked to contact you instead. You can always change bookings yourself.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setStatus(null);
            startTransition(async () => {
              const result = await saveCutoffAction({ cancelCutoffMin: value });
              setStatus(result.ok ? "Saved." : result.error);
            });
          }}
        >
          <Field id="cancelCutoffMin" label="Clients can make changes">
            <select
              id="cancelCutoffMin"
              className={selectClass}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            >
              {CUTOFF_OPTIONS.map((o) => (
                <option key={o.minutes} value={o.minutes}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              Save cutoff
            </Button>
            <p role="status" className="text-muted-foreground text-sm">
              {status}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
