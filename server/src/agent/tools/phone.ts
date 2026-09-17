import { telecomConfigured } from '../../config.js';
import { createCall, listMessages, sendSms } from '../../twilio.js';
import type { ToolDef } from '../types.js';

function ensureTelecom(): void {
  if (!telecomConfigured()) {
    throw new Error(
      'Phone calling is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER.',
    );
  }
}

export const callNumberTool: ToolDef = {
  name: 'call_number',
  description:
    'Place a real outbound phone call that speaks a message aloud, then hangs up. Confirm the number and wording with the user before calling.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Destination phone number in E.164 format, e.g. +15550001234.' },
      message: { type: 'string', description: 'What Ryan should say on the call.' },
    },
    required: ['to', 'message'],
  },
  async run(args) {
    ensureTelecom();
    const to = String(args.to ?? '').trim();
    const message = String(args.message ?? '').trim();
    if (!to || !message) throw new Error('Both "to" and "message" are required.');
    const result = await createCall(to, message);
    return `Calling ${to} now (call SID ${result.sid}, status ${result.status}).`;
  },
};

export const sendSmsTool: ToolDef = {
  name: 'send_sms',
  description: 'Send a real text message (SMS) from the configured Twilio number.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Destination phone number in E.164 format.' },
      body: { type: 'string', description: 'The text message to send.' },
    },
    required: ['to', 'body'],
  },
  async run(args) {
    ensureTelecom();
    const to = String(args.to ?? '').trim();
    const body = String(args.body ?? '').trim();
    if (!to || !body) throw new Error('Both "to" and "body" are required.');
    const result = await sendSms(to, body);
    return `Text sent to ${to} (message SID ${result.sid}, status ${result.status}).`;
  },
};

export const listSmsTool: ToolDef = {
  name: 'list_sms',
  description:
    'Read recent text messages sent to or from the Twilio number. Optionally filter to a specific phone number. Use this to catch up on a conversation.',
  parameters: {
    type: 'object',
    properties: {
      with_number: { type: 'string', description: 'Only show texts exchanged with this number.' },
      limit: { type: 'number', description: 'How many messages to read (1-50). Defaults to 10.' },
    },
  },
  async run(args) {
    ensureTelecom();
    const messages = await listMessages({
      withNumber: args.with_number ? String(args.with_number) : undefined,
      limit: Number(args.limit ?? 10),
    });
    if (!messages.length) return 'No text messages found.';
    return messages
      .map((message) => {
        const who = message.direction.startsWith('inbound') ? `from ${message.from}` : `to ${message.to}`;
        return `- ${message.dateSent ?? ''} | ${who} | ${message.body}`;
      })
      .join('\n');
  },
};
