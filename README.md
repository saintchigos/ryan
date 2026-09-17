# Ryan

A web-based, Jarvis-style AI assistant. Ryan lives on a website (not localhost in production),
talks and listens through the browser, browses the live web, and can act in the real world: control
your smart home, manage your calendar and email, place calls and texts, and run allow-listed actions
on devices **you own and pair**.

```
ryan/
├── server/        Node.js + Express: the agent loop, tools and API   -> deploy to Render
├── client/        React + Vite HUD with voice in / voice out         -> deploy to Vercel
└── device-agent/  Runs on your own machines, pairs them with Ryan
```

## Capabilities

| Area | Tools | What it does |
| --- | --- | --- |
| Internet | `web_search`, `fetch_page` | Live search (Tavily / Brave / keyless DuckDuckGo) and full page reading with citations |
| Utility | `get_time`, `calculate` | Dates, times, maths |
| Memory | `remember`, `recall` | Durable facts, surfaced on the Memory tab |
| Smart home | `home_list`, `home_control` | Home Assistant devices, scenes, lights, climate, covers |
| Calendar | `calendar_list`, `calendar_create` | ICS feeds to read, CalDAV to read/write |
| Email | `email_list`, `email_read`, `email_send` | IMAP inbox, SMTP sending |
| Phone | `call_number`, `send_sms`, `list_sms` | Real outbound calls, texts, and reading the thread (Twilio) |
| Devices | `device_list`, `device_command` | Actions on your paired computers/phones |
| Voice | browser mic + speech synthesis | Talk to Ryan, hear him answer |

## 1. Run locally

```bash
npm install
cp server/.env.example server/.env   # then edit it
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:4000

Minimum to bring Ryan online:

```env
RYAN_LLM_API_KEY=sk-...
RYAN_LLM_MODEL=gpt-4o-mini
RYAN_CLIENT_ORIGINS=*
```

Any OpenAI-compatible endpoint works (OpenAI, Groq, Together, OpenRouter, Azure, local
llama.cpp/ollama). Search works with no key via DuckDuckGo.

## 2. Connect the integrations you want

All of these are optional. Ryan only advertises a tool once its integration is configured.

**Phone calls + SMS (Twilio)** - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
Point Twilio's voice webhook at `POST /api/call/twilio/voice`.

**Smart home (Home Assistant)** - `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN` (a long-lived token
from your HA profile). Ryan can read state and call services on lights, switches, climate, covers,
media players and scenes.

**Calendar** - `CALENDAR_ICS_URL` for read-only (e.g. Google's "secret address in iCal format"),
and/or `CALDAV_URL` + `CALDAV_USER` + `CALDAV_PASSWORD` for read **and** write (Nextcloud, Fastmail,
iCloud with an app password, ...).

**Email** - `EMAIL_IMAP_HOST`/`EMAIL_IMAP_PORT` to read, `EMAIL_SMTP_HOST`/`EMAIL_SMTP_PORT` to send,
plus `EMAIL_USER`/`EMAIL_PASSWORD`/`EMAIL_FROM`. Use an app password, never your main password.

**Devices** - set `DEVICE_PAIRING_SECRET`, then run the agent on each machine you own (section 4).

## 3. Deploy so it is a real website

**Server -> Render:** import the repo, use the Blueprint (`render.yaml`) or a Web Service with root
directory `server`, build `npm install && npm run build`, start `npm run start`. Set your env vars.
Copy the URL, e.g. `https://ryan-server.onrender.com`.

**Client -> Vercel:** import the repo, set Root Directory to `client`, and add:
- `VITE_API_URL` = your Render URL
- `VITE_API_TOKEN` = the same value as the server's `RYAN_API_TOKEN`

Then lock CORS: `RYAN_CLIENT_ORIGINS=https://your-app.vercel.app`.

### Security

Set `RYAN_API_TOKEN` on the server (and `VITE_API_TOKEN` on the client). Every sensitive route then
requires it. The device bridge uses its own pairing secret and per-device tokens, and the Twilio
webhook stays public by design.

## 4. Device control (your own machines)

Start the server with `DEVICE_PAIRING_SECRET=...`, then on each device you own:

```bash
cd device-agent
RYAN_SERVER_URL=https://your-ryan-server.onrender.com \
RYAN_DEVICE_SECRET=... \
RYAN_DEVICE_NAME="My Laptop" \
node ryan-device.mjs
```

Ryan can then run an **allow-listed** set of actions on it: `system_info`, `open_app`, `open_url`,
clipboard read/write, `notify`, `volume`, `lock_screen`, `screenshot`, `list_files`, `read_file`, and
on Android/Termux `read_sms` / `send_sms`. The two powerful actions stay **off** unless you opt in:

- `RYAN_DEVICE_ALLOW_SHELL=1` enables `run_command`
- `RYAN_DEVICE_ALLOW_POWER=1` enables `power`

File access is confined to your home directory or `RYAN_DEVICE_ROOTS`. See
`device-agent/README.md`.

> Scope note: this is remote control of hardware **you enroll**, with pairing and an action
> allow-list - not a tool for accessing other people's devices or messages. Keep the pairing secret
> and API token private.

## 5. Plug in your own agent brain

The brain is abstracted in `server/src/agent/llm.ts` (`LLMClient`). Either set
`RYAN_AGENT_ENDPOINT` to your own service (Ryan POSTs `{ messages, tools }`, expects
`{ content, events?, toolCalls? }`), or implement `LLMClient` and return it from `createClient()`.
Add tools by creating a `ToolDef` and registering it in `server/src/agent/tools/index.ts`.

## Scripts

```bash
npm run dev         # server + client in watch mode
npm run build       # build both
npm run typecheck   # typecheck both
npm start           # run the built server
```
