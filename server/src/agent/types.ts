export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface Memory {
  id: string;
  text: string;
  createdAt: string;
}

export interface MemoryStore {
  list(sessionId: string): Promise<Memory[]>;
  add(sessionId: string, text: string): Promise<Memory>;
  remove(sessionId: string, id: string): Promise<boolean>;
  search(sessionId: string, query: string): Promise<Memory[]>;
}

export interface ToolContext {
  sessionId: string;
  memory: MemoryStore;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

export interface AgentEvent {
  type: 'status' | 'token' | 'tool' | 'done' | 'error';
  state?: 'thinking' | 'working' | 'idle';
  text?: string;
  name?: string;
  phase?: 'start' | 'done';
  detail?: string;
  round?: number;
}
