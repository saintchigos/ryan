import { config, homeConfigured } from '../../config.js';
import type { ToolDef } from '../types.js';

interface HassState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

async function hass<T>(path: string, init?: RequestInit): Promise<T> {
  if (!homeConfigured()) {
    throw new Error(
      'Smart home is not connected. Set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN on the server.',
    );
  }
  const response = await fetch(`${config.home.url}/api/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.home.token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Home Assistant responded ${response.status}.`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

const CONTROL_DOMAINS = new Set([
  'light',
  'switch',
  'fan',
  'media_player',
  'climate',
  'cover',
  'lock',
  'scene',
  'script',
  'automation',
  'input_boolean',
  'vacuum',
]);

export const homeListTool: ToolDef = {
  name: 'home_list',
  description:
    'List smart-home devices and their current state from Home Assistant. Optionally filter by domain (light, switch, climate, cover, media_player, sensor, lock, scene, ...).',
  parameters: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'Optional domain filter, e.g. "light".' },
      search: { type: 'string', description: 'Optional text to match in the friendly name.' },
    },
  },
  async run(args) {
    const states = await hass<HassState[]>('states');
    const domain = String(args.domain ?? '').toLowerCase().trim();
    const search = String(args.search ?? '').toLowerCase().trim();

    const filtered = states
      .filter((state) => (domain ? state.entity_id.startsWith(`${domain}.`) : CONTROL_DOMAINS.has(state.entity_id.split('.')[0])))
      .filter((state) =>
        search
          ? String(state.attributes.friendly_name ?? state.entity_id)
              .toLowerCase()
              .includes(search)
          : true,
      )
      .slice(0, 80)
      .map((state) => {
        const name = state.attributes.friendly_name ?? state.entity_id;
        const unit = state.attributes.unit_of_measurement ?? '';
        return `- ${state.entity_id} | ${name} | ${state.state}${unit ? ` ${unit}` : ''}`;
      });

    return filtered.length ? filtered.join('\n') : 'No matching home entities found.';
  },
};

export const homeControlTool: ToolDef = {
  name: 'home_control',
  description:
    'Control a smart-home device through Home Assistant. Actions: turn_on, turn_off, toggle, set_value (lights -> brightness percent, climate -> target temperature, media_player -> volume percent), or run for scenes/scripts.',
  parameters: {
    type: 'object',
    properties: {
      entity_id: { type: 'string', description: 'Entity id, e.g. light.living_room.' },
      action: {
        type: 'string',
        enum: ['turn_on', 'turn_off', 'toggle', 'set_value', 'run'],
      },
      value: { type: 'number', description: 'Value for set_value (brightness %, temperature, volume %).' },
    },
    required: ['entity_id', 'action'],
  },
  async run(args) {
    const entityId = String(args.entity_id ?? '').trim();
    const action = String(args.action ?? '').trim();
    const value = args.value === undefined ? undefined : Number(args.value);
    const domain = entityId.split('.')[0];

    if (!CONTROL_DOMAINS.has(domain)) {
      throw new Error(`Entity "${entityId}" controls are not exposed to Ryan.`);
    }

    if (action === 'run') {
      const service = domain === 'script' ? 'turn_on' : 'turn_on';
      await hass(`services/${domain}/${service}`, {
        method: 'POST',
        body: JSON.stringify({ entity_id: entityId }),
      });
      return `Ran ${entityId}.`;
    }

    if (action === 'set_value') {
      if (value === undefined || Number.isNaN(value)) {
        throw new Error('set_value requires a numeric value.');
      }
      if (domain === 'light') {
        await hass('services/light/turn_on', {
          method: 'POST',
          body: JSON.stringify({ entity_id: entityId, brightness_pct: value }),
        });
        return `Set ${entityId} brightness to ${value}%.`;
      }
      if (domain === 'climate') {
        await hass('services/climate/set_temperature', {
          method: 'POST',
          body: JSON.stringify({ entity_id: entityId, temperature: value }),
        });
        return `Set ${entityId} target temperature to ${value}.`;
      }
      if (domain === 'media_player') {
        await hass('services/media_player/volume_set', {
          method: 'POST',
          body: JSON.stringify({ entity_id: entityId, volume_level: Math.min(1, value / 100) }),
        });
        return `Set ${entityId} volume to ${value}%.`;
      }
      throw new Error(`set_value is not supported for ${domain}.`);
    }

    if (!['turn_on', 'turn_off', 'toggle'].includes(action)) {
      throw new Error(`Unsupported action "${action}".`);
    }

    await hass(`services/${domain}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    });
    return `${action.replace('_', ' ')} sent to ${entityId}.`;
  },
};
