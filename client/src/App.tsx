import { useEffect, useMemo, useRef, useState } from 'react';
import { ArcReactor, type RyanState } from './components/ArcReactor';
import { ChatPanel } from './components/ChatPanel';
import { CallPanel } from './components/CallPanel';
import { DevicesPanel } from './components/DevicesPanel';
import { NotesPanel } from './components/NotesPanel';
import { SystemPanel } from './components/SystemPanel';
import { useChat } from './hooks/useChat';
import { useSpeechRecognition, useSpeechSynthesis } from './hooks/useVoice';

type Tab = 'assistant' | 'calls' | 'devices' | 'memory' | 'system';

const TAB_LABELS: Record<Tab, string> = {
  assistant: 'Assistant',
  calls: 'Phone',
  devices: 'Devices',
  memory: 'Memory',
  system: 'System',
};

export default function App() {
  const [tab, setTab] = useState<Tab>('assistant');
  const [input, setInput] = useState('');
  const chat = useChat();
  const speech = useSpeechSynthesis();

  const mic = useSpeechRecognition((text) => {
    setInput((previous) => (previous ? `${previous} ${text}` : text));
  });

  const lastSpoken = useRef<string | null>(null);
  useEffect(() => {
    if (chat.busy) return;
    const last = chat.messages[chat.messages.length - 1];
    if (last && last.role === 'assistant' && last.content && last.id !== lastSpoken.current) {
      lastSpoken.current = last.id;
      speech.speak(last.content);
    }
  }, [chat.busy, chat.messages, speech]);

  const state: RyanState = mic.listening
    ? 'listening'
    : speech.speaking
      ? 'speaking'
      : chat.busy
        ? 'working'
        : 'idle';

  const statusLine = useMemo(() => {
    if (state === 'listening') return 'Listening';
    if (state === 'speaking') return 'Speaking';
    if (state === 'working') return 'Working';
    return 'Online';
  }, [state]);

  return (
    <div className="app">
      <header className="topbar">
        <ArcReactor state={state} />
        <div className="brand">
          <h1>RYAN</h1>
          <span className={`status status-${state}`}>{statusLine}</span>
        </div>
        <nav className="tabs">
          {(Object.keys(TAB_LABELS) as Tab[]).map((item) => (
            <button
              key={item}
              className={tab === item ? 'tab active' : 'tab'}
              onClick={() => setTab(item)}
            >
              {TAB_LABELS[item]}
            </button>
          ))}
        </nav>
      </header>

      <main className="stage">
        {tab === 'assistant' && (
          <ChatPanel
            messages={chat.messages}
            busy={chat.busy}
            state={state}
            listening={mic.listening}
            interim={mic.interim}
            micSupported={mic.supported}
            voiceEnabled={speech.enabled}
            voiceAvailable={typeof window !== 'undefined' && 'speechSynthesis' in window}
            voices={speech.voices}
            voiceName={speech.voiceName}
            input={input}
            onInputChange={setInput}
            onVoiceChange={speech.setVoiceName}
            onToggleVoice={() => speech.setEnabled(!speech.enabled)}
            onToggleMic={mic.toggle}
            onSend={chat.send}
            onStop={chat.stop}
            onClear={chat.clear}
          />
        )}
        {tab === 'calls' && <CallPanel />}
        {tab === 'devices' && <DevicesPanel />}
        {tab === 'memory' && <NotesPanel sessionId={chat.sessionId} />}
        {tab === 'system' && <SystemPanel />}
      </main>
    </div>
  );
}
