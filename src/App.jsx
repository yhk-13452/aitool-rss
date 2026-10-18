import { useEffect, useMemo, useRef, useState } from 'react'
import { articlesTable, feedsTable, markRead, markUnread, markAllRead, toggleStar, getMeta } from './lib/db.js'
import { syncFeed, checkStorageIntegrity } from './lib/feed.js'
import { exportBackup, importBackup } from './lib/backup.js'
import { subscribe, applyUpdate, checkNow } from './lib/update.js'

const build = __APP_BUILD__

function fmtTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const diffH = (Date.now() - d.getTime()) / 3600000
    if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))} 分钟前`
    if (diffH < 24) return `${Math.round(diffH)} 小时前`
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function useUpdateBanner() {
    const [show, setShow] = useState(false)
    useEffect(() => subscribe(setShow), [])
    return show
}

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
}

export default function App() {
    const [articles, setArticles] = useState([])
    const [filter, setFilter] = useState('all')
    const [openId, setOpenId] = useState(null)
    const [open, setOpen] = useState(null)
    const [sync, setSync] = useState(null)
    const [wiped, setWiped] = useState(false)
    const [busy, setBusy] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [toast, setToast] = useState('')
    const [showFeeds, setShowFeeds] = useState(false)
    const [feedRows, setFeedRows] = useState([])
    const [lastSyncMeta, setLastSyncMeta] = useState(null)
    const fileRef = useRef(null)
    const updateReady = useUpdateBanner()

    const notify = (msg) => {
        setToast(msg)
        setTimeout(() => setToast(''), 4000)
    }

    const reload = async () => {
        setBusy(true)
        setLoadError('')
        try {
            const result = await syncFeed()
            setSync(result)
        } catch (e) {
            // 拉取失败不判空：本地库里有什么就显示什么（SW 缓存 / 既往数据）
            setLoadError(String(e?.message ?? e))
        }
        const rows = await articlesTable.orderBy('pubDate').reverse().toArray()
        setArticles(rows)
        setBusy(false)
    }

    useEffect(() => {
        checkStorageIntegrity().then(r => setWiped(r.wiped))
        reload()
    }, [])

    useEffect(() => {
        if (openId) {
            markRead(openId).then(() => articlesTable.get(openId).then(setOpen))
        }
    }, [openId])

    const feeds = useMemo(() => {
        const m = new Map()
        for (const a of articles) m.set(a.feedId, a.feedTitle)
        return [...m.entries()]
    }, [articles])

    const shown = useMemo(() => {
        if (filter === 'all') return articles
        if (filter === 'unread') return articles.filter(a => a.readAt == null)
        if (filter === 'starred') return articles.filter(a => a.starredAt != null)
        return articles.filter(a => a.feedId === filter)
    }, [articles, filter])

    const filterFeedId = feeds.some(([id]) => id === filter) ? filter : null

    const onMarkAllRead = async () => {
        const scope = filterFeedId ? articles.find(a => a.feedId === filterFeedId)?.feedTitle : '全部'
        if (!window.confirm(`把「${scope}」的未读文章全部标为已读？`)) return
        const n = await markAllRead(filterFeedId)
        notify(`已标已读 ${n} 篇`)
        reload()
    }

    const onToggleStar = async () => {
        const starredAt = await toggleStar(open.id)
        setOpen({ ...open, starredAt })
        setArticles(prev => prev.map(a => a.id === open.id ? { ...a, starredAt } : a))
    }

    const onExport = async () => {
        const r = await exportBackup()
        if (r.method === 'share') notify(`已分享备份（${r.states} 条状态）`)
        else if (r.method === 'download') notify(`已下载备份（${r.states} 条状态）`)
        else if (r.method === 'cancelled') notify('已取消分享')
    }

    const onImport = async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        try {
            const r = await importBackup(file)
            notify(`恢复完成：命中 ${r.applied} 条${r.missing ? `，${r.missing} 条文章暂不在本地（同步后再恢复一次）` : ''}`)
            reload()
        } catch (err) {
            notify(`恢复失败：${err.message}`)
        }
    }

    const openFeeds = async () => {
        setFeedRows(await feedsTable.toArray())
        setLastSyncMeta(await getMeta('lastSync'))
        setShowFeeds(true)
    }

    return (
        <div className="app">
            <header>
                <div className="bar">
                    <strong>RSS</strong>
                    <span className="grow" />
                    <button onClick={onMarkAllRead}>标已读</button>
                    <button disabled={busy} onClick={reload}>{busy ? '刷新中…' : '刷新'}</button>
                </div>
                {toast && <div className="banner info">{toast}</div>}
                {updateReady && (
                    <div className="banner update">
                        新版本已就绪
                        <button onClick={() => applyUpdate()}>重启更新</button>
                    </div>
                )}
                {!isStandalone() && (
                    <div className="banner warn">
                        浏览器标签页模式：iOS 会在 7 天不用后静默清除本地数据。请用「分享 → 添加到主屏幕」安装后在主屏 App 内阅读。
                    </div>
                )}
                {wiped && (
                    <div className="banner danger">
                        检测到本地文章库被清空（可能是系统清理了存储）。已读记录已丢失，刷新可重建文章缓存。
                    </div>
                )}
                {sync?.errors?.length > 0 && (
                    <div className="banner warn">
                        {sync.errors.length} 个订阅源本次抓取失败：{sync.errors.map(e => e.id).join('、')}
                    </div>
                )}
                {loadError && <div className="banner warn">feed.json 拉取失败（{loadError}），显示的是本地缓存</div>}
            </header>

            <nav className="chips">
                <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>全部</button>
                <button className={filter === 'unread' ? 'on' : ''} onClick={() => setFilter('unread')}>未读</button>
                <button className={filter === 'starred' ? 'on' : ''} onClick={() => setFilter('starred')}>收藏</button>
                {feeds.map(([id, title]) => (
                    <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{title}</button>
                ))}
            </nav>

            <main>
                {shown.length === 0 && !busy && (
                    <p className="empty">{filter === 'starred' ? '还没有收藏。打开文章后点 ☆ 收藏。' : filter === 'unread' ? '没有未读文章。' : '没有文章。若刚清除过数据，点上方「刷新」重建缓存。'}</p>
                )}
                <ul className="list">
                    {shown.map(a => (
                        <li key={a.id} className={a.readAt ? 'read' : 'unread'} onClick={() => setOpenId(a.id)}>
                            <div className="title">{a.starredAt ? '★ ' : ''}{a.title}</div>
                            <div className="meta">{a.feedTitle} · {fmtTime(a.pubDate)}</div>
                        </li>
                    ))}
                </ul>
            </main>

            {open && (
                <div className="sheet">
                    <div className="sheet-bar">
                        <button onClick={() => { setOpen(null); setOpenId(null); reload() }}>← 返回</button>
                        <span className="grow" />
                        <button onClick={onToggleStar} title="收藏">{open.starredAt ? '★' : '☆'}</button>
                        <button onClick={async () => {
                            const s = await (open.readAt ? markUnread(open.id).then(() => null) : markRead(open.id))
                            setOpen({ ...open, readAt: s ?? null })
                        }}>{open.readAt ? '标未读' : '标已读'}</button>
                        {open.link
                            ? <a href={open.link} target="_blank" rel="noreferrer">原文 ↗</a>
                            : <span className="nolink">已隐藏原文</span>}
                    </div>
                    <article>
                        <h2>{open.title}</h2>
                        <div className="meta">{open.feedTitle} · {new Date(open.pubDate).toLocaleString('zh-CN')}</div>
                        <div className="content" dangerouslySetInnerHTML={{ __html: open.content || open.contentSnippet || '' }} />
                    </article>
                </div>
            )}

            {showFeeds && (
                <div className="sheet">
                    <div className="sheet-bar">
                        <button onClick={() => setShowFeeds(false)}>← 返回</button>
                        <span className="grow" />
                        <strong>订阅状态</strong>
                    </div>
                    <div className="feeds-panel">
                        <h3>订阅源</h3>
                        <ul className="feed-list">
                            {feedRows.map(f => (
                                <li key={f.id}>
                                    <div className="title">{f.title}</div>
                                    <div className="meta">
                                        {articles.filter(a => a.feedId === f.id).length} 篇 ·
                                        抓取于 {f.fetchedAt ? fmtTime(f.fetchedAt) : '未知'}
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {lastSyncMeta?.errors?.length > 0 && (
                            <>
                                <h3>上次抓取失败</h3>
                                <ul className="feed-list errors">
                                    {lastSyncMeta.errors.map(e => (
                                        <li key={e.id}>
                                            <div className="title">{feedRows.find(f => f.id === e.id)?.title ?? e.id}</div>
                                            <div className="meta">{e.error}</div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                </div>
            )}

            <footer>
                <button onClick={openFeeds}>订阅</button>
                <button onClick={onExport}>备份</button>
                <button onClick={() => fileRef.current?.click()}>恢复</button>
                <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onImport} />
                <span className="grow" />
                <span>build {build.id}{build.dirty ? '*' : ''} @ {build.at?.slice(0, 16).replace('T', ' ')}</span>
                <button onClick={async () => {
                    const r = await checkNow()
                    alert(r.checked ? (r.updated ? '有新版本，点「重启更新」生效' : '已是最新版本') : `检查失败：${r.reason}`)
                }}>检查更新</button>
            </footer>
        </div>
    )
}
