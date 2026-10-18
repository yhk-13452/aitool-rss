import Dexie from 'dexie'

// 库名带 aitool-rss 前缀：reader 与本 app 共享 <user>.github.io 这个 origin，
// IndexedDB 虽按名字隔离，但加前缀是共享 origin 下的既定约定，避免任何命名撞车。
const db = new Dexie('aitool-rss-meta')

db.version(1).stores({
    // id = sha1(guid||link)，主键
    articles: '&id, feedId, pubDate, readAt, [feedId+pubDate]',
    feeds: '&id, title',
    meta: '&key',
})

export const articlesTable = db.table('articles')
export const feedsTable = db.table('feeds')
export const metaTable = db.table('meta')

export async function markRead(id) {
    const now = Date.now()
    await articlesTable.update(id, { readAt: now })
    return now
}

export async function markUnread(id) {
    await articlesTable.update(id, { readAt: null })
}

export async function getMeta(key) {
    const rec = await metaTable.get(key)
    return rec?.value
}

export async function setMeta(key, value) {
    await metaTable.put({ key, value })
}

export { db }
