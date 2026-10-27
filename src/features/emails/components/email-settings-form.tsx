"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/features/booking-page/components/field";
import type { FieldErrors } from "@/lib/action-result";
import { saveEmailSettingsAction } from "../actions";
import { REMINDER_LABELS, REMINDER_POLICIES, type EmailSettings } from "../schemas";

export function EmailSettingsForm({ initial }: { initial: EmailSettings }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await saveEmailSettingsAction(values);
      if (result.ok) {
        setErrors({});
        setStatus("Saved.");
      } else {
        setErrors(result.fieldErrors ?? {});
        setStatus(result.fieldErrors ? null : result.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Emails</h2>
        </CardTitle>
        <CardDescription>
          Clients get a confirmation when they book, and reminders before the meeting.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
          <Field
            id="name"
            label="Your name"
            hint={'Emails come from "Your name via Slotwise".'}
            error={errors.name}
          >
            <Input
              id="name"
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
          </Field>
          <Field id="reminderPolicy" label="Reminders" error={errors.reminderPolicy}>
            <select
              id="reminderPolicy"
              className={selectClass}
              value={values.reminderPolicy}
              onChange={(e) =>
                setValues({
                  ...values,
                  reminderPolicy: e.target.value as EmailSettings["reminderPolicy"],
                })
              }
            >
              {REMINDER_POLICIES.map((p) => (
                <option key={p} value={p}>
                  {REMINDER_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              Save email settings
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
