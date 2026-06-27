// scripts/update.js
import { readFileSync, writeFileSync } from 'fs';
import { aggregate } from '../src/aggregator.js';

async function main() {
  console.log('📡 RSS Aggregator - Update started');
  const start = Date.now();

  const configPath = new URL('../data/sources.json', import.meta.url);
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  const result = await aggregate(config.sources);

  // 输出到 data/feed.json
  const outputPath = new URL('../data/feed.json', import.meta.url);
  writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

  // 同时复制到 public/data/feed.json（部署时会包含）
  const publicPath = new URL('../public/data/feed.json', import.meta.url);
  try {
    writeFileSync(publicPath, JSON.stringify(result, null, 2), 'utf-8');
  } catch (err) {
    // 如果 public 不存在则跳过
    console.warn('⚠️  public/data/feed.json not written:', err.message);
  }

  console.log(`✅ Done in ${((Date.now() - start) / 1000).toFixed(2)}s`);
  console.log(`📊 Stats:`, result.stats);
  if (result.errors.length > 0) {
    console.warn('⚠️  Errors:', result.errors);
  }
}

main().catch(err => {
  console.error('❌ Update failed:', err);
  process.exit(1);
});
