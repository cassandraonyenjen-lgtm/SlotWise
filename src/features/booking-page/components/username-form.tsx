"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usernameSchema } from "@/lib/usernames";
import { setUsernameAction } from "../actions";
import { Field } from "./field";

export function UsernameForm({ current, appUrl }: { current: string | null; appUrl: string }) {
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState<string | null>(current);
  const [pending, startTransition] = useTransition();
  const host = appUrl.replace(/^https?:\/\//, "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = usernameSchema.safeParse(value);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    startTransition(async () => {
      const result = await setUsernameAction(parsed.data);
      if (result.ok) {
        setError(undefined);
        setSaved(parsed.data);
        setValue(parsed.data);
      } else {
        setError(result.fieldErrors?.username ?? result.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Your booking link</h2>
        </CardTitle>
        <CardDescription>
          {saved ? (
            <>
              Share{" "}
              <a className="text-primary underline" href={`/${saved}`} target="_blank">
                {host}/{saved}
              </a>{" "}
              in your email signature and socials.
            </>
          ) : (
            "Choose the link clients will use to book you."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field id="username" label="Username" error={error}>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground shrink-0 text-sm">{host}/</span>
                <Input
                  id="username"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoComplete="off"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "username-error" : undefined}
                />
              </div>
            </Field>
          </div>
          <Button type="submit" disabled={pending}>
            {saved ? "Update link" : "Save link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
