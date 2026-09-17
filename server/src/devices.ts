import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

export interface DeviceCommand {
  id: string;
  action: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'done';
  output?: string;
  ok?: boolean;
  createdAt: number;
  completedAt?: number;
}

interface DeviceRecord {
  id: string;
  name: string;
  platform: string;
  tokenHash: string;
  createdAt: number;
}

interface Device extends DeviceRecord {
  lastSeen: number;
  pending: DeviceCommand[];
  running: Map<string, DeviceCommand>;
  history: DeviceCommand[];
  waiters: Map<string, (command: DeviceCommand) => void>;
  wake: (() => void) | null;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = config.dataDir || path.resolve(here, '..', 'data');
const file = path.join(dataDir, 'devices.json');
const ONLINE_WINDOW_MS = 30000;

const devices = new Map<string, Device>();
let loaded = false;

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await fs.readFile(file, 'utf8');
    const records = JSON.parse(raw) as DeviceRecord[];
    for (const record of records) {
      devices.set(record.id, {
        ...record,
        lastSeen: 0,
        pending: [],
        running: new Map(),
        history: [],
        waiters: new Map(),
        wake: null,
      });
    }
  } catch {
    /* no devices yet */
  }
}

async function persist(): Promise<void> {
  const records: DeviceRecord[] = [...devices.values()].map((device) => ({
    id: device.id,
    name: device.name,
    platform: device.platform,
    tokenHash: device.tokenHash,
    createdAt: device.createdAt,
  }));
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(records, null, 2), 'utf8');
  } catch {
    /* persistence is best-effort */
  }
}

function isOnline(device: Device): boolean {
  return Date.now() - device.lastSeen < ONLINE_WINDOW_MS;
}

export function publicDevice(device: Device) {
  return {
    id: device.id,
    name: device.name,
    platform: device.platform,
    online: isOnline(device),
    lastSeen: device.lastSeen || null,
    pending: device.pending.length + device.running.size,
  };
}

export async function registerDevice(input: {
  name: string;
  platform: string;
  secret: string;
  id?: string;
  token?: string;
}): Promise<{ id: string; token: string; name: string; platform: string }> {
  await load();

  if (!config.devices.pairingSecret) {
    throw new Error('Device pairing is disabled. Set DEVICE_PAIRING_SECRET on the server.');
  }

  if (input.id && input.token) {
    const existing = devices.get(input.id);
    if (existing && existing.tokenHash === hash(input.token)) {
      existing.name = input.name || existing.name;
      existing.platform = input.platform || existing.platform;
      existing.lastSeen = Date.now();
      return { id: existing.id, token: input.token, name: existing.name, platform: existing.platform };
    }
  }

  if (input.secret !== config.devices.pairingSecret) {
    throw new Error('Invalid pairing secret.');
  }

  const token = randomUUID() + randomUUID().replace(/-/g, '');
  const device: Device = {
    id: randomUUID(),
    name: input.name || 'Unnamed device',
    platform: input.platform || 'unknown',
    tokenHash: hash(token),
    createdAt: Date.now(),
    lastSeen: Date.now(),
    pending: [],
    running: new Map(),
    history: [],
    waiters: new Map(),
    wake: null,
  };
  devices.set(device.id, device);
  await persist();
  return { id: device.id, token, name: device.name, platform: device.platform };
}

export async function authenticateDevice(id: string, token: string): Promise<Device | null> {
  await load();
  const device = devices.get(id);
  if (!device) return null;
  if (device.tokenHash !== hash(token)) return null;
  return device;
}

export async function listDevices() {
  await load();
  return [...devices.values()]
    .map(publicDevice)
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

export async function findDevice(ref: string): Promise<Device | null> {
  await load();
  const exact = devices.get(ref);
  if (exact) return exact;
  const needle = ref.trim().toLowerCase();
  return (
    [...devices.values()].find((device) => device.name.toLowerCase() === needle) ??
    [...devices.values()].find((device) => device.name.toLowerCase().includes(needle)) ??
    null
  );
}

export async function enqueueCommand(
  device: Device,
  action: string,
  args: Record<string, unknown>,
): Promise<DeviceCommand> {
  const command: DeviceCommand = {
    id: randomUUID(),
    action,
    args,
    status: 'pending',
    createdAt: Date.now(),
  };
  device.pending.push(command);
  device.wake?.();
  return command;
}

export function waitForResult(
  device: Device,
  commandId: string,
  timeoutMs = config.devices.commandTimeoutMs,
): Promise<DeviceCommand | null> {
  return new Promise((resolve) => {
    const finish = (command: DeviceCommand | null) => {
      device.waiters.delete(commandId);
      resolve(command);
    };

    device.waiters.set(commandId, finish);
    const timer = setTimeout(() => finish(null), timeoutMs);
    const original = device.waiters.get(commandId);
    device.waiters.set(commandId, (command) => {
      clearTimeout(timer);
      original?.(command);
    });
  });
}

export async function takePendingCommands(device: Device): Promise<DeviceCommand[]> {
  await load();
  device.lastSeen = Date.now();

  if (device.pending.length) {
    const commands = device.pending.splice(0, device.pending.length);
    for (const command of commands) {
      command.status = 'running';
      device.running.set(command.id, command);
    }
    return commands;
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      device.wake = null;
      const commands = device.pending.splice(0, device.pending.length);
      for (const command of commands) {
        command.status = 'running';
        device.running.set(command.id, command);
      }
      resolve(commands);
    };
    device.wake = done;
    setTimeout(done, config.devices.pollTimeoutMs);
  });
}

export function submitResult(
  device: Device,
  commandId: string,
  ok: boolean,
  output: string,
): boolean {
  const command = device.running.get(commandId) ?? device.pending.find((c) => c.id === commandId);
  if (!command) return false;

  device.running.delete(commandId);
  command.status = 'done';
  command.ok = ok;
  command.output = output.slice(0, 20000);
  command.completedAt = Date.now();
  device.history.unshift(command);
  device.history = device.history.slice(0, 50);

  const waiter = device.waiters.get(commandId);
  if (waiter) {
    command.status = 'done';
    waiter(command);
  }
  return true;
}

export async function removeDevice(id: string): Promise<boolean> {
  await load();
  const removed = devices.delete(id);
  if (removed) await persist();
  return removed;
}
