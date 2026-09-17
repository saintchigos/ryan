#!/usr/bin/env node
// Ryan device agent.
//
// Runs on a computer or phone that YOU own and pairs it with your Ryan server
// so Ryan can run an allow-listed set of actions on it. It only ever executes
// the fixed actions defined below - there is no arbitrary remote-control
// channel unless you explicitly enable RYAN_DEVICE_ALLOW_SHELL.
//
//   RYAN_SERVER_URL        https://your-ryan-server.onrender.com
//   RYAN_DEVICE_SECRET     the DEVICE_PAIRING_SECRET from the server
//   RYAN_DEVICE_NAME       friendly name (defaults to hostname)
//   RYAN_DEVICE_ALLOW_SHELL=1   enable the "run_command" action
//   RYAN_DEVICE_ALLOW_POWER=1   enable the "power" action
//   RYAN_DEVICE_ROOTS      path delimiter separated allow-list for file access

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SERVER = (process.env.RYAN_SERVER_URL || 'http://localhost:4000').replace(/\/+$/, '');
const SECRET = process.env.RYAN_DEVICE_SECRET || '';
const NAME = process.env.RYAN_DEVICE_NAME || os.hostname();
const PLATFORM = process.platform;
const ALLOW_SHELL = process.env.RYAN_DEVICE_ALLOW_SHELL === '1';
const ALLOW_POWER = process.env.RYAN_DEVICE_ALLOW_POWER === '1';
const ROOTS = (process.env.RYAN_DEVICE_ROOTS || os.homedir())
  .split(path.delimiter)
  .filter(Boolean)
  .map((entry) => path.resolve(entry));
const STATE_FILE = path.join(process.cwd(), '.ryan-device.json');
const MAX_BUFFER = 8 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run(cmd, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(cmd, args, { maxBuffer: MAX_BUFFER, ...options });
  return `${(stdout || '').trim()}${stderr ? `\n${stderr.trim()}` : ''}`.trim();
}

function pipe(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `exit code ${code}`)),
    );
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

function powershell(script) {
  return run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

function osascript(script) {
  return run('osascript', ['-e', script]);
}

function withinRoots(target) {
  const resolved = path.resolve(target);
  const allowed = ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!allowed) throw new Error(`Path is outside the allowed roots: ${ROOTS.join(', ')}`);
  return resolved;
}

function requireShell() {
  if (!ALLOW_SHELL) {
    throw new Error('The run_command action is disabled. Set RYAN_DEVICE_ALLOW_SHELL=1 to enable it.');
  }
}

function requirePower() {
  if (!ALLOW_POWER) {
    throw new Error('The power action is disabled. Set RYAN_DEVICE_ALLOW_POWER=1 to enable it.');
  }
}

