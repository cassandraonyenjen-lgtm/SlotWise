"use client";

import { ChevronLeft, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  hostCancelAction,
  hostRescheduleAction,
  hostSlotsAction,
  markNoShowAction,
} from "@/features/booking-management/actions";
import { MAX_NOTE_LENGTH } from "@/features/booking-management/schemas";
import { Field, textareaClass } from "@/features/booking-page/components/field";
import { SlotPicker, useSlotFormatters } from "@/features/booking-page/components/slot-picker";
import type { DetailView } from "../detail";

type Mode = "view" | "reschedule" | "confirm-reschedule" | "cancel";

const STATUS_LABEL = { confirmed: "Confirmed", cancelled: "Cancelled", no_show: "No-show" };

/** One booking's details and the host's actions on it (F3.2, F3.5, F5.3). */
export function BookingPanel({
  detail,
  hostTimezone,
  onClose,
  onChanged,
}: {
  detail: DetailView;
  hostTimezone: string;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const [timeZone, setTimeZone] = useState<string | null>(hostTimezone);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fmt = useSlotFormatters(timeZone);

  useEffect(() => {
    setMode("view");
    setNote("");
    setError(null);
    headingRef.current?.focus();
  }, [detail.id]);

  const fetchSlots = useCallback(
    (from: Date, to: Date) =>
      hostSlotsAction(detail.id, { from: from.toISOString(), to: to.toISOString() }),
    [detail.id],
  );

  const run = (
    action: () => Promise<{ ok: boolean; error?: string; taken?: true }>,
    done: string,
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMode("view");
        setNote("");
        onChanged(done);
      } else if ("taken" in result && result.taken) {
        setNotice(result.error ?? null);
        setReloadKey((k) => k + 1);
        setMode("reschedule");
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  };

  const noteField = (label: string, hint: string) => (
    <Field id="host-note" label={label} hint={hint}>
      <textarea
        id="host-note"
        className={textareaClass}
        value={note}
        maxLength={MAX_NOTE_LENGTH}
        onChange={(e) => setNote(e.target.value)}
      />
    </Field>
  );

  return (
    <aside
      aria-labelledby="booking-panel-heading"
      className="bg-card flex flex-col gap-4 rounded-lg border p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2
            id="booking-panel-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            {detail.inviteeName}
          </h2>
          <p className="text-muted-foreground text-sm">
            {detail.meetingTypeName} ·{" "}
            <span data-testid="booking-status">{STATUS_LABEL[detail.status]}</span>
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close details"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      {mode === "view" && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">When</dt>
            <dd>
              <span className={detail.status === "cancelled" ? "line-through" : undefined}>
                {detail.when}
              </span>
              {detail.inviteeWhen && (
                <span className="text-muted-foreground block">
                  Their time: {detail.inviteeWhen}
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">
              <a className="text-primary underline" href={`mailto:${detail.inviteeEmail}`}>
                {detail.inviteeEmail}
              </a>
            </dd>
            <dt className="text-muted-foreground">{detail.location.label}</dt>
            <dd className="break-words">{detail.location.value}</dd>
            {detail.answers.map((a) => (
              <Row key={a.label} label={a.label} value={a.answer} />
            ))}
            {detail.notes && <Row label="Notes" value={detail.notes} />}
            {detail.cancelReason && <Row label="Cancel reason" value={detail.cancelReason} />}
          </dl>

          {(detail.canChange || detail.canMarkNoShow) && (
            <div className="flex flex-wrap gap-2">
              {detail.canChange && (
                <>
                  <Button type="button" size="sm" onClick={() => setMode("reschedule")}>
                    Reschedule
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setMode("cancel")}
                  >
                    Cancel booking
                  </Button>
                </>
              )}
              {detail.canMarkNoShow && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => markNoShowAction(detail.id), "Marked as a no-show.")}
                >
                  Mark as no-show
                </Button>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <section aria-label="Booking history" className="border-t pt-3">
            <h3 className="mb-2 text-sm font-medium">History</h3>
            <ol className="flex flex-col gap-1 text-sm">
              {detail.history.map((h) => (
                <li key={h.id}>
                  <span className="text-muted-foreground">{h.at}</span> · {h.text}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {mode === "reschedule" && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="link"
            className="self-start px-0"
            onClick={() => setMode("view")}
          >
            <ChevronLeft /> Back
          </Button>
          <SlotPicker
            timeZone={timeZone}
            onTimeZoneChange={setTimeZone}
            fetchSlots={fetchSlots}
            maxDaysAhead={detail.maxDaysAhead}
            reloadKey={reloadKey}
            notice={notice}
            onPick={(s) => {
              setSelected(s);
              setNotice(null);
              setMode("confirm-reschedule");
            }}
            heading={<h3 className="font-medium">Pick a new time</h3>}
          />
        </div>
      )}

      {mode === "confirm-reschedule" && selected && fmt && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => hostRescheduleAction(detail.id, { startAt: selected, message: note }),
              `Moved. ${detail.inviteeName} has been emailed.`,
            );
          }}
        >
          <Button
            type="button"
            variant="link"
            className="self-start px-0"
            onClick={() => setMode("reschedule")}
          >
            <ChevronLeft /> Change time
          </Button>
          <p className="text-sm">
            Move to{" "}
            <strong>
              {fmt.longDay.format(new Date(selected))}, {fmt.time.format(new Date(selected))}
            </strong>
            ?
          </p>
          {noteField("Message (optional)", `Included in the email to ${detail.inviteeName}.`)}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Moving…" : "Move and notify"}
            </Button>
            <p role="status" className="text-destructive text-sm">
              {error}
            </p>
          </div>
        </form>
      )}

      {mode === "cancel" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => hostCancelAction(detail.id, { reason: note }),
              `Cancelled. ${detail.inviteeName} has been emailed.`,
            );
          }}
        >
          <Button
            type="button"
            variant="link"
            className="self-start px-0"
            onClick={() => setMode("view")}
          >
            <ChevronLeft /> Back
          </Button>
          {noteField(
            "Message (optional)",
            `Included in the cancellation email to ${detail.inviteeName}.`,
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Cancelling…" : "Cancel and notify"}
            </Button>
            <p role="status" className="text-destructive text-sm">
              {error}
            </p>
          </div>
        </form>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-line">{value}</dd>
    </>
  );
}
