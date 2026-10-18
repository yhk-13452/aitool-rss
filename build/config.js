// 部署路径的唯一来源。换 repo 名 / 换部署地址时只改 APP_SLUG 这一行。
// vite.config.js 用它配 base 与 manifest；浏览器端一律读 import.meta.env.BASE_URL。
export const APP_SLUG = 'aitool-rss'

export const BASE_URL = `/${APP_SLUG}/`
