import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { config } from '../../config.js';
import type { ToolDef } from '../types.js';

function imapClient(): ImapFlow {
  return new ImapFlow({
    host: config.email.imapHost,
    port: config.email.imapPort,
    secure: config.email.imapSecure,
    auth: { user: config.email.user, pass: config.email.password },
    logger: false,
  });
}

async function withInbox<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  if (!config.email.imapHost) {
    throw new Error('Email reading is not configured. Set EMAIL_IMAP_HOST, EMAIL_USER and EMAIL_PASSWORD.');
  }
  const client = imapClient();
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    return await fn(client);
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

function extractEmail(raw: string): string {
  const blank = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') + 4 : raw.indexOf('\n\n') + 2;
  const headers = blank > 2 ? raw.slice(0, blank) : raw;
  let body = blank > 2 ? raw.slice(blank) : '';

  const header = (name: string): string => {
    const match = headers.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'));
    return match ? match[1].trim() : '';
  };

  const encoding = header('Content-Transfer-Encoding').toLowerCase();
  if (encoding === 'base64') {
    try {
      body = Buffer.from(body, 'base64').toString('utf8');
    } catch {
      /* keep raw */
    }
  } else if (encoding === 'quoted-printable') {
    body = decodeQuotedPrintable(body);
  }

  const plain = body.match(/Content-Type:\s*text\/plain[^\n]*\n[\s\S]*?\n\n([\s\S]*?)(?=\n--|\nContent-Type:|$)/i);
  if (plain) body = plain[1];

  body = body
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return [
    `From: ${header('From')}`,
    `To: ${header('To')}`,
    `Date: ${header('Date')}`,
    `Subject: ${header('Subject')}`,
    '',
    body,
  ].join('\n');
}

export const emailListTool: ToolDef = {
  name: 'email_list',
  description: 'List the most recent emails in the inbox with sender, date and subject.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'How many recent emails to list (1-25). Defaults to 10.' },
    },
  },
  async run(args) {
    const limit = Math.min(25, Math.max(1, Number(args.limit ?? 10)));
    return withInbox(async (client) => {
      const mailbox = client.mailbox;
      const exists = mailbox && typeof mailbox !== 'boolean' ? mailbox.exists : 0;
      if (!exists) return 'The inbox is empty.';

      const start = Math.max(1, exists - limit + 1);
      const lines: string[] = [];
      for await (const message of client.fetch(`${start}:*`, { envelope: true })) {
        const envelope = message.envelope;
        const from = envelope?.from?.[0]?.address ?? 'unknown';
        const subject = envelope?.subject ?? '(no subject)';
        const date = envelope?.date ? new Date(envelope.date).toISOString() : '';
        lines.push(`#${message.seq} | ${date} | ${from} | ${subject}`);
      }
      return lines.reverse().join('\n') || 'No messages.';
    });
  },
};

export const emailReadTool: ToolDef = {
  name: 'email_read',
  description:
    'Read the full content of a specific email. Use the "#number" shown by email_list as the id.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'The message sequence number from email_list.' },
    },
    required: ['id'],
  },
  async run(args) {
    const id = Number(args.id);
    if (!Number.isFinite(id)) throw new Error('A numeric message id is required.');
    return withInbox(async (client) => {
      const message = await client.fetchOne(String(id), { source: true });
      if (!message || !message.source) return `No email with id ${id}.`;
      return extractEmail(message.source.toString('utf8')).slice(0, 10000);
    });
  },
};

export const emailSendTool: ToolDef = {
  name: 'email_send',
  description: 'Send an email from the connected account.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string' },
      body: { type: 'string', description: 'Plain-text body of the email.' },
    },
    required: ['to', 'subject', 'body'],
  },
  async run(args) {
    if (!config.email.smtpHost) {
      throw new Error('Email sending is not configured. Set EMAIL_SMTP_HOST, EMAIL_USER and EMAIL_PASSWORD.');
    }
    const transporter = nodemailer.createTransport({
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      secure: config.email.smtpSecure,
      auth: { user: config.email.user, pass: config.email.password },
    });
    const info = await transporter.sendMail({
      from: config.email.from,
      to: String(args.to),
      subject: String(args.subject),
      text: String(args.body),
    });
    return `Email sent to ${args.to} (message id ${info.messageId}).`;
  },
};
