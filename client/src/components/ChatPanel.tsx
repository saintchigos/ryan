import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { ChatMessage } from '../types';
import type { RyanState } from './ArcReactor';

interface ChatPanelProps {
  messages: ChatMessage[];
  busy: boolean;
  state: RyanState;
  listening: boolean;
  interim: string;
  micSupported: boolean;
  voiceEnabled: boolean;
  voiceAvailable: boolean;
  voices: SpeechSynthesisVoice[];
  voiceName: string;
  input: string;
  onInputChange: (value: string) => void;
  onVoiceChange: (name: string) => void;
  onToggleVoice: () => void;
  onToggleMic: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onClear: () => void;
}

function renderRich(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <a key={`${match.index}-${match[1]}`} href={match[2]} target="_blank" rel="noreferrer">
        {match[1]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function labelFor(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const SUGGESTIONS = [
  'What is happening in the world right now?',
  'Research the latest breakthroughs in fusion energy and cite sources.',
  'Remember that I prefer dark mode and short answers.',
  'Calculate the payment on a 450000 loan at 6.5% over 30 years.',
];

export function ChatPanel(props: ChatPanelProps) {
  const {
    messages,
    busy,
    listening,
    interim,
    micSupported,
    voiceEnabled,
    voiceAvailable,
    voices,
    voiceName,
    input,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, interim]);

  const submit = () => {
    if (!input.trim()) return;
    props.onSend(input);
    props.onInputChange('');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <section className="panel chat-panel">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">Ryan is standing by.</p>
            <p className="empty-sub">
              Ask anything. He will search the live internet, read the sources, run the numbers, and
              remember what matters.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  className="suggestion"
                  onClick={() => props.onSend(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={`message message-${message.role}`}>
              <header className="message-head">
                <span className="message-author">{message.role === 'user' ? 'You' : 'Ryan'}</span>
              </header>

              {message.activities.length > 0 && (
                <ul className="activities">
                  {message.activities.map((activity) => (
                    <li
                      key={activity.id}
                      className={`activity activity-${activity.status}`}
                      title={activity.detail ?? ''}
                    >
                      <span className="activity-dot" />
                      {labelFor(activity.name)}
                      <span className="activity-state">
                        {activity.status === 'running' ? 'running' : 'done'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className={`message-body${message.error ? ' message-error' : ''}`}>
                {renderRich(message.content)}
                {message.role === 'assistant' && busy && !message.content && (
                  <span className="typing">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="composer">
        {interim && <div className="interim">{interim}</div>}
        <textarea
          value={input}
          onChange={(event) => props.onInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? 'Listening...' : 'Give Ryan an order...'}
          rows={2}
        />
        <div className="composer-actions">
          <button
            className={`icon-button${listening ? ' active' : ''}`}
            onClick={props.onToggleMic}
            disabled={!micSupported || busy}
            title={micSupported ? 'Speak to Ryan' : 'Voice input is not supported in this browser'}
          >
            {listening ? 'Stop mic' : 'Mic'}
          </button>
          <button
            className={`icon-button${voiceEnabled ? ' active' : ''}`}
            onClick={props.onToggleVoice}
            disabled={!voiceAvailable}
            title="Let Ryan speak his replies"
          >
            {voiceEnabled ? 'Voice on' : 'Voice off'}
          </button>
          <select
            className="voice-select"
            value={voiceName}
            onChange={(event) => props.onVoiceChange(event.target.value)}
            disabled={!voices.length}
            title="Ryan's voice"
          >
            {voices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name}
              </option>
            ))}
          </select>
          <button className="icon-button ghost" onClick={props.onClear} disabled={busy}>
            Clear
          </button>
          {busy ? (
            <button className="send-button stop" onClick={props.onStop}>
              Stop
            </button>
          ) : (
            <button className="send-button" onClick={submit} disabled={!input.trim()}>
              Send
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
