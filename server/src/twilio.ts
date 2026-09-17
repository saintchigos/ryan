import { config, telecomConfigured } from './config.js';

const API = 'https://api.twilio.com/2010-04-01/Accounts';

function authHeader(): string {
  const raw = `${config.twilio.accountSid}:${config.twilio.authToken}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

async function request<T>(resource: string, init: RequestInit): Promise<T> {
  if (!telecomConfigured()) {
    throw new Error('Twilio is not configured. Set TWILIO_* environment variables.');
  }
  const response = await fetch(`${API}/${config.twilio.accountSid}/${resource}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : text.slice(0, 300);
    throw new Error(`Twilio error (${response.status}): ${detail}`);
  }
  return data as T;
}

function form(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

export interface TwilioMessage {
  sid: string;
  direction: string;
  from: string;
  to: string;
  body: string;
  status: string;
  dateSent: string | null;
}

export async function createCall(to: string, message: string): Promise<{ sid: string; status: string }> {
  const twiml = `<Response><Say voice="Polly.Matthew">${escapeXml(message)}</Say></Response>`;
  const data = await request<{ sid: string; status: string }>(
    'Calls.json',
    {
      method: 'POST',
      body: form({ To: to, From: config.twilio.fromNumber, Twiml: twiml }),
    },
  );
  return { sid: data.sid, status: data.status };
}

export async function sendSms(to: string, body: string): Promise<{ sid: string; status: string }> {
  const data = await request<{ sid: string; status: string }>('Messages.json', {
    method: 'POST',
    body: form({ To: to, From: config.twilio.fromNumber, Body: body }),
  });
  return { sid: data.sid, status: data.status };
}

export async function listMessages(options: {
  withNumber?: string;
  limit?: number;
}): Promise<TwilioMessage[]> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const query = new URLSearchParams({ PageSize: String(limit) });
  if (options.withNumber) {
    query.set(config.twilio.fromNumber === options.withNumber ? 'From' : 'To', options.withNumber);
  }

  const data = await request<{
    messages?: Array<{
      sid: string;
      direction: string;
      from: string;
      to: string;
      body: string;
      status: string;
      date_sent: string | null;
    }>;
  }>(`Messages.json?${query.toString()}`, { method: 'GET' });

  return (data.messages ?? []).map((message) => ({
    sid: message.sid,
    direction: message.direction,
    from: message.from,
    to: message.to,
    body: message.body,
    status: message.status,
    dateSent: message.date_sent,
  }));
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
