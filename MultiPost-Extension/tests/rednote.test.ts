import { webcrypto } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { DynamicRednote } from '../src/sync/dynamic/rednote'

it('refuses uncontrolled auto-publication before touching any page or network', async () => {
  const query = vi.spyOn(document, 'querySelector'); const fetcher = vi.spyOn(globalThis, 'fetch')
  try {
    await expect(DynamicRednote({ platforms: [], isAutoPublish: true, data: { title: '测试', content: '正文', images: [], videos: [] } })).rejects.toThrow('SUBMIT_INTENT_REQUIRED')
    expect(query).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
  } finally { query.mockRestore(); fetcher.mockRestore() }
})
it('rejects missing images and unsupported fields instead of dropping content', async () => {
  const base = { platforms: [], isAutoPublish: false, data: { title: '测试', content: '完整正文', images: [], videos: [] } }
  await expect(DynamicRednote(base)).rejects.toThrow('MISSING_REQUIRED_FIELD')
  await expect(DynamicRednote({ ...base, data: { ...base.data, images: [{ name: 'test.png', url: 'blob:local' }], tags: ['话题'] } })).rejects.toThrow('UNSUPPORTED_FIELD')
})

it('refuses expired or invalid preparation before changing the editor', async () => {
  const { prepareRednoteEditor } = await import('../src/sync/dynamic/rednote-prepare')
  const input = { runId: 'test', deadline: Date.now() - 1, title: '原题', content: '原文', tags: ['人工智能'], images: [{ name: '1.png', url: 'data:image/png;base64,AAAA', size: 3 }] }
  document.body.innerHTML = '<input type="text" value="现有内容"><button>发布</button>'
  const click = vi.fn(); document.querySelector('button')!.addEventListener('click', click)
  expect(await prepareRednoteEditor(input)).toMatchObject({ ok: false, code: 'PREPARATION_EXPIRED' })
  expect(document.querySelector('input')!.value).toBe('现有内容')
  expect(click).not.toHaveBeenCalled()
})

it('protects an existing note from being overwritten by a preparation task', async () => {
  const { prepareRednoteEditor } = await import('../src/sync/dynamic/rednote-prepare')
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<input placeholder="填写标题会有更多赞哦" value="我的草稿"><div class="tiptap ProseMirror" contenteditable="true">我的正文</div>'
  try {
    expect(await prepareRednoteEditor({ runId: 'new', deadline: Date.now() + 1000, title: '新标题', content: '新正文', tags: [], images: [{ name: '1.png', url: 'data:image/png;base64,AAAA', size: 3 }] })).toMatchObject({ ok: false, code: 'EDITOR_NOT_EMPTY' })
    expect(document.querySelector('input')!.value).toBe('我的草稿')
  } finally { vi.unstubAllGlobals() }
})

