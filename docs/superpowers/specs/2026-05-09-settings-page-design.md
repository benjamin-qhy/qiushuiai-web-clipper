# Settings Page & OSS Upload Design

Date: 2026-05-09  
Status: Approved

## Background

This extension is a knowledge collection tool (currently: Feishu docs; future: 得到 e-books, etc.). Currently, users must select a Vault directory and configure a subdirectory on every popup open. This design introduces a dedicated Settings (Options) page to configure all persistent settings once, and adds cloud storage upload as an alternative to local file saving.

---

## Goals

- Move all persistent configuration out of the popup into a dedicated Options page
- Support two image handling modes: local save (default) and cloud storage upload
- Implement Aliyun OSS as the first cloud storage provider, with a clean abstraction for future providers (Tencent COS, AWS S3, etc.)
- Simplify the popup to its core job: show document properties and save

---

## Architecture

### New Files

```
entrypoints/options/
  index.html
  main.ts
  App.vue                      ← Settings page UI

src/storage/settings.ts        ← Read/write settings via chrome.storage.local
src/composables/useSettings.ts ← Vue composable wrapping settings storage

src/uploader/
  types.ts                     ← ImageUploader interface
  aliyun.ts                    ← Aliyun OSS implementation
  index.ts                     ← Factory: createUploader(settings) → ImageUploader | null
```

### Modified Files

```
entrypoints/popup/App.vue         ← Simplified: remove vault selection, subDir input
src/composables/useFileSave.ts    ← Branch on imageMode: local vs uploader
wxt.config.ts                     ← Add options entrypoint + host_permissions
```

### Storage Responsibilities

| Data | Storage |
|---|---|
| Vault directory handle | IndexedDB (structured clone, already implemented) |
| All other settings | `chrome.storage.local` (JSON) |

---

## Settings Data Model

```typescript
interface Settings {
  subDir: string              // default: 'Clippings'
  imageMode: 'local' | 'oss'
  ossProvider: 'aliyun'       // future: 'tencent' | 'aws'
  aliyunOSS: {
    accessKeyId: string
    accessKeySecret: string
    bucket: string
    region: string            // e.g. 'oss-cn-hangzhou'
    prefix: string            // e.g. 'obsidian'
  }
}

const DEFAULT_SETTINGS: Settings = {
  subDir: 'Clippings',
  imageMode: 'local',
  ossProvider: 'aliyun',
  aliyunOSS: { accessKeyId: '', accessKeySecret: '', bucket: '', region: 'oss-cn-hangzhou', prefix: '' },
}
```

---

## Uploader Abstraction

```typescript
// src/uploader/types.ts
interface UploadParams {
  base64: string
  mimeType: string
  notename: string   // sanitized, used in filename
  source: string     // e.g. 'feishu', 'dedao' — used in OSS path construction
}

interface ImageUploader {
  upload(params: UploadParams): Promise<string>  // returns public URL
}
```

Factory in `src/uploader/index.ts`:

```typescript
export function createUploader(settings: Settings): ImageUploader | null {
  if (settings.imageMode !== 'oss') return null
  if (settings.ossProvider === 'aliyun') return new AliyunOSSUploader(settings.aliyunOSS)
  return null
}
```

Adding a new provider in future = add a new class file + one branch in the factory. No other code changes needed.

---

## OSS Path Structure

```
${prefix}/feishu/${YYYYMM}/${notename}-${YYYYMMDDHHmmssSSS}.${ext}
```

Example:
```
obsidian/feishu/202605/半年50场AI培训-20260509143022583.png
```

- `YYYYMM` — monthly grouping
- `HHmmssSSS` — millisecond precision, no collisions even with concurrent multi-image uploads
- `notename` — processed by existing `sanitizeFilename()`, safe for all OS path rules
- `feishu` — source identifier, hardcoded per-source in each uploader caller

### Aliyun OSS Signing

Use browser-native **Web Crypto API (SubtleCrypto)** for OSS V1 HMAC-SHA1 signing. Zero external dependencies. No increase in bundle size.

Public URL format (Bucket must have public-read ACL):
```
https://${bucket}.${region}.aliyuncs.com/${path}
```

### Manifest Permission

```json
"host_permissions": ["https://*.aliyuncs.com/*"]
```

Required for cross-origin PUT requests from the extension.

---

## Settings Page UI

Single scrolling page with three sections:

### Section 1: Vault Configuration

- **Vault directory**: shows current directory name + "重新选择" button (triggers `showDirectoryPicker`)
- **Default subdirectory**: text input, default `Clippings`

### Section 2: Image Handling

Radio group:
- `● 保存到本地 Vault`（default）
- `○ 上传到云存储`

### Section 3: Cloud Storage Config

Visible only when "上传到云存储" is selected.

- **Cloud provider dropdown**: `阿里云 OSS` (only option for now)
- **Access Key ID**: text input
- **Access Key Secret**: password input with show/hide toggle
- **Bucket name**: text input
- **Region**: dropdown of common regions (oss-cn-hangzhou, oss-cn-beijing, oss-cn-shanghai, etc.)
- **Path prefix**: text input, placeholder `obsidian`
- **Path preview**: live preview of the full OSS path pattern
- **Test connection button**: uploads a 1×1 transparent PNG to `${prefix}/feishu/.connection-test.png`, reports success or specific error

### Footer

`[ 保存设置 ]` button — shows `✓ 已保存` confirmation on success.

---

## Popup Simplification

Popup no longer contains vault selection or subdirectory input. Three states:

**State 1: Fully configured (normal)**
- Doc title, properties panel, content preview
- `[ 保存到 Obsidian ▼ ]` save button
- ⚙ gear icon (top-right) → opens Settings page

**State 2: Vault not configured (first install)**
- Doc title, properties panel, content preview
- Warning: "请先在设置中配置 Vault 目录"
- `[ 去设置 ]` button → opens Settings page

**State 3: Vault needs re-authorization (after browser restart)**
- `[ 点击授权访问 Vault ]` button
- On click: calls `requestPermission()` (user gesture), no directory re-selection needed

---

## Error Handling

| Scenario | Behavior |
|---|---|
| OSS upload fails | Fall back to original Feishu URL, log warning, continue saving MD file |
| Vault not configured | Popup shows "去设置" prompt, save button hidden |
| Test connection fails | Show specific error: auth failure / bucket not found / network error |
| AK/SK empty when OSS selected | Disable save button in popup, show "OSS 配置不完整" |

---

## Vault Requirement in OSS Mode

The Vault directory is **always required**, regardless of image mode. The Vault stores the `.md` file. OSS only replaces local image storage — the markdown file itself is always written to the local Vault. If Vault is not configured, saving is blocked in both modes.

---

## Out of Scope

- STS temporary credentials (personal tool, direct AK/SK is acceptable)
- Private bucket + signed URLs (public-read bucket assumed)
- 得到 source integration (future work; path structure `${prefix}/dedao/${YYYYMM}/...` will follow same pattern)
