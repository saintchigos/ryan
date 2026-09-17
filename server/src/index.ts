import express from 'express';
import cors from 'cors';
import {
  config,
  brainConfigured,
  calendarConfigured,
  devicesEnabled,
  emailConfigured,
  homeConfigured,
  telecomConfigured,
} from './config.js';
import { requireToken } from './auth.js';
import { chatRouter } from './routes/chat.js';
import { memoryRouter } from './routes/memories.js';
import { callRouter } from './routes/call.js';
import { deviceRouter } from './routes/devices.js';
import { tools } from './agent/tools/index.js';

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: config.clientOrigins.includes('*') ? true : config.clientOrigins,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-ryan-token'],
  }),
);

function integrations() {
  return {
    brain: brainConfigured(),
    telecom: telecomConfigured(),
    home: homeConfigured(),
    calendar: calendarConfigured(),
    email: emailConfigured(),
    devices: devicesEnabled(),
    secured: Boolean(config.apiToken),
    search: config.search.tavilyApiKey ? 'tavily' : config.search.braveApiKey ? 'brave' : 'duckduckgo',
  };
}

app.get('/', (_req, res) => {
  res.json({
    name: 'Ryan',
    status: 'online',
    integrations: integrations(),
    tools: tools.map((tool) => tool.name),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use('/api', requireToken);

app.get('/api/capabilities', (_req, res) => {
  res.json({
    ...integrations(),
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
  });
});

app.use('/api', chatRouter);
app.use('/api', memoryRouter);
app.use('/api', callRouter);
app.use('/api', deviceRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(config.port, () => {
  console.log(`Ryan server listening on http://localhost:${config.port}`);
  if (!brainConfigured()) {
    console.warn('Ryan has no brain configured. Set RYAN_LLM_API_KEY to bring him online.');
  }
  if (!config.apiToken) {
    console.warn('No RYAN_API_TOKEN set. Sensitive routes are unprotected - do not expose publicly.');
  }
});
