export interface UploadParams {
  base64: string
  mimeType: string
  notename: string
  source: string
}

export interface ImageUploader {
  upload(params: UploadParams): Promise<string>
}
