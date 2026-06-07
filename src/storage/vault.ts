const DB_NAME = 'feishu-clipper'
const STORE_NAME = 'vault'
const HANDLE_KEY = 'handle'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY)
    req.onsuccess = () => { db.close(); resolve((req.result as FileSystemDirectoryHandle) ?? null) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function setVaultHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY)
    req.onsuccess = () => { db.close(); resolve() }
    req.onerror = () => { db.close(); reject(req.error) }
  })
  if (navigator.storage?.persist) {
    await navigator.storage.persist()
  }
}

export async function clearVaultHandle(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).delete(HANDLE_KEY)
    req.onsuccess = () => { db.close(); resolve() }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}
