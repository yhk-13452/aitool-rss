import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { BASE_URL } from './build/config.js'

// 界面上必须能认出「现在跑的是哪一版」：Pages 的 sw.js 走 CDN 缓存，
// 把 commit 短 SHA 与构建时间烧进包里。
function appBuild() {
    const run = cmd => {
        try { return execSync(cmd, { encoding: 'utf8', cwd: import.meta.dirname }).trim() } catch { return '' }
    }
    const sha = run('git rev-parse --short HEAD') || (process.env.GITHUB_SHA ?? '').slice(0, 7)
    return JSON.stringify({
        id: sha || '未知',
        dirty: !!run('git status --porcelain'),
        at: new Date().toISOString(),
    })
}

// 开发期放宽 connect-src 以允许 Vite HMR 的 websocket；生产构建用严格版。
// img-src 生产也放开 https: —— RSS 文章正文里的远程图片要能显示；
// script-src 保持 'self'，远程内容里的 <script> 不会被执行。
const cspDirectives = ({ dev }) => [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' blob: data:",
    `connect-src 'self' data:${dev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
].join('; ')

// Pages 无法设置 HTTP 响应头，CSP 只能走 <meta http-equiv>
function injectCsp() {
    return {
        name: 'inject-csp',
        transformIndexHtml(html, ctx) {
            const tag = `<meta http-equiv="Content-Security-Policy" content="${cspDirectives(
                { dev: ctx.server !== undefined }
            )}">`
            return html.replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n    ${tag}`)
        },
    }
}

// 每个 precache URL 都必须对应 dist/ 里的真实文件，否则 SW 装完静默失败、离线不可用
function assertPrecache() {
    let outDir
    return {
        name: 'assert-precache',
        apply: 'build',
        configResolved(config) {
            outDir = resolve(config.root, config.build.outDir)
        },
        // vite-plugin-pwa 在 post 钩子里写出 sw.js，检查必须排在其后
        closeBundle: {
            order: 'post',
            handler() {
                const sw = readFileSync(resolve(outDir, 'sw.js'), 'utf8')
                const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map(m => m[1])
                const missing = urls.filter(url => !existsSync(resolve(outDir, url.replace(/^\/+/, ''))))
                this.info(`precache self-check: ${urls.length} entries, ${missing.length} missing`)
                if (missing.length) this.error(`precache URL not found in dist: ${missing.join(', ')}`)
            },
        },
    }
}

export default defineConfig({
    // base 是唯一路径来源：manifest 的 start_url/scope、SW 注册路径、
    // precache 列表全部由它派生，换 repo 名只需改 APP_SLUG
    base: BASE_URL,
    define: { __APP_BUILD__: appBuild() },
    plugins: [
        injectCsp(),
        react(),
        VitePWA({
            registerType: 'prompt',
            includeManifestIcons: false,
            manifest: {
                name: 'RSS 阅读器',
                short_name: 'RSS',
                description: '静态订阅源聚合的离线 RSS 阅读器',
                lang: 'zh-CN',
                start_url: '.',
                scope: './',
                display: 'standalone',
                orientation: 'any',
                background_color: '#1a1a2e',
                theme_color: '#1a1a2e',
                icons: [
                    { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
                    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: 'pwa-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
                    { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            workbox: {
                // 只预缓存应用外壳；feed.json 与文章数据走 runtimeCaching，绝不进 precache，
                // 否则内容每次更新用户都要等新壳发版才能看到
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                globIgnores: ['**/pwa-1024.png', '**/pwa-512.png', '**/pwa-512-maskable.png'],
                runtimeCaching: [
                    {
                        urlPattern: /\/feed\.json$/,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'rss-data',
                            expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
                        },
                    },
                ],
            },
        }),
        assertPrecache(),
    ],
    build: {
        // 支持下限 iOS 18 → 不做语法转译
        target: 'safari18',
    },
})
