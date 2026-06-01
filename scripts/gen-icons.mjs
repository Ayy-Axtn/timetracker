// Generates placeholder solid-colour PNG icons (no external deps) for the tray
// state set and the app icon. These are stand-ins — replace with real artwork
// before distribution. Run with: npm run gen:icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'resources')

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

// Solid RGBA square with a 1px transparent margin so tray icons read cleanly.
const png = (size, [r, g, b]) => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(6, 9) // colour type: RGBA
  const margin = size >= 32 ? Math.round(size * 0.12) : 1
  const raw = Buffer.alloc((1 + size * 4) * size)
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 4)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < size; x += 1) {
      const edge = x < margin || y < margin || x >= size - margin || y >= size - margin
      const p = rowStart + 1 + x * 4
      raw[p] = r
      raw[p + 1] = g
      raw[p + 2] = b
      raw[p + 3] = edge ? 0 : 255
    }
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const targets = [
  { file: 'tray-idle.png', size: 16, colour: [158, 158, 158] }, // grey
  { file: 'tray-active.png', size: 16, colour: [67, 160, 71] }, // green
  { file: 'tray-paused.png', size: 16, colour: [255, 179, 0] }, // amber
  { file: 'tray-error.png', size: 16, colour: [229, 57, 53] }, // red
  { file: 'icon.png', size: 256, colour: [38, 110, 180] } // app icon (blue)
]

mkdirSync(outDir, { recursive: true })
for (const { file, size, colour } of targets) {
  writeFileSync(join(outDir, file), png(size, colour))
  console.log(`wrote resources/${file} (${size}x${size})`)
}
