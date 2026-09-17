import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type { Message, ToolCall, ToolDef } from './types.js';

export interface Completion {
  content: string;
  toolCalls: ToolCall[];
}

export interface LLMClient {
  readonly name: string;
  run(
    messages: Message[],
    tools: ToolDef[],
    onToken?: (text: string) => void,
  ): Promise<Completion>;
}

function openAIToolSchema(tools: ToolDef[]): unknown[] | undefined {
  if (!tools.length) return undefined;
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

async function* sseDataLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) yield trimmed.slice(5).trim();
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}

class OpenAICompatibleClient implements LLMClient {
  readonly name: string;

  constructor() {
    this.name = config.llm.model;
  }

  async run(
    messages: Message[],
    tools: ToolDef[],
    onToken?: (text: string) => void,
  ): Promise<Completion> {
    const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages,
        temperature: config.llm.temperature,
        stream: true,
        tools: openAIToolSchema(tools),
        tool_choice: tools.length ? 'auto' : undefined,
      }),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Language model request failed (${response.status}). ${detail.slice(0, 400)}`.trim(),
      );
    }

    let content = '';
    const pending = new Map<number, { id: string; name: string; args: string }>();

    for await (const data of sseDataLines(response.body)) {
      if (data === '[DONE]') break;
      let payload: any;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = payload?.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === 'string' && delta.content.length) {
        content += delta.content;
        onToken?.(delta.content);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const call of delta.tool_calls) {
          const index: number = call.index ?? 0;
          const entry = pending.get(index) ?? { id: '', name: '', args: '' };
          if (call.id) entry.id = call.id;
          if (call.function?.name) entry.name += call.function.name;
          if (call.function?.arguments) entry.args += call.function.arguments;
          pending.set(index, entry);
        }
      }
    }

    const toolCalls: ToolCall[] = [...pending.values()]
      .filter((entry) => entry.name)
      .map((entry) => ({
        id: entry.id || randomUUID(),
        type: 'function',
        function: { name: entry.name, arguments: entry.args || '{}' },
      }));

    return { content, toolCalls };
  }
}

class CustomAgentClient implements LLMClient {
  readonly name = 'custom-agent';

  async run(
    messages: Message[],
    tools: ToolDef[],
    onToken?: (text: string) => void,
  ): Promise<Completion> {
    const response = await fetch(config.agentEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Custom agent failed (${response.status}). ${detail.slice(0, 400)}`.trim());
    }

    const data = (await response.json()) as {
      content?: string;
      events?: Array<{ type: string; text?: string }>;
      toolCalls?: ToolCall[];
    };

    for (const event of data.events ?? []) {
      if (event.type === 'token' && event.text) onToken?.(event.text);
    }
    if (data.content) onToken?.(data.content);

    return { content: data.content ?? '', toolCalls: data.toolCalls ?? [] };
  }
}

export function createClient(): LLMClient {
  if (config.agentEndpoint) return new CustomAgentClient();
  return new OpenAICompatibleClient();
}
