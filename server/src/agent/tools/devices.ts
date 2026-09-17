import { devicesEnabled } from '../../config.js';
import { enqueueCommand, findDevice, listDevices, waitForResult } from '../../devices.js';
import type { ToolDef } from '../types.js';

export const deviceListTool: ToolDef = {
  name: 'device_list',
  description:
    'List the computers and phones the user has paired with Ryan, including whether each is currently online. Use the returned name or id with device_command.',
  parameters: { type: 'object', properties: {} },
  async run() {
    if (!devicesEnabled()) {
      throw new Error('Device control is disabled. Set DEVICE_PAIRING_SECRET on the server to enable it.');
    }
    const devices = await listDevices();
    if (!devices.length) return 'No devices are paired yet.';
    return devices
      .map(
        (device) =>
          `- ${device.name} [${device.id}] | ${device.platform} | ${
            device.online ? 'online' : 'offline'
          } | ${device.pending} queued`,
      )
      .join('\n');
  },
};

export const deviceCommandTool: ToolDef = {
  name: 'device_command',
  description:
    'Run an action on one of the user\'s paired devices. Common actions: system_info, open_app, open_url, read_clipboard, write_clipboard, notify, volume, lock_screen, screenshot, list_files, read_file, read_sms, send_sms. Elevated actions (run_command, power) only work if the device agent has them enabled. Pass args as an object, e.g. {"text":"hello"} for notify.',
  parameters: {
    type: 'object',
    properties: {
      device: { type: 'string', description: 'Device name or id from device_list.' },
      action: { type: 'string', description: 'The action to run on the device.' },
      args: { type: 'object', description: 'Arguments for the action.', additionalProperties: true },
    },
    required: ['device', 'action'],
  },
  async run(args) {
    if (!devicesEnabled()) {
      throw new Error('Device control is disabled. Set DEVICE_PAIRING_SECRET on the server to enable it.');
    }
    const device = await findDevice(String(args.device ?? ''));
    if (!device) throw new Error(`No paired device matches "${args.device}".`);

    const action = String(args.action ?? '').trim();
    if (!action) throw new Error('An action is required.');

    const commandArgs = (args.args ?? {}) as Record<string, unknown>;
    const command = await enqueueCommand(device, action, commandArgs);
    const result = await waitForResult(device, command.id);

    if (!result) {
      throw new Error(`Device "${device.name}" did not respond in time. Is the agent running?`);
    }
    return result.ok
      ? `Success on ${device.name}:\n${result.output ?? ''}`
      : `Device reported an error:\n${result.output ?? ''}`;
  },
};
