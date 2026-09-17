import type { ToolDef } from '../types.js';

export const getTimeTool: ToolDef = {
  name: 'get_time',
  description: 'Get the current date and time, including the timezone of the server.',
  parameters: { type: 'object', properties: {} },
  async run() {
    const now = new Date();
    return [
      `ISO: ${now.toISOString()}`,
      `Local: ${now.toString()}`,
      `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    ].join('\n');
  },
};

export const calculateTool: ToolDef = {
  name: 'calculate',
  description:
    'Evaluate a mathematical expression reliably. Supports + - * / % ^ and parentheses. Use it instead of computing in your head.',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'e.g. (1250 * 3.5) / 7 + 2^10' },
    },
    required: ['expression'],
  },
  async run(args) {
    const expression = String(args.expression ?? '').trim();
    if (!/^[0-9+\-*/%^().\s]+$/.test(expression)) {
      throw new Error('Only numbers and the operators + - * / % ^ ( ) are allowed.');
    }
    const js = expression.replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${js});`)();
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('The expression did not evaluate to a finite number.');
    }
    return `${expression} = ${value}`;
  },
};

export const rememberTool: ToolDef = {
  name: 'remember',
  description:
    'Save a durable fact, preference or detail about the user so it can be recalled in future conversations. Use whenever the user shares something worth remembering.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The fact to remember, written as a short statement.' },
    },
    required: ['text'],
  },
  async run(args, ctx) {
    const text = String(args.text ?? '').trim();
    if (!text) throw new Error('Nothing to remember.');
    const memory = await ctx.memory.add(ctx.sessionId, text);
    return `Saved to memory: "${memory.text}"`;
  },
};

export const recallTool: ToolDef = {
  name: 'recall',
  description:
    'Look up previously remembered facts and preferences about the user. Search by keyword, or leave the query empty to list everything.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keyword to search memories for. Optional.' },
    },
  },
  async run(args, ctx) {
    const query = String(args.query ?? '').trim();
    const memories = await ctx.memory.search(ctx.sessionId, query);
    if (!memories.length) return 'No matching memories found.';
    return memories.map((memory, index) => `${index + 1}. ${memory.text}`).join('\n');
  },
};
