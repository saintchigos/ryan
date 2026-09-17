import { Router } from 'express';
import {
  authenticateDevice,
  enqueueCommand,
  findDevice,
  listDevices,
  registerDevice,
  removeDevice,
  submitResult,
  takePendingCommands,
  waitForResult,
} from '../devices.js';
import { config } from '../config.js';

export const deviceRouter = Router();

function deviceToken(req: import('express').Request): string {
  const header = req.header('authorization') ?? '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

// --- Device-facing endpoints (authenticated by pairing secret / device token) ---

deviceRouter.post('/devices/register', async (req, res) => {
  try {
    const result = await registerDevice({
      name: String(req.body?.name ?? 'Unnamed device'),
      platform: String(req.body?.platform ?? 'unknown'),
      secret: String(req.body?.secret ?? ''),
      id: req.body?.id ? String(req.body.id) : undefined,
      token: req.body?.token ? String(req.body.token) : undefined,
    });
    res.json(result);
  } catch (error) {
    res.status(403).json({ error: (error as Error).message });
  }
});

deviceRouter.post('/devices/:id/poll', async (req, res) => {
  const device = await authenticateDevice(req.params.id, deviceToken(req));
  if (!device) {
    res.status(401).json({ error: 'Invalid device credentials.' });
    return;
  }
  const commands = await takePendingCommands(device);
  res.json({ commands });
});

deviceRouter.post('/devices/:id/result', async (req, res) => {
  const device = await authenticateDevice(req.params.id, deviceToken(req));
  if (!device) {
    res.status(401).json({ error: 'Invalid device credentials.' });
    return;
  }
  device.lastSeen = Date.now();
  const ok = submitResult(
    device,
    String(req.body?.commandId ?? ''),
    Boolean(req.body?.ok),
    String(req.body?.output ?? ''),
  );
  res.json({ accepted: ok });
});

// --- User-facing endpoints (protected by the Ryan API token) ---

deviceRouter.get('/devices', async (_req, res) => {
  res.json({ devices: await listDevices(), enabled: Boolean(config.devices.pairingSecret) });
});

deviceRouter.post('/devices/:id/command', async (req, res) => {
  const device = (await findDevice(req.params.id)) ?? (await findDevice(req.body?.device ?? ''));
  if (!device) {
    res.status(404).json({ error: 'Device not found.' });
    return;
  }

  const action = String(req.body?.action ?? '').trim();
  if (!action) {
    res.status(400).json({ error: 'An action is required.' });
    return;
  }

  const args = (req.body?.args ?? {}) as Record<string, unknown>;
  const command = await enqueueCommand(device, action, args);

  if (req.body?.wait === false) {
    res.json({ commandId: command.id, status: 'pending' });
    return;
  }

  const result = await waitForResult(device, command.id);
  if (!result) {
    res.status(504).json({
      error: 'The device did not respond in time.',
      commandId: command.id,
      hint: 'Make sure the device agent is running and online.',
    });
    return;
  }
  res.json({ commandId: result.id, ok: result.ok, output: result.output ?? '' });
});

deviceRouter.delete('/devices/:id', async (req, res) => {
  res.json({ removed: await removeDevice(req.params.id) });
});
