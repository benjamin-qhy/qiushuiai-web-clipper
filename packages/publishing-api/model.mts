import type { Asset } from './assets.mts'
import type { Task, Attempt } from './tasks.mts'

export interface Computer { id: string; name: string; version: number; defaultBrowserId?: string; defaultProfiles: Record<string, string> }
export interface Executor { id: string; computerId: string; browserId: string; browserName: string; profileId: string; profileName: string; installationId: string; extensionVersion: string; lastHeartbeat: string | null; revoked: boolean }
export interface Credential { id: string; hash: string; role: 'skill' | 'executor'; executorId?: string; name: string; revoked: boolean }
export interface Pairing { hash: string; expiresAt: string; computerId: string; browserId: string; browserName: string; profileId: string; profileName: string; used: boolean }
export interface Account { id: string; executorId: string; platform: string; platformAccountId: string; displayName: string; observedAt: string | null; bindingState: 'unobserved' | 'matched' | 'mismatch' | 'logged_out' }
export interface State { instanceId: string; computers: Computer[]; executors: Executor[]; keys: Credential[]; pairings: Pairing[]; accounts: Account[]; assets: Asset[]; tasks: Task[]; attempts: Attempt[] }