it.each(['video-cover-expired', 'video-cover-expired-wrong', 'video-source-changed', 'video-fetch-secret', 'video-fetch-error', 'video-multi-blob', 'video-multi-blob-wrong', 'video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-cover-resume', 'video-topics', 'video-single-cover', 'video-partial-topic', 'video-text', 'video-reloaded', 'video-continue', 'video-covers', 'video', 'ready', 'delayed-upload-entry', 'reordered', 'duplicate-collection', 'original-agreement', 'accepted-agreement', 'span-agreement', 'changed-agreement', 'reencoded'])('verifies content and explicit settings without publishing (%s)', async (caseName) => {
  const expiredCover = caseName.startsWith('video-cover-expired');
  const scenario = expiredCover ? 'video-cover-crop' : caseName;
  const reordered = scenario === 'reordered'
  const { prepareRednoteEditor } = await import('../src/sync/dynamic/rednote-prepare')
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<input type="file" multiple><input placeholder="填写标题会有更多赞哦"><div class="tiptap ProseMirror" contenteditable="true"></div><div class="format-img"></div><div class="scroll-container"><div class="title"></div><div class="info"></div></div><div id="creator-editor-topic-container"></div><div class="collection-plugin-choose"><span class="collection-name"></span></div><div class="collection-plugin-popover-content"><div class="item"><div class="item-label">AI落地实战</div></div><div class="item"><div class="item-label">AI落地</div></div></div><div class="custom-switch-card"><span class="has-tips">原创声明</span><div class="d-switch"><input type="checkbox"></div></div><button>发布</button>'
  if (scenario === 'ready') document.querySelector('.collection-plugin-choose')!.className = 'collection-plugin-button'
  if (scenario === 'duplicate-collection') document.querySelector('.collection-plugin-popover-content')!.insertAdjacentHTML('beforeend', '<div class="item"><div class="item-label">AI落地</div></div>')
  document.querySelectorAll('.collection-plugin-popover-content .item').forEach(item => item.addEventListener('click', () => { if (scenario.startsWith('video')) document.querySelector('.user-desc-wrapper2')?.setAttribute('class', 'user-desc-wrapper'); if (scenario === 'video-source-changed') Object.defineProperty(document.querySelector('video.exact-video'), 'currentSrc', { value: 'blob:https://creator.xiaohongshu.com/replaced' }); document.querySelector('.collection-name')!.textContent = item.textContent; document.querySelector('.collection-name')!.parentElement!.className = 'collection-plugin-choose' }))
  document.querySelector('.d-switch')!.addEventListener('click', () => { document.querySelector<HTMLInputElement>('.d-switch input')!.checked = true; if (['original-agreement', 'accepted-agreement', 'span-agreement', 'changed-agreement'].includes(scenario)) document.body.insertAdjacentHTML('beforeend', '<div class="d-modal"><div class="originalContainer"><a href="https://fe.xiaohongshu.com/ditto/vincent/45ba4b7117054e64b0e730b81e1a4864">《原创声明须知》</a><label class="d-checkbox"><input type="checkbox"></label><button>声明原创</button></div></div>') })
  document.querySelector('.d-switch')!.addEventListener('click', () => {
    if (['span-agreement', 'changed-agreement'].includes(scenario)) document.querySelector('.originalContainer a')!.outerHTML = '<span class="custom-link alink">《原创声明须知》</span>';
    if (['span-agreement', 'changed-agreement'].includes(scenario)) document.querySelector('.originalContainer .d-checkbox')!.insertAdjacentHTML('beforeend', scenario === 'span-agreement' ? '<span>我已阅读并同意 《原创声明须知》 ，如滥用声明，平台将驳回并予以相关处置</span>' : '<span>不同的协议内容</span>');
  })
  document.body.addEventListener('click', event => { if (['accepted-agreement', 'span-agreement'].includes(scenario) && (event.target as HTMLElement).textContent === '声明原创' && document.querySelector<HTMLInputElement>('.originalContainer input')?.checked) document.querySelector('.d-modal')?.remove() }, { signal: AbortSignal.timeout(3000) })
  const click = vi.fn(); document.querySelector('button')!.addEventListener('click', click)
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('fetch', async (url: string) => new Response(Uint8Array.from((url.endsWith('one') !== reordered) ? (scenario === 'reencoded' ? [4, 4, 4] : [0, 0, 0]) : [1, 2, 3])))
  vi.stubGlobal('createImageBitmap', async () => ({ width: 100, height: 100, close() {} }))
  let pixelRead = 0
  vi.stubGlobal('OffscreenCanvas', class { getContext() { return { drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(scenario === 'reencoded' ? [1, 2, 3, 255] : [++pixelRead, 2, 3, 255]) } } } } })
  if (scenario === 'video-multi-blob') vi.stubGlobal('fetch', async (url: string) => { if (url !== 'blob:https://creator.xiaohongshu.com/one') throw new TypeError('player-preview-not-file'); return new Response(new Uint8Array(3)); });
  if (scenario.startsWith('video-fetch-')) vi.stubGlobal('fetch', async () => { throw new TypeError(scenario === 'video-fetch-secret' ? 'PRIVATE_TOKEN' : 'private-url-token-must-not-leak'); });
  const files: File[] = []
  vi.stubGlobal('DataTransfer', class { items = { add: (f: File) => files.push(f) }; get files() { return files } })
  const upload = document.querySelector<HTMLInputElement>('input[type="file"]')!
  const videoDeadline = Date.now() + 2000
  const coverUploads: string[] = []
  if (['video-preview-resume', 'video-preview-changed', 'video-single-cover', 'video-cover-resume', 'video-cover-crop'].includes(scenario)) {
    const box = document.createElement('section'); box.innerHTML = '<input type="file" aria-label="上传封面图片" accept="image/png, image/jpeg, image/*"><div class="hide-view-for-exact"><canvas width="100" height="100"></canvas></div><button>完成</button>';
    document.body.insertAdjacentHTML('beforeend', '<div class="cover cover--row"><div class="default row" style="background-image: url(old)"></div></div>');
    const input = box.querySelector('input')!; Object.defineProperty(input, 'files', { value: [], writable: true });
    let uploaded = false; input.addEventListener('change', () => { const button = document.createElement('button'); button.className = 'uploaded-thumbnail'; button.innerHTML = '<img alt="已上传封面" src="blob:https://creator.xiaohongshu.com/one"><div class="uploaded-thumbnail-inactive-mask"></div>'; for (const [key, value] of Object.entries({ complete: true, naturalWidth: 100, naturalHeight: 100 })) Object.defineProperty(button.querySelector('img'), key, { value }); button.addEventListener('click', () => { uploaded = true; button.querySelector('.uploaded-thumbnail-inactive-mask')?.remove() }); box.append(button); input.remove() });
    Object.defineProperty(box.querySelector('canvas'), 'getContext', { value: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(uploaded ? [1, 2, 3, 255] : [0, 0, 0, 255]) }) }) });
    box.querySelector('button')!.getBoundingClientRect = () => ({ width: 90 } as DOMRect);
    box.querySelector('button')!.addEventListener('click', () => { document.querySelector<HTMLElement>('.cover > .default')!.style.backgroundImage = 'url(new)'; box.remove() });
    document.body.append(box);
  }
  if (scenario === 'video-covers') {
    for (const [kind, label] of [['horizontal', '横版封面'], ['vertical', '竖版封面']]) {
      const region = document.createElement('section'); region.innerHTML = `<span>${label}</span><input type="file" accept="image/png"><img>`;
      region.querySelector('span')!.getBoundingClientRect = () => ({ width: 90 } as DOMRect);
      const input = region.querySelector('input')!; Object.defineProperty(input, 'files', { value: [], writable: true });
      input.addEventListener('change', () => { coverUploads.push(kind); const img = region.querySelector('img')!; img.src = 'blob:https://creator.xiaohongshu.com/' + kind + '-one'; Object.defineProperty(img, 'complete', { value: true }); Object.defineProperty(img, 'naturalWidth', { value: 100 }); });
      document.body.append(region);
    }
  }
  if (scenario.startsWith('video')) {
    upload.removeAttribute('multiple'); upload.className = 'upload-input'; upload.accept = '.mp4';
    vi.stubGlobal('haiqiaiMedia', { id: 'fill', deadline: videoDeadline, size: 3, sha256: '709e80c88487a2411e1ee4dfb9f22a861492d20c4765150c0c794abd70f8147c', file: new File([new Uint8Array(3)], 'v.mp4', { type: 'video/mp4' }) });
  }
  Object.defineProperty(upload, 'files', { writable: true, value: [] })
  upload.addEventListener('change', () => {
    if (scenario.startsWith('video')) {
      const video = document.createElement('video'); video.src = 'blob:https://creator.xiaohongshu.com/' + (scenario === 'video-multi-blob-wrong' ? 'two' : 'one');
      for (const [name, value] of Object.entries({ currentSrc: video.src, duration: 12, readyState: 2, videoWidth: 1920 })) Object.defineProperty(video, name, { value, configurable: true });
      video.className = 'exact-video video'; const sourceBox = document.createElement('div'); sourceBox.className = 'hide-view-for-exact'; sourceBox.append(video); document.body.append(sourceBox);
      for (let i = 0; i < 3; i++) { const preview = document.createElement('video'); for (const [key, value] of Object.entries({ currentSrc: scenario.startsWith('video-multi-blob') ? 'blob:https://creator.xiaohongshu.com/' + i + (scenario === 'video-multi-blob-wrong' && i === 2 ? '-two' : '-one') : video.src, duration: 12, readyState: 2, videoWidth: 1920 })) Object.defineProperty(preview, key, { value }); document.body.append(preview); }
      return;
    }
    document.querySelector('.format-img')!.innerHTML = '<img class="preview" src="blob:https://creator.xiaohongshu.com/one"><img class="preview" src="blob:https://creator.xiaohongshu.com/two">'
    document.querySelector('.scroll-container')!.insertAdjacentHTML('beforeend', '<img id="creator-preview-image-0" src="blob:https://creator.xiaohongshu.com/one"><img id="creator-preview-image-1" src="blob:https://creator.xiaohongshu.com/two">')
    document.querySelectorAll('img').forEach(img => { Object.defineProperty(img, 'complete', { value: true }); Object.defineProperty(img, 'naturalWidth', { value: 100 }) })
  })
  let entryTimer: ReturnType<typeof setTimeout> | undefined
  if (scenario === 'delayed-upload-entry') {
    upload.remove()
    entryTimer = setTimeout(() => {
      const entry = document.createElement('div'); entry.className = 'creator-tab'; entry.textContent = '上传图文'
      entry.getBoundingClientRect = () => ({ x: 10, width: 96 } as DOMRect)
      entry.addEventListener('click', () => document.body.append(upload))
      document.body.append(entry)
    }, 100)
  }
  const title = document.querySelector<HTMLInputElement>('input[placeholder]')!
  if (scenario.startsWith('video')) document.querySelector('.scroll-container')!.outerHTML = '<div class="publish-page-preview"><div class="user-desc-wrapper2"><span></span></div></div>'
  title.addEventListener('input', () => { if (!scenario.startsWith('video')) document.querySelector('.scroll-container .title')!.textContent = title.value })
  const editor = document.querySelector<HTMLElement>('.tiptap')!
  Object.defineProperty(editor, 'innerText', { get: () => Array.from(editor.childNodes).map(n => n.nodeName === 'P' ? n.textContent + '\n' : n.textContent).join('').replace(/\n$/, '') })
  const preview = () => { if (scenario.startsWith('video')) document.querySelector('.user-desc-wrapper2 span, .user-desc-wrapper span')!.textContent = title.value + ' ' + editor.textContent + ' '; else document.querySelector('.scroll-container .info')!.innerHTML = editor.innerHTML }
  const command = vi.fn((_cmd: string, _ui: boolean, value: string) => {
    if (value.includes('\n')) { for (const line of value.split('\n')) { const p = document.createElement('p'); p.textContent = line; editor.append(p) } } else editor.append(document.createTextNode(value)); preview()
    if (value.includes('#')) {
      const tag = value.slice(value.indexOf('#') + 1)
      document.querySelector('#creator-editor-topic-container')!.innerHTML = `<div class="item"><span class="name">#${tag}推荐</span></div><div class="item"><span class="name">#${tag}</span></div>`
      document.querySelectorAll('#creator-editor-topic-container .item').forEach(item => item.addEventListener('click', () => {
        const name = item.textContent!.slice(1)
        editor.lastChild!.remove(); const a = document.createElement('a'); a.className = 'tiptap-topic'; a.dataset.topic = JSON.stringify({ id: 'native-id', name }); a.textContent = `#${name}[话题]#`; editor.append(a, document.createTextNode('\u00a0')); preview()
        document.querySelector('#creator-editor-topic-container')!.innerHTML = ''
      }))
    }
    return true
  })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: command })
  if (['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-cover-resume', 'video-topics', 'video-partial-topic', 'video-text', 'video-continue', 'video-reloaded'].includes(scenario)) {
    upload.dispatchEvent(new Event('change'));
    delete (globalThis as any).haiqiaiMedia;
    if (scenario !== 'video-reloaded') vi.stubGlobal('haiqiaiPreparation', { id: 'previous', finished: true, stopped: true, result: { ok: false, code: 'VIDEO_UPLOAD_UNCONFIRMED' } });
  }
  if (scenario === 'video-text') { title.value = '确认的标题'; command('insertText', false, '确认的正文\n第二段'); command.mockClear(); vi.stubGlobal('haiqiaiPreparation', { id: 'previous', finished: true, stopped: true, result: { code: 'CONTENT_MISMATCH' } }); preview() }
  if (['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-cover-resume', 'video-topics'].includes(scenario)) { if (['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-cover-resume'].includes(scenario)) document.querySelector('input[aria-label="上传封面图片"]')!.dispatchEvent(new Event('change')); title.value = '确认的标题'; command('insertText', false, '确认的正文\n第二段'); for (const tag of ['企业AI落地', '人工智能']) { command('insertText', false, ' #' + tag); document.querySelectorAll<HTMLElement>('#creator-editor-topic-container .item')[1].click() } command.mockClear(); vi.stubGlobal('haiqiaiPreparation', { id: 'previous', finished: true, stopped: true, result: { code: ['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-cover-resume'].includes(scenario) ? 'COVER_IDENTITY_UNCONFIRMED' : 'VIDEO_COVER_CONTROL_UNVERIFIED' } }); preview() }
  if (scenario === 'video-partial-topic') { title.value = '确认的标题'; command('insertText', false, '确认的正文\n第二段'); command('insertText', false, ' #企业AI落地'); document.querySelectorAll<HTMLElement>('#creator-editor-topic-container .item')[1].click(); command('insertText', false, ' #人工智能'); command.mockClear(); vi.stubGlobal('haiqiaiPreparation', { id: 'previous', finished: true, stopped: true, result: { code: 'TOPIC_NOT_FOUND' } }); }
  if (scenario === 'video-cover-crop') { document.querySelector('.uploaded-thumbnail-inactive-mask')!.remove(); document.querySelector('canvas')!.width = 1920 }
  if (expiredCover) {
    document.querySelector<HTMLImageElement>('button.uploaded-thumbnail img')!.src = 'https://example.test/expired-cover';
    vi.stubGlobal('fetch', async (url: string) => new Response(new Uint8Array(3), { status: url.includes('expired-cover') ? 403 : 200 }));
    vi.stubGlobal('OffscreenCanvas', class { image?: unknown; getContext() { return { drawImage: (image: unknown) => { this.image = image }, getImageData: () => ({ data: new Uint8ClampedArray(caseName === 'video-cover-expired-wrong' && this.image instanceof HTMLImageElement ? [9, 2, 3, 255] : [1, 2, 3, 255]) }) } } });
  }
  if (scenario.startsWith('video-preview-')) { document.querySelector('section')!.remove(); document.querySelector<HTMLElement>('.cover > .default')!.style.backgroundImage = 'url(confirmed)'; vi.stubGlobal('haiqiaiPreparation', { id: 'previous', finished: true, stopped: true, result: { code: 'PREVIEW_MISMATCH' } }); }
  try {
    const result = await prepareRednoteEditor({ ...(['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-cover-resume', 'video-topics', 'video-partial-topic', 'video-text', 'video-continue', 'video-reloaded'].includes(scenario) ? { existingVideo: { topicsInProgress: scenario === 'video-partial-topic', previousResultCode: scenario === 'video-partial-topic' ? 'TOPIC_NOT_FOUND' : undefined, ...(scenario.startsWith('video-preview-') ? { confirmedCoverPreviewSha256: scenario === 'video-preview-changed' ? '0'.repeat(64) : Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(document.querySelector<HTMLElement>('.cover > .default')!.style.backgroundImage)))).map(b => b.toString(16).padStart(2, '0')).join('') } : {}), coverAlreadyUploaded: ['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-cover-resume'].includes(scenario), topicsAlreadyFilled: ['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-topics', 'video-cover-resume'].includes(scenario), textAlreadyFilled: ['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-partial-topic', 'video-text', 'video-topics', 'video-cover-resume'].includes(scenario), previousStoppedAt: new Date(Date.now() - 10000).toISOString(), previousRunId: 'previous', size: 3, sha256: '709e80c88487a2411e1ee4dfb9f22a861492d20c4765150c0c794abd70f8147c' } } : {}), runId: 'fill', coverCropAccepted: scenario === 'video-cover-crop' || scenario.startsWith('video-preview-'), originalAgreementAccepted: ['accepted-agreement', 'span-agreement', 'changed-agreement'].includes(scenario), deadline: scenario.startsWith('video') ? videoDeadline : Date.now() + 2000, ...(scenario.startsWith('video') ? { video: true } : {}), ...(['video-preview-resume', 'video-preview-changed', 'video-single-cover', 'video-cover-resume', 'video-cover-crop'].includes(scenario) ? { covers: [{ kind: 'default' as const, name: 'h.png', url: 'data:image/png;base64,AAAA', size: 3 }] } : {}), ...(scenario === 'video-covers' ? { covers: [{ kind: 'horizontal' as const, name: 'h.png', url: 'data:image/png;base64,AAAA', size: 3 }, { kind: 'vertical' as const, name: 'v.png', url: 'data:image/png;base64,AAAA', size: 3 }] } : {}), title: '确认的标题', content: '确认的正文\n第二段', collectionName: 'AI落地', declareOriginal: true, tags: ['企业AI落地', '人工智能'], images: scenario.startsWith('video') ? [] : [{ name: '01.png', url: 'data:image/png;base64,AAAA', size: 3 }, { name: '02.png', url: 'data:image/png;base64,AQID', size: 3 }] })
    if (scenario.startsWith('video-fetch-')) { expect(result).toMatchObject({ ok: false, code: 'VIDEO_PREVIEW_FETCH_FAILED', detail: 'video_preview_fetch; preview=1; error=TypeError' }); expect(JSON.stringify(result)).not.toContain('private-url-token'); expect(JSON.stringify(result)).not.toContain('PRIVATE_TOKEN'); expect(title.value).toBe(''); return; }
    if (scenario === 'video-source-changed') { expect(result).toMatchObject({ ok: false, code: 'VIDEO_IDENTITY_UNCONFIRMED' }); expect(click).not.toHaveBeenCalled(); return; }
    if (scenario === 'video-multi-blob-wrong') { expect(result).toMatchObject({ ok: false, code: 'VIDEO_IDENTITY_UNCONFIRMED' }); expect(title.value).toBe(''); expect(click).not.toHaveBeenCalled(); return; }
    if (caseName === 'video-cover-expired-wrong') { expect(result).toMatchObject({ ok: false, code: 'COVER_IDENTITY_UNCONFIRMED' }); expect(document.querySelector('section')).not.toBeNull(); return; }
    const codes = { 'video-partial-topic': 'AWAITING_PUBLISH_CONFIRMATION', 'video-multi-blob': 'AWAITING_PUBLISH_CONFIRMATION', 'video-preview-resume': 'AWAITING_PUBLISH_CONFIRMATION', 'video-preview-changed': 'COVER_IDENTITY_UNCONFIRMED', 'video-cover-crop': 'AWAITING_PUBLISH_CONFIRMATION', 'video-cover-resume': 'AWAITING_PUBLISH_CONFIRMATION', 'video-topics': 'AWAITING_PUBLISH_CONFIRMATION', 'video-single-cover': 'AWAITING_PUBLISH_CONFIRMATION', 'video-text': 'AWAITING_PUBLISH_CONFIRMATION', 'video-reloaded': 'AWAITING_PUBLISH_CONFIRMATION', 'video-continue': 'AWAITING_PUBLISH_CONFIRMATION', 'video-covers': 'AWAITING_PUBLISH_CONFIRMATION', video: 'AWAITING_PUBLISH_CONFIRMATION', ready: 'AWAITING_PUBLISH_CONFIRMATION', 'delayed-upload-entry': 'AWAITING_PUBLISH_CONFIRMATION', reordered: 'IMAGE_ORDER_UNCONFIRMED', 'duplicate-collection': 'COLLECTION_AMBIGUOUS', 'original-agreement': 'ORIGINAL_AGREEMENT_REQUIRED', 'accepted-agreement': 'AWAITING_PUBLISH_CONFIRMATION', 'span-agreement': 'AWAITING_PUBLISH_CONFIRMATION', 'changed-agreement': 'ORIGINAL_AGREEMENT_CHANGED', reencoded: 'AWAITING_PUBLISH_CONFIRMATION' }
    expect(result).toMatchObject({ ok: ['video-multi-blob', 'video-preview-resume', 'video-cover-crop', 'video-cover-resume', 'video-topics', 'video-single-cover', 'video-partial-topic', 'video-text', 'video-reloaded', 'video-continue', 'video-covers', 'video', 'ready', 'delayed-upload-entry', 'accepted-agreement', 'span-agreement', 'reencoded'].includes(scenario), code: codes[scenario as keyof typeof codes] })
    expect(document.querySelector('.collection-name')!.textContent).toBe(['duplicate-collection', 'video-preview-changed'].includes(scenario) ? '' : 'AI落地')
    expect(document.querySelector<HTMLInputElement>('.d-switch input')!.checked).toBe(!['duplicate-collection', 'video-preview-changed'].includes(scenario))
    expect(files.map(f => f.name)).toEqual(['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-cover-resume', 'video-topics', 'video-partial-topic', 'video-text', 'video-continue', 'video-reloaded'].includes(scenario) ? [] : ['video-preview-resume', 'video-preview-changed', 'video-single-cover', 'video-cover-resume', 'video-cover-crop'].includes(scenario) ? ['v.mp4', 'h.png'] : scenario === 'video-covers' ? ['v.mp4', 'h.png', 'v.png'] : scenario.startsWith('video') ? ['v.mp4'] : ['01.png', '02.png'])
    expect(Array.from(editor.querySelectorAll('a')).map(a => JSON.parse(a.dataset.topic!).name)).toEqual(['企业AI落地', '人工智能'])
    if (scenario === 'video-covers') expect(coverUploads).toEqual(['horizontal', 'vertical']);
    if (['video-preview-resume', 'video-preview-changed', 'video-cover-crop', 'video-cover-resume', 'video-topics'].includes(scenario)) expect(command).not.toHaveBeenCalled()
    if (scenario === 'video-partial-topic') expect(command).not.toHaveBeenCalled();
    if (scenario === 'video-text') expect(command.mock.calls.every(call => call[2].startsWith(' #'))).toBe(true)
    expect(click).not.toHaveBeenCalled()
  } finally { clearTimeout(entryTimer); vi.unstubAllGlobals(); delete (document as any).execCommand; delete (globalThis as any).haiqiaiPreparation; delete (globalThis as any).haiqiaiMedia }
})

