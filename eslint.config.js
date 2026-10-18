// 只跑两条规则，目的很窄：Vite 8 用的是 rolldown，未导入的裸标识符会被当成全局变量，
// 构建照样绿、运行时才 ReferenceError。所以这里只要 no-undef 能把「缺 import」抓出来。
// 全局名手工列（照 reader 的做法）：少一个依赖，也逼我们看清代码到底碰了哪些宿主 API。

const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    location: 'readonly',
    history: 'readonly',
    console: 'readonly',
    alert: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    requestAnimationFrame: 'readonly',
    indexedDB: 'readonly',
    caches: 'readonly',
    fetch: 'readonly',
    URL: 'readonly',
    Blob: 'readonly',
    File: 'readonly',
    FileReader: 'readonly',
    // 构建期由 vite define 替换掉（vite.config.js），运行时并不存在这个全局
    __APP_BUILD__: 'readonly',
}

const nodeGlobals = {
    process: 'readonly',
    console: 'readonly',
    URL: 'readonly',
    Blob: 'readonly',
    Buffer: 'readonly',
}

export default [
    { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'public/**'] },
    {
        files: ['src/**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            // espree 读 JSX 必须显式打开这个开关
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: browserGlobals,
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
        },
    },
    {
        files: ['vite.config.js', 'build/**/*.mjs', 'scripts/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: nodeGlobals,
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
        },
    },
]
