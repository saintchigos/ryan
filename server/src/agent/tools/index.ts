import type { ToolDef } from '../types.js';
import { webSearchTool } from './webSearch.js';
import { webFetchTool } from './webFetch.js';
import { calculateTool, getTimeTool, recallTool, rememberTool } from './misc.js';
import { homeControlTool, homeListTool } from './home.js';
import { calendarCreateTool, calendarListTool } from './calendar.js';
import { emailListTool, emailReadTool, emailSendTool } from './email.js';
import { callNumberTool, listSmsTool, sendSmsTool } from './phone.js';
import { deviceCommandTool, deviceListTool } from './devices.js';

export const tools: ToolDef[] = [
  webSearchTool,
  webFetchTool,
  getTimeTool,
  calculateTool,
  rememberTool,
  recallTool,
  homeListTool,
  homeControlTool,
  calendarListTool,
  calendarCreateTool,
  emailListTool,
  emailReadTool,
  emailSendTool,
  callNumberTool,
  sendSmsTool,
  listSmsTool,
  deviceListTool,
  deviceCommandTool,
];

export function findTool(name: string): ToolDef | undefined {
  return tools.find((tool) => tool.name === name);
}
