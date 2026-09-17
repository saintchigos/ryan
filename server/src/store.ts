import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import type { Memory, MemoryStore } from './agent/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = config.dataDir || path.resolve(here, '..', 'data');
const file = path.join(dataDir, 'memories.json');

type Store = Record<string, Memory[]>;

let cache: Store | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(file, 'utf8');
    cache = JSON.parse(raw) as Store;
  } catch {
    cache = {};
  }
  return cache;
}

function persist(): void {
  if (!cache) return;
  const snapshot = JSON.stringify(cache, null, 2);
  writeQueue = writeQueue
    .then(async () => {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(file, snapshot, 'utf8');
    })
    .catch(() => {
      /* persistence is best-effort (e.g. read-only serverless fs) */
    });
}

export const memoryStore: MemoryStore = {
  async list(sessionId) {
    const store = await load();
    return [...(store[sessionId] ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async add(sessionId, text) {
    const store = await load();
    const memory: Memory = {
      id: randomUUID(),
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    store[sessionId] = [memory, ...(store[sessionId] ?? [])];
    persist();
    return memory;
  },

  async remove(sessionId, id) {
    const store = await load();
    const list = store[sessionId] ?? [];
    const next = list.filter((item) => item.id !== id);
    store[sessionId] = next;
    persist();
    return next.length !== list.length;
  },

  async search(sessionId, query) {
    const store = await load();
    const q = query.toLowerCase().trim();
    const list = store[sessionId] ?? [];
    if (!q) return list;
    return list.filter((item) => item.text.toLowerCase().includes(q));
  },
};
