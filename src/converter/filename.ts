// File systems limit filenames to 255 bytes (UTF-8). Reserve bytes for ".md" + conflict suffix.
const MAX_FILENAME_BYTES = 200

function truncateToBytes(str: string, maxBytes: number): string {
  const encoder = new TextEncoder()
  if (encoder.encode(str).length <= maxBytes) return str
  const chars = [...str]
  while (chars.length > 0 && encoder.encode(chars.join('')).length > maxBytes) {
    chars.pop()
  }
  return chars.join('').trim() || 'untitled'
}

// Windows reserved device names (case-insensitive, apply with or without extension)
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i

export function sanitizeFilename(title: string): string {
  const result = [...title]
    .filter(ch => {
      const cp = ch.codePointAt(0) ?? 0
      // 控制字符 (U+0000–U+001F, U+007F–U+009F)
      if (cp <= 0x1F || (cp >= 0x7F && cp <= 0x9F)) return false
      // 零宽 / 不可见字符 (U+200B–U+200F, U+2028–U+2029, U+FEFF, U+00AD)
      if (cp >= 0x200B && cp <= 0x200F) return false
      if (cp === 0x2028 || cp === 0x2029) return false
      if (cp === 0xFEFF || cp === 0x00AD) return false
      // 文件系统非法字符（Windows + macOS 均适用）
      if ('/\\:*?"<>|'.includes(ch)) return false
      return true
    })
    .join('')
    .trim()
    .replace(/^\.+/, '')   // 不能以 . 开头（macOS / File System Access API）
    .replace(/\.+$/, '')   // 不能以 . 结尾（Windows 会静默截断末尾的点）
    .trim()

  // Windows 保留设备名（CON、NUL、COM1-9、LPT1-9 等）加后缀避免冲突
  const safe = WINDOWS_RESERVED.test(result) ? `${result}_` : result
  return truncateToBytes(safe || 'untitled', MAX_FILENAME_BYTES)
}

export function resolveFilename(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base
  let i = 1
  while (existing.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

export async function chooseFilename(
  base: string,
  existing: Set<string>,
  confirmOverwrite: (filename: string) => boolean | Promise<boolean>,
): Promise<{ finalName: string; overwrite: boolean }> {
  if (!existing.has(base)) return { finalName: base, overwrite: false }
  if (await confirmOverwrite(`${base}.md`)) return { finalName: base, overwrite: true }
  return { finalName: resolveFilename(base, existing), overwrite: false }
}
