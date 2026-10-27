"use client";

import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, textareaClass } from "@/features/booking-page/components/field";
import {
  SlotPicker,
  useBrowserTimeZone,
  useSlotFormatters,
} from "@/features/booking-page/components/slot-picker";
import { manageCancelAction, manageRescheduleAction, manageSlotsAction } from "../actions";
import { MAX_NOTE_LENGTH } from "../schemas";

type Mode = "menu" | "reschedule" | "confirm-reschedule" | "cancel" | "rescheduled" | "cancelled";

export interface ManageBookingProps {
  token: string;
  startAt: string;
  inviteeTimezone: string;
  durationMin: number;
  maxDaysAhead: number;
  hostName: string;
  bookAgainHref: string | null;
  initialAction: "reschedule" | "cancel" | null;
}

/** The invitee's reschedule and cancel steps (F5.1, F5.2). No account: the link is the key. */
export function ManageBooking(props: ManageBookingProps) {
  const { token, durationMin, maxDaysAhead, hostName } = props;
  const [mode, setMode] = useState<Mode>(props.initialAction ?? "menu");
  const [timeZone, setTimeZone] = useBrowserTimeZone(props.inviteeTimezone);
  const [selected, setSelected] = useState<string | null>(null);
  const [newStart, setNewStart] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fmt = useSlotFormatters(timeZone);

  useEffect(() => {
    headingRef.current?.focus();
  }, [mode]);

  const fetchSlots = useCallback(
    (from: Date, to: Date) =>
      manageSlotsAction(token, { from: from.toISOString(), to: to.toISOString() }),
    [token],
  );

  const when = (iso: string) =>
    fmt ? `${fmt.longDay.format(new Date(iso))}, ${fmt.time.format(new Date(iso))}` : "";

  const heading = (text: string) => (
    <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
      {text}
    </h2>
  );

  const back = (
    <Button
      type="button"
      variant="link"
      className="self-start px-0"
      onClick={() => setMode("menu")}
    >
      <ChevronLeft /> Back
    </Button>
  );

  const reschedule = () => {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await manageRescheduleAction(token, { startAt: selected });
      if (result.ok) {
        setNewStart(selected);
        setMode("rescheduled");
      } else if ("taken" in result) {
        setNotice(result.error);
        setSelected(null);
        setReloadKey((k) => k + 1);
        setMode("reschedule");
      } else {
        setError(result.error);
      }
    });
  };

  const cancel = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await manageCancelAction(token, { reason });
      if (result.ok) setMode("cancelled");
      else setError(("fieldErrors" in result && result.fieldErrors?.reason) || result.error);
    });
  };

  if (mode === "rescheduled" && newStart) {
    return (
      <section className="flex flex-col gap-2" aria-live="polite">
        {heading("You're rescheduled")}
        <p className="text-sm">
          Your meeting with {hostName} is now on <strong>{when(newStart)}</strong> ({durationMin}{" "}
          min). We&apos;ve emailed you an updated calendar invite.
        </p>
      </section>
    );
  }

  if (mode === "cancelled") {
    return (
      <section className="flex flex-col gap-3">
        {heading("Your meeting is cancelled")}
        <p className="text-sm">
          We&apos;ve let {hostName} know. You&apos;ll get an email to confirm.
        </p>
        {props.bookAgainHref && (
          <Button asChild variant="outline" className="self-start">
            <a href={props.bookAgainHref}>Book another time</a>
          </Button>
        )}
      </section>
    );
  }

  if (mode === "reschedule") {
    return (
      <section className="flex flex-col gap-2">
        {back}
        <SlotPicker
          timeZone={timeZone}
          onTimeZoneChange={setTimeZone}
          fetchSlots={fetchSlots}
          maxDaysAhead={maxDaysAhead}
          reloadKey={reloadKey}
          notice={notice}
          onPick={(s) => {
            setSelected(s);
            setNotice(null);
            setError(null);
            setMode("confirm-reschedule");
          }}
          heading={heading("Pick a new time")}
        />
      </section>
    );
  }

  if (mode === "confirm-reschedule" && selected) {
    return (
      <section className="flex flex-col gap-4">
        <Button
          type="button"
          variant="link"
          className="self-start px-0"
          onClick={() => setMode("reschedule")}
        >
          <ChevronLeft /> Change time
        </Button>
        {heading("Move your meeting?")}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">From</dt>
          <dd className="line-through">{when(props.startAt)}</dd>
          <dt className="text-muted-foreground">To</dt>
          <dd className="font-medium">{when(selected)}</dd>
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={reschedule} disabled={pending}>
            {pending ? "Moving…" : "Confirm new time"}
          </Button>
          <p role="status" className="text-destructive text-sm">
            {error}
          </p>
        </div>
      </section>
    );
  }

  if (mode === "cancel") {
    return (
      <section className="flex flex-col gap-4">
        {back}
        {heading("Cancel this meeting?")}
        <form onSubmit={cancel} className="flex flex-col gap-4">
          <Field
            id="reason"
            label="Reason (optional)"
            hint={`Shared with ${hostName}.`}
            error={error ?? undefined}
          >
            <textarea
              id="reason"
              className={textareaClass}
              value={reason}
              maxLength={MAX_NOTE_LENGTH}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="destructive" className="self-start" disabled={pending}>
            {pending ? "Cancelling…" : "Cancel meeting"}
          </Button>
        </form>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {heading("What would you like to do?")}
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => setMode("reschedule")}>
          Reschedule
        </Button>
        <Button type="button" variant="outline" onClick={() => setMode("cancel")}>
          Cancel meeting
        </Button>
      </div>
    </section>
  );
}
