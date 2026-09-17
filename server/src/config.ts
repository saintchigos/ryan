import 'dotenv/config';

const env = process.env;

function str(value: string | undefined, fallback = ''): string {
  return (value ?? fallback).trim();
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const imapPort = num(env.EMAIL_IMAP_PORT, 993);
const smtpPort = num(env.EMAIL_SMTP_PORT, 587);

export const config = {
  port: num(env.PORT, 4000),

  // Optional shared secret that protects every sensitive API route.
  // Strongly recommended once Ryan is on the public internet.
  apiToken: str(env.RYAN_API_TOKEN),

  clientOrigins: str(env.RYAN_CLIENT_ORIGINS, '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  llm: {
    apiKey: str(env.RYAN_LLM_API_KEY) || str(env.OPENAI_API_KEY),
    baseUrl: str(env.RYAN_LLM_BASE_URL, 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: str(env.RYAN_LLM_MODEL, 'gpt-4o-mini'),
    temperature: num(env.RYAN_LLM_TEMPERATURE, 0.7),
  },

  agentEndpoint: str(env.RYAN_AGENT_ENDPOINT),

  search: {
    tavilyApiKey: str(env.TAVILY_API_KEY),
    braveApiKey: str(env.BRAVE_API_KEY),
  },

  systemPrompt: env.RYAN_SYSTEM_PROMPT ?? '',
  maxToolRounds: Math.max(1, num(env.RYAN_MAX_TOOL_ROUNDS, 10)),
  dataDir: str(env.RYAN_DATA_DIR),

  home: {
    url: str(env.HOME_ASSISTANT_URL).replace(/\/+$/, ''),
    token: str(env.HOME_ASSISTANT_TOKEN),
  },

  calendar: {
    icsUrl: str(env.CALENDAR_ICS_URL),
    caldavUrl: str(env.CALDAV_URL),
    caldavUser: str(env.CALDAV_USER),
    caldavPassword: str(env.CALDAV_PASSWORD),
  },

  email: {
    imapHost: str(env.EMAIL_IMAP_HOST),
    imapPort,
    imapSecure: bool(env.EMAIL_IMAP_SECURE, imapPort === 993),
    smtpHost: str(env.EMAIL_SMTP_HOST),
    smtpPort,
    smtpSecure: bool(env.EMAIL_SMTP_SECURE, smtpPort === 465),
    user: str(env.EMAIL_USER),
    password: str(env.EMAIL_PASSWORD),
    from: str(env.EMAIL_FROM) || str(env.EMAIL_USER),
  },

  twilio: {
    accountSid: str(env.TWILIO_ACCOUNT_SID),
    authToken: str(env.TWILIO_AUTH_TOKEN),
    fromNumber: str(env.TWILIO_FROM_NUMBER),
  },

  devices: {
    pairingSecret: str(env.DEVICE_PAIRING_SECRET),
    pollTimeoutMs: Math.max(5000, num(env.DEVICE_POLL_TIMEOUT_MS, 20000)),
    commandTimeoutMs: Math.max(5000, num(env.DEVICE_COMMAND_TIMEOUT_MS, 45000)),
  },
};

export function brainConfigured(): boolean {
  return Boolean(config.agentEndpoint || config.llm.apiKey);
}

export function telecomConfigured(): boolean {
  const { accountSid, authToken, fromNumber } = config.twilio;
  return Boolean(accountSid && authToken && fromNumber);
}

export function homeConfigured(): boolean {
  return Boolean(config.home.url && config.home.token);
}

export function calendarConfigured(): boolean {
  return Boolean(config.calendar.icsUrl || config.calendar.caldavUrl);
}

export function emailConfigured(): boolean {
  return Boolean(config.email.imapHost || config.email.smtpHost);
}

export function devicesEnabled(): boolean {
  return Boolean(config.devices.pairingSecret);
}
