import { defineContentScript } from 'wxt/utils/define-content-script'
import { browser } from 'wxt/browser'
import type { MessageRequest, MessageResponse } from '../src/types'
import { extractGeneral } from '../src/extractor/general'

export default defineContentScript({
  matches: ['<all_urls>'],
  excludeMatches: ['*://*.feishu.cn/*', '*://*.kdocs.cn/*'],
  runAt: 'document_idle',

  main() {
    browser.runtime.onMessage.addListener(
      (message: MessageRequest, _sender: unknown, sendResponse: (r: MessageResponse) => void) => {
        if (message.type === 'EXTRACT_DOC') {
          try {
            const doc = extractGeneral()
            const wordCount = (doc.markdown ?? '').trim().length
            if (wordCount < 30) {
              sendResponse({ ok: false, error: '未识别到正文内容' })
              return
            }
            sendResponse({ ok: true, data: doc })
          } catch (e) {
            sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
          }
          return true
        }
      }
    )
  },
})
