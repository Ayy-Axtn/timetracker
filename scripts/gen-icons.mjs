// Generates the app icon and tray-state icons — a stopwatch motif drawn in code
// (no external deps), supersampled for smooth edges. The app icon is a full
// stopwatch; the tray icons are colour-coded status discs with a state glyph.
// Run with: npm run gen:icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')
const SS = 4 // supersample factor for anti-aliasing

// --- PNG (RGBA8) encoding ---
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
const encodePng = (size, rgba) => {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  let p = 0
  for (let y = 0; y < size; y += 1) {
    raw[p++] = 0 // filter: none
    for (let x = 0; x < stride; x += 1) raw[p++] = rgba[y * stride + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const shade = (rgb, f) => rgb.map((v) => Math.round(v * f))
const WHITE = [246, 247, 249]

// --- Hi-res drawing surface (opaque pixels; AA comes from downsampling) ---
const surface = (H) => {
  const buf = new Uint8Array(H * H * 4)
  const put = (x, y, col) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= H || y >= H) return
    const i = (y * H + x) * 4
    buf[i] = col[0]
    buf[i + 1] = col[1]
    buf[i + 2] = col[2]
    buf[i + 3] = 255
  }
  const disc = (cx, cy, r, col) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y += 1)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x += 1) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= r * r) put(x, y, col)
      }
  }
  const ring = (cx, cy, ro, ri, col) => {
    for (let y = Math.floor(cy - ro); y <= Math.ceil(cy + ro); y += 1)
      for (let x = Math.floor(cx - ro); x <= Math.ceil(cx + ro); x += 1) {
        const dx = x - cx
        const dy = y - cy
        const d2 = dx * dx + dy * dy
        if (d2 <= ro * ro && d2 >= ri * ri) put(x, y, col)
      }
  }
  // Thick line segment with round caps (used for hands, bars, stem).
  const capsule = (x1, y1, x2, y2, rad, col) => {
    const minx = Math.floor(Math.min(x1, x2) - rad)
    const maxx = Math.ceil(Math.max(x1, x2) + rad)
    const miny = Math.floor(Math.min(y1, y2) - rad)
    const maxy = Math.ceil(Math.max(y1, y2) + rad)
    const dxs = x2 - x1
    const dys = y2 - y1
    const len2 = dxs * dxs + dys * dys || 1
    for (let y = miny; y <= maxy; y += 1)
      for (let x = minx; x <= maxx; x += 1) {
        let t = ((x - x1) * dxs + (y - y1) * dys) / len2
        t = Math.max(0, Math.min(1, t))
        const px = x1 + t * dxs
        const py = y1 + t * dys
        const ddx = x - px
        const ddy = y - py
        if (ddx * ddx + ddy * ddy <= rad * rad) put(x, y, col)
      }
  }
  return { buf, disc, ring, capsule }
}

// Downsample the SS×SS blocks into the final image (premultiplied averaging).
const downsample = (H, buf, size) => {
  const out = new Uint8Array(size * size * 4)
  const n = SS * SS
  for (let oy = 0; oy < size; oy += 1)
    for (let ox = 0; ox < size; ox += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy += 1)
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((oy * SS + sy) * H + (ox * SS + sx)) * 4
          const pa = buf[i + 3]
          r += buf[i] * pa
          g += buf[i + 1] * pa
          b += buf[i + 2] * pa
          a += pa
        }
      const oi = (oy * size + ox) * 4
      out[oi] = a ? Math.round(r / a) : 0
      out[oi + 1] = a ? Math.round(g / a) : 0
      out[oi + 2] = a ? Math.round(b / a) : 0
      out[oi + 3] = Math.round(a / n)
    }
  return out
}

// Draw a stopwatch / status disc. glyph: 'clock' | 'pause' | 'error'.
const drawIcon = (size, { color, glyph, detail }) => {
  const H = size * SS
  const s = surface(H)
  const dark = shade(color, 0.62)
  const cx = H / 2
  const cy = H * (detail ? 0.55 : 0.5)
  const r = H * (detail ? 0.34 : 0.42)

  if (detail) {
    // Stem (top button) and a side start button.
    s.capsule(cx, cy - r - H * 0.11, cx, cy - r + H * 0.02, H * 0.055, dark)
    s.disc(cx, cy - r - H * 0.12, H * 0.07, dark)
    s.capsule(cx + r * 0.78, cy - r * 0.78, cx + r * 0.92, cy - r * 0.92, H * 0.045, dark)
  }

  s.disc(cx, cy, r, color)
  s.ring(cx, cy, r, r * (detail ? 0.9 : 0.88), dark) // bezel

  if (detail) {
    // Tick marks at 12/3/6/9.
    const tick = (ang) => {
      const a = (ang * Math.PI) / 180
      const x = Math.cos(a)
      const y = Math.sin(a)
      s.capsule(cx + x * r * 0.74, cy + y * r * 0.74, cx + x * r * 0.86, cy + y * r * 0.86, H * 0.018, WHITE)
    }
    tick(-90)
    tick(0)
    tick(90)
    tick(180)
  }

  if (glyph === 'clock') {
    // Minute hand (up) + hour hand (toward ~2 o'clock) + hub.
    s.capsule(cx, cy, cx + r * 0.04, cy - r * 0.6, H * (detail ? 0.028 : 0.05), WHITE)
    s.capsule(cx, cy, cx + r * 0.42, cy - r * 0.24, H * (detail ? 0.032 : 0.055), WHITE)
    s.disc(cx, cy, H * (detail ? 0.04 : 0.07), WHITE)
  } else if (glyph === 'pause') {
    const off = r * 0.26
    const half = r * 0.4
    const w = H * 0.075
    s.capsule(cx - off, cy - half, cx - off, cy + half, w, WHITE)
    s.capsule(cx + off, cy - half, cx + off, cy + half, w, WHITE)
  } else if (glyph === 'error') {
    s.capsule(cx, cy - r * 0.45, cx, cy + r * 0.12, H * 0.075, WHITE)
    s.disc(cx, cy + r * 0.42, H * 0.095, WHITE)
  }

  return encodePng(size, downsample(H, s.buf, size))
}

const COLOURS = {
  idle: [108, 113, 122],
  active: [46, 150, 74],
  paused: [232, 140, 0],
  error: [211, 51, 51],
  brand: [38, 132, 220]
}

const targets = [
  { file: 'tray-idle.png', size: 32, color: COLOURS.idle, glyph: 'clock', detail: false },
  { file: 'tray-active.png', size: 32, color: COLOURS.active, glyph: 'clock', detail: false },
  { file: 'tray-paused.png', size: 32, color: COLOURS.paused, glyph: 'pause', detail: false },
  { file: 'tray-error.png', size: 32, color: COLOURS.error, glyph: 'error', detail: false },
  { file: 'icon.png', size: 256, color: COLOURS.brand, glyph: 'clock', detail: true }
]

mkdirSync(outDir, { recursive: true })
for (const { file, size, ...opts } of targets) {
  writeFileSync(join(outDir, file), drawIcon(size, opts))
  console.log(`wrote resources/${file} (${size}x${size})`)
}
