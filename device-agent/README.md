# Ryan device agent

Pairs a machine **you own** with your Ryan server so Ryan can run a fixed, allow-listed set of
actions on it (system info, open apps/urls, clipboard, notifications, volume, lock, screenshot,
files, and — on Android via Termux — reading and sending SMS).

It is intentionally *not* a general remote-control channel. Only the actions listed below exist, file
access is limited to your home directory (or `RYAN_DEVICE_ROOTS`), and the two powerful actions —
`run_command` and `power` — stay off unless you explicitly enable them.

## Pair and run

```bash
cd device-agent

# Windows (PowerShell)
$env:RYAN_SERVER_URL="https://your-ryan-server.onrender.com"
$env:RYAN_DEVICE_SECRET="the-same-DEVICE_PAIRING_SECRET-you-set-on-the-server"
$env:RYAN_DEVICE_NAME="My Laptop"
node ryan-device.mjs

# macOS / Linux
RYAN_SERVER_URL=https://your-ryan-server.onrender.com \
RYAN_DEVICE_SECRET=... \
RYAN_DEVICE_NAME="My Laptop" \
node ryan-device.mjs
```

Credentials are stored in `.ryan-device.json` and reused on restart.

## Environment

| Variable | Purpose |
| --- | --- |
| `RYAN_SERVER_URL` | Base URL of your Ryan server. |
| `RYAN_DEVICE_SECRET` | Must equal `DEVICE_PAIRING_SECRET` on the server. |
| `RYAN_DEVICE_NAME` | Friendly name shown to Ryan (defaults to hostname). |
| `RYAN_DEVICE_ROOTS` | Path-delimiter separated folders Ryan may read. Defaults to your home. |
| `RYAN_DEVICE_ALLOW_SHELL=1` | Enables `run_command` (arbitrary shell). Off by default. |
| `RYAN_DEVICE_ALLOW_POWER=1` | Enables `power` (shutdown/restart/sleep). Off by default. |

## Actions

`system_info`, `open_app`, `open_url`, `read_clipboard`, `write_clipboard`, `notify`, `volume`,
`lock_screen`, `screenshot`, `list_files`, `read_file`, `read_sms`, `send_sms`, plus opt-in
`run_command` and `power`.

### Phone (Android)

Install [Termux](https://termux.dev) and the Termux:API add-on, then run `pkg install termux-api`
and start the agent inside Termux. `read_sms` / `send_sms` will work on the device's own SIM.
