import { Router } from 'express';
import { runAgent } from '../agent/index.js';
import type { Message } from '../agent/types.js';

export const chatRouter = Router();

function sse(res: import('express').Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

chatRouter.post('/chat', async (req, res) => {
  const body = (req.body ?? {}) as {
    sessionId?: string;
    messages?: Array<{ role?: string; content?: string }>;
  };

  const sessionId = String(body.sessionId ?? 'default').slice(0, 128);

  const messages: Message[] = (body.messages ?? [])
    .filter((message) => message && typeof message.content === 'string')
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: String(message.content),
    }))
    .slice(-40);

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    res.status(400).json({ error: 'The last message must be from the user.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  const keepAlive = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, 15000);

  try {
    await runAgent({
      sessionId,
      messages,
      onEvent: (event) => {
        if (!closed) sse(res, event.type, event);
      },
    });
  } catch (error) {
    if (!closed) {
      sse(res, 'error', { type: 'error', text: (error as Error).message });
    }
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});
