export interface RednoteFinishInput {
  runId: string; finish: 'save_draft' | 'publish'; mode: 'inspect' | 'execute' | 'observe'; deadline: number; title: string;
}
export interface RednoteFinishResult {
  state: 'ready' | 'draft_saved' | 'submitted' | 'published' | 'failed' | 'outcome_unknown'; code: string; detail: string; observedAt?: string; url?: string;
}

// Serialized into the same isolated world as preparation. Never uploads or retries a click.
export async function finishRednoteEditor(data: RednoteFinishInput): Promise<RednoteFinishResult> {
  const unknown = (code: string, detail: string): RednoteFinishResult => ({ state: 'outcome_unknown', code, detail });
  const scope = globalThis as typeof globalThis & {
    haiqiaiPreparation?: { id: string; finished: boolean; result?: { ok: boolean }; snapshot?: string };
    haiqiaiFinish?: { id: string; finish: string; finished: boolean; result?: RednoteFinishResult; read?: () => void };
  };
  if (data.mode === 'observe' && scope.haiqiaiFinish?.id === data.runId && scope.haiqiaiFinish.finish === data.finish) scope.haiqiaiFinish.read?.();
  if (scope.haiqiaiFinish) return scope.haiqiaiFinish.id === data.runId && scope.haiqiaiFinish.finish === data.finish && scope.haiqiaiFinish.result || unknown('FINISH_IN_PROGRESS', '');
  if (data.mode === 'observe') return unknown('RESULT_NOT_FOUND', '');
  if (location.origin !== 'https://creator.xiaohongshu.com' || location.pathname !== '/publish/publish') return unknown('PAGE_NOT_READY', '');
  const prepared = scope.haiqiaiPreparation;
  if (prepared?.id !== data.runId || !prepared.finished || !prepared.result?.ok || !prepared.snapshot) return unknown('PREPARATION_UNVERIFIED', '');
  const title = document.querySelector<HTMLInputElement>('input[placeholder="填写标题会有更多赞哦"]');
  const editor = document.querySelector<HTMLElement>('.tiptap.ProseMirror');
  const saved = JSON.parse(prepared.snapshot);
  const isVideo = Object.hasOwn(saved, 'video');
  const coverMatches = (cover: { kind: string; src: string }) => {
    if (cover.kind === 'default') { const previews = document.querySelectorAll<HTMLElement>('.cover.cover--row > .default.row'); return previews.length === 1 && !!cover.src && previews[0].style.backgroundImage === cover.src && !document.querySelector('input[aria-label="上传封面图片"]'); }
    const label = cover.kind === 'horizontal' ? '横版封面' : cover.kind === 'vertical' ? '竖版封面' : '视频封面';
    const labels = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => el.childElementCount === 0 && el.textContent?.trim() === label && el.getBoundingClientRect().width > 0);
    if (labels.length !== 1) return false;
    let region = labels[0].parentElement;
    for (let depth = 0; region && depth < 4; depth++, region = region.parentElement) {
      const inputs = Array.from(region.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(el => el.accept.includes('image'));
      if (inputs.length > 1) return false;
      if (inputs.length === 1) {
        if (Array.from(region.querySelectorAll('*')).some(el => el.childElementCount === 0 && ['横版封面', '竖版封面', '视频封面'].includes(el.textContent?.trim() || '') && el.textContent?.trim() !== label)) return false;
        const images = Array.from(region.querySelectorAll<HTMLImageElement>('img')).filter(img => img.complete && img.naturalWidth > 0 && img.src.startsWith('blob:https://creator.xiaohongshu.com/'));
        return images.length === 1 && images[0].src === cover.src;
      }
    }
    return false;
  };
  if (isVideo && (!Array.isArray(saved.covers) || saved.covers.some((cover: { kind: string; src: string }) => !coverMatches(cover)))) return unknown('COVER_CONFIRM_UNVERIFIED', '');
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video')).filter(video => video.readyState >= 1 && video.duration > 0 && video.videoWidth > 0);
  if (isVideo && (!videos.length || !videos[0].currentSrc || videos.some(video => !video.currentSrc || video.duration !== videos[0].duration))) return unknown('VIDEO_UPLOAD_UNCONFIRMED', '');
  const originals = saved.videoSources ? document.querySelectorAll<HTMLVideoElement>('.hide-view-for-exact video.exact-video') : [];
  const original = saved.videoSources ? originals.length === 1 ? originals[0] : undefined : videos[0];
  if (isVideo && (!original || !videos.includes(original))) return unknown('VIDEO_UPLOAD_UNCONFIRMED', '');
  const videoSources = [...new Set(videos.map(video => video.currentSrc))].sort();
  if (isVideo && JSON.stringify(videoSources) !== JSON.stringify(saved.videoSources || [saved.video])) return unknown('VIDEO_UPLOAD_UNCONFIRMED', '');
  const snapshot = JSON.stringify({ title: title?.value, body: editor?.innerText, images: Array.from(document.querySelectorAll<HTMLImageElement>('.format-img img.preview')).map(img => img.src), ...(isVideo ? { video: original!.currentSrc, duration: original!.duration, ...(saved.videoSources ? { videoSources } : {}), covers: saved.covers } : {}), collection: document.querySelector('.collection-name')?.textContent?.trim() || '', original: Array.from(document.querySelectorAll('.custom-switch-card')).find(el => el.querySelector('.has-tips')?.textContent?.trim() === '原创声明')?.querySelector<HTMLInputElement>('input')?.checked || false });
  if (snapshot !== prepared.snapshot || title?.value !== data.title || document.querySelector('.d-modal .originalContainer')) return unknown('CONTENT_CHANGED', '');
  if (!['save_draft', 'publish'].includes(data.finish)) return unknown('INVALID_FINISH', '');
  const host = document.querySelector<HTMLElement>('xhs-publish-btn');
  const root = host && (host.shadowRoot || chrome.dom.openOrClosedShadowRoot(host) as ShadowRoot | null);
  const label = data.finish === 'save_draft' ? '暂存离开' : '发布';
  const buttons = Array.from((root || document).querySelectorAll<HTMLButtonElement>('button')).filter(button => button.textContent?.trim() === label && !button.disabled && button.getAttribute('aria-disabled') !== 'true');
  if (buttons.length !== 1 || (host && host.getAttribute(data.finish === 'save_draft' ? 'save-disabled' : 'submit-disabled') === 'true')) return unknown('FINISH_CONTROL_MISSING', '');
  if (data.mode === 'inspect') return { state: 'ready', code: 'FINISH_READY', detail: '' };
  if (!Number.isFinite(data.deadline) || Date.now() >= data.deadline) return unknown('FINISH_EXPIRED', '');
  const run = { id: data.runId, finish: data.finish, finished: false, result: undefined as RednoteFinishResult | undefined, read: undefined as (() => void) | undefined }; scope.haiqiaiFinish = run;
  const signal = data.finish === 'save_draft' ? '保存成功' : '发布成功';
  let observed = false;
  let invalidated = false;
  const existing = new Set(Array.from(document.querySelectorAll('*')).filter(el => el.childElementCount === 0 && el.textContent?.trim() === signal));
  const read = () => {
    const currentTitle = document.querySelector<HTMLInputElement>('input[placeholder="填写标题会有更多赞哦"]');
    if (invalidated || (currentTitle && (currentTitle !== title || currentTitle.value !== data.title))) {
      invalidated = true; watcher.disconnect(); return;
    }
    if (Array.from(document.querySelectorAll('*')).some(el => el.childElementCount === 0 && el.textContent?.trim() === signal && !existing.has(el))) observed = true;
    if (!currentTitle && !observed) { invalidated = true; watcher.disconnect(); return; }
    if (observed && (data.finish === 'publish' || !document.querySelector('input[placeholder="填写标题会有更多赞哦"]'))) {
      run.result = { state: data.finish === 'save_draft' ? 'draft_saved' : 'submitted', code: data.finish === 'save_draft' ? 'DRAFT_SAVED' : 'SUBMITTED', detail: '', observedAt: new Date().toISOString() };
      watcher.disconnect();
    }
  };
  // A user edit ends attribution to this immutable task, even if its result arrives later.
  document.addEventListener('input', () => { invalidated = true; watcher.disconnect(); }, { once: true, capture: true });
  run.read = read;
  const watcher = new MutationObserver(read); watcher.observe(document.body, { childList: true, subtree: true, characterData: true });
  try {
    buttons[0].click(); read();
    const end = Math.min(data.deadline, Date.now() + 20_000);
    while (Date.now() < end) {
      read();
      if (run.result?.state === 'draft_saved' || run.result?.state === 'submitted') return run.result;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    run.result = unknown('RESULT_UNCONFIRMED', ''); return run.result;
  } catch {
    run.result = unknown('FINISH_INTERRUPTED', ''); return run.result;
  } finally { run.finished = true; }
}
