import { useEffect, useMemo, useState } from 'react'
import { articlesTable, markRead, markUnread, getMeta } from './lib/db.js'
import { syncFeed, checkStorageIntegrity } from './lib/feed.js'
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
    const updateReady = useUpdateBanner()

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
        if (openId) markRead(openId).then(() => articlesTable.get(openId).then(setOpen))
    }, [openId])

    const feeds = useMemo(() => {
        const m = new Map()
        for (const a of articles) m.set(a.feedId, a.feedTitle)
        return [...m.entries()]
    }, [articles])
    const shown = filter === 'all' ? articles : articles.filter(a => a.feedId === filter)

    return (
        <div className="app">
            <header>
                <div className="bar">
                    <strong>RSS</strong>
                    <span className="grow" />
                    <button disabled={busy} onClick={reload}>{busy ? '刷新中…' : '刷新'}</button>
                </div>
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
                {feeds.map(([id, title]) => (
                    <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{title}</button>
                ))}
            </nav>

            <main>
                {shown.length === 0 && !busy && (
                    <p className="empty">没有文章。若刚清除过数据，点上方「刷新」重建缓存。</p>
                )}
                <ul className="list">
                    {shown.map(a => (
                        <li key={a.id} className={a.readAt ? 'read' : 'unread'} onClick={() => setOpenId(a.id)}>
                            <div className="title">{a.title}</div>
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
                        {open.readAt
                            ? <button onClick={() => markUnread(open.id).then(() => setOpen({ ...open, readAt: null }))}>标未读</button>
                            : <button onClick={() => markRead(open.id).then(() => setOpen({ ...open, readAt: Date.now() }))}>标已读</button>}
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

            <footer>
                <span>build {build.id}{build.dirty ? '*' : ''} @ {build.at?.slice(0, 16).replace('T', ' ')}</span>
                <span className="grow" />
                <button onClick={async () => {
                    const r = await checkNow()
                    alert(r.checked ? (r.updated ? '有新版本，点「重启更新」生效' : '已是最新版本') : `检查失败：${r.reason}`)
                }}>检查更新</button>
            </footer>
        </div>
    )
}
