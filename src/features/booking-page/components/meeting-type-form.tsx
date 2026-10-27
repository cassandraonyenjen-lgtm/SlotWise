"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fieldErrorsOf, type FieldErrors } from "@/lib/action-result";
import {
  createMeetingTypeAction,
  deleteMeetingTypeAction,
  updateMeetingTypeAction,
} from "../actions";
import {
  BUFFER_OPTIONS,
  LOCATION_LABELS,
  LOCATION_TYPES,
  MAX_QUESTIONS,
  meetingTypeSchema,
  slugify,
  type MeetingTypeInput,
} from "../schemas";
import { Field, selectClass, textareaClass } from "./field";

const NOTICE_OPTIONS = [
  [0, "No minimum"],
  [30, "30 minutes"],
  [60, "1 hour"],
  [120, "2 hours"],
  [240, "4 hours"],
  [720, "12 hours"],
  [1440, "1 day"],
  [2880, "2 days"],
  [10080, "1 week"],
] as const;

const LOCATION_PLACEHOLDERS: Record<MeetingTypeInput["locationType"], string> = {
  video_link: "https://meet.google.com/abc-defg-hij",
  phone: "+234 801 234 5678, or 'I'll call you'",
  in_person: "12 Broad Street, Lagos",
};

export interface MeetingTypeFormValues {
  name: string;
  slug: string;
  durationMin: string;
  description: string;
  locationType: MeetingTypeInput["locationType"];
  locationValue: string;
  bufferBeforeMin: string;
  bufferAfterMin: string;
  minNoticeMin: string;
  maxDaysAhead: string;
  dailyLimit: string;
  isActive: boolean;
  questions: MeetingTypeInput["questions"];
}

export const NEW_MEETING_TYPE: MeetingTypeFormValues = {
  name: "",
  slug: "",
  durationMin: "30",
  description: "",
  locationType: "video_link",
  locationValue: "",
  bufferBeforeMin: "0",
  bufferAfterMin: "0",
  minNoticeMin: "240",
  maxDaysAhead: "60",
  dailyLimit: "",
  isActive: true,
  questions: [],
};

