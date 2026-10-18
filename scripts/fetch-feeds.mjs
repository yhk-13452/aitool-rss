import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';

const root = path.resolve(import.meta.dirname, '..');

// 订阅清单优先读 Actions Secret FEEDS_JSON（公开仓库的 Actions 日志人人可见，
// 所以错误信息也要脱敏：URL 与主机名一律不回显）。仓库文件仅作本地开发 fallback。
let config;
const rawEnv = process.env.FEEDS_JSON?.trim();
if (rawEnv) {
  try {
    config = JSON.parse(rawEnv);
  } catch {
    // 不回显解析错误细节，避免 secret 片段进公开 Actions 日志
    console.error('FEEDS_JSON 不是合法 JSON（请检查格式，勿带多余引号/换行转义问题）');
    process.exit(1);
  }
} else {
  const configPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'feeds.config.json');
  let text;
  try {
    text = await readFile(configPath, 'utf8');
  } catch (e) {
    console.error(e.code === 'ENOENT'
      ? '缺少订阅配置：未设置 FEEDS_JSON，也读不到 feeds.config.json（GitHub 上请到 Settings→Secrets→Actions 新建 FEEDS_JSON）'
      : `读取 ${configPath} 失败: ${e.message}`);
    process.exit(1);
  }
  try {
    config = JSON.parse(text);
  } catch (e) {
    console.error(`feeds.config.json 不是合法 JSON: ${e.message}`);
    process.exit(1);
  }
}
if (!Array.isArray(config.feeds) || config.feeds.length === 0 || config.feeds.some(f => !f.id || !f.url)) {
  console.error('配置无效：需要 feeds:[{id,url}] 非空数组');
  process.exit(1);
}

function redact(message, feed) {
  let out = String(message);
  try { out = out.replaceAll(new URL(feed.url).hostname, '[host]'); } catch { /* url 非法时无需脱敏 */ }
  return out.replaceAll(feed.url, '[url]');
}

const parser = new Parser({
  timeout: config.timeoutMs,
  headers: { 'user-agent': 'Mozilla/5.0 (compatible; FeedFetcher/1.0)' },
});

function itemId(entry) {
  const key = entry.guid || entry.link || entry.title || '';
  return createHash('sha1').update(key).digest('hex');
}

function cleanAuthor(value) {
  return (value ?? '').replace(/<[^>]*>/g, '').replace(/[\w.+-]+@[\w.-]+/g, '').trim();
}

function toItem(entry, feed) {
  return {
    id: itemId(entry),
    title: entry.title ?? '(untitled)',
    // 私密源可设 hideLinks：不把文章 URL 放进公开产物（代价：该源文章不能跳原文）
    link: feed.hideLinks ? '' : (entry.link ?? ''),
    pubDate: entry.isoDate ?? entry.pubDate ?? '',
    author: cleanAuthor(entry.creator ?? entry.author),
    contentSnippet: (entry.contentSnippet ?? '').slice(0, 500),
    content: (entry.content ?? entry['content:encoded'] ?? '').slice(0, 8000),
    image: entry.itunes?.image ?? entry.enclosure?.url ?? '',
  };
}

const results = await Promise.allSettled(
  config.feeds.map(async (feed) => {
    const res = await parser.parseURL(feed.url);
    return {
      id: feed.id,
      // 配置里的 title 作为展示别名（私密源可脱敏成代号）；未设置则用源自带标题
      title: feed.title ?? res.title ?? feed.id,
      fetchedAt: new Date().toISOString(),
      items: res.items.slice(0, config.maxItemsPerFeed).map(entry => toItem(entry, feed)),
    };
  })
);

const feeds = [];
const errors = [];
results.forEach((r, i) => {
  const id = config.feeds[i].id;
  if (r.status === 'fulfilled') feeds.push(r.value);
  else errors.push({ id, error: redact(r.reason?.message ?? r.reason, config.feeds[i]) });
});

if (feeds.length === 0) {
  console.error(`all feeds failed: ${JSON.stringify(errors)}`);
  process.exit(1);
}

const output = { generatedAt: new Date().toISOString(), feeds, errors };
const outDir = path.join(root, 'data');
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'feed.json'), JSON.stringify(output, null, 2));

console.log(`ok: ${feeds.length} feeds, ${feeds.reduce((n, f) => n + f.items.length, 0)} items, ${errors.length} errors -> data/feed.json`);
for (const e of errors) console.log(`  failed: ${e.id} (${e.error})`);
