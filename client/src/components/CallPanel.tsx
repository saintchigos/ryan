import { useCallback, useEffect, useState } from 'react';
import { apiFetch, jsonInit } from '../api';
import type { CallStatus, SmsMessage } from '../types';

type Mode = 'call' | 'sms';

export function CallPanel() {
  const [status, setStatus] = useState<CallStatus | null>(null);
  const [mode, setMode] = useState<Mode>('call');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);

  const loadMessages = useCallback(async () => {
    try {
      const response = await apiFetch('/api/call/messages?limit=20');
      const data = (await response.json()) as { messages?: SmsMessage[]; error?: string };
      setMessages(data.messages ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    apiFetch('/api/call/status')
      .then((response) => response.json())
      .then((data: CallStatus) => setStatus(data))
      .catch(() => setStatus(null));
    void loadMessages();
  }, [loadMessages]);

  const configured = status?.configured ?? false;

  const submit = async () => {
    setResult(mode === 'call' ? 'Dialing...' : 'Sending...');
    try {
      const path = mode === 'call' ? '/api/call/dial' : '/api/call/sms';
      const body = mode === 'call' ? { to, message } : { to, body: message };
      const response = await apiFetch(path, jsonInit('POST', body));
      const data = (await response.json()) as { error?: string; detail?: string; sid?: string };
      if (data.error) {
        setResult(`${data.error}${data.detail ? ` ${data.detail}` : ''}`);
      } else {
        setResult(mode === 'call' ? `Call placed (${data.sid}).` : `Text sent (${data.sid}).`);
        if (mode === 'sms') {
          setMessage('');
          void loadMessages();
        }
      }
    } catch (error) {
      setResult((error as Error).message);
    }
  };

  return (
    <section className="panel call-panel">
      <h2>Phone</h2>
      <p className="panel-sub">
        Ryan can place real calls and send texts through the connected Twilio number, and can read
        the recent conversation.
      </p>

      <div className={`call-badge ${configured ? 'ok' : 'pending'}`}>
        {configured
          ? `Connected via ${status?.provider ?? 'twilio'} (${
              status?.fromNumber ?? 'no sender number'
            })`
          : `Not configured (${status?.provider ?? 'twilio'})`}
      </div>

      <div className="segmented">
        <button className={mode === 'call' ? 'seg active' : 'seg'} onClick={() => setMode('call')}>
          Call
        </button>
        <button className={mode === 'sms' ? 'seg active' : 'seg'} onClick={() => setMode('sms')}>
          Text
        </button>
      </div>

      <label className="field">
        <span>Phone number</span>
        <input
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="+15550001234"
          inputMode="tel"
        />
      </label>

      <label className="field">
        <span>{mode === 'call' ? 'What Ryan should say' : 'Message'}</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          placeholder={
            mode === 'call'
              ? 'Hello, this is Ryan calling on behalf of...'
              : "I'll be there in ten minutes."
          }
        />
      </label>

      <button className="send-button" onClick={submit} disabled={!configured}>
        {mode === 'call' ? 'Place call' : 'Send text'}
      </button>

      {result && <p className="call-result">{result}</p>}

      {messages.length > 0 && (
        <div className="sms-log">
          <h3>Recent messages</h3>
          <ul>
            {messages.map((sms) => (
              <li key={sms.sid} className={sms.direction.startsWith('inbound') ? 'sms-in' : 'sms-out'}>
                <div className="sms-meta">
                  {sms.direction.startsWith('inbound') ? sms.from : `to ${sms.to}`}
                  <span>{sms.dateSent ? new Date(sms.dateSent).toLocaleString() : ''}</span>
                </div>
                <div className="sms-body">{sms.body}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!configured && status && (
        <div className="call-setup">
          <h3>To enable calls and texts</h3>
          <ol>
            <li>Create a Twilio account and buy a voice + SMS capable number.</li>
            <li>
              Set <code>{status.requiredEnv.join('</code>, <code>')}</code> on the server.
            </li>
            <li>
              Point Twilio's voice webhook at <code>POST /api/call/twilio/voice</code>.
            </li>
          </ol>
        </div>
      )}
    </section>
  );
}
