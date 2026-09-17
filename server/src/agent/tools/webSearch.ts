import { config } from '../../config.js';
import type { ToolDef } from '../types.js';
import { USER_AGENT, decodeEntities, stripTags } from './util.js';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function format(results: SearchResult[], provider: string): string {
  if (!results.length) return `No results found via ${provider}.`;
  const body = results
    .map((result, index) => {
      const snippet = result.snippet ? `\n   ${result.snippet.slice(0, 380)}` : '';
      return `${index + 1}. ${result.title}\n   ${result.url}${snippet}`;
    })
    .join('\n');
  return `Search results (${provider}):\n${body}`;
}

async function searchTavily(query: string, max: number): Promise<string> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.search.tavilyApiKey,
      query,
      max_results: max,
      search_depth: 'basic',
      include_answer: true,
    }),
  });
  if (!response.ok) throw new Error(`Tavily responded ${response.status}`);
  const data = (await response.json()) as {
    answer?: string;
    results?: Array<{ title: string; url: string; content: string }>;
  };
  const results: SearchResult[] = (data.results ?? []).map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.content ?? '',
  }));
  const answer = data.answer ? `Direct answer: ${data.answer}\n\n` : '';
  return answer + format(results, 'Tavily');
}

async function searchBrave(query: string, max: number): Promise<string> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': config.search.braveApiKey,
    },
  });
  if (!response.ok) throw new Error(`Brave responded ${response.status}`);
  const data = (await response.json()) as {
    web?: { results?: Array<{ title: string; url: string; description?: string }> };
  };
  const results: SearchResult[] = (data.web?.results ?? []).map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.description ?? '',
  }));
  return format(results, 'Brave');
}

async function searchDuckDuckGoHtml(query: string, max: number): Promise<string> {
  const response = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  });
  const html = await response.text();

  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<td[^>]*class=['"]?result-snippet['"]?[^>]*>([\s\S]*?)<\/td>/gi;

  const links: Array<{ href: string; title: string }> = [];
  for (const match of html.matchAll(anchorRegex)) {
    if (!/class=['"]?result-link/i.test(match[1])) continue;
    const hrefMatch = match[1].match(/href=['"]([^'"]+)['"]/i);
    if (!hrefMatch) continue;
    links.push({ href: hrefMatch[1], title: decodeEntities(stripTags(match[2])) });
  }

  const snippets = [...html.matchAll(snippetRegex)];
  const results: SearchResult[] = [];

  for (let i = 0; i < links.length && results.length < max; i += 1) {
    let href = links[i].href;
    if (href.startsWith('//')) {
      const parsed = new URL(`https:${href}`);
      href = decodeURIComponent(parsed.searchParams.get('uddg') ?? href);
    }
    results.push({
      title: links[i].title || href,
      url: href,
      snippet: snippets[i] ? decodeEntities(stripTags(snippets[i][1])) : '',
    });
  }

  if (!results.length) return 'No results found.';
  return format(results, 'DuckDuckGo');
}

async function searchDuckDuckGoApi(query: string, max: number): Promise<string> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
    query,
  )}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const data = (await response.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: unknown[] }>;
  };

  const results: SearchResult[] = [];
  if (data.AbstractText) {
    results.push({
      title: data.AbstractText,
      url: data.AbstractURL ?? '',
      snippet: '',
    });
  }

  const walk = (topics: Array<{ Text?: string; FirstURL?: string; Topics?: unknown[] }>): void => {
    for (const topic of topics) {
      if (results.length >= max) return;
      if (Array.isArray(topic.Topics)) walk(topic.Topics as typeof topics);
      else if (topic.Text) results.push({ title: topic.Text, url: topic.FirstURL ?? '', snippet: '' });
    }
  };
  walk(data.RelatedTopics ?? []);

  if (!results.length) return 'No results found via DuckDuckGo.';
  return format(results, 'DuckDuckGo');
}

async function searchDuckDuckGo(query: string, max: number): Promise<string> {
  try {
    const html = await searchDuckDuckGoHtml(query, max);
    if (!html.startsWith('No results')) return html;
  } catch {
    /* fall through to the instant-answer API */
  }
  return searchDuckDuckGoApi(query, max);
}

export const webSearchTool: ToolDef = {
  name: 'web_search',
  description:
    'Search the live internet for current information, news, facts or anything you do not know. Returns ranked results with titles, URLs and snippets. Follow up with fetch_page to read a result in full.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query.' },
      max_results: {
        type: 'number',
        description: 'How many results to return (1-10). Defaults to 6.',
      },
    },
    required: ['query'],
  },
  async run(args) {
    const query = String(args.query ?? '').trim();
    if (!query) throw new Error('A search query is required.');
    const max = Math.min(10, Math.max(1, Number(args.max_results ?? 6)));

    if (config.search.tavilyApiKey) {
      try {
        return await searchTavily(query, max);
      } catch (error) {
        return searchDuckDuckGo(query, max).catch(
          () => `Search failed: ${(error as Error).message}`,
        );
      }
    }
    if (config.search.braveApiKey) {
      try {
        return await searchBrave(query, max);
      } catch {
        /* fall through to keyless search */
      }
    }
    try {
      return await searchDuckDuckGo(query, max);
    } catch (error) {
      return `Search failed: ${(error as Error).message}`;
    }
  },
};