export function MeetingTypeForm({
  id,
  initial,
  linkPrefix,
}: {
  /** Absent when creating. */
  id?: string;
  initial: MeetingTypeFormValues;
  /** e.g. "slotwise.app/jane/", or null before a username is chosen. */
  linkPrefix: string | null;
}) {
  const [values, setValues] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof MeetingTypeFormValues>(key: K, value: MeetingTypeFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const toInput = () => ({
    ...values,
    dailyLimit: values.dailyLimit.trim() === "" ? null : values.dailyLimit,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = toInput();
    const parsed = meetingTypeSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      setMessage("Fix the highlighted fields, then save again.");
      return;
    }
    startTransition(async () => {
      // Send the raw input: the server parses it again with the same schema.
      const result = id
        ? await updateMeetingTypeAction(id, input)
        : await createMeetingTypeAction(input);
      // Success redirects to the list, so we only get here on failure.
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
      }
    });
  };

  const remove = () => {
    if (!id || !window.confirm("Delete this meeting type? This can't be undone.")) return;
    startTransition(async () => {
      const result = await deleteMeetingTypeAction(id);
      if (!result.ok) setMessage(result.error);
    });
  };

  const err = (key: string) => errors[key];
  const invalid = (key: string) => ({
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `${key}-error` : undefined,
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Details</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field id="name" label="Name" error={err("name")}>
            <Input
              id="name"
              value={values.name}
              placeholder="30-minute intro call"
              onChange={(e) => {
                set("name", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
              {...invalid("name")}
            />
          </Field>
          <Field
            id="slug"
            label="Link"
            error={err("slug")}
            hint={
              linkPrefix
                ? undefined
                : "Choose your username on the meeting types page to get a link."
            }
          >
            <div className="flex items-center gap-1">
              {linkPrefix && (
                <span className="text-muted-foreground max-w-[50%] shrink-0 truncate text-sm">
                  {linkPrefix}
                </span>
              )}
              <Input
                id="slug"
                value={values.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set("slug", e.target.value);
                }}
                {...invalid("slug")}
              />
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="durationMin" label="Duration (minutes)" error={err("durationMin")}>
              <Input
                id="durationMin"
                type="number"
                inputMode="numeric"
                min={15}
                max={240}
                step={5}
                value={values.durationMin}
                onChange={(e) => set("durationMin", e.target.value)}
                {...invalid("durationMin")}
              />
            </Field>
            <Field id="locationType" label="Location">
              <select
                id="locationType"
                className={selectClass}
                value={values.locationType}
                onChange={(e) =>
                  set("locationType", e.target.value as MeetingTypeInput["locationType"])
                }
              >
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LOCATION_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            id="locationValue"
            label={
              values.locationType === "video_link"
                ? "Meeting link"
                : values.locationType === "phone"
                  ? "Phone details"
                  : "Address"
            }
            hint="Clients see this after they book."
            error={err("locationValue")}
          >
            <Input
              id="locationValue"
              value={values.locationValue}
              placeholder={LOCATION_PLACEHOLDERS[values.locationType]}
              onChange={(e) => set("locationValue", e.target.value)}
              {...invalid("locationValue")}
            />
          </Field>
          <Field id="description" label="Description (optional)" error={err("description")}>
            <textarea
              id="description"
              className={textareaClass}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              {...invalid("description")}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={values.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
            />
            Clients can book this (turn off to hide it without deleting)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Booking rules</h2>
          </CardTitle>
          <CardDescription>Protect your time between and around meetings.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(["bufferBeforeMin", "bufferAfterMin"] as const).map((key) => (
            <Field
              key={key}
              id={key}
              label={key === "bufferBeforeMin" ? "Buffer before" : "Buffer after"}
              error={err(key)}
            >
              <select
                id={key}
                className={selectClass}
                value={values[key]}
                onChange={(e) => set(key, e.target.value)}
              >
                {BUFFER_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "None" : `${m} minutes`}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field id="minNoticeMin" label="Minimum notice" error={err("minNoticeMin")}>
            <select
              id="minNoticeMin"
              className={selectClass}
              value={values.minNoticeMin}
              onChange={(e) => set("minNoticeMin", e.target.value)}
            >
              {NOTICE_OPTIONS.map(([m, label]) => (
                <option key={m} value={m}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="maxDaysAhead" label="Bookable up to (days ahead)" error={err("maxDaysAhead")}>
            <Input
              id="maxDaysAhead"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={values.maxDaysAhead}
              onChange={(e) => set("maxDaysAhead", e.target.value)}
              {...invalid("maxDaysAhead")}
            />
          </Field>
          <Field
            id="dailyLimit"
            label="Daily limit (optional)"
            hint="Most meetings you'll take in one day. Leave blank for no limit."
            error={err("dailyLimit")}
          >
            <Input
              id="dailyLimit"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={values.dailyLimit}
              onChange={(e) => set("dailyLimit", e.target.value)}
              {...invalid("dailyLimit")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Questions for clients</h2>
          </CardTitle>
          <CardDescription>
            Clients always give their name and email. Ask up to {MAX_QUESTIONS} more questions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {values.questions.map((q, i) => {
            const update = (patch: Partial<typeof q>) =>
              set(
                "questions",
                values.questions.map((x, j) => (j === i ? { ...x, ...patch } : x)),
              );
            return (
              <div key={q.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-md border p-3">
                <Field
                  id={`questions.${i}.label`}
                  label={`Question ${i + 1}`}
                  error={err(`questions.${i}.label`)}
                >
                  <Input
                    id={`questions.${i}.label`}
                    value={q.label}
                    onChange={(e) => update({ label: e.target.value })}
                    {...invalid(`questions.${i}.label`)}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-4">
                  <select
                    aria-label={`Question ${i + 1} answer type`}
                    className={`${selectClass} w-auto`}
                    value={q.type}
                    onChange={(e) => update({ type: e.target.value as typeof q.type })}
                  >
                    <option value="short_text">Short answer</option>
                    <option value="long_text">Long answer</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      checked={q.required}
                      onChange={(e) => update({ required: e.target.checked })}
                    />
                    Required
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() =>
                      set(
                        "questions",
                        values.questions.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 /> Remove
                  </Button>
                </div>
              </div>
            );
          })}
          {values.questions.length < MAX_QUESTIONS && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  set("questions", [
                    ...values.questions,
                    { label: "", type: "short_text", required: false },
                  ])
                }
              >
                + Add a question
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : id ? "Save changes" : "Create meeting type"}
        </Button>
        {id && (
          <Button type="button" variant="ghost" onClick={remove} disabled={pending}>
            Delete
          </Button>
        )}
        <p role="status" className="text-destructive text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}
