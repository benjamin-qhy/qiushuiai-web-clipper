export function computeSharedImagePath(
  subDir: string,
  imageLocalDir: string,
  filename: string,
): string {
  const depth = subDir.split('/').filter(Boolean).length
  const prefix = '../'.repeat(depth)
  return `${prefix}${imageLocalDir}/${filename}`
}
