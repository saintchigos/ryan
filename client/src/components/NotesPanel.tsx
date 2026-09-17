import { useCallback, useEffect, useState } from 'react';
import { apiFetch, jsonInit } from '../api';
import type { Memory } from '../types';

export function NotesPanel({ sessionId }: { sessionId: string }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(`/api/memories?sessionId=${encodeURIComponent(sessionId)}`);
      const data = (await response.json()) as { memories: Memory[] };
      setMemories(data.memories ?? []);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!draft.trim()) return;
    await apiFetch('/api/memories', jsonInit('POST', { sessionId, text: draft }));
    setDraft('');
    void load();
  };

  const remove = async (id: string) => {
    await apiFetch(`/api/memories/${id}?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    void load();
  };

  return (
    <section className="panel notes-panel">
      <h2>Memory</h2>
      <p className="panel-sub">
        Everything Ryan has been asked to remember. He reads this automatically before every reply.
      </p>

      <div className="notes-add">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
          placeholder="Teach Ryan something about you..."
        />
        <button className="send-button" onClick={add} disabled={!draft.trim()}>
          Save
        </button>
      </div>

      {loading ? (
        <p className="panel-sub">Loading...</p>
      ) : memories.length === 0 ? (
        <p className="panel-sub">Nothing saved yet.</p>
      ) : (
        <ul className="notes-list">
          {memories.map((memory) => (
            <li key={memory.id}>
              <span>{memory.text}</span>
              <button className="icon-button ghost" onClick={() => remove(memory.id)}>
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
