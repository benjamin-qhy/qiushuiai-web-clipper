export interface AIProvider {
  complete(userPrompt: string, systemPrompt?: string): Promise<string>
  testConnection(): Promise<void>
}
