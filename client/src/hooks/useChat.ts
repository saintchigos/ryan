import { useCallback, useRef, useState } from 'react';
import { apiFetch, jsonInit } from '../api';
import type { Activity, ChatMessage } from '../types';

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

async function* readSSE(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

    let index = buffer.indexOf('\n\n');
    while (index !== -1) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);

      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) yield { event, data };

      index = buffer.indexOf('\n\n');
    }
  }
}

export function useChat() {
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem('ryan.sessionId');
    if (existing) return existing;
    const created = newId();
    localStorage.setItem('ryan.sessionId', created);
    return created;
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const patch = useCallback((id: string, updater: (message: ChatMessage) => ChatMessage) => {
    setMessages((previous) => previous.map((message) => (message.id === id ? updater(message) : message)));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      const userMessage: ChatMessage = { id: newId(), role: 'user', content, activities: [] };
      const assistantMessage: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: '',
        activities: [],
      };
      const history = [...messages, userMessage];

      setMessages((previous) => [...previous, userMessage, assistantMessage]);
      setBusy(true);

      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        const response = await apiFetch('/api/chat', {
          ...jsonInit('POST', {
            sessionId,
            messages: history.map((message) => ({ role: message.role, content: message.content })),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Request failed (${response.status})`);
        }

        for await (const { event, data } of readSSE(response.body)) {
          const payload = JSON.parse(data) as {
            type: string;
            text?: string;
            name?: string;
            phase?: 'start' | 'done';
            detail?: string;
            round?: number;
          };

          if (event === 'token') {
            patch(assistantMessage.id, (message) => ({
              ...message,
              content: message.content + (payload.text ?? ''),
            }));
          } else if (event === 'tool') {
            patch(assistantMessage.id, (message) => {
              const activities = [...message.activities];
              if (payload.phase === 'start') {
                activities.push({
                  id: newId(),
                  name: payload.name ?? 'tool',
                  detail: payload.detail,
                  status: 'running',
                  round: payload.round,
                });
              } else {
                const reversed = [...activities].reverse();
                const found = reversed.findIndex(
                  (activity) => activity.name === payload.name && activity.status === 'running',
                );
                if (found !== -1) {
                  const realIndex = activities.length - 1 - found;
                  activities[realIndex] = {
                    ...activities[realIndex],
                    status: 'done',
                    detail: payload.detail ?? activities[realIndex].detail,
                  };
                }
              }
              return { ...message, activities };
            });
          } else if (event === 'error') {
            patch(assistantMessage.id, (message) => ({
              ...message,
              content: message.content || payload.text || 'Something went wrong.',
              error: true,
            }));
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          patch(assistantMessage.id, (message) => ({
            ...message,
            content: message.content || `I hit a problem: ${(error as Error).message}`,
            error: true,
          }));
        }
      } finally {
        controllerRef.current = null;
        setBusy(false);
      }
    },
    [busy, messages, patch, sessionId],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    setBusy(false);
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  return { sessionId, messages, busy, send, stop, clear };
}
