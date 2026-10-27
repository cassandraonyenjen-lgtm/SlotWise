"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { setTimezoneAction } from "../actions";

export function TimezonePicker({ current }: { current: string }) {
  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf("timeZone");
    return all.includes(current) ? all : [current, ...all];
  }, [current]);
  const [value, setValue] = useState(current);
  const [detected, setDetected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Read the browser zone after mount so server and client render the same markup.
  useEffect(() => {
    setDetected(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const save = (tz: string) => {
    setValue(tz);
    startTransition(async () => {
      const result = await setTimezoneAction(tz);
      setMessage(result.ok ? `Time zone set to ${tz}.` : result.error);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Time zone</h2>
        </CardTitle>
        <CardDescription>
          Your hours are kept in this zone, so daylight-saving changes never move them. Clients see
          times in their own zone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="timezone">Your time zone</Label>
          <select
            id="timezone"
            className="border-input dark:bg-input/30 h-9 w-full max-w-sm rounded-md border bg-transparent px-3 text-sm"
            value={value}
            disabled={pending}
            onChange={(e) => save(e.target.value)}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        {detected && detected !== value && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Your device is set to {detected.replaceAll("_", " ")}.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => save(detected)}>
              Use {detected.replaceAll("_", " ")}
            </Button>
          </div>
        )}
        <p role="status" className="text-sm">
          {message}
        </p>
      </CardContent>
    </Card>
  );
}
