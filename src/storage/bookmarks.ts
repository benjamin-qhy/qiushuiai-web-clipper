export interface BookmarkRecord {
  id: string
  url: string
  title: string
  summary: string
  tags: string[]
  category: string
  processedAt: number
}

export interface ProcessingStatus {
  state: 'idle' | 'running' | 'done' | 'error'
  total: number
  processed: number
  lastRunAt: number | null
  error?: string
}

const DB_NAME = 'qiushui-bookmarks'
const STORE_NAME = 'records'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveBookmarkRecord(record: BookmarkRecord): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(record)
    req.onsuccess = () => { db.close(); resolve() }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function getAllBookmarkRecords(): Promise<BookmarkRecord[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => { db.close(); resolve(req.result as BookmarkRecord[]) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function getProcessedIds(): Promise<Set<string>> {
  const records = await getAllBookmarkRecords()
  return new Set(records.map(r => r.id))
}
