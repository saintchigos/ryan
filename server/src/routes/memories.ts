import { Router } from 'express';
import { memoryStore } from '../store.js';

export const memoryRouter = Router();

function sessionOf(req: import('express').Request): string {
  const value = (req.query.sessionId ?? req.body?.sessionId ?? 'default') as string;
  return String(value).slice(0, 128);
}

memoryRouter.get('/memories', async (req, res) => {
  res.json({ memories: await memoryStore.list(sessionOf(req)) });
});

memoryRouter.post('/memories', async (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) {
    res.status(400).json({ error: 'text is required.' });
    return;
  }
  const memory = await memoryStore.add(sessionOf(req), text);
  res.status(201).json({ memory });
});

memoryRouter.delete('/memories/:id', async (req, res) => {
  const removed = await memoryStore.remove(sessionOf(req), req.params.id);
  res.json({ removed });
});
