// src/rssFetcher.js
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '__cdata',
  trimValues: true,
  processEntities: false,
  stopNodes: ['*.description', '*.content', '*.summary'],
  maxTextLength: 10_000_000
});

/**
 * 通用 RSS / Atom 抓取与解析
 */
export async function fetchFeed(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        // ✅ 关键：添加 Referer，部分站点会检查
        'Referer': new URL(source.url).origin
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const parsed = parser.parse(xml);

    return normalizeFeed(parsed, source);
  } finally {
    clearTimeout(timeout);
  }
}

// normalizeFeed / stripHtml / parseDate 等函数保持不变
function normalizeFeed(data, source) {
  if (data.rss?.channel) {
    const channel = data.rss.channel;
    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean);
    return {
      sourceId: source.id,
      sourceTitle: channel.title || source.title,
      items: items.slice(0, source.limit || 20).map(item => ({
        id: item.guid?.['#text'] || item.guid || item.link || cryptoHash(item.title || ''),
        title: stripHtml(item.title || ''),
        link: item.link || '',
        summary: stripHtml(item.description || '').slice(0, 300),
        author: item['dc:creator'] || item.author || '',
        pubDate: parseDate(item.pubDate),
        categories: extractCategories(item.category)
      }))
    };
  }

  if (data.feed?.entry) {
    const entries = Array.isArray(data.feed.entry) ? data.feed.entry : [data.feed.entry];
    return {
      sourceId: source.id,
      sourceTitle: data.feed.title || source.title,
      items: entries.slice(0, source.limit || 20).map(entry => ({
        id: entry.id || cryptoHash(entry.title || entry.link || ''),
        title: stripHtml(entry.title?.['#text'] || entry.title || ''),
        link: entry.link?.['@_href'] || entry.link || '',
        summary: stripHtml(entry.summary || entry.content?.['#text'] || '').slice(0, 300),
        author: entry.author?.name || '',
        pubDate: parseDate(entry.published || entry.updated),
        categories: extractCategories(entry.category)
      }))
    };
  }

  throw new Error('Unknown feed format');
}

function stripHtml(html) {
  if (typeof html !== 'string') return '';
  const withLineBreaks = html
    .replace(/<\/(p|br|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return withLineBreaks
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function extractCategories(cat) {
  if (!cat) return [];
  if (Array.isArray(cat)) return cat.map(c => (typeof c === 'string' ? c : c['#text'])).filter(Boolean);
  if (typeof cat === 'string') return [cat];
  if (cat['#text']) return [cat['#text']];
  return [];
}

function cryptoHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(36)}`;
}
