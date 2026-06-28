// src/rssFetcher.js
import { XMLParser } from 'fast-xml-parser';
import he from 'he';

// XML 解析器配置（照搬 build.js）
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '#cdata',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
});

const FETCH_TIMEOUT = 15000; // 15秒超时
const DEFAULT_UA = 'Mozilla/5.0 (compatible; RSS Aggregator/1.0)';

/**
 * 抓取 RSS 内容（简化版，照搬您能跑通的 build.js 方式）
 */
export async function fetchFeed(source) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': DEFAULT_UA }, // ✅ 关键：只用这一个头
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = parser.parse(xml);
    return normalizeFeed(parsed, source);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 提取并清理文本内容
 */
function extractText(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object') {
    if (obj['#cdata'] != null) return String(obj['#cdata']);
    if (obj['#text'] != null) return String(obj['#text']);
    const keys = Object.keys(obj);
    if (keys.length > 0) return extractText(obj[keys[0]]);
  }
  return String(obj);
}

/**
 * 清理 HTML 并解码实体
 */
function cleanContent(html) {
  if (!html) return '';
  // 先移除 script/style
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // 解码 HTML 实体
  text = he.decode(text, { isAttributeValue: false, strict: false });
  // 移除标签
  text = text.replace(/<[^>]*>/g, ' ');
  // 合并空白
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 格式化日期
 */
function formatDate(str) {
  if (!str) return new Date().toISOString();
  try {
    const date = new Date(str);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * 提取链接
 */
function extractLink(linkObj) {
  if (!linkObj) return '#';
  if (typeof linkObj === 'string') return linkObj;
  if (typeof linkObj === 'object') {
    if (linkObj['@_href']) return linkObj['@_href'];
    if (linkObj['#text']) return linkObj['#text'];
  }
  return '#';
}

/**
 * 标准化为统一格式
 */
function normalizeFeed(xmlObj, source) {
  // RSS 2.0
  if (xmlObj.rss?.channel) {
    const channel = xmlObj.rss.channel;
    const items = channel.item || [];
    const itemList = Array.isArray(items) ? items : [items];

    return {
      sourceId: source.id,
      sourceTitle: extractText(channel.title) || source.title,
      items: itemList.slice(0, source.limit || 20).map(item => ({
        id: extractLink(item.link) || cryptoHash(extractText(item.title) || ''),
        title: he.decode(extractText(item.title) || '无标题'),
        link: extractLink(item.link),
        summary: cleanContent(
          extractText(item['content:encoded']) || extractText(item.description) || ''
        ).slice(0, 400),
        author: extractText(item['dc:creator']) || extractText(channel.title) || '',
        pubDate: formatDate(extractText(item.pubDate) || extractText(item['dc:date'])),
        categories: extractCategories(item.category)
      }))
    };
  }

  // Atom 1.0
  if (xmlObj.feed) {
    const feed = xmlObj.feed;
    const entries = feed.entry || [];
    const entryList = Array.isArray(entries) ? entries : [entries];

    return {
      sourceId: source.id,
      sourceTitle: extractText(feed.title) || source.title,
      items: entryList.slice(0, source.limit || 20).map(entry => ({
        id: extractText(entry.id) || cryptoHash(extractText(entry.title) || extractLink(entry.link)),
        title: he.decode(extractText(entry.title) || '无标题'),
        link: extractLink(entry.link),
        summary: cleanContent(
          extractText(entry.content) || extractText(entry.summary) || ''
        ).slice(0, 400),
        author: extractText(entry.author?.name) || extractText(feed.title) || '',
        pubDate: formatDate(extractText(entry.updated) || extractText(entry.published)),
        categories: extractCategories(entry.category)
      }))
    };
  }

  // RSS 1.0 (RDF)
  if (xmlObj['rdf:RDF']) {
    const channel = xmlObj['rdf:RDF'].channel;
    const items = xmlObj['rdf:RDF'].item || [];
    const itemList = Array.isArray(items) ? items : [items];
    const feedTitle = extractText(channel?.title) || source.title;

    return {
      sourceId: source.id,
      sourceTitle: feedTitle,
      items: itemList.slice(0, source.limit || 20).map(item => ({
        id: extractLink(item.link) || cryptoHash(extractText(item.title) || ''),
        title: he.decode(extractText(item.title) || '无标题'),
        link: extractLink(item.link),
        summary: cleanContent(extractText(item.description) || '').slice(0, 400),
        author: feedTitle,
        pubDate: formatDate(extractText(item['dc:date'])),
        categories: extractCategories(item.category)
      }))
    };
  }

  throw new Error('无法识别的 Feed 格式');
}

function extractCategories(cat) {
  if (!cat) return [];
  if (Array.isArray(cat)) return cat.map(c => (typeof c === 'string' ? c : extractText(c))).filter(Boolean);
  if (typeof cat === 'string') return [cat];
  if (typeof cat === 'object') return [extractText(cat)].filter(Boolean);
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
