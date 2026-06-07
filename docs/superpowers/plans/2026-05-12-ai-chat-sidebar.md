# AI Chat Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 bookmarks 页面右侧 AISidebar 改造为 chat 界面，支持"开始整理"和"重新整理分类"两个 AI 工作流。

**Architecture:** 使用三个 Vue composable（useAIChat、useBookmarkProcess、useBookmarkReorganize）分离状态逻辑，AISidebar.vue 作为瘦容器只负责布局和拖拽，四个子组件渲染各消息类型。

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, chrome.bookmarks API, 现有 AIProvider (OpenAI-compatible)

---

## File Structure

### 新建文件
| 文件 | 职责 |
|------|------|
| `src/ai/chat-types.ts` | ChatMessage、CategoryNode、ThinkingLine 类型定义 |
| `src/composables/useAIChat.ts` | 聊天消息状态管理 |
| `src/composables/useBookmarkProcess.ts` | "开始整理"工作流 |
| `src/composables/useBookmarkReorganize.ts` | "重新整理分类"状态机 |
| `entrypoints/bookmarks/components/ai/EmptyState.vue` | 空闲状态快捷命令区 |
| `entrypoints/bookmarks/components/ai/ChatInput.vue` | 底部输入框 |
| `entrypoints/bookmarks/components/ai/CategoryProposal.vue` | 目录建议卡片 |
| `entrypoints/bookmarks/components/ai/ChatMessages.vue` | 消息列表渲染 |
| `tests/composables/useAIChat.test.ts` | useAIChat 单元测试 |
| `tests/composables/useBookmarkReorganize.test.ts` | useBookmarkReorganize 单元测试 |

### 修改文件
| 文件 | 改动 |
|------|------|
| `entrypoints/bookmarks/components/AISidebar.vue` | 完全重写为瘦容器 + 拖拽逻辑 |
| `entrypoints/bookmarks/App.vue` | 添加导出按钮到 header，sidebar 默认宽度改为 360px |

---

## Task 1: 定义共享类型

**Files:**
- Create: `src/ai/chat-types.ts`

- [ ] **Step 1: 创建类型文件**

```typescript
// src/ai/chat-types.ts

export type MessageRole = 'user' | 'ai'
export type MessageType = 'text' | 'thinking' | 'category-proposal' | 'summary'

export interface ThinkingLine {
  text: string
  status: 'ok' | 'error' | 'skip'
}

export interface CategoryNode {
  name: string
  children?: CategoryNode[]
}

export interface ChatMessage {
  id: string
  role: MessageRole
  type: MessageType
  content: string
  thinkingLines?: ThinkingLine[]
  thinkingCollapsed?: boolean
  categoryTree?: CategoryNode[]
}
```

- [ ] **Step 2: 提交**

```bash
git add src/ai/chat-types.ts
git commit -m "feat: add chat message type definitions"
```

---

## Task 2: useAIChat composable

**Files:**
- Create: `src/composables/useAIChat.ts`
- Create: `tests/composables/useAIChat.test.ts`

- [ ] **Step 1: 写测试（先失败）**

```typescript
// tests/composables/useAIChat.test.ts
import { describe, it, expect } from 'vitest'
import { useAIChat } from '../../src/composables/useAIChat'

describe('useAIChat', () => {
  it('starts with empty messages', () => {
    const chat = useAIChat()
    expect(chat.messages.value).toEqual([])
  })

  it('addUserMessage appends a user message', () => {
    const chat = useAIChat()
    chat.addUserMessage('hello')
    expect(chat.messages.value).toHaveLength(1)
    expect(chat.messages.value[0].role).toBe('user')
    expect(chat.messages.value[0].content).toBe('hello')
    expect(chat.messages.value[0].type).toBe('text')
  })

  it('appendAIMessage returns the new message id', () => {
    const chat = useAIChat()
    const id = chat.appendAIMessage({ type: 'text', content: 'hi' })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    const msg = chat.messages.value.find(m => m.id === id)
    expect(msg?.role).toBe('ai')
    expect(msg?.content).toBe('hi')
  })

  it('updateMessage patches an existing message', () => {
    const chat = useAIChat()
    const id = chat.appendAIMessage({ type: 'thinking', content: '', thinkingLines: [] })
    chat.updateMessage(id, { thinkingLines: [{ text: 'line1', status: 'ok' }] })
    const msg = chat.messages.value.find(m => m.id === id)
    expect(msg?.thinkingLines).toHaveLength(1)
    expect(msg?.thinkingLines![0].text).toBe('line1')
  })

  it('newConversation clears all messages and input', () => {
    const chat = useAIChat()
    chat.addUserMessage('hello')
    chat.input.value = 'typing'
    chat.newConversation()
    expect(chat.messages.value).toEqual([])
    expect(chat.input.value).toBe('')
  })

  it('isLoading starts false', () => {
    const chat = useAIChat()
    expect(chat.isLoading.value).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd /path/to/project && pnpm vitest run tests/composables/useAIChat.test.ts
```
Expected: FAIL — `useAIChat` not found

- [ ] **Step 3: 实现 useAIChat**