const ACTIONS = {
  async system_info() {
    const cpus = os.cpus();
    const total = os.totalmem() / 1024 ** 3;
    const free = os.freemem() / 1024 ** 3;
    return [
      `host: ${os.hostname()}`,
      `platform: ${PLATFORM} ${os.release()} (${os.arch()})`,
      `user: ${os.userInfo().username}`,
      `cpu: ${cpus[0]?.model ?? 'unknown'} x${cpus.length}`,
      `memory: ${free.toFixed(1)} GB free of ${total.toFixed(1)} GB`,
      `uptime: ${(os.uptime() / 3600).toFixed(1)} hours`,
    ].join('\n');
  },

  async open_app({ target }) {
    if (!target) throw new Error('"target" is required.');
    if (PLATFORM === 'win32') await powershell(`Start-Process '${target}'`);
    else if (PLATFORM === 'darwin') await run('open', ['-a', target]);
    else spawn(target, [], { detached: true, stdio: 'ignore' }).unref();
    return `Launched ${target}.`;
  },

  async open_url({ url }) {
    if (!url) throw new Error('"url" is required.');
    if (PLATFORM === 'win32') await powershell(`Start-Process '${url}'`);
    else if (PLATFORM === 'darwin') await run('open', [url]);
    else await run('xdg-open', [url]);
    return `Opened ${url}.`;
  },

  async read_clipboard() {
    if (PLATFORM === 'win32') return (await powershell('Get-Clipboard -Raw')) || '(empty clipboard)';
    if (PLATFORM === 'darwin') return (await run('pbpaste')) || '(empty clipboard)';
    return (await run('xclip', ['-selection', 'clipboard', '-o'])) || '(empty clipboard)';
  },

  async write_clipboard({ text }) {
    const value = String(text ?? '');
    if (PLATFORM === 'win32') {
      const encoded = Buffer.from(value, 'utf8').toString('base64');
      await powershell(
        `Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))`,
      );
    } else if (PLATFORM === 'darwin') await pipe('pbcopy', [], value);
    else await pipe('xclip', ['-selection', 'clipboard'], value);
    return 'Clipboard updated.';
  },

  async notify({ text, title }) {
    const body = String(text ?? '').replace(/'/g, "''");
    const heading = String(title ?? 'Ryan').replace(/'/g, "''");
    if (PLATFORM === 'win32') {
      await powershell(
        `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ` +
          `$n = New-Object System.Windows.Forms.NotifyIcon; ` +
          `$n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; ` +
          `$n.ShowBalloonTip(5000, '${heading}', '${body}', [System.Windows.Forms.ToolTipIcon]::Info); ` +
          `Start-Sleep -Seconds 6; $n.Dispose()`,
      );
    } else if (PLATFORM === 'darwin') {
      await osascript(`display notification "${body}" with title "${heading}"`);
    } else {
      await run('notify-send', [heading, body]);
    }
    return 'Notification shown.';
  },

  async volume({ value, mute }) {
    if (mute !== undefined) {
      if (PLATFORM === 'win32') await powershell('(New-Object -ComObject WScript.Shell).SendKeys([char]173)');
      else if (PLATFORM === 'darwin') await osascript('set volume output muted true');
      else await run('amixer', ['-q', 'set', 'Master', 'mute']);
      return mute ? 'Muted.' : 'Mute toggled.';
    }
    const level = Math.max(0, Math.min(100, Number(value ?? 50)));
    if (PLATFORM === 'win32') {
      const steps = Math.round(level / 2);
      await powershell(
        `$w = New-Object -ComObject WScript.Shell; 1..50 | ForEach-Object { $w.SendKeys([char]174) }; ` +
          `1..${steps} | ForEach-Object { $w.SendKeys([char]175) }`,
      );
    } else if (PLATFORM === 'darwin') {
      await osascript(`set volume output volume ${level}`);
    } else {
      await run('amixer', ['-q', 'set', 'Master', `${level}%`]);
    }
    return `Volume set to about ${level}%.`;
  },

  async lock_screen() {
    if (PLATFORM === 'win32') await run('rundll32.exe', ['user32.dll,LockWorkStation']);
    else if (PLATFORM === 'darwin')
      await osascript(
        'tell application "System Events" to keystroke "q" using {command down, control down}',
      );
    else await run('loginctl', ['lock-session']).catch(() => run('xdg-screensaver', ['lock']));
    return 'Screen locked.';
  },

  async screenshot({ path: target }) {
    const file = target ? withinRoots(target) : path.join(os.tmpdir(), `ryan-shot-${Date.now()}.png`);
    if (PLATFORM === 'win32') {
      await powershell(
        `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ` +
          `$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ` +
          `$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; ` +
          `$g = [System.Drawing.Graphics]::FromImage($bmp); ` +
          `$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); ` +
          `$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      );
    } else if (PLATFORM === 'darwin') {
      await run('screencapture', ['-x', file]);
    } else {
      await run('gnome-screenshot', ['-f', file]).catch(() => run('import', ['-window', 'root', file]));
    }
    const stats = await fs.stat(file);
    return `Screenshot saved to ${file} (${Math.round(stats.size / 1024)} KB).`;
  },

  async list_files({ path: target }) {
    const dir = withinRoots(target || os.homedir());
    const entries = await fs.readdir(dir, { withFileTypes: true });
    if (!entries.length) return `${dir} is empty.`;
    return entries
      .slice(0, 200)
      .map((entry) => `${entry.isDirectory() ? '[dir]' : '[file]'} ${entry.name}`)
      .join('\n');
  },

  async read_file({ path: target, max_bytes }) {
    const file = withinRoots(target || '');
    if (!file) throw new Error('"path" is required.');
    const limit = Math.min(1024 * 1024, Math.max(1000, Number(max_bytes ?? 100000)));
    const handle = await fs.open(file, 'r');
    try {
      const buffer = Buffer.alloc(limit);
      const { bytesRead } = await handle.read(buffer, 0, limit, 0);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  },

  async run_command({ command, cwd }) {
    requireShell();
    if (!command) throw new Error('"command" is required.');
    return run(command, [], { shell: true, cwd: cwd ? withinRoots(cwd) : undefined });
  },

  async read_sms({ limit }) {
    const count = Math.min(50, Math.max(1, Number(limit ?? 10)));
    const raw = await run('termux-sms-list', ['-l', String(count)]);
    const messages = JSON.parse(raw);
    return messages
      .map((message) => `- ${message.number} | ${new Date(message.received).toISOString()} | ${message.body}`)
      .join('\n');
  },

  async send_sms({ to, body }) {
    if (!to || !body) throw new Error('Both "to" and "body" are required.');
    await run('termux-sms-send', ['-n', String(to), String(body)]);
    return `Text sent to ${to}.`;
  },

  async power({ mode }) {
    requirePower();
    const action = String(mode || 'lock');
    if (action === 'lock') return ACTIONS.lock_screen();
    if (PLATFORM === 'win32') {
      if (action === 'shutdown') await run('shutdown.exe', ['/s', '/t', '0']);
      else if (action === 'restart') await run('shutdown.exe', ['/r', '/t', '0']);
      else if (action === 'sleep')
        await run('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']);
    } else if (PLATFORM === 'darwin') {
      if (action === 'shutdown') await osascript('tell application "System Events" to shut down');
      else if (action === 'restart') await osascript('tell application "System Events" to restart');
      else if (action === 'sleep') await run('pmset', ['sleepnow']);
    } else {
      if (action === 'shutdown') await run('systemctl', ['poweroff']);
      else if (action === 'restart') await run('systemctl', ['reboot']);
      else if (action === 'sleep') await run('systemctl', ['suspend']);
    }
    return `Power command "${action}" issued.`;
  },
};

async function execute(action, args) {
  const handler = ACTIONS[action];
  if (!handler) {
    return { ok: false, output: `Unknown action "${action}". Available: ${Object.keys(ACTIONS).join(', ')}` };
  }
  try {
    const output = await handler(args ?? {});
    return { ok: true, output: String(output ?? 'Done.') };
  } catch (error) {
    return { ok: false, output: error.message || String(error) };
  }
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function saveState(state) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

let credentials = null;

async function register() {
  if (!SECRET) throw new Error('RYAN_DEVICE_SECRET is required to pair.');
  const previous = await loadState();
  const response = await fetch(`${SERVER}/api/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: NAME,
      platform: PLATFORM,
      secret: SECRET,
      id: previous?.id,
      token: previous?.token,
    }),
  });
  if (!response.ok) throw new Error(`Pairing failed (${response.status}): ${await response.text()}`);
  const data = await response.json();
  await saveState({ id: data.id, token: data.token });
  credentials = { id: data.id, token: data.token };
  console.log(`[ryan-device] paired as "${data.name}" (${data.id})`);
}

async function poll() {
  const response = await fetch(`${SERVER}/api/devices/${credentials.id}/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.token}` },
    body: '{}',
  });
  if (response.status === 401) {
    console.warn('[ryan-device] credentials rejected, re-pairing...');
    await register();
    return [];
  }
  if (!response.ok) throw new Error(`poll failed (${response.status})`);
  const data = await response.json();
  return data.commands || [];
}

async function report(commandId, ok, output) {
  await fetch(`${SERVER}/api/devices/${credentials.id}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.token}` },
    body: JSON.stringify({ commandId, ok, output }),
  });
}

async function main() {
  credentials = await loadState();
  if (!credentials?.id || !credentials?.token) await register();

  console.log(`[ryan-device] "${NAME}" online. Reporting to ${SERVER}.`);
  console.log(`[ryan-device] file roots: ${ROOTS.join(', ')}`);
  console.log(`[ryan-device] shell: ${ALLOW_SHELL ? 'enabled' : 'disabled'} | power: ${ALLOW_POWER ? 'enabled' : 'disabled'}`);

  for (;;) {
    try {
      const commands = await poll();
      for (const command of commands) {
        console.log(`[ryan-device] ${command.action}`, command.args);
        const { ok, output } = await execute(command.action, command.args);
        await report(command.id, ok, output);
      }
    } catch (error) {
      console.error('[ryan-device]', error.message);
      await sleep(3000);
    }
  }
}

process.on('SIGINT', () => {
  console.log('\n[ryan-device] shutting down.');
  process.exit(0);
});

main().catch((error) => {
  console.error('[ryan-device] fatal:', error.message);
  process.exit(1);
});
