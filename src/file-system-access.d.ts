// Augment missing File System Access API types not yet in TypeScript's lib
interface FileSystemHandle {
  queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>
}

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite'; startIn?: FileSystemDirectoryHandle }): Promise<FileSystemDirectoryHandle>
}