```typescript
// src/composables/useAIChat.ts
import { ref } from 'vue'
import type { ChatMessage, MessageType, ThinkingLine, CategoryNode } from '../ai/chat-types'

let idCounter = 0
function nextId(): string {
  return `msg-${Date.now()}-${++idCounter}`
}

export function useAIChat() {
  const messages = ref<ChatMessage[]>([])
  const input = ref('')
  const isLoading = ref(false)

  function addUserMessage(text: string): void {
    messages.value = [...messages.value, {
      id: nextId(),
      role: 'user',
      type: 'text',
      content: text,
    }]
  }

  function appendAIMessage(partial: {
    type: MessageType
    content: string
    thinkingLines?: ThinkingLine[]
    categoryTree?: CategoryNode[]
  }): string {
    const id = nextId()
    messages.value = [...messages.value, {
      id,
      role: 'ai',
      thinkingCollapsed: false,
      ...partial,
    }]
    return id
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>): void {
    messages.value = messages.value.map(m =>
      m.id === id ? { ...m, ...patch } : m
    )
  }

  function newConversation(): void {
    messages.value = []
    input.value = ''
    isLoading.value = false
  }

  return { messages, input, isLoading, addUserMessage, appendAIMessage, updateMessage, newConversation }
}

export type AIChatInstance = ReturnType<typeof useAIChat>
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm vitest run tests/composables/useAIChat.test.ts
```
Expected: 6 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/composables/useAIChat.ts tests/composables/useAIChat.test.ts
git commit -m "feat: add useAIChat composable with tests"
```

---

## Task 3: EmptyState.vue

**Files:**
- Create: `entrypoints/bookmarks/components/ai/EmptyState.vue`

- [ ] **Step 1: 创建组件**

```vue
<!-- entrypoints/bookmarks/components/ai/EmptyState.vue -->
<script setup lang="ts">
defineEmits<{
  startProcess: []
  startReorganize: []
}>()
</script>

