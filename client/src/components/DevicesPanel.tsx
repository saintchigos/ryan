import { useCallback, useEffect, useState } from 'react';
import { apiFetch, jsonInit } from '../api';
import type { Device } from '../types';

const ACTIONS: Array<{ name: string; hint: string }> = [
  { name: 'system_info', hint: 'no arguments' },
  { name: 'open_app', hint: '{"target":"notepad"}' },
  { name: 'open_url', hint: '{"url":"https://..."}' },
  { name: 'read_clipboard', hint: 'no arguments' },
  { name: 'write_clipboard', hint: '{"text":"hello"}' },
  { name: 'notify', hint: '{"title":"Ryan","text":"Done"}' },
  { name: 'volume', hint: '{"value":40} or {"mute":true}' },
  { name: 'lock_screen', hint: 'no arguments' },
  { name: 'screenshot', hint: 'no arguments' },
  { name: 'list_files', hint: '{"path":"C:\\\\Users\\\\you\\\\Documents"}' },
  { name: 'read_file', hint: '{"path":"...","max_bytes":50000}' },
  { name: 'read_sms', hint: '{"limit":10} - Android/Termux' },
  { name: 'send_sms', hint: '{"to":"+1...","body":"hi"}' },
  { name: 'run_command', hint: '{"command":"..."} - needs ALLOW_SHELL' },
  { name: 'power', hint: '{"mode":"lock|shutdown|restart|sleep"} - needs ALLOW_POWER' },
];

export function DevicesPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [selected, setSelected] = useState('');
  const [action, setAction] = useState('system_info');
  const [args, setArgs] = useState('{}');
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch('/api/devices');
      const data = (await response.json()) as { devices?: Device[]; enabled?: boolean };
      setDevices(data.devices ?? []);
      setEnabled(data.enabled ?? false);
      setSelected((current) => current || data.devices?.[0]?.id || '');
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [load]);

  const run = async () => {
    if (!selected) return;
    setRunning(true);
    setOutput('Waiting for the device...');
    try {
      const response = await apiFetch(
        `/api/devices/${selected}/command`,
        jsonInit('POST', { action, args: JSON.parse(args || '{}') }),
      );
      const data = (await response.json()) as { ok?: boolean; output?: string; error?: string };
      setOutput(data.error ? data.error : `${data.ok ? 'Success' : 'Error'}:\n${data.output ?? ''}`);
    } catch (error) {
      setOutput((error as Error).message);
    } finally {
      setRunning(false);
      void load();
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/api/devices/${id}`, { method: 'DELETE' });
    void load();
  };

  const activeHint = ACTIONS.find((entry) => entry.name === action)?.hint ?? '';

  return (
    <section className="panel devices-panel">
      <div className="panel-head">
        <h2>Devices</h2>
        <button className="icon-button ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <p className="panel-sub">
        Machines you have paired with Ryan. Control is limited to the allow-listed actions below and
        only works while the device agent is running on that device.
      </p>

      {enabled === false && (
        <div className="call-setup">
          <h3>Device control is off</h3>
          <ol>
            <li>
              Set <code>DEVICE_PAIRING_SECRET</code> on the server to a long random string.
            </li>
            <li>
              On the device you own, run{' '}
              <code>RYAN_DEVICE_SECRET=... node device-agent/ryan-device.mjs</code>.
            </li>
            <li>Refresh this page - the device will appear and go online.</li>
          </ol>
        </div>
      )}

      {devices.length > 0 && (
        <ul className="device-list">
          {devices.map((device) => (
            <li key={device.id} className={device.online ? 'online' : 'offline'}>
              <span className={`dot ${device.online ? 'on' : 'off'}`} />
              <span className="device-name">{device.name}</span>
              <span className="device-meta">{device.platform}</span>
              <span className="device-meta">{device.online ? 'online' : 'offline'}</span>
              <button className="icon-button ghost" onClick={() => remove(device.id)}>
                Unpair
              </button>
            </li>
          ))}
        </ul>
      )}

      {devices.length === 0 && enabled && (
        <p className="panel-sub">No devices paired yet. Start the device agent to enroll one.</p>
      )}

      {devices.length > 0 && (
        <div className="device-runner">
          <div className="runner-row">
            <label className="field">
              <span>Device</span>
              <select value={selected} onChange={(event) => setSelected(event.target.value)}>
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} {device.online ? '' : '(offline)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Action</span>
              <select value={action} onChange={(event) => setAction(event.target.value)}>
                {ACTIONS.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Arguments (JSON) - {activeHint}</span>
            <textarea value={args} onChange={(event) => setArgs(event.target.value)} rows={2} />
          </label>

          <button className="send-button" onClick={run} disabled={running || !selected}>
            {running ? 'Running...' : 'Run on device'}
          </button>

          {output && <pre className="device-output">{output}</pre>}
        </div>
      )}
    </section>
  );
}
