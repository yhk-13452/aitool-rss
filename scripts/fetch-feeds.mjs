import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import Parser from 'rss-parser';

const root = path.resolve(import.meta.dirname, '..');
const configPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'feeds.config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));

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

function toItem(entry) {
  return {
    id: itemId(entry),
    title: entry.title ?? '(untitled)',
    link: entry.link ?? '',
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
      title: res.title ?? feed.id,
      siteUrl: res.link ?? '',
      fetchedAt: new Date().toISOString(),
      items: res.items.slice(0, config.maxItemsPerFeed).map(toItem),
    };
  })
);

const feeds = [];
const errors = [];
results.forEach((r, i) => {
  const id = config.feeds[i].id;
  if (r.status === 'fulfilled') feeds.push(r.value);
  else errors.push({ id, url: config.feeds[i].url, error: String(r.reason?.message ?? r.reason) });
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
