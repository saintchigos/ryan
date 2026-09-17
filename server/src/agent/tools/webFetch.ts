import type { ToolDef } from '../types.js';
import { USER_AGENT, decodeEntities, htmlToText, stripTags, truncate } from './util.js';

export const webFetchTool: ToolDef = {
  name: 'fetch_page',
  description:
    'Fetch and read the full text content of a specific web page or URL (article, documentation, API response, etc). Use this to read and verify sources found via web_search.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The absolute URL to fetch, including https://',
      },
      max_chars: {
        type: 'number',
        description: 'Maximum characters of text to return. Defaults to 12000.',
      },
    },
    required: ['url'],
  },
  async run(args) {
    const url = String(args.url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('The url must be an absolute http(s) URL.');
    }
    const maxChars = Math.min(60000, Math.max(1000, Number(args.max_chars ?? 12000)));

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') ?? '';
    const raw = await response.text();
    const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeEntities(stripTags(titleMatch[1])) : '';

    let text: string;
    if (contentType.includes('json')) {
      try {
        text = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        text = raw;
      }
    } else if (contentType.includes('html') || contentType.includes('xml')) {
      text = htmlToText(raw);
    } else {
      text = raw;
    }

    const header = `URL: ${url}\nStatus: ${response.status}\nTitle: ${title}\n`;
    return `${header}\n${truncate(text, maxChars)}`;
  },
};
