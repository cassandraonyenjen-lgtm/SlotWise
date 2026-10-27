"use client";

import type { EventInput, EventSourceFuncArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useCallback, useEffect, useRef, useState } from "react";
import { addLocalDays } from "@/features/availability/time";
import { bookingDetailAction, calendarDataAction } from "../actions";
import type { DetailView } from "../detail";
import { BookingPanel } from "./booking-panel";

const MOBILE = "(max-width: 767px)";

export interface CalendarViewProps {
  timezone: string;
  businessHours: { daysOfWeek: number[]; startTime: string; endTime: string }[];
  /** Floating host-local "now", so "today" follows the host's zone, not the browser's. */
  now: string;
  initialDate?: string;
  initialBookingId?: string;
}

/**
 * The host's calendar (F3.1–F3.4). Runs in "UTC" with floating host-local times (see
 * floating.ts), so every view shows the host's wall clock. Phones get the agenda list (F3.3).
 */
export function CalendarView(props: CalendarViewProps) {
  const { timezone } = props;
  const calendarRef = useRef<FullCalendar>(null);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialBookingId ?? null);
  const [detail, setDetail] = useState<DetailView | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia(MOBILE);
    setIsMobile(query.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      calendarRef.current?.getApi().changeView(e.matches ? "listWeek" : "timeGridWeek");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const next = await bookingDetailAction(id);
    setDetail(next);
    if (!next) setStatus("That booking couldn't be found.");
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (detail && window.matchMedia(MOBILE).matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panelRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [detail]);

  const events = useCallback(
    async (info: EventSourceFuncArg): Promise<EventInput[]> => {
      const data = await calendarDataAction({
        start: info.startStr,
        end: info.endStr,
        timezone,
      });
      if (!data) throw new Error("Couldn't load bookings");
      const bookings: EventInput[] = data.bookings.map((b) => ({
        id: b.id,
        title: b.status === "no_show" ? `${b.title} (no-show)` : b.title,
        start: b.start,
        end: b.end,
        classNames: ["sw-booking", b.status === "no_show" ? "sw-no-show" : ""],
      }));
      // Blocked days and custom hours sit behind bookings, in their own color (F3.4).
      const blocks: EventInput[] = data.blocks.map((b) =>
        b.hours
          ? {
              start: `${b.date}T${b.hours.start}:00`,
              end: `${b.date}T${b.hours.end}:00`,
              display: "background",
              title: `Custom hours ${b.hours.start}–${b.hours.end}`,
              classNames: ["sw-custom-hours"],
            }
          : {
              start: `${b.date}T00:00:00`,
              end: `${addLocalDays(b.date, 1)}T00:00:00`,
              display: "background",
              title: "Blocked",
              classNames: ["sw-blocked"],
            },
      );
      return [...bookings, ...blocks];
    },
    [timezone],
  );

  const refresh = (message: string) => {
    setStatus(message);
    calendarRef.current?.getApi().refetchEvents();
    if (selectedId) void loadDetail(selectedId);
  };

  if (isMobile === null) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Loading your calendar…
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="sw-calendar min-w-0">
        <p role="status" className="sr-only">
          {status}
        </p>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
          timeZone="UTC"
          now={props.now}
          initialDate={props.initialDate}
          initialView={isMobile ? "listWeek" : "timeGridWeek"}
          headerToolbar={
            isMobile
              ? { left: "prev,next", center: "title", right: "today" }
              : {
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
                }
          }
          footerToolbar={isMobile ? { center: "timeGridDay,listWeek,dayGridMonth" } : undefined}
          buttonText={{ today: "Today", month: "Month", week: "Week", day: "Day", list: "List" }}
          views={{ listWeek: { buttonText: "List" } }}
          height="auto"
          nowIndicator
          businessHours={props.businessHours}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          scrollTime="08:00:00"
          events={events}
          eventClick={(info) => {
            info.jsEvent.preventDefault();
            if (info.event.display === "background") return;
            setSelectedId(info.event.id);
          }}
          noEventsContent="No bookings in this period."
        />
        <p className="text-muted-foreground mt-2 text-xs">
          Times in {timezone.replaceAll("_", " ")}. <span className="sw-legend sw-legend-blocked" />{" "}
          Blocked <span className="sw-legend sw-legend-custom" /> Custom hours
        </p>
      </div>
      <div ref={panelRef}>
        {detail ? (
          <BookingPanel
            detail={detail}
            hostTimezone={timezone}
            onClose={() => setSelectedId(null)}
            onChanged={refresh}
          />
        ) : (
          <p className="text-muted-foreground hidden rounded-lg border border-dashed p-4 text-sm lg:block">
            Select a booking to see its details.
          </p>
        )}
        {status && (
          <p className="text-muted-foreground mt-2 text-sm" aria-hidden>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
