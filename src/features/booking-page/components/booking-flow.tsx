"use client";

import { CalendarPlus, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/action-result";
import { bookSlotAction, type BookingConfirmation } from "../booking-actions";
import { googleCalendarUrl, outlookCalendarUrl } from "../calendar-urls";
import { bookingRequestSchema } from "../schemas";
import { Field, selectClass, textareaClass } from "./field";

const DAY = 86_400_000;
const WINDOW_DAYS = 31;

export interface BookingFlowProps {
  username: string;
  slug: string;
  durationMin: number;
  maxDaysAhead: number;
  questions: { id: string; label: string; type: "short_text" | "long_text"; required: boolean }[];
}

type Step = "pick" | "details" | "done";

/**
 * The invitee's three steps (F2.4): pick a time, enter details, see the confirmation.
 * Slots arrive as UTC instants and are shown in the invitee's zone, which they can change (F2.3).
 */
export function BookingFlow(props: BookingFlowProps) {
  const { username, slug, durationMin, maxDaysAhead, questions } = props;
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState<number | null>(null);
  const [firstWindow, setFirstWindow] = useState<number | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [form, setForm] = useState({
    name: "",
    email: "",
    notes: "",
    answers: {} as Record<string, string>,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Browser-only values are read after mount so the server render stays deterministic.
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const now = Date.now();
    setWindowStart(now);
    setFirstWindow(now);
  }, []);

  const loadSlots = useCallback(async () => {
    if (windowStart === null) return;
    setSlots(null);
    setLoadError(null);
    const params = new URLSearchParams({
      username,
      slug,
      from: new Date(windowStart).toISOString(),
      to: new Date(windowStart + WINDOW_DAYS * DAY).toISOString(),
    });
    try {
      const res = await fetch(`/api/public/slots?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { slots: string[] };
      setSlots(body.slots);
    } catch {
      setLoadError("We couldn't load available times. Check your connection and try again.");
    }
  }, [username, slug, windowStart]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const fmt = useMemo(() => {
    if (!timeZone) return null;
    return {
      key: new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      day: new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      longDay: new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      time: new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" }),
    };
  }, [timeZone]);

  const byDate = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!slots || !fmt) return map;
    for (const s of slots) {
      const key = fmt.key.format(new Date(s));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [slots, fmt]);

  // Keep the selected date valid as slots or the time zone change.
  useEffect(() => {
    if (byDate.size === 0) return setSelectedDate(null);
    if (!selectedDate || !byDate.has(selectedDate))
      setSelectedDate(byDate.keys().next().value ?? null);
  }, [byDate, selectedDate]);

  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf("timeZone");
    return timeZone && !all.includes(timeZone) ? [timeZone, ...all] : all;
  }, [timeZone]);

  const lastBookable = firstWindow === null ? 0 : firstWindow + (maxDaysAhead + 1) * DAY;
  const canGoBack = windowStart !== null && firstWindow !== null && windowStart > firstWindow;
  const canGoForward = windowStart !== null && windowStart + WINDOW_DAYS * DAY < lastBookable;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !timeZone) return;
    const input = {
      username,
      slug,
      startAt: selectedSlot,
      inviteeName: form.name,
      inviteeEmail: form.email,
      inviteeTimezone: timeZone,
      notes: form.notes,
      answers: form.answers,
    };
    const parsed = bookingRequestSchema.safeParse(input);
    const missing = questions.find((q) => q.required && !form.answers[q.id]?.trim());
    if (!parsed.success || missing) {
      const next: FieldErrors = {};
      for (const issue of parsed.error?.issues ?? []) next[issue.path.join(".")] ??= issue.message;
      if (missing) next[`answers.${missing.id}`] = "Please answer this question";
      setErrors(next);
      setFormError("Check the highlighted fields.");
      return;
    }
    startTransition(async () => {
      const result = await bookSlotAction(input);
      if (result.ok) {
        setConfirmation(result.data);
        setStep("done");
      } else if ("taken" in result) {
        setNotice(result.error);
        setSelectedSlot(null);
        setStep("pick");
        void loadSlots();
      } else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      }
    });
  };

  if (step === "done" && confirmation && fmt) {
    return (
      <Confirmation
        confirmation={confirmation}
        fmt={fmt}
        timeZone={timeZone!}
        headingRef={headingRef}
      />
    );
  }

  if (step === "details" && selectedSlot && fmt) {
    const start = new Date(selectedSlot);
    return (
      <section aria-labelledby="details-heading" className="flex flex-col gap-4">
        <div>
          <Button type="button" variant="link" className="px-0" onClick={() => setStep("pick")}>
            <ChevronLeft /> Change time
          </Button>
          <h2
            id="details-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            Your details
          </h2>
          <p className="text-muted-foreground text-sm">
            {fmt.longDay.format(start)}, {fmt.time.format(start)} ({durationMin} min) ·{" "}
            {timeZone?.replaceAll("_", " ")}
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field id="inviteeName" label="Name" error={errors.inviteeName}>
            <Input
              id="inviteeName"
              autoComplete="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-invalid={Boolean(errors.inviteeName)}
              aria-describedby={errors.inviteeName ? "inviteeName-error" : undefined}
              required
            />
          </Field>
          <Field id="inviteeEmail" label="Email" error={errors.inviteeEmail}>
            <Input
              id="inviteeEmail"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              aria-invalid={Boolean(errors.inviteeEmail)}
              aria-describedby={errors.inviteeEmail ? "inviteeEmail-error" : undefined}
              required
            />
          </Field>
          {questions.map((q) => {
            const id = `answers.${q.id}`;
            const common = {
              id,
              value: form.answers[q.id] ?? "",
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setForm({ ...form, answers: { ...form.answers, [q.id]: e.target.value } }),
              "aria-invalid": Boolean(errors[id]),
              "aria-describedby": errors[id] ? `${id}-error` : undefined,
              required: q.required,
            };
            return (
              <Field
                key={q.id}
                id={id}
                label={q.required ? q.label : `${q.label} (optional)`}
                error={errors[id]}
              >
                {q.type === "long_text" ? (
                  <textarea className={textareaClass} {...common} />
                ) : (
                  <Input {...common} />
                )}
              </Field>
            );
          })}
          <Field id="notes" label="Anything else? (optional)" error={errors.notes}>
            <textarea
              id="notes"
              className={textareaClass}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Booking…" : "Confirm booking"}
            </Button>
            <p role="status" className="text-destructive text-sm">
              {formError}
            </p>
          </div>
        </form>
      </section>
    );
  }

  const dates = [...byDate.keys()];
  const times = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
    <section aria-labelledby="pick-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2
          id="pick-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          Pick a time
        </h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="invitee-tz" className="text-muted-foreground text-sm">
            Times are shown in
          </label>
          <select
            id="invitee-tz"
            className={`${selectClass} max-w-sm`}
            value={timeZone ?? ""}
            onChange={(e) => setTimeZone(e.target.value)}
            disabled={!timeZone}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notice && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 rounded-md border p-3 text-sm"
        >
          {notice}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoBack}
          onClick={() => setWindowStart((w) => Math.max(firstWindow!, w! - WINDOW_DAYS * DAY))}
        >
          <ChevronLeft /> Earlier
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoForward}
          onClick={() => setWindowStart((w) => w! + WINDOW_DAYS * DAY)}
        >
          Later <ChevronRight />
        </Button>
      </div>

      {loadError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm">
          {loadError}
          <Button type="button" variant="outline" size="sm" onClick={() => void loadSlots()}>
            Try again
          </Button>
        </div>
      ) : slots === null || !fmt ? (
        <p className="text-muted-foreground text-sm" role="status">
          Loading available times…
        </p>
      ) : dates.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          No times available in this period.{canGoForward ? " Try later dates." : ""}
        </p>
      ) : (
        <>
          <div role="group" aria-label="Available days" className="flex flex-wrap gap-2">
            {dates.map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={d === selectedDate ? "default" : "outline"}
                aria-pressed={d === selectedDate}
                onClick={() => setSelectedDate(d)}
              >
                {fmt.day.format(new Date(byDate.get(d)![0]!))}
              </Button>
            ))}
          </div>
          <div
            role="group"
            aria-label="Available times"
            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            {times.map((s) => (
              <Button
                key={s}
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedSlot(s);
                  setNotice(null);
                  setFormError(null);
                  setStep("details");
                }}
              >
                {fmt.time.format(new Date(s))}
              </Button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Confirmation({
  confirmation: c,
  fmt,
  timeZone,
  headingRef,
}: {
  confirmation: BookingConfirmation;
  fmt: { longDay: Intl.DateTimeFormat; time: Intl.DateTimeFormat };
  timeZone: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const start = new Date(c.startAt);
  const end = new Date(c.endAt);
  const event = { ...c.calendar, startAt: start, endAt: end };
  const icsHref = useMemo(
    () => `data:text/calendar;charset=utf-8,${encodeURIComponent(c.ics)}`,
    [c.ics],
  );

  return (
    <section aria-labelledby="done-heading" className="flex flex-col gap-4">
      <h2
        id="done-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold outline-none"
      >
        You&apos;re booked
      </h2>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">What</dt>
        <dd>
          {c.meetingTypeName} with {c.hostName}
        </dd>
        <dt className="text-muted-foreground">When</dt>
        <dd>
          {fmt.longDay.format(start)}, {fmt.time.format(start)} – {fmt.time.format(end)} (
          {timeZone.replaceAll("_", " ")})
        </dd>
        <dt className="text-muted-foreground">{c.locationLabel}</dt>
        <dd className="break-all">
          {/^https?:\/\//.test(c.locationValue) ? (
            <a
              className="text-primary underline"
              href={c.locationValue}
              target="_blank"
              rel="noreferrer"
            >
              {c.locationValue}
            </a>
          ) : (
            c.locationValue
          )}
        </dd>
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Add to your calendar</h3>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
              <CalendarPlus /> Google Calendar
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={outlookCalendarUrl(event)} target="_blank" rel="noreferrer">
              <CalendarPlus /> Outlook
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={icsHref} download="slotwise-booking.ics">
              <Download /> Apple / other (.ics)
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
