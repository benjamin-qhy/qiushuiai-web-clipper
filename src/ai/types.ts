export interface AICompletionOptions {
  responseFormat?: 'json' | 'text'
}

export interface AIProvider {
  complete(
    userPrompt: string,
    systemPrompt?: string,
    options?: AICompletionOptions,
  ): Promise<string>
  testConnection(): Promise<void>
}
