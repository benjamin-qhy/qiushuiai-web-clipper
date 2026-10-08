// Scope from decisions #22/#27. Existing upstream scripts are not yet verified adapters.
const scope: Record<string, string[]> = {
  weixin: ['article', 'dynamic'], weixinchannel: ['dynamic', 'video'],
  xiaohongshu: ['dynamic', 'video'], douyin: ['dynamic', 'video'], tiktok: ['video'],
  weibo: ['dynamic', 'article', 'video'], youtube: ['video'], okjike: ['dynamic', 'video'],
  toutiao: ['article', 'dynamic', 'video'], linkedin: ['dynamic'], maimai: ['dynamic'],
  zsxq: ['dynamic', 'article'], medium: ['article'],
}
export const capabilities = Object.entries(scope).flatMap(([platform, types]) => types.map(type => ({
  platform, type, adapterVersion: null, verified: false, autoPublish: false,
  requiredFields: [], supportedFields: [], fieldConstraints: null, mediaRules: null, supportedMarkup: [], destinationRequired: null,
  limitations: ['尚未接入任务执行与结果确认'],
})))
