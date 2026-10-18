// 生成占位图标（纯色 PNG），供开发期与构建自检使用。
// 正式图标定稿前替换掉本脚本产物；PNG 元数据剥离在上库流程里单独做。
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'public')
mkdirSync(outDir, { recursive: true })

const [R, G, B] = [0x1a, 0x1a, 0x2e]

function crc32(buf) {
  let c, table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function solidPng(size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3)])
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = R
    row[1 + x * 3 + 1] = G
    row[1 + x * 3 + 2] = B
  }
  const idat = deflateSync(Buffer.concat(Array(size).fill(row)))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const targets = {
  'apple-touch-icon.png': 180,
  'pwa-512.png': 512,
  'pwa-1024.png': 1024,
  'pwa-512-maskable.png': 512,
  'favicon.png': 64,
}
for (const [name, size] of Object.entries(targets)) {
  const png = solidPng(size)
  writeFileSync(path.join(outDir, name), png)
  console.log(`${name}: ${size}x${size} sha1=${createHash('sha1').update(png).digest('hex').slice(0, 8)}`)
}
