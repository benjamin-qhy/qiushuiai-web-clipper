import type { State } from './model.mts'
import { fail, text } from './protocol.mts'

export function resolveTarget(state: State, body: Record<string, unknown>) {
  const computer = state.computers.find(computer => computer.id === text(body, 'computerId'))
  if (!computer) fail(422, 'COMPUTER_NOT_FOUND', '电脑不存在')
  const browserId = body.browserId === undefined ? computer.defaultBrowserId : text(body, 'browserId')
  if (!browserId) fail(422, 'DEFAULT_NOT_SET', '电脑尚未设置默认浏览器')
  const profileId = body.profileId === undefined ? computer.defaultProfiles[browserId] : text(body, 'profileId')
  if (!profileId) fail(422, 'DEFAULT_NOT_SET', '浏览器尚未设置默认用户配置')
  const matches = state.executors.filter(executor => !executor.revoked && executor.computerId === computer.id && executor.browserId === browserId && executor.profileId === profileId)
  if (matches.length !== 1) fail(422, 'EXECUTOR_NOT_FOUND', '目标安装不存在、已撤销或有歧义')
  const executor = matches[0]
  const account = state.accounts.find(account => account.id === text(body, 'accountId') && account.platform === text(body, 'platform') && account.executorId === executor.id)
  if (!account) fail(422, 'ACCOUNT_MISMATCH', '账号未登记到指定平台和安装实例')
  return { executorId: executor.id, computerId: computer.id, browserId, profileId, accountId: account.id, platform: account.platform }
}
