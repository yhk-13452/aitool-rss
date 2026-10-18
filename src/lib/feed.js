import { articlesTable, feedsTable, getMeta, setMeta } from './db.js'

// 拉取同源的 feed.json（由 Actions 管道产出、SW 走 StaleWhileRevalidate 缓存）。
// 加时间戳查询参数绕过浏览器 HTTP 缓存，但 SW 层仍会命中/回源，不影响离线。
export async function fetchFeedJson() {
    const url = `${import.meta.env.BASE_URL}feed.json?t=${Date.now()}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`feed.json HTTP ${res.status}`)
    return res.json()
}

// 把 feed.json 增量并入 IndexedDB。已读状态以本地为准，不被 feed 覆盖。
export async function syncFeed() {
    const data = await fetchFeedJson()

    const newArticles = []
    for (const feed of data.feeds) {
        for (const it of feed.items) {
            newArticles.push({ ...it, feedId: feed.id, feedTitle: feed.title, readAt: null })
        }
    }

    // 只插入本地还没有的，保留已有条目的 readAt
    const existingIds = new Set(await articlesTable.where('id').anyOf(newArticles.map(a => a.id)).primaryKeys())
    const toAdd = newArticles.filter(a => !existingIds.has(a.id))
    if (toAdd.length) await articlesTable.bulkAdd(toAdd)

    await feedsTable.bulkPut(data.feeds.map(f => ({ id: f.id, title: f.title, fetchedAt: f.fetchedAt })))

    const before = await articlesTable.count()
    await setMeta('lastSync', {
        at: new Date().toISOString(),
        generatedAt: data.generatedAt,
        added: toAdd.length,
        errors: data.errors,
        articleCount: before,
    })
    await setMeta('fingerprint', { total: before, lastGeneratedAt: data.generatedAt })

    return { added: toAdd.length, total: before, errors: data.errors }
}

// 启动自检：IndexedDB 被 iOS 静默清空时，之前存过 lastSync 但 articles 现在为空 → 判定为被清。
// 绝不让用户看到「看起来正常的空态」。
export async function checkStorageIntegrity() {
    const lastSync = await getMeta('lastSync')
    const count = await articlesTable.count()
    if (lastSync && lastSync.articleCount > 0 && count === 0) {
        return { wiped: true, lostCount: lastSync.articleCount }
    }
    return { wiped: false, count }
}
