export interface Activity {
  id: string;
  name: string;
  detail?: string;
  status: 'running' | 'done';
  round?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  activities: Activity[];
  error?: boolean;
}

export interface Memory {
  id: string;
  text: string;
  createdAt: string;
}

export interface CallStatus {
  configured: boolean;
  provider: string;
  fromNumber: string | null;
  requiredEnv: string[];
}

export interface SmsMessage {
  sid: string;
  direction: string;
  from: string;
  to: string;
  body: string;
  status: string;
  dateSent: string | null;
}

export interface Device {
  id: string;
  name: string;
  platform: string;
  online: boolean;
  lastSeen: number | null;
  pending: number;
}

export interface Capabilities {
  brain: boolean;
  telecom: boolean;
  home: boolean;
  calendar: boolean;
  email: boolean;
  devices: boolean;
  secured: boolean;
  search: string;
  tools: Array<{ name: string; description: string }>;
}