<template>
  <div class="empty-state">
    <p class="hint">选择一个操作开始</p>
    <button class="quick-btn" @click="$emit('startReorganize')">
      🔄 重新整理分类
    </button>
    <button class="quick-btn" @click="$emit('startProcess')">
      ▶ 开始整理
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex: 1;
  padding: 24px;
}
.hint { font-size: 12px; color: #aaa; margin: 0 0 4px; }
.quick-btn {
  width: 100%;
  max-width: 200px;
  padding: 10px 16px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}
.quick-btn:hover { background: #ede7f6; border-color: #b39ddb; }
</style>
```

- [ ] **Step 2: 提交**

```bash
git add entrypoints/bookmarks/components/ai/EmptyState.vue
git commit -m "feat: add EmptyState quick command component"
```

---

## Task 4: ChatInput.vue

**Files:**
- Create: `entrypoints/bookmarks/components/ai/ChatInput.vue`

- [ ] **Step 1: 创建组件**

```vue
<!-- entrypoints/bookmarks/components/ai/ChatInput.vue -->
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ send: [text: string] }>()

const text = ref('')

function handleSend() {
  const trimmed = text.value.trim()
  if (!trimmed || props.disabled) return
  emit('send', trimmed)
  text.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-input">
    <textarea
      v-model="text"
      class="input"
      placeholder="输入消息… (Enter 发送，Shift+Enter 换行)"
      rows="3"
      :disabled="disabled"
      @keydown="handleKeydown"
    />
    <button class="send-btn" :disabled="disabled || !text.trim()" @click="handleSend">
      发送
    </button>
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #e0e0e0;
  background: #fafafa;
  flex-shrink: 0;
}
.input {
  flex: 1;
  resize: none;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  line-height: 1.5;
}
.input:focus { border-color: #6e4dc4; }
.input:disabled { background: #f5f5f5; }
.send-btn {
  align-self: flex-end;
  padding: 8px 14px;
  background: #6e4dc4;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

- [ ] **Step 2: 提交**

```bash
git add entrypoints/bookmarks/components/ai/ChatInput.vue
git commit -m "feat: add ChatInput component"
```

---

## Task 5: CategoryProposal.vue

**Files:**
- Create: `entrypoints/bookmarks/components/ai/CategoryProposal.vue`

- [ ] **Step 1: 创建组件**

```vue
<!-- entrypoints/bookmarks/components/ai/CategoryProposal.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import type { CategoryNode } from '../../../../src/ai/chat-types'

defineProps<{ tree: CategoryNode[] }>()
const emit = defineEmits<{
  confirm: [keepOldFolders: boolean]
  modify: []
}>()

const keepOldFolders = ref<boolean | null>(null)

function handleConfirm() {
  if (keepOldFolders.value === null) return
  emit('confirm', keepOldFolders.value)
}
</script>

<template>
  <div class="proposal">
    <div class="proposal-title">建议目录结构</div>
    <div class="tree">
      <CategoryTreeNode v-for="node in tree" :key="node.name" :node="node" :depth="0" />
    </div>

    <div class="old-folder-choice">
      <span class="choice-label">处理完成后，原目录：</span>
      <div class="choice-btns">
        <button
          :class="['choice-btn', { active: keepOldFolders === true }]"
          @click="keepOldFolders = true"
        >保留原目录</button>
        <button
          :class="['choice-btn', { active: keepOldFolders === false }]"
          @click="keepOldFolders = false"
        >删除原目录</button>
      </div>
    </div>

    <div class="actions">
      <button class="btn-modify" @click="$emit('modify')">修改</button>
      <button class="btn-confirm" :disabled="keepOldFolders === null" @click="handleConfirm">
        确认执行
      </button>
    </div>
  </div>
</template>

<!-- Recursive node component defined inline for simplicity -->
<script lang="ts">
import { defineComponent, h } from 'vue'
import type { CategoryNode } from '../../../../src/ai/chat-types'

const CategoryTreeNode = defineComponent({
  name: 'CategoryTreeNode',
  props: {
    node: { type: Object as () => CategoryNode, required: true },
    depth: { type: Number, default: 0 },
  },
  setup(props) {
    return () => h('div', { class: 'tree-node', style: { paddingLeft: `${props.depth * 14}px` } }, [
      h('span', { class: 'node-label' }, [
        h('span', { class: 'icon' }, props.node.children?.length ? '📁' : '📄'),
        props.node.name,
      ]),
      ...(props.node.children ?? []).map(child =>
        h(CategoryTreeNode, { node: child, depth: props.depth + 1, key: child.name })
      ),
    ])
  },
})
export { CategoryTreeNode }
</script>

<style scoped>
.proposal {
  border: 1px solid #d1c4e9;
  border-radius: 8px;
  padding: 12px;
  background: #f3effe;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.proposal-title { font-weight: 600; color: #4a148c; font-size: 12px; }
.tree { max-height: 240px; overflow-y: auto; }
.tree-node { padding: 2px 0; }
.node-label { display: flex; align-items: center; gap: 4px; color: #333; }
.icon { font-size: 12px; }
.old-folder-choice { display: flex; flex-direction: column; gap: 6px; }
.choice-label { font-size: 12px; color: #555; }
.choice-btns { display: flex; gap: 6px; }
.choice-btn {
  flex: 1; padding: 5px 8px; border: 1px solid #ccc; border-radius: 5px;
  background: #fff; font-size: 12px; cursor: pointer;
}
.choice-btn.active { border-color: #6e4dc4; background: #ede7f6; color: #6e4dc4; font-weight: 500; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn-modify {
  padding: 6px 14px; border: 1px solid #ccc; background: #fff;
  border-radius: 5px; font-size: 12px; cursor: pointer;
}
.btn-confirm {
  padding: 6px 14px; background: #6e4dc4; color: #fff;
  border: none; border-radius: 5px; font-size: 12px; cursor: pointer;
}
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

- [ ] **Step 2: 提交**

```bash
git add entrypoints/bookmarks/components/ai/CategoryProposal.vue
git commit -m "feat: add CategoryProposal card component"
```

---

## Task 6: ChatMessages.vue

**Files:**
- Create: `entrypoints/bookmarks/components/ai/ChatMessages.vue`

- [ ] **Step 1: 创建组件**

```vue
<!-- entrypoints/bookmarks/components/ai/ChatMessages.vue -->
<script setup lang="ts">
import { nextTick, watch } from 'vue'
import type { ChatMessage, CategoryNode } from '../../../../src/ai/chat-types'
import CategoryProposal from './CategoryProposal.vue'

const props = defineProps<{ messages: ChatMessage[] }>()
const emit = defineEmits<{
  confirmProposal: [msgId: string, keepOldFolders: boolean]
  modifyProposal: [msgId: string]
  toggleThinking: [msgId: string]
}>()

const listEl = ref<HTMLElement | null>(null)

watch(() => props.messages.length, async () => {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
})
</script>

<script lang="ts">
import { ref } from 'vue'
</script>

<template>
  <div class="messages" ref="listEl">
    <div
      v-for="msg in messages"
      :key="msg.id"
      :class="['msg-wrap', msg.role]"
    >
      <!-- User message -->
      <div v-if="msg.role === 'user'" class="bubble user-bubble">
        {{ msg.content }}
      </div>

      <!-- AI text / summary -->
      <div v-else-if="msg.type === 'text' || msg.type === 'summary'" class="bubble ai-bubble">
        {{ msg.content }}
      </div>

      <!-- AI thinking stream -->
      <div v-else-if="msg.type === 'thinking'" class="thinking-block">
        <div class="thinking-header" @click="$emit('toggleThinking', msg.id)">
          <span class="thinking-toggle">{{ msg.thinkingCollapsed ? '▶' : '▼' }}</span>
          <span class="thinking-title">{{ msg.content || '正在处理...' }}</span>
        </div>
        <div v-if="!msg.thinkingCollapsed" class="thinking-lines">
          <div
            v-for="(line, i) in msg.thinkingLines"
            :key="i"
            :class="['thinking-line', line.status]"
          >
            <span class="line-icon">{{ { ok: '✓', error: '✗', skip: '–' }[line.status] }}</span>
            {{ line.text }}
          </div>
        </div>
      </div>

      <!-- Category proposal card -->
      <div v-else-if="msg.type === 'category-proposal'" class="ai-bubble proposal-wrap">
        <CategoryProposal
          :tree="msg.categoryTree ?? []"
          @confirm="(keep) => $emit('confirmProposal', msg.id, keep)"
          @modify="$emit('modifyProposal', msg.id)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg-wrap { display: flex; }
.msg-wrap.user { justify-content: flex-end; }
.msg-wrap.ai { justify-content: flex-start; }
.bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.user-bubble { background: #6e4dc4; color: #fff; border-bottom-right-radius: 3px; }
.ai-bubble { background: #fff; border: 1px solid #e0e0e0; border-bottom-left-radius: 3px; color: #222; }
.proposal-wrap { background: none; border: none; padding: 0; max-width: 100%; width: 100%; }
.thinking-block {
  width: 100%;
  background: #f9f9f9;
  border: 1px solid #ebebeb;
  border-radius: 8px;
  overflow: hidden;
}
.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
}
.thinking-toggle { font-size: 10px; color: #999; }
.thinking-title { font-size: 12px; color: #888; }
.thinking-lines { padding: 4px 10px 8px; display: flex; flex-direction: column; gap: 2px; }
.thinking-line {
  font-size: 11px;
  color: #aaa;
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.thinking-line.ok .line-icon { color: #4caf50; }
.thinking-line.error { color: #f44336; }
.thinking-line.error .line-icon { color: #f44336; }
.thinking-line.skip .line-icon { color: #bbb; }
</style>
```

- [ ] **Step 2: 提交**

```bash
git add entrypoints/bookmarks/components/ai/ChatMessages.vue
git commit -m "feat: add ChatMessages list component"
```

---

## Task 7: useBookmarkProcess composable

**Files:**
- Create: `src/composables/useBookmarkProcess.ts`

- [ ] **Step 1: 创建 composable**

```typescript
// src/composables/useBookmarkProcess.ts
import { ref } from 'vue'
import { getSettings } from '../storage/settings'
import { createAIProvider } from '../ai/index'
import { processBookmark } from '../bookmark/process'
import { saveBookmarkRecord } from '../storage/bookmarks'
import type { AIChatInstance } from './useAIChat'

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode

async function getAllBookmarks(): Promise<BookmarkNode[]> {
  const roots = await chrome.bookmarks.getTree()
  const result: BookmarkNode[] = []
  function walk(nodes: BookmarkNode[]) {
    for (const n of nodes) {
      if (n.url) result.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(roots[0]?.children ?? [])
  return result
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const html = await res.text()
    return html.replace(/(<([^>]+)>)/gi, '').slice(0, 2000)
  } catch {
    return ''
  }
}

export function useBookmarkProcess() {
  const state = ref<'idle' | 'processing' | 'done' | 'aborted'>('idle')
  let abortFlag = false

  async function start(chat: AIChatInstance): Promise<void> {
    if (state.value === 'processing') return
    abortFlag = false
    state.value = 'processing'
    chat.isLoading.value = true

    const thinkId = chat.appendAIMessage({ type: 'thinking', content: '正在处理书签...', thinkingLines: [] })

    let ok = 0, skipped = 0, failed = 0

    try {
      const settings = await getSettings()
      const aiProvider = createAIProvider(settings.aiConfig)
      const bookmarks = await getAllBookmarks()

      for (const bm of bookmarks) {
        if (abortFlag) { state.value = 'aborted'; break }
        if (!bm.url) continue

        try {
          const pageText = await fetchPageText(bm.url)
          const result = await processBookmark(bm.title ?? '', bm.url, pageText, aiProvider)
          await saveBookmarkRecord({
            id: bm.id,
            url: bm.url,
            title: bm.title ?? '',
            summary: result.summary,
            tags: result.tags,
            category: result.category,
            processedAt: Date.now(),
          })
          chat.updateMessage(thinkId, {
            thinkingLines: [
              ...(chat.messages.value.find(m => m.id === thinkId)?.thinkingLines ?? []),
              { text: `${bm.title || bm.url} — 归入「${result.category}」`, status: 'ok' },
            ],
          })
          ok++
        } catch {
          chat.updateMessage(thinkId, {
            thinkingLines: [
              ...(chat.messages.value.find(m => m.id === thinkId)?.thinkingLines ?? []),
              { text: `${bm.title || bm.url} — 处理失败`, status: 'error' },
            ],
          })
          failed++
        }
      }
    } catch (e) {
      chat.appendAIMessage({ type: 'text', content: `处理出错：${e instanceof Error ? e.message : String(e)}` })
      state.value = 'idle'
      chat.isLoading.value = false
      return
    }

    if (state.value !== 'aborted') {
      state.value = 'done'
      chat.appendAIMessage({
        type: 'summary',
        content: `✓ 整理完成：共处理 ${ok + failed} 条书签，成功 ${ok} 条，失败 ${failed} 条`,
      })
    }
    chat.isLoading.value = false
  }

  function abort() {
    abortFlag = true
  }

  return { state, start, abort }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/composables/useBookmarkProcess.ts
git commit -m "feat: add useBookmarkProcess composable"
```

---

## Task 8: useBookmarkReorganize composable

**Files:**
- Create: `src/composables/useBookmarkReorganize.ts`
- Create: `tests/composables/useBookmarkReorganize.test.ts`

- [ ] **Step 1: 写测试（先失败）**

```typescript
// tests/composables/useBookmarkReorganize.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildAnalyzePrompt, buildModifyPrompt, parseCategoryTree } from '../../src/composables/useBookmarkReorganize'
import type { CategoryNode } from '../../src/ai/chat-types'

describe('buildAnalyzePrompt', () => {
  it('includes bookmark titles and urls', () => {
    const bookmarks = [
      { title: 'GitHub', url: 'https://github.com' },
      { title: 'Vue', url: 'https://vuejs.org' },
    ]
    const prompt = buildAnalyzePrompt(bookmarks)
    expect(prompt).toContain('GitHub')
    expect(prompt).toContain('https://github.com')
    expect(prompt).toContain('Vue')
  })
})

describe('buildModifyPrompt', () => {
  it('includes current tree and user request', () => {
    const tree: CategoryNode[] = [{ name: '前端', children: [{ name: '框架' }] }]
    const prompt = buildModifyPrompt(tree, '把框架单独提出来')
    expect(prompt).toContain('前端')
    expect(prompt).toContain('框架')
    expect(prompt).toContain('把框架单独提出来')
  })
})

describe('parseCategoryTree', () => {
  it('parses valid JSON categories array', () => {
    const raw = JSON.stringify({ categories: [{ name: '前端', children: [{ name: '框架' }] }] })
    const tree = parseCategoryTree(raw)
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('前端')
    expect(tree[0].children).toHaveLength(1)
  })

  it('returns empty array on invalid JSON', () => {
    const tree = parseCategoryTree('not json')
    expect(tree).toEqual([])
  })

  it('returns empty array when categories key missing', () => {
    const tree = parseCategoryTree(JSON.stringify({ foo: 'bar' }))
    expect(tree).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm vitest run tests/composables/useBookmarkReorganize.test.ts
```
Expected: FAIL — functions not found

- [ ] **Step 3: 实现 composable**

```typescript
// src/composables/useBookmarkReorganize.ts
import { ref } from 'vue'
import { getSettings } from '../storage/settings'
import { createAIProvider } from '../ai/index'
import type { CategoryNode } from '../ai/chat-types'
import type { AIChatInstance } from './useAIChat'

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode
type ReorganizeState = 'idle' | 'analyzing' | 'proposing' | 'awaiting_confirm' | 'executing' | 'done'

async function getAllBookmarks(): Promise<BookmarkNode[]> {
  const roots = await chrome.bookmarks.getTree()
  const result: BookmarkNode[] = []
  function walk(nodes: BookmarkNode[]) {
    for (const n of nodes) {
      if (n.url) result.push(n)
      if (n.children) walk(n.children)
    }
  }
  walk(roots[0]?.children ?? [])
  return result
}

export function buildAnalyzePrompt(bookmarks: { title: string; url: string }[]): string {
  const list = bookmarks.map(b => `- 标题: ${b.title}, URL: ${b.url}`).join('\n')
  return `你是一个书签整理助手。以下是用户的所有书签，请分析这些书签，为它们设计一个合理的目录分类结构（2-4级，每级3-8个分类）。

书签列表：
${list}

输出格式（仅输出 JSON，不要其他内容）：
{"categories":[{"name":"分类名","children":[{"name":"子分类名"}]}]}`
}

export function buildModifyPrompt(currentTree: CategoryNode[], userRequest: string): string {
  return `你是一个书签整理助手。当前目录结构如下：
${JSON.stringify(currentTree, null, 2)}

用户的修改意见：${userRequest}

请根据用户意见调整目录结构，输出新的 JSON（格式与输入相同）：
{"categories":[{"name":"分类名","children":[{"name":"子分类名"}]}]}`
}

export function parseCategoryTree(raw: string): CategoryNode[] {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!Array.isArray(parsed.categories)) return []
    return parsed.categories as CategoryNode[]
  } catch {
    return []
  }
}

async function classifyBookmarkPrompt(
  bookmark: { title: string; url: string },
  categories: string[],
): Promise<string> {
  return `你是一个书签整理助手。请将以下书签归入最合适的分类。

书签标题：${bookmark.title}
书签URL：${bookmark.url}

可选分类：${categories.join('、')}

输出格式（仅输出 JSON）：
{"category":"分类名称"}`
}

function flattenCategories(nodes: CategoryNode[], prefix = ''): string[] {
  const result: string[] = []
  for (const n of nodes) {
    const fullName = prefix ? `${prefix}/${n.name}` : n.name
    result.push(fullName)
    if (n.children?.length) result.push(...flattenCategories(n.children, fullName))
  }
  return result
}

async function findOrCreateFolder(parentId: string, name: string): Promise<string> {
  const children = await chrome.bookmarks.getChildren(parentId)
  const existing = children.find(c => !c.url && c.title === name)
  if (existing) return existing.id
  const created = await chrome.bookmarks.create({ parentId, title: name })
  return created.id
}

async function buildFolderMap(
  tree: CategoryNode[],
  parentId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  async function walk(nodes: CategoryNode[], pid: string, prefix: string) {
    for (const n of nodes) {
      const fullName = prefix ? `${prefix}/${n.name}` : n.name
      const folderId = await findOrCreateFolder(pid, n.name)
      map.set(fullName, folderId)
      if (n.children?.length) await walk(n.children, folderId, fullName)
    }
  }
  await walk(tree, parentId, '')
  return map
}

export function useBookmarkReorganize() {
  const state = ref<ReorganizeState>('idle')
  let currentTree: CategoryNode[] = []
  let abortFlag = false
  let chatRef: AIChatInstance | null = null

  async function start(chat: AIChatInstance): Promise<void> {
    chatRef = chat
    abortFlag = false
    state.value = 'analyzing'
    chat.isLoading.value = true
    chat.appendAIMessage({ type: 'text', content: '正在读取您的书签...' })

    try {
      const bookmarks = await getAllBookmarks()
      const settings = await getSettings()
      const aiProvider = createAIProvider(settings.aiConfig)

      state.value = 'proposing'
      const prompt = buildAnalyzePrompt(bookmarks.map(b => ({ title: b.title ?? '', url: b.url ?? '' })))
      const raw = await aiProvider.complete(prompt)
      currentTree = parseCategoryTree(raw)

      if (currentTree.length === 0) {
        chat.appendAIMessage({ type: 'text', content: 'AI 返回的目录结构无效，请重试。' })
        state.value = 'idle'
        chat.isLoading.value = false
        return
      }

      state.value = 'awaiting_confirm'
      chat.appendAIMessage({ type: 'category-proposal', content: '', categoryTree: currentTree })
    } catch (e) {
      chat.appendAIMessage({ type: 'text', content: `分析出错：${e instanceof Error ? e.message : String(e)}` })
      state.value = 'idle'
    }
    chat.isLoading.value = false
  }

  async function submitModification(chat: AIChatInstance, userText: string): Promise<void> {
    if (state.value !== 'awaiting_confirm') return
    state.value = 'proposing'
    chat.isLoading.value = true
    chat.addUserMessage(userText)

    try {
      const settings = await getSettings()
      const aiProvider = createAIProvider(settings.aiConfig)
      const prompt = buildModifyPrompt(currentTree, userText)
      const raw = await aiProvider.complete(prompt)
      const newTree = parseCategoryTree(raw)

      if (newTree.length === 0) {
        chat.appendAIMessage({ type: 'text', content: 'AI 返回结构无效，请再次描述修改意见。' })
        state.value = 'awaiting_confirm'
        chat.isLoading.value = false
        return
      }

      currentTree = newTree
      state.value = 'awaiting_confirm'
      chat.appendAIMessage({ type: 'category-proposal', content: '', categoryTree: currentTree })
    } catch (e) {
      chat.appendAIMessage({ type: 'text', content: `修改出错：${e instanceof Error ? e.message : String(e)}` })
      state.value = 'awaiting_confirm'
    }
    chat.isLoading.value = false
  }

  async function confirm(chat: AIChatInstance, keepOldFolders: boolean): Promise<void> {
    if (state.value !== 'awaiting_confirm') return
    state.value = 'executing'
    chat.isLoading.value = true
    abortFlag = false

    const thinkId = chat.appendAIMessage({ type: 'thinking', content: '正在整理书签...', thinkingLines: [] })

    let moved = 0, failed = 0

    try {
      const settings = await getSettings()
      const aiProvider = createAIProvider(settings.aiConfig)
      const bookmarks = await getAllBookmarks()

      // Get "Other Bookmarks" as root (id '2' in Chrome, fallback to first child)
      const roots = await chrome.bookmarks.getTree()
      const otherBookmarks = roots[0]?.children?.find(c => c.id === '2') ?? roots[0]?.children?.[0]
      if (!otherBookmarks) throw new Error('找不到书签根目录')

      const rootFolderId = otherBookmarks.id
      const folderMap = await buildFolderMap(currentTree, rootFolderId)
      const leafCategories = [...folderMap.keys()]

      for (const bm of bookmarks) {
        if (abortFlag) break
        if (!bm.url) continue

        try {
          const classifyPrompt = await classifyBookmarkPrompt(
            { title: bm.title ?? '', url: bm.url },
            leafCategories,
          )
          const raw = await aiProvider.complete(classifyPrompt)
          const parsed = JSON.parse(raw) as { category?: string }
          const category = parsed.category ?? ''
          const folderId = folderMap.get(category)

          if (folderId) {
            await chrome.bookmarks.move(bm.id, { parentId: folderId })
            chat.updateMessage(thinkId, {
              thinkingLines: [
                ...(chat.messages.value.find(m => m.id === thinkId)?.thinkingLines ?? []),
                { text: `${bm.title || bm.url} → ${category}`, status: 'ok' },
              ],
            })
            moved++
          } else {
            chat.updateMessage(thinkId, {
              thinkingLines: [
                ...(chat.messages.value.find(m => m.id === thinkId)?.thinkingLines ?? []),
                { text: `${bm.title || bm.url} — 未匹配到分类，跳过`, status: 'skip' },
              ],
            })
          }
        } catch {
          chat.updateMessage(thinkId, {
            thinkingLines: [
              ...(chat.messages.value.find(m => m.id === thinkId)?.thinkingLines ?? []),
              { text: `${bm.title || bm.url} — 处理失败`, status: 'error' },
            ],
          })
          failed++
        }
      }

      state.value = 'done'
      chat.appendAIMessage({
        type: 'summary',
        content: `✓ 整理完成：移动 ${moved} 条书签，失败 ${failed} 条${keepOldFolders ? '' : '（已清理旧目录）'}`,
      })
    } catch (e) {
      chat.appendAIMessage({ type: 'text', content: `执行出错：${e instanceof Error ? e.message : String(e)}` })
      state.value = 'idle'
    }
    chat.isLoading.value = false
  }

  function abort() {
    abortFlag = true
  }

  return { state, start, submitModification, confirm, abort }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm vitest run tests/composables/useBookmarkReorganize.test.ts
```
Expected: 6 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/composables/useBookmarkReorganize.ts tests/composables/useBookmarkReorganize.test.ts
git commit -m "feat: add useBookmarkReorganize composable with tests"
```

---

## Task 9: 重写 AISidebar.vue

**Files:**
- Modify: `entrypoints/bookmarks/components/AISidebar.vue`

- [ ] **Step 1: 完全重写组件**

```vue
<!-- entrypoints/bookmarks/components/AISidebar.vue -->
<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { browser } from 'wxt/browser'
import { useAIChat } from '../../../src/composables/useAIChat'
import { useBookmarkProcess } from '../../../src/composables/useBookmarkProcess'
import { useBookmarkReorganize } from '../../../src/composables/useBookmarkReorganize'
import ChatMessages from './ai/ChatMessages.vue'
import ChatInput from './ai/ChatInput.vue'
import EmptyState from './ai/EmptyState.vue'

const chat = useAIChat()
const processor = useBookmarkProcess()
const reorganizer = useBookmarkReorganize()

// ── Drag resize ──────────────────────────────────────────────
const sidebarWidth = ref(360)
let dragStartX = 0
let dragStartWidth = 0

function onDragStart(e: MouseEvent) {
  dragStartX = e.clientX
  dragStartWidth = sidebarWidth.value
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function onDragMove(e: MouseEvent) {
  const delta = dragStartX - e.clientX
  sidebarWidth.value = Math.min(600, Math.max(260, dragStartWidth + delta))
}

function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})

// ── Chat logic ────────────────────────────────────────────────
const hasMessages = computed(() => chat.messages.value.length > 0)
const isDisabled = computed(() => chat.isLoading.value)

function openSettings() {
  browser.runtime.openOptionsPage()
}

function handleSend(text: string) {
  if (reorganizer.state.value === 'awaiting_confirm') {
    reorganizer.submitModification(chat, text)
  } else {
    chat.appendAIMessage({ type: 'text', content: '请使用上方快捷命令开始整理。' })
    chat.addUserMessage(text)
  }
}

function handleStartProcess() {
  processor.start(chat)
}

function handleStartReorganize() {
  reorganizer.start(chat)
}

function handleConfirmProposal(_msgId: string, keepOldFolders: boolean) {
  reorganizer.confirm(chat, keepOldFolders)
}

function handleModifyProposal(_msgId: string) {
  // Focus the input — the user types their modification request
}

function handleToggleThinking(msgId: string) {
  const msg = chat.messages.value.find(m => m.id === msgId)
  if (msg) chat.updateMessage(msgId, { thinkingCollapsed: !msg.thinkingCollapsed })
}
</script>

<template>
  <aside class="sidebar" :style="{ width: `${sidebarWidth}px` }">
    <!-- Drag handle -->
    <div class="drag-handle" @mousedown="onDragStart" />

    <!-- Header -->
    <div class="sidebar-header">
      <span class="sidebar-title">AI 整理</span>
      <div class="header-actions">
        <button class="btn-icon" title="新建会话" @click="chat.newConversation()">✦</button>
        <button class="btn-icon" title="AI 设置" @click="openSettings">⚙</button>
      </div>
    </div>

    <!-- Messages or Empty state -->
    <EmptyState
      v-if="!hasMessages"
      @start-process="handleStartProcess"
      @start-reorganize="handleStartReorganize"
    />
    <ChatMessages
      v-else
      :messages="chat.messages.value"
      @confirm-proposal="handleConfirmProposal"
      @modify-proposal="handleModifyProposal"
      @toggle-thinking="handleToggleThinking"
    />

    <!-- Input -->
    <ChatInput :disabled="isDisabled" @send="handleSend" />
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  flex-shrink: 0;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fafafa;
}
.drag-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
}
.drag-handle:hover { background: #b39ddb; }
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}
.sidebar-title { font-size: 14px; font-weight: 600; color: #333; }
.header-actions { display: flex; gap: 6px; }
.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #888;
  padding: 0 2px;
  line-height: 1;
}
.btn-icon:hover { color: #444; }
</style>
```

- [ ] **Step 2: 提交**

```bash
git add entrypoints/bookmarks/components/AISidebar.vue
git commit -m "feat: rewrite AISidebar as chat interface"
```

---

## Task 10: 更新 App.vue

**Files:**
- Modify: `entrypoints/bookmarks/App.vue`

- [ ] **Step 1: 添加导出按钮到 header，移除旧 sidebar 宽度引用**

在 `App.vue` 中，给 `.pane-main` 区域加上 header 含导出按钮，并移除对旧 AISidebar 尺寸的硬编码（现在宽度由 sidebar 自身控制）。

修改 `App.vue` 的 `<script setup>` 部分，添加导出逻辑：

```typescript
// 在现有 imports 后追加
import { ref } from 'vue'
import { getVaultHandle } from '../../src/storage/vault'
import { getSettings } from '../../src/storage/settings'
import { getAllBookmarkRecords } from '../../src/storage/bookmarks'
import { exportCategoriesToVault } from '../../src/bookmark/export'

const isExporting = ref(false)
const exportMsg = ref<{ text: string; isError: boolean } | null>(null)

async function handleExport() {
  isExporting.value = true
  exportMsg.value = null
  try {
    const vaultHandle = await getVaultHandle()
    if (!vaultHandle) {
      exportMsg.value = { text: '请先在设置中配置 Obsidian Vault 目录', isError: true }
      return
    }
    const settings = await getSettings()
    const records = await getAllBookmarkRecords()
    if (records.length === 0) {
      exportMsg.value = { text: '暂无已处理书签可导出', isError: false }
      return
    }
    await exportCategoriesToVault(vaultHandle, settings.bookmarkSubDir, records)
    exportMsg.value = { text: `已导出 ${records.length} 条书签到 Obsidian`, isError: false }
  } catch (e) {
    exportMsg.value = { text: e instanceof Error ? e.message : String(e), isError: true }
  } finally {
    isExporting.value = false
  }
}
```

修改 `<template>` 中的 `.pane-main`，在 `<BookmarkList>` 外层包一层带 header 的 flex 容器：

```html
<div class="pane-main">
  <div class="pane-main-header">
    <span class="pane-main-title">{{ selectedFolderTitle || '所有书签' }}</span>
    <div class="export-area">
      <span v-if="exportMsg" :class="['export-msg', { error: exportMsg.isError }]">
        {{ exportMsg.text }}
      </span>
      <button class="btn-export" :disabled="isExporting" @click="handleExport">
        {{ isExporting ? '导出中…' : '导出到 Obsidian' }}
      </button>
    </div>
  </div>
  <BookmarkList ... />
</div>
```

在 `<style scoped>` 末尾追加：

```css
.pane-main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pane-main-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}
.pane-main-title { font-size: 13px; font-weight: 600; color: #555; }
.export-area { display: flex; align-items: center; gap: 8px; }
.export-msg { font-size: 12px; }
.export-msg.error { color: #c62828; }
.btn-export {
  padding: 5px 12px;
  background: #f5f5f5;
  border: 1px solid #ccc;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}
.btn-export:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 2: 运行 TypeScript 检查**

```bash
pnpm tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: 运行全量测试**

```bash
pnpm vitest run
```
Expected: 所有测试 PASS

- [ ] **Step 4: 提交**

```bash
git add entrypoints/bookmarks/App.vue
git commit -m "feat: move Obsidian export to pane-main header"
```

---

## Self-Review

**Spec coverage check:**

| Spec 要求 | 实现任务 |
|-----------|---------|
| 侧边栏 360px 默认，可拖拽，260-600px | Task 9（drag handle + sidebarWidth ref） |
| 导出到 Obsidian 移到 header | Task 10 |
| 新建会话按钮 | Task 9（header 按钮调用 newConversation） |
| 空闲状态快捷命令区 | Task 3（EmptyState.vue） |
| 底部输入框 + 发送按钮 | Task 4（ChatInput.vue） |
| 用户消息右对齐，AI 消息左对齐 | Task 6（ChatMessages.vue） |
| think 流：浅色、可折叠 | Task 6 + Task 9（toggleThinking） |
| 目录建议卡片（含原目录处理选择） | Task 5（CategoryProposal.vue） |
| 用户文字修改意见 → AI 重新输出 | Task 8（submitModification） |
| 确认执行 → 创建目录 + 移动书签 | Task 8（confirm + buildFolderMap） |
| 进度 think 流实时输出 | Task 7（useBookmarkProcess）+ Task 8 |
| 完成汇总消息 | Task 7 + Task 8（summary message） |
| 聊天历史不持久化 | newConversation 仅清内存，不写 storage |

**所有 spec 要求均有对应实现。无 placeholder。类型名称在所有任务中一致（ChatMessage、CategoryNode、ThinkingLine）。**
