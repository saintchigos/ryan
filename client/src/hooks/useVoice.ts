import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  start: () => void;
  stop: () => void;
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [supported] = useState(() => Boolean(recognitionCtor()));
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript as string;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        onFinalRef.current(finalText.trim());
        setInterim('');
      }
    };
    recognition.onend = () => {
      setListening(false);
      setInterim('');
    };
    recognition.onerror = () => {
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { listening, interim, supported, start, stop, toggle };
}

function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const preferred = ['Daniel', 'Google UK English Male', 'Microsoft Ryan', 'Microsoft Guy', 'Microsoft David'];
  for (const name of preferred) {
    const found = voices.find((voice) => voice.name.includes(name));
    if (found) return found;
  }
  return voices.find((voice) => voice.lang?.startsWith('en')) ?? voices[0];
}

export function useSpeechSynthesis() {
  const [enabled, setEnabled] = useState(() => localStorage.getItem('ryan.speak') === '1');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState(() => localStorage.getItem('ryan.voice') ?? '');
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (!list.length) return;
      setVoices(list);
      setVoiceName((current) => current || pickDefaultVoice(list)?.name || list[0].name);
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(() => {
    localStorage.setItem('ryan.speak', enabled ? '1' : '0');
    if (!enabled) window.speechSynthesis?.cancel();
  }, [enabled]);

  useEffect(() => {
    if (voiceName) localStorage.setItem('ryan.voice', voiceName);
  }, [voiceName]);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return;
      const clean = text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_`#>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean.slice(0, 1600));
      const voice = voices.find((item) => item.name === voiceName);
      if (voice) utterance.voice = voice;
      utterance.rate = 1.03;
      utterance.pitch = 0.95;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [enabled, voiceName, voices],
  );

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  return { enabled, setEnabled, voices, voiceName, setVoiceName, speaking, speak, stop };
}