it.each(['missing', 'invalid-proof', 'future-proof', 'wrong-id', 'running'])('refuses video continuation without proven old execution (%s)', async state => {
  const { prepareRednoteEditor } = await import('../src/sync/dynamic/rednote-prepare')
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<input placeholder="填写标题会有更多赞哦"><div class="tiptap ProseMirror"></div>'
  if (['wrong-id', 'running'].includes(state)) vi.stubGlobal('haiqiaiPreparation', { id: state === 'wrong-id' ? 'other' : 'previous', stopped: state !== 'running', finished: state !== 'running', result: { code: 'VIDEO_UPLOAD_UNCONFIRMED' } })
  try {
    expect(await prepareRednoteEditor({ runId: 'new', deadline: Date.now() + 1000, title: 'title', content: 'body', tags: [], images: [], video: true, existingVideo: { previousRunId: 'previous', previousStoppedAt: state === 'invalid-proof' ? 'bad' : state === 'future-proof' ? new Date(Date.now() + 60000).toISOString() : undefined, size: 3, sha256: '0'.repeat(64) } })).toMatchObject({ ok: false, code: 'CONTINUATION_UNVERIFIED' })
    expect(document.querySelector('input')!.value).toBe('')
  } finally { vi.unstubAllGlobals(); delete (globalThis as any).haiqiaiPreparation }
})


