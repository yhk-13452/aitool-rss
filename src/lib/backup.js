import { articlesTable, metaTable } from './db.js'

// 备份只存个人状态（已读/收藏/meta 设置）；文章本体由 feed.json 重新同步。
// 恢复按 id 命中，本地还不存在的文章计入 missing（下次同步后再恢复一次即可补全）。
export async function buildBackup() {
    const states = await articlesTable
        .filter(a => a.readAt != null || a.starredAt != null)
        .toArray()
    return {
        app: 'aitool-rss',
        kind: 'backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        states: states.map(a => ({ id: a.id, readAt: a.readAt ?? null, starredAt: a.starredAt ?? null })),
        meta: await metaTable.toArray(),
    }
}

function backupName() {
    return `rssreader-backup-${new Date().toISOString().slice(0, 10)}.json`
}

export async function exportBackup() {
    const doc = await buildBackup()
    const data = JSON.stringify(doc, null, 2)
    const name = backupName()
    // 主屏 iOS：<a download> 是坏的，navigator.share({files}) 才是正路（reader 实测）
    const file = new File([data], name, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file] })
            return { method: 'share', states: doc.states.length }
        } catch (e) {
            if (e.name === 'AbortError') return { method: 'cancelled' }
            // 其余错误落入下载兜底
        }
    }
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    return { method: 'download', states: doc.states.length }
}

export async function importBackup(file) {
    let doc
    try {
        doc = JSON.parse(await file.text())
    } catch {
        throw new Error('文件不是合法 JSON')
    }
    if (doc?.kind !== 'backup' || !Array.isArray(doc.states)) {
        throw new Error('不是本应用的备份文件（缺 kind/states）')
    }
    let applied = 0
    let missing = 0
    for (const s of doc.states) {
        if (await articlesTable.get(s.id)) {
            await articlesTable.update(s.id, { readAt: s.readAt ?? null, starredAt: s.starredAt ?? null })
            applied++
        } else {
            missing++
        }
    }
    if (Array.isArray(doc.meta)) {
        for (const m of doc.meta) await metaTable.put(m)
    }
    return { applied, missing, exportedAt: doc.exportedAt ?? '' }
}
