import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

// Routes that must stay reachable without the user API token:
// - health checks
// - device enrolment / polling (authenticated by the pairing secret or device token)
// - the Twilio voice webhook (called by Twilio, not a browser)
const PUBLIC_PATHS = [
  /^\/health\/?$/,
  /^\/devices\/register\/?$/,
  /^\/devices\/[^/]+\/poll\/?$/,
  /^\/devices\/[^/]+\/result\/?$/,
  /^\/call\/twilio\/voice\/?$/,
];

export function requireToken(req: Request, res: Response, next: NextFunction): void {
  if (!config.apiToken) {
    next();
    return;
  }

  if (PUBLIC_PATHS.some((pattern) => pattern.test(req.path))) {
    next();
    return;
  }

  const header = req.header('authorization') ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const token = bearer || req.header('x-ryan-token') || '';

  if (token && token === config.apiToken) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized. Provide a valid Ryan API token.' });
}
