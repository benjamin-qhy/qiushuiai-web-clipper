import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const [file, mediaType, output] = process.argv.slice(2)
if (!file || !mediaType || !output) throw new Error('用法：文件路径 媒体类型 输出.json')
if (existsSync(output)) throw new Error('已有上传结果，请读取该文件；不要重复上传。')
const digest = createHash('sha256')
for await (const chunk of createReadStream(file)) digest.update(chunk)
const declaration = { filename: basename(file), mediaType, sizeBytes: statSync(file).size, sha256: digest.digest('hex') }
const keyFile = process.env.HAIQIAI_API_KEY_FILE || join(process.env.HAIQIAI_DATA_DIR || '.haiqiai-publishing', 'admin.key')
const identity = createHash('sha256').update(readFileSync(keyFile, 'utf8').trim()).digest('hex')
const manifest = JSON.stringify({ apiUrl: process.env.HAIQIAI_API_URL || 'http://127.0.0.1:43129', identity, declaration })
const manifestPath = `${output}.upload.json`
if (existsSync(manifestPath)) {
  if (readFileSync(manifestPath, 'utf8') !== manifest) throw new Error('文件、服务或身份已改变，请使用新的输出路径')
} else writeFileSync(manifestPath, manifest, { flag: 'wx', mode: 0o600 })
const input = `${output}.declaration.json`; const metadata = `${output}.asset.json`
if (!existsSync(input)) writeFileSync(input, JSON.stringify(declaration), { flag: 'wx', mode: 0o600 })
else if (readFileSync(input, 'utf8') !== JSON.stringify(declaration)) throw new Error('声明文件已改变，请检查请求记录')
const cli = fileURLToPath(new URL('./admin.mts', import.meta.url))
if (!existsSync(metadata)) await promisify(execFile)(process.execPath, [cli, 'POST', '/v1/assets', input, metadata])
const asset = JSON.parse(readFileSync(metadata, 'utf8'))
await promisify(execFile)(process.execPath, [cli, 'UPLOAD', `/v1/assets/${asset.assetId}/content`, file, output])
console.log(`上传结果已保存：${output}`)
