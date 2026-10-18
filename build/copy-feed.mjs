import { copyFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
copyFileSync(path.join(root, 'data', 'feed.json'), path.join(root, 'public', 'feed.json'))
console.log('data/feed.json -> public/feed.json')
