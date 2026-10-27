"use client";

import { CalendarPlus, ChevronLeft, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Turnstile } from "@/components/turnstile";
import { Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/action-result";
import { bookSlotAction, type BookingConfirmation } from "../booking-actions";
import { googleCalendarUrl, outlookCalendarUrl } from "../calendar-urls";
import { bookingRequestSchema } from "../schemas";
import { Field, textareaClass } from "./field";
import { SlotPicker, useBrowserTimeZone, useSlotFormatters } from "./slot-picker";

export interface BookingFlowProps {
  username: string;
  slug: string;
  durationMin: number;
  maxDaysAhead: number;
  questions: { id: string; label: string; type: "short_text" | "long_text"; required: boolean }[];
  /** Cloudflare Turnstile site key; null when bot protection is off. */
  turnstileSiteKey?: string | null;
}

type Step = "pick" | "details" | "done";

/**
 * The invitee's three steps (F2.4): pick a time, enter details, see the confirmation.
 * Slots arrive as UTC instants and are shown in the invitee's zone, which they can change (F2.3).
 */
export function BookingFlow(props: BookingFlowProps) {
  const { username, slug, durationMin, maxDaysAhead, questions } = props;
  const [timeZone, setTimeZone] = useBrowserTimeZone();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const needsTurnstile = Boolean(props.turnstileSiteKey);
  const [reloadKey, setReloadKey] = useState(0);
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
  const fmt = useSlotFormatters(timeZone);

  const fetchSlots = useCallback(
    async (from: Date, to: Date) => {
      const params = new URLSearchParams({
        username,
        slug,
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const res = await fetch(`/api/public/slots?${params}`, { cache: "no-store" });
      if (!res.ok) return null;
      return ((await res.json()) as { slots: string[] }).slots;
    },
    [username, slug],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

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
      const result = await bookSlotAction({ ...input, turnstileToken });
      // A token is single-use; get a fresh one for any retry.
      if (!result.ok) setTurnstileReset((k) => k + 1);
      if (result.ok) {
        setConfirmation(result.data);
        setStep("done");
      } else if ("taken" in result) {
        setNotice(result.error);
        setSelectedSlot(null);
        setStep("pick");
        setReloadKey((k) => k + 1);
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
          <Turnstile
            siteKey={props.turnstileSiteKey ?? null}
            onToken={setTurnstileToken}
            resetKey={turnstileReset}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending || (needsTurnstile && !turnstileToken)}>
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

  return (
    <section aria-labelledby="pick-heading">
      <SlotPicker
        timeZone={timeZone}
        onTimeZoneChange={setTimeZone}
        fetchSlots={fetchSlots}
        maxDaysAhead={maxDaysAhead}
        reloadKey={reloadKey}
        notice={notice}
        onPick={(s) => {
          setSelectedSlot(s);
          setNotice(null);
          setFormError(null);
          setStep("details");
        }}
        heading={
          <h2
            id="pick-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            Pick a time
          </h2>
        }
      />
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
