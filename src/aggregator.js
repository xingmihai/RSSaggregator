// src/aggregator.js
import { fetchFeed } from './rssFetcher.js';

/**
 * 并发抓取所有 RSS 源（限制并发数）
 */
export async function aggregate(sources, options = {}) {
  const concurrency = options.concurrency || 5;
  const results = [];
  const errors = [];

  // 分批处理
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (source) => {
        try {
          const feed = await fetchFeed(source);
          return { ok: true, feed };
        } catch (err) {
          return { ok: false, source, error: err.message };
        }
      })
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        if (r.value.ok) results.push(r.value.feed);
        else errors.push(r.value);
      } else {
        errors.push({ error: r.reason.message });
      }
    }
  }

  // 合并所有条目
  const allItems = [];
  for (const feed of results) {
    for (const item of feed.items) {
      allItems.push({
        ...item,
        sourceId: feed.sourceId,
        sourceTitle: feed.sourceTitle
      });
    }
  }

  // 按时间倒序
  allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // 去重（按 link 域名+path）
  const dedupMap = new Map();
  for (const item of allItems) {
    const key = normalizeLink(item.link);
    if (!dedupMap.has(key)) dedupMap.set(key, item);
  }

  return {
    items: Array.from(dedupMap.values()),
    errors,
    stats: {
      sources: sources.length,
      success: results.length,
      failed: errors.length,
      items: dedupMap.size,
      updatedAt: new Date().toISOString()
    }
  };
}

function normalizeLink(url) {
  try {
    const u = new URL(url);
    // 去除 utm 等追踪参数
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign'];
    trackingParams.forEach(p => u.searchParams.delete(p));
    return `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}