it.each(['title', 'body', 'topic'])('refuses changed text during original-page continuation (%s)', async changed => {
  const { prepareRednoteEditor } = await import('../src/sync/dynamic/rednote-prepare')
  vi.stubGlobal('location', new URL('https://creator.xiaohongshu.com/publish/publish'))
  document.body.innerHTML = '<input placeholder="填写标题会有更多赞哦"><div class="tiptap ProseMirror" contenteditable="true">body</div>'
  const title = document.querySelector('input')!; title.value = changed === 'title' ? 'changed' : 'title'
  const editor = document.querySelector<HTMLElement>('.tiptap')!
  Object.defineProperty(editor, 'innerText', { get: () => changed === 'body' ? 'changed' : 'body' })
  if (changed === 'topic') editor.innerHTML += '<a class="tiptap-topic">#existing</a>'
  const before = document.body.innerHTML
  try {
    expect(await prepareRednoteEditor({ runId: 'new', deadline: Date.now() + 1000, title: 'title', content: 'body', tags: [], images: [], video: true, existingVideo: { previousRunId: 'previous', previousStoppedAt: new Date(Date.now() - 1000).toISOString(), textAlreadyFilled: true, size: 3, sha256: '0'.repeat(64) } })).toMatchObject({ ok: false, code: 'CONTENT_MISMATCH' })
    expect(document.body.innerHTML).toBe(before)
  } finally { vi.unstubAllGlobals() }
})
