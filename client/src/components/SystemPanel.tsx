import { useEffect, useState } from 'react';
import { API_BASE, API_TOKEN, apiFetch } from '../api';
import type { Capabilities } from '../types';

const INTEGRATIONS: Array<{ key: keyof Capabilities; label: string; env: string }> = [
  { key: 'brain', label: 'Brain (LLM)', env: 'RYAN_LLM_API_KEY' },
  {
    key: 'telecom',
    label: 'Phone calls & SMS',
    env: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER',
  },
  { key: 'home', label: 'Smart home', env: 'HOME_ASSISTANT_URL, HOME_ASSISTANT_TOKEN' },
  { key: 'calendar', label: 'Calendar', env: 'CALENDAR_ICS_URL and/or CALDAV_URL' },
  {
    key: 'email',
    label: 'Email',
    env: 'EMAIL_IMAP_HOST, EMAIL_SMTP_HOST, EMAIL_USER, EMAIL_PASSWORD',
  },
  { key: 'devices', label: 'Paired devices', env: 'DEVICE_PAIRING_SECRET' },
];

export function SystemPanel() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/capabilities')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Server responded ${response.status}`);
        return (await response.json()) as Capabilities;
      })
      .then(setCaps)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <section className="panel system-panel">
      <h2>System</h2>
      <p className="panel-sub">What Ryan currently has access to, and what is still to be connected.</p>

      <div className="status-grid">
        {INTEGRATIONS.map((integration) => {
          const online = caps ? Boolean(caps[integration.key]) : false;
          return (
            <div key={String(integration.key)} className={`status-card ${online ? 'ok' : 'off'}`}>
              <div className="status-card-top">
                <span className={`dot ${online ? 'on' : 'off'}`} />
                <strong>{integration.label}</strong>
              </div>
              {!online && <code>{integration.env}</code>}
            </div>
          );
        })}
      </div>

      <div className="system-meta">
        <div>
          <span>API base</span>
          <code>{API_BASE || 'same origin (dev proxy)'}</code>
        </div>
        <div>
          <span>Request token</span>
          <code>{API_TOKEN ? 'configured' : 'not set (VITE_API_TOKEN)'}</code>
        </div>
        <div>
          <span>Web search</span>
          <code>{caps?.search ?? '...'}</code>
        </div>
      </div>

      {error && <p className="call-result">Could not reach the server: {error}</p>}

      {caps && (
        <div className="tools-list">
          <h3>Tools Ryan can call ({caps.tools.length})</h3>
          <ul>
            {caps.tools.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code>
                <span>{tool.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
