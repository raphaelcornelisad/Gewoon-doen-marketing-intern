/** Zet een Calendly-event + invitee om naar een rij voor acq_meetings. */

export interface CalendlyEvent {
  uri: string;
  name: string;
  start_time: string;
  status: "active" | "canceled";
}

export interface CalendlyInvitee {
  uri: string;
  email?: string | null;
  name?: string | null;
  status: "active" | "canceled";
  no_show?: unknown | null;
  text_reminder_number?: string | null;
  tracking?: { utm_source?: string | null } | null;
  questions_and_answers?: { question: string; answer: string }[] | null;
}

export interface MeetingRow {
  invitee_uri: string;
  event_uri: string;
  event_name: string;
  start_time: string;
  status: "active" | "canceled";
  no_show: boolean;
  email: string | null;
  phone: string | null;
  naam: string;
  utm_source: string | null;
}

export function toMeetingRow(e: CalendlyEvent, i: CalendlyInvitee): MeetingRow {
  const phoneAnswer = i.questions_and_answers?.find((q) => /telefoon|phone|mobiel|nummer/i.test(q.question))?.answer;
  return {
    invitee_uri: i.uri,
    event_uri: e.uri,
    event_name: e.name.trim(),
    start_time: e.start_time,
    // Een afspraak is alleen actief als zowel het event als de gast actief is.
    status: e.status === "canceled" || i.status === "canceled" ? "canceled" : "active",
    no_show: !!i.no_show,
    email: i.email?.trim().toLowerCase() || null,
    phone: i.text_reminder_number || phoneAnswer || null,
    naam: (i.name ?? "").trim(),
    utm_source: i.tracking?.utm_source?.trim().toLowerCase() || null,
  };
}
