import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles.css'
import App from './App.jsx'
import { setRunner, watchUpdates, markAvailable } from './lib/update.js'

const updateSW = registerSW({
    onNeedRefresh() { markAvailable() },
    onOfflineReady() { console.info('[pwa] 应用外壳已缓存，可离线使用') },
    onRegisteredSW(url, registration) {
        console.info('[pwa] SW 已注册', { url, scope: registration?.scope })
        watchUpdates(registration)
    },
    onRegisterError(error) { console.error('[pwa] SW 注册失败', error) },
})
setRunner(updateSW)

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
