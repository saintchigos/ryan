import { randomUUID } from 'node:crypto';
import { config, calendarConfigured } from '../../config.js';
import type { ToolDef } from '../types.js';
import { USER_AGENT, decodeEntities } from './util.js';

interface CalendarEvent {
  start: Date;
  end: Date | null;
  summary: string;
  location: string;
  description: string;
}

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseIcsDate(value: string): Date | null {
  const raw = value.trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [, year, month, day, hour, minute, second, zulu] = match;
  if (hour === undefined) {
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  if (zulu) {
    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
    );
  }
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

function parseEvents(ics: string): CalendarEvent[] {
  const unfolded = unfold(ics);
  const events: CalendarEvent[] = [];

  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0];
    const field = (name: string): string => {
      const match = body.match(new RegExp(`^${name}[^:\\r\\n]*:(.*)$`, 'im'));
      return match ? match[1].trim() : '';
    };

    const start = parseIcsDate(field('DTSTART'));
    if (!start) continue;
    const end = parseIcsDate(field('DTEND'));

    events.push({
      start,
      end,
      summary: field('SUMMARY') || '(no title)',
      location: field('LOCATION'),
      description: field('DESCRIPTION').replace(/\\n/g, ' ').slice(0, 300),
    });
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function formatEvents(events: CalendarEvent[]): string {
  if (!events.length) return 'No upcoming events in that window.';
  return events
    .map((event) => {
      const when = event.start.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      const where = event.location ? ` @ ${event.location}` : '';
      const notes = event.description ? `\n   ${event.description}` : '';
      return `- ${when} | ${event.summary}${where}${notes}`;
    })
    .join('\n');
}

async function fetchIcs(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Calendar feed responded ${response.status}.`);
  return response.text();
}

function caldavAuth(): string {
  const raw = `${config.calendar.caldavUser}:${config.calendar.caldavPassword}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

function caldavStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

async function caldavQuery(start: Date, end: Date): Promise<CalendarEvent[]> {
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${caldavStamp(start)}" end="${caldavStamp(end)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;

  const response = await fetch(config.calendar.caldavUrl, {
    method: 'REPORT',
    headers: {
      Authorization: caldavAuth(),
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body,
  });
  if (!response.ok) throw new Error(`CalDAV responded ${response.status}.`);
  const xml = await response.text();

  const events: CalendarEvent[] = [];
  const regex = /<(?:[a-z0-9]+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?calendar-data>/gi;
  for (const match of xml.matchAll(regex)) {
    events.push(...parseEvents(decodeEntities(match[1])));
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export const calendarListTool: ToolDef = {
  name: 'calendar_list',
  description:
    'Read upcoming calendar events (from the connected ICS feed or CalDAV calendar). Use this to answer questions about the schedule or to find a good time.',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: 'How many days ahead to look. Defaults to 7.' },
    },
  },
  async run(args) {
    if (!calendarConfigured()) {
      throw new Error(
        'Calendar is not connected. Set CALENDAR_ICS_URL (read) and/or CALDAV_URL (read/write).',
      );
    }
    const days = Math.min(365, Math.max(1, Number(args.days ?? 7)));
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const events = config.calendar.icsUrl
      ? parseEvents(await fetchIcs(config.calendar.icsUrl)).filter(
          (event) => event.start >= now && event.start <= until,
        )
      : await caldavQuery(now, until);

    return formatEvents(events.slice(0, 40));
  },
};

export const calendarCreateTool: ToolDef = {
  name: 'calendar_create',
  description:
    'Create a calendar event. Requires a CalDAV calendar to be configured (CALDAV_URL, CALDAV_USER, CALDAV_PASSWORD).',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Event title.' },
      start: { type: 'string', description: 'Start time as an ISO 8601 string.' },
      duration_minutes: { type: 'number', description: 'Length in minutes. Defaults to 60.' },
      location: { type: 'string' },
      description: { type: 'string' },
    },
    required: ['summary', 'start'],
  },
  async run(args) {
    if (!config.calendar.caldavUrl) {
      throw new Error('Creating events requires CALDAV_URL, CALDAV_USER and CALDAV_PASSWORD.');
    }
    const start = new Date(String(args.start));
    if (Number.isNaN(start.getTime())) {
      throw new Error('The start time must be a valid ISO 8601 date string.');
    }
    const duration = Math.max(1, Number(args.duration_minutes ?? 60));
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const uid = `${randomUUID()}@ryan`;

    const escape = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Ryan//Assistant//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${caldavStamp(new Date())}`,
      `DTSTART:${caldavStamp(start)}`,
      `DTEND:${caldavStamp(end)}`,
      `SUMMARY:${escape(String(args.summary))}`,
    ];
    if (args.location) lines.push(`LOCATION:${escape(String(args.location))}`);
    if (args.description) lines.push(`DESCRIPTION:${escape(String(args.description))}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');

    const url = `${config.calendar.caldavUrl.replace(/\/+$/, '')}/${uid}.ics`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: caldavAuth(),
        'Content-Type': 'text/calendar; charset=utf-8',
        'If-None-Match': '*',
      },
      body: lines.join('\r\n'),
    });

    if (![200, 201, 204].includes(response.status)) {
      const detail = await response.text().catch(() => '');
      throw new Error(`CalDAV rejected the event (${response.status}). ${detail.slice(0, 200)}`);
    }

    return `Created event "${args.summary}" at ${start.toISOString()} for ${duration} minutes.`;
  },
};
