import type { GenerateInput, ModelChoice, ModelSelection, ReasoningLevel } from '@qiushui/content-publishing-workbench'
import { createAIProvider } from '../ai'
import { getAvailableModelSelection, getModelOptions, getProviderOptions } from '../ai/catalog'
import { getSettings, saveSettings, type Settings } from '../storage/settings'

export const CARD_MARKDOWN_OUTPUT_CONTRACT = `请只返回 Markdown。使用短段落、标题和列表组织内容；用 **粗体** 表示重要结论，用 ==重点标记== 表示最值得读者注意的短语。不要返回 YAML frontmatter，不要解释格式要求。`

function hasUsableCredentials(platform: Settings['aiPlatforms'][number]): boolean {
  return Boolean(platform.apiKey.trim()
    && (platform.provider !== 'openai-compatible' || platform.baseUrl?.trim()))
}

export function getPublisherModelChoices(settings: Settings): ModelChoice[] {
  const providerNames = new Map(getProviderOptions().map(option => [option.id, option.name]))

  return settings.aiPlatforms.filter(hasUsableCredentials).flatMap(platform => getModelOptions(platform).map(model => ({
    platformId: platform.id,
    modelId: model.id,
    reasoning: 'off' as const,
    label: model.name,
    groupLabel: providerNames.get(platform.provider) ?? platform.provider,
    reasoningLevels: ['off', ...model.reasoningLevels] as ReasoningLevel[],
  })))
}

export function resolvePublisherModelSelection(settings: Settings): ModelSelection | null {
  const available = getAvailableModelSelection({
    ...settings,
    aiPlatforms: settings.aiPlatforms.filter(hasUsableCredentials),
  })
  if (!available) return null

  const model = getModelOptions(available.platform).find(option => option.id === available.modelId)
  if (!model) return null
  const savedReasoning = settings.lastUsedAIReasoning ?? 'off'
  const reasoning = savedReasoning === 'off' || model.reasoningLevels.includes(savedReasoning)
    ? savedReasoning
    : 'off'

  return {
    platformId: available.platform.id,
    modelId: available.modelId,
    reasoning,
  }
}

interface GenerateDependencies {
  createProvider: typeof createAIProvider
  getLatestSettings: typeof getSettings
  save: typeof saveSettings
}

const defaultDependencies: GenerateDependencies = {
  createProvider: createAIProvider,
  getLatestSettings: getSettings,
  save: saveSettings,
}

export async function generatePublisherMarkdown(
  input: GenerateInput,
  settings: Settings,
  dependencies: GenerateDependencies = defaultDependencies,
): Promise<string> {
  const platform = settings.aiPlatforms.find(item => item.id === input.model.platformId)
  if (!platform) throw new Error('所选模型平台已不可用，请重新选择')
  if (!getModelOptions(platform).some(model => model.id === input.model.modelId)) {
    throw new Error('所选模型已不可用，请重新选择')
  }

  const provider = dependencies.createProvider(platform, input.model.modelId, input.model.reasoning)
  const systemPrompt = `${input.instruction.trim()}\n\n${CARD_MARKDOWN_OUTPUT_CONTRACT}`
  const markdown = await provider.complete(input.sourceMarkdown, systemPrompt, { responseFormat: 'text' })
  if (!markdown.trim()) throw new Error('模型未返回内容，请重试')

  const latestSettings = await dependencies.getLatestSettings()
  await dependencies.save({
    ...latestSettings,
    lastUsedAIModel: {
      platformId: input.model.platformId,
      modelId: input.model.modelId,
    },
    lastUsedAIReasoning: input.model.reasoning,
  })
  return markdown
}
