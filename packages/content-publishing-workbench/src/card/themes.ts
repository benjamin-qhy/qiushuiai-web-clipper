import type { CardThemeId } from '../types'

export interface CardTheme {
  id: CardThemeId
  label: string
  description: string
}

export const CARD_THEMES: readonly CardTheme[] = [
  { id: 'basic', label: '基础', description: '石墨灰与荧光绿重点' },
  { id: 'tech', label: '科技', description: '深海军蓝与电蓝网格' },
  { id: 'minimal', label: '简约', description: '暖白纸张与黄色笔触' },
  { id: 'border', label: '边框', description: '白底与天蓝结构边框' },
  { id: 'journal', label: '手帐', description: '象牙横线纸与植物墨迹' },
  { id: 'soft', label: '柔和', description: '薄荷与蜜桃柔和纸张' },
] as const

export function getCardTheme(themeId: CardThemeId): CardTheme {
  return CARD_THEMES.find(theme => theme.id === themeId) ?? CARD_THEMES[2]
}
