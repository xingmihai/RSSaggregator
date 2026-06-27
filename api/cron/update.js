// api/cron/update.js
// 这个文件允许通过 HTTP 请求触发更新（如 vercel.json 中配置 cron）
import { aggregate } from '../../src/aggregator.js';
import { readFileSync, writeFileSync } from 'fs';
import { promises as fs } from 'fs';

export default async function handler(req, res) {
  // 仅允许 CRON_SECRET 验证的请求
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const config = JSON.parse(readFileSync('data/sources.json', 'utf-8'));
    const result = await aggregate(config.sources);

    await fs.writeFile('public/data/feed.json', JSON.stringify(result, null, 2));

    return res.status(200).json({ ok: true, stats: result.stats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
