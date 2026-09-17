import { Router } from 'express';
import { config, telecomConfigured } from '../config.js';
import { createCall, escapeXml, listMessages, sendSms } from '../twilio.js';

export const callRouter = Router();

callRouter.get('/call/status', (_req, res) => {
  res.json({
    configured: telecomConfigured(),
    provider: 'twilio',
    fromNumber: config.twilio.fromNumber || null,
    requiredEnv: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
  });
});

callRouter.post('/call/dial', async (req, res) => {
  const to = String(req.body?.to ?? '').trim();
  const message = String(req.body?.message ?? '').trim();

  if (!telecomConfigured()) {
    res.status(503).json({
      error: 'Telecom provider is not configured yet.',
      detail: 'Add your Twilio credentials to the server environment to enable real calls.',
    });
    return;
  }
  if (!/^\+?[0-9 ()-]{6,20}$/.test(to)) {
    res.status(400).json({ error: 'A valid phone number is required (E.164 recommended).' });
    return;
  }
  if (!message) {
    res.status(400).json({ error: 'A message for Ryan to say is required.' });
    return;
  }

  try {
    const call = await createCall(to, message);
    res.json({ ok: true, ...call });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

callRouter.post('/call/sms', async (req, res) => {
  const to = String(req.body?.to ?? '').trim();
  const body = String(req.body?.body ?? '').trim();

  if (!telecomConfigured()) {
    res.status(503).json({ error: 'Telecom provider is not configured yet.' });
    return;
  }
  if (!to || !body) {
    res.status(400).json({ error: 'Both "to" and "body" are required.' });
    return;
  }

  try {
    const message = await sendSms(to, body);
    res.json({ ok: true, ...message });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

callRouter.get('/call/messages', async (req, res) => {
  if (!telecomConfigured()) {
    res.status(503).json({ error: 'Telecom provider is not configured yet.' });
    return;
  }
  try {
    const messages = await listMessages({
      withNumber: req.query.with ? String(req.query.with) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 15,
    });
    res.json({ messages });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

// Twilio voice webhook: the words Ryan speaks when the call connects.
callRouter.post('/call/twilio/voice', (req, res) => {
  const say = String(req.body?.Say ?? '').trim();
  const text = say || 'Hello. This is Ryan, calling on behalf of the user.';
  res
    .type('text/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">${escapeXml(
        text,
      )}</Say></Response>`,
    );
});

// Twilio inbound SMS webhook (optional auto-reply surface).
callRouter.post('/call/twilio/sms', (_req, res) => {
  res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});
