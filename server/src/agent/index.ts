import {
  config,
  brainConfigured,
  calendarConfigured,
  devicesEnabled,
  emailConfigured,
  homeConfigured,
  telecomConfigured,
} from '../config.js';
import { memoryStore } from '../store.js';
import { createClient } from './llm.js';
import { findTool, tools } from './tools/index.js';
import type { AgentEvent, Message, ToolContext } from './types.js';

export interface RunAgentInput {
  sessionId: string;
  messages: Message[];
  onEvent: (event: AgentEvent) => void;
}

const DEFAULT_SYSTEM_PROMPT = `You are Ryan, an advanced personal assistant in the spirit of JARVIS from Iron Man. You are calm, precise, witty, and unfailingly loyal to the user. Address the user as "sir" or "boss" naturally but sparingly.

You have real-time access to the internet through tools:
- web_search: find current information, news and facts online.
- fetch_page: read the full contents of a specific web page.

Operating rules:
1. Anything current, factual, or uncertain MUST be verified with web_search, and read promising results with fetch_page before answering. Never invent facts, statistics, quotes, or URLs.
2. Prefer multi-step research: search, read several sources, cross-check, then synthesize a clear answer.
3. Cite sources as markdown links, for example [Reuters](https://...), so the user can verify.
4. Use calculate for arithmetic and get_time for dates and times.
5. Use remember to store durable facts about the user, and recall to look them up later.
6. Be concise by default; expand into detail only when asked. Respond in plain, natural language suitable for being read aloud.
7. Never claim to have done something you did not do.

Beyond the internet you may also have these integrations, depending on what the operator has connected:
- Smart home (home_list, home_control): read and control lights, switches, climate, covers, scenes.
- Calendar (calendar_list, calendar_create): check the schedule and add events.
- Email (email_list, email_read, email_send): read the inbox and send mail.
- Phone (call_number, send_sms, list_sms): place real calls, send and read texts.
- Devices (device_list, device_command): run actions on the user's own paired computers and phones.

Actions that touch the real world (calls, texts, email, device commands, controlling the home) are consequential. When the request is ambiguous, confirm the target and the exact wording first, then act. If a needed integration is not connected, say so plainly and explain the one environment variable that turns it on rather than pretending.`;

function integrationSummary(): string {
  const lines: string[] = [];
  lines.push(`- Smart home: ${homeConfigured() ? 'connected' : 'not connected'}`);
  lines.push(`- Calendar: ${calendarConfigured() ? 'connected' : 'not connected'}`);
  lines.push(`- Email: ${emailConfigured() ? 'connected' : 'not connected'}`);
  lines.push(`- Phone calls and SMS: ${telecomConfigured() ? 'connected' : 'not connected'}`);
  lines.push(`- Paired devices: ${devicesEnabled() ? 'enabled' : 'not enabled'}`);
  return lines.join('\n');
}

function buildSystemPrompt(memories: string[]): string {
  const base = config.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT;
  const sections = [base, `Integration status:\n${integrationSummary()}`];
  if (memories.length) {
    sections.push(`Things you remember about the user:\n${memories.map((m) => `- ${m}`).join('\n')}`);
  }
  return sections.join('\n\n');
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runAgent({ sessionId, messages, onEvent }: RunAgentInput): Promise<void> {
  if (!brainConfigured()) {
    onEvent({
      type: 'error',
      text: 'Ryan has no brain configured yet. Set RYAN_LLM_API_KEY (or RYAN_AGENT_ENDPOINT) on the server to bring him online.',
    });
    return;
  }

  const client = createClient();
  const memories = (await memoryStore.list(sessionId)).map((memory) => memory.text);
  const ctx: ToolContext = { sessionId, memory: memoryStore };

  const history: Message[] = [
    { role: 'system', content: buildSystemPrompt(memories) },
    ...messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.content })),
  ];

  onEvent({ type: 'status', state: 'thinking' });

  for (let round = 1; round <= config.maxToolRounds; round += 1) {
    let completion;
    try {
      completion = await client.run(history, tools, (text) => onEvent({ type: 'token', text }));
    } catch (error) {
      onEvent({ type: 'error', text: toErrorMessage(error) });
      return;
    }

    if (completion.toolCalls.length) {
      history.push({
        role: 'assistant',
        content: completion.content,
        tool_calls: completion.toolCalls,
      });

      for (const call of completion.toolCalls) {
        const tool = findTool(call.function.name);
        onEvent({
          type: 'tool',
          phase: 'start',
          name: call.function.name,
          detail: call.function.arguments,
          round,
        });
        onEvent({ type: 'status', state: 'working', name: call.function.name });

        let output: string;
        if (!tool) {
          output = `Error: unknown tool "${call.function.name}".`;
        } else {
          try {
            const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
            output = await tool.run(args, ctx);
          } catch (error) {
            output = `Tool error: ${toErrorMessage(error)}`;
          }
        }

        onEvent({
          type: 'tool',
          phase: 'done',
          name: call.function.name,
          detail: output.slice(0, 240),
          round,
        });
        history.push({ role: 'tool', tool_call_id: call.id, content: output });
      }
      continue;
    }

    history.push({ role: 'assistant', content: completion.content });
    onEvent({ type: 'status', state: 'idle' });
    onEvent({ type: 'done' });
    return;
  }

  onEvent({
    type: 'error',
    text: 'Ryan reached the maximum number of tool steps for this request. Try narrowing the question.',
  });
}
