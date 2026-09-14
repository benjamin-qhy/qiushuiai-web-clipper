import type { SemanticBlock } from '../markdown/parse'

export interface PagePlan {
  index: number
  blocks: SemanticBlock[]
}

export interface PagePlannerOptions {
  contentHeight: number
  measure(blocks: SemanticBlock[]): Promise<number>
}
