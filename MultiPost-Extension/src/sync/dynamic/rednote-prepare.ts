import type { StagedPublishingMedia } from "../media-stage";
export interface RednotePreparation {
  runId: string; deadline: number; title: string; content: string; tags: string[];
  collectionName?: string; declareOriginal?: boolean; originalAgreementAccepted?: boolean;
  video?: boolean; coverCropAccepted?: boolean;
  existingVideo?: { previousRunId: string; previousResultCode?: string; previousStoppedAt?: string; textAlreadyFilled?: boolean; topicsInProgress?: boolean; coverAlreadyUploaded?: boolean; confirmedCoverPreviewSha256?: string; topicsAlreadyFilled?: boolean; size: number; sha256: string };
  covers?: { kind: "horizontal" | "vertical" | "default"; name: string; url: string; size: number }[];
  images: { name: string; url: string; size: number }[];
}
export interface RednotePreparationResult { ok: boolean; code: string; detail?: string }

// Self-contained: Chrome serializes this function into the isolated page world.
export async function prepareRednoteEditor(data: RednotePreparation): Promise<RednotePreparationResult> {
  if (!Number.isFinite(data.deadline) || Date.now() >= data.deadline) return { ok: false, code: "PREPARATION_EXPIRED" };
  if (location.origin !== "https://creator.xiaohongshu.com" || location.pathname !== "/publish/publish") return { ok: false, code: "PAGE_NOT_READY" };
  const textAlreadyFilled = data.video && data.existingVideo?.textAlreadyFilled === true;
  const topicsAlreadyFilled = data.existingVideo?.topicsAlreadyFilled === true;
  const existingTopicsMatch = () => {
    const editor = document.querySelector<HTMLElement>('.tiptap.ProseMirror');
    if (!editor) return false;
    const anchors = Array.from(editor.querySelectorAll<HTMLElement>('a.tiptap-topic'));
    if (anchors.length !== data.tags.length || anchors.some((a, i) => { try { return JSON.parse(a.getAttribute('data-topic') || '{}').name !== data.tags[i]; } catch { return true; } })) return false;
    if (!editor.innerText.startsWith(data.content)) return false;
    let remaining = editor.innerText.slice(data.content.length);
    for (const anchor of anchors) remaining = remaining.replace(anchor.innerText || anchor.textContent || '', '');
    return !remaining.trim();
  };
  const pendingTopicIndex = () => {
    const editor = document.querySelector<HTMLElement>('.tiptap.ProseMirror');
    if (!editor || !editor.innerText.startsWith(data.content)) return undefined;
    const anchors = Array.from(editor.querySelectorAll<HTMLElement>('a.tiptap-topic'));
    if (anchors.length >= data.tags.length || anchors.some((a, i) => { try { return JSON.parse(a.getAttribute('data-topic') || '{}').name !== data.tags[i]; } catch { return true; } })) return undefined;
    let remaining = editor.innerText.slice(data.content.length);
    for (const anchor of anchors) remaining = remaining.replace(anchor.innerText || anchor.textContent || '', '');
    return remaining.trim() === '#' + data.tags[anchors.length] ? anchors.length : undefined;
  };
  const pendingIndex = data.existingVideo?.topicsInProgress ? pendingTopicIndex() : undefined;
  if (data.existingVideo?.topicsInProgress && pendingIndex === undefined) return { ok: false, code: "CONTENT_MISMATCH" };
  const existingTextMatches = () => document.querySelector<HTMLInputElement>('input[placeholder="填写标题会有更多赞哦"]')?.value === data.title && (pendingIndex !== undefined ? pendingTopicIndex() === pendingIndex : topicsAlreadyFilled ? existingTopicsMatch() : document.querySelector<HTMLElement>('.tiptap.ProseMirror')?.innerText === data.content && !document.querySelector('.tiptap.ProseMirror a.tiptap-topic'));
  if (textAlreadyFilled && !existingTextMatches()) return { ok: false, code: "CONTENT_MISMATCH" };
  if (!textAlreadyFilled && (document.querySelector<HTMLInputElement>('input[placeholder="填写标题会有更多赞哦"]')?.value || document.querySelector('.tiptap.ProseMirror')?.textContent?.trim() || document.querySelector('.format-img img.preview'))) return { ok: false, code: "EDITOR_NOT_EMPTY" };
  const scope = globalThis as typeof globalThis & { haiqiaiPreparation?: { id: string; stopped: boolean; finished: boolean; result?: RednotePreparationResult; snapshot?: string } };
  if (data.existingVideo) {
    // The trusted worker supplies persisted API stop evidence; page globals disappear on extension reload.
    const old = scope.haiqiaiPreparation;
    const stoppedAt = Date.parse(data.existingVideo.previousStoppedAt || '');
    const persistedStop = Number.isFinite(stoppedAt) && stoppedAt <= Date.now();
    if (old ? old.id !== data.existingVideo.previousRunId || !old.finished || !old.stopped || old.result?.code !== (data.existingVideo.previousResultCode || (data.existingVideo?.confirmedCoverPreviewSha256 ? "PREVIEW_MISMATCH" : data.existingVideo?.coverAlreadyUploaded ? "COVER_IDENTITY_UNCONFIRMED" : topicsAlreadyFilled ? "VIDEO_COVER_CONTROL_UNVERIFIED" : textAlreadyFilled ? "CONTENT_MISMATCH" : "VIDEO_UPLOAD_UNCONFIRMED")) : !persistedStop) return { ok: false, code: "CONTINUATION_UNVERIFIED" };
  }
  if (scope.haiqiaiPreparation && !data.existingVideo) return { ok: false, code: "PREPARATION_ALREADY_STARTED" };
  const run: { id: string; stopped: boolean; finished: boolean; result?: RednotePreparationResult; snapshot?: string } = { id: data.runId, stopped: false, finished: false }; scope.haiqiaiPreparation = run;
  let diagnosticStep = "initialization"; let previewIndex = 0;
  const check = () => { if (run.stopped || Date.now() >= data.deadline) throw new Error("PREPARATION_EXPIRED"); };
  const wait = async <T>(read: () => T | undefined | false, code: string, timeout = 15000): Promise<NonNullable<T>> => {
    const end = Math.min(data.deadline, Date.now() + timeout);
    while (true) { check(); const value = read(); if (value) return value; if (Date.now() >= end) throw new Error(code); await new Promise(resolve => setTimeout(resolve, 100)); }
  };
  const topicNames = (root: Element) => Array.from(root.querySelectorAll('a.tiptap-topic')).map(a => { try { return JSON.parse(a.getAttribute('data-topic') || '{}').name; } catch { return undefined; } });
  try {
    if ((!data.video && (!data.images.length || data.images.length > 18)) || new Set(data.tags).size !== data.tags.length || data.tags.some(tag => !tag.trim() || /[#\r\n]/.test(tag))) throw new Error("INVALID_CONTENT");
    if (data.images.reduce((sum, image) => sum + image.size, 0) > 32 * 1024 * 1024) throw new Error("ASSET_TRANSPORT_LIMIT");
    const transfer = new DataTransfer(); const sourceDigests: string[] = [];
    const digest = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(byte => byte.toString(16).padStart(2, "0")).join("");
    for (const image of data.images) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image.url);
      if (!match) throw new Error("INVALID_IMAGE");
      const raw = atob(match[2]); if (raw.length !== image.size) throw new Error("ASSET_SIZE_MISMATCH");
      const bytes = Uint8Array.from(raw, c => c.charCodeAt(0)); sourceDigests.push(await digest(bytes));
      transfer.items.add(new File([bytes], image.name, { type: match[1] }));
    }
    let preparedVideo: HTMLVideoElement | undefined;
    let videoSources: string[] = []; let originalVideoSrc = ""; let originalVideoDuration = 0;
    if (data.video) {
      const staged = (scope as typeof scope & { haiqiaiMedia?: StagedPublishingMedia }).haiqiaiMedia;
      if (!data.existingVideo) {
      if (!staged?.file || staged.id !== data.runId || staged.deadline !== data.deadline || staged.consumed) throw new Error("MEDIA_NOT_READY");
      if (document.querySelector('video[src]')) throw new Error("EDITOR_NOT_EMPTY");
      const upload = await wait(() => document.querySelector<HTMLInputElement>('input.upload-input[type="file"][accept*=".mp4"]'), "PAGE_NOT_READY");
      check(); staged.consumed = true; transfer.items.add(staged.file); upload.files = transfer.files;
      upload.dispatchEvent(new Event("change", { bubbles: true }));
      }
      preparedVideo = await wait(() => {
        const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video')).filter(video => video.readyState >= 1 && video.duration > 0 && video.videoWidth > 0);
        const originals = document.querySelectorAll<HTMLVideoElement>('.hide-view-for-exact video.exact-video');
        return originals.length === 1 && videos.includes(originals[0]) && originals[0].currentSrc && videos.every(video => !!video.currentSrc && video.duration === originals[0].duration) ? originals[0] : undefined;
      }, "VIDEO_UPLOAD_UNCONFIRMED", 60000);
      // The original-video node backs cover extraction; player previews may use non-file blob URLs.
      // Hash the unique original source, then fence every player URL and duration in the final snapshot.
      originalVideoSrc = preparedVideo.currentSrc; originalVideoDuration = preparedVideo.duration;
      videoSources = [...new Set(Array.from(document.querySelectorAll<HTMLVideoElement>('video')).filter(video => video.readyState >= 1 && video.duration > 0 && video.videoWidth > 0).map(video => video.currentSrc))].sort();
      const expected = data.existingVideo || staged!;
      for (const [index, src] of [originalVideoSrc].entries()) {
        previewIndex = index + 1;
        check();
        if (!src.startsWith('blob:https://creator.xiaohongshu.com/')) throw new Error("VIDEO_IDENTITY_UNCONFIRMED");
        diagnosticStep = "video_preview_fetch";
        const preview = await fetch(src, { signal: AbortSignal.timeout(10000) });
        if (!preview.ok) throw new Error("VIDEO_IDENTITY_UNCONFIRMED");
        diagnosticStep = "video_preview_body";
        const blob = await preview.blob();
        diagnosticStep = "video_preview_bytes";
        const bytes = new Uint8Array(await blob.arrayBuffer());
        diagnosticStep = "video_preview_hash";
        if (blob.size !== expected.size || await digest(bytes) !== expected.sha256) throw new Error("VIDEO_IDENTITY_UNCONFIRMED");
      }
      check(); if (staged) delete staged.file;
    } else {
    if (!document.querySelector('input[type="file"][multiple]')) {
      const entry = await wait(() => {
        const entries = Array.from(document.querySelectorAll<HTMLElement>('.creator-tab')).filter(el => el.textContent?.trim() === "上传图文" && el.getBoundingClientRect().x >= 0 && el.getBoundingClientRect().width > 0 && getComputedStyle(el).opacity !== "0" && !el.closest('[aria-hidden="true"]'));
        return entries.length === 1 ? entries[0] : undefined;
      }, "PAGE_NOT_READY");
      check(); entry.click();
    }
    const upload = await wait(() => document.querySelector<HTMLInputElement>('input[type="file"][multiple]'), "PAGE_NOT_READY");
    check(); upload.files = transfer.files; upload.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(() => { const images = Array.from(document.querySelectorAll<HTMLImageElement>('.format-img img.preview')); return images.length === data.images.length && images.every(img => img.complete && img.naturalWidth > 0); }, "IMAGE_UPLOAD_UNCONFIRMED", 45000);
    }
    diagnosticStep = "editor"; previewIndex = 0;
    const title = await wait(() => document.querySelector<HTMLInputElement>('input[placeholder="填写标题会有更多赞哦"]'), "PAGE_NOT_READY");
    const editor = await wait(() => document.querySelector<HTMLElement>('.tiptap.ProseMirror[contenteditable="true"]'), "PAGE_NOT_READY");
    if (!textAlreadyFilled && (title.value || editor.textContent?.trim())) throw new Error("EDITOR_NOT_EMPTY");
    if (title.maxLength >= 0 && data.title.length > title.maxLength) throw new Error("CONTENT_TOO_LONG");
    if (!textAlreadyFilled) {
    check(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, data.title);
    title.dispatchEvent(new Event("input", { bubbles: true })); title.dispatchEvent(new Event("change", { bubbles: true }));
    editor.focus();
    if (data.content && !document.execCommand("insertText", false, data.content)) throw new Error("CONTENT_WRITE_FAILED");
    }
    const previewMatches = () => {
      if (!data.video) return document.querySelector('.scroll-container .title')?.textContent === data.title && document.querySelector('.scroll-container .info')?.textContent === editor.textContent;
      const captions = document.querySelectorAll('.publish-page-preview .user-desc-wrapper2, .publish-page-preview .user-desc-wrapper');
      return captions.length === 1 && captions[0].textContent?.trim() === (data.title + ' ' + editor.textContent).trim();
    };
    await wait(() => title.value === data.title && previewMatches() && (pendingIndex !== undefined ? pendingTopicIndex() === pendingIndex : topicsAlreadyFilled ? existingTopicsMatch() : editor.innerText === data.content), "CONTENT_MISMATCH");
    diagnosticStep = "topics";
    for (const [index, tag] of (topicsAlreadyFilled ? [] : data.tags).entries()) {
      if (pendingIndex !== undefined && index < pendingIndex) continue;
      check(); editor.focus(); const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); const selection = getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      if (index !== pendingIndex && !document.execCommand("insertText", false, ` #${tag}`)) throw new Error("TOPIC_WRITE_FAILED");
      const item = await wait(() => {
        const matches = Array.from(document.querySelectorAll<HTMLElement>('#creator-editor-topic-container .item .name')).filter(el => el.textContent?.trim() === `#${tag}`);
        if (matches.length > 1) throw new Error("TOPIC_AMBIGUOUS");
        return matches.length === 1 ? matches[0].closest<HTMLElement>('.item') : undefined;
      }, "TOPIC_NOT_FOUND", 30000);
      check(); item.click();
      await wait(() => { const names = topicNames(editor); return names.length === index + 1 && names[index] === tag; }, "TOPIC_UNCONFIRMED");
    }
    const coverSources: { kind: string; src: string }[] = [];
    diagnosticStep = "covers";
    if (data.video && data.covers?.length) {
      const kinds = data.covers.map(cover => cover.kind);
      if (new Set(kinds).size !== kinds.length || (kinds.includes('default') && kinds.length > 1)) throw new Error("INVALID_CONTENT");
      // MultiPost VideoRednote's single-cover upload flow, with current-page selectors and evidence checks.
      if (data.existingVideo?.confirmedCoverPreviewSha256) {
        const previews = document.querySelectorAll<HTMLElement>('.cover.cover--row > .default.row');
        const src = previews[0]?.style.backgroundImage;
        if (!data.coverCropAccepted || data.covers.length !== 1 || data.covers[0].kind !== 'default' || previews.length !== 1 || !src || document.querySelector('button.uploaded-thumbnail, input[aria-label="上传封面图片"]') || await digest(new TextEncoder().encode(src)) !== data.existingVideo.confirmedCoverPreviewSha256) throw new Error("COVER_IDENTITY_UNCONFIRMED");
        coverSources.push({ kind: 'default', src });
      } else if (data.covers.length === 1 && data.covers[0].kind === 'default') {
        const cover = data.covers[0];
        const selector = 'input[aria-label="上传封面图片"][accept="image/png, image/jpeg, image/*"]';
        if (!data.existingVideo?.coverAlreadyUploaded && !document.querySelector(selector)) {
          const entries = document.querySelectorAll<HTMLElement>('.cover-edit-entry');
          if (entries.length !== 1) throw new Error("VIDEO_COVER_CONTROL_UNVERIFIED");
          check(); entries[0].click();
        }
        const input = data.existingVideo?.coverAlreadyUploaded ? undefined : await wait(() => { const inputs = document.querySelectorAll<HTMLInputElement>(selector); return inputs.length === 1 ? inputs[0] : undefined; }, "VIDEO_COVER_CONTROL_UNVERIFIED");
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(cover.url);
        if (!match) throw new Error("INVALID_IMAGE");
        const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
        if (bytes.length !== cover.size || bytes.length > 16 * 1024 * 1024) throw new Error("ASSET_SIZE_MISMATCH");
        const file = new File([bytes], cover.name, { type: match[1] });
        const bitmap = await createImageBitmap(file);
        let expectedPixels: string;
        try {
          if (bitmap.width * bitmap.height > 20_000_000) throw new Error("INVALID_IMAGE");
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height); const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error("COVER_IDENTITY_UNCONFIRMED");
          ctx.drawImage(bitmap, 0, 0);
          expectedPixels = await digest(new Uint8Array(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer));
          if (input) {
            const files = new DataTransfer(); files.items.add(file); check(); input.files = files.files;
            input.dispatchEvent(new Event('change', { bubbles: true })); input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const thumbnail = await wait(() => { const images = document.querySelectorAll<HTMLImageElement>('button.uploaded-thumbnail img[alt="已上传封面"]'); return images.length === 1 && images[0].complete && images[0].naturalWidth === bitmap.width && images[0].naturalHeight === bitmap.height ? images[0] : undefined; }, "COVER_IDENTITY_UNCONFIRMED");
          let uploadedResponse: Response | undefined;
          try { uploadedResponse = await fetch(thumbnail.src, { signal: AbortSignal.timeout(10000) }); } catch { /* A loaded thumbnail may outlive its signed URL. */ }
          if (uploadedResponse?.ok) {
            const uploaded = await uploadedResponse.blob();
            if (uploaded.size > 16 * 1024 * 1024 || await digest(new Uint8Array(await uploaded.arrayBuffer())) !== await digest(bytes)) throw new Error("COVER_IDENTITY_UNCONFIRMED");
          } else {
            if (!data.existingVideo?.coverAlreadyUploaded) throw new Error("COVER_IDENTITY_UNCONFIRMED");
            try {
              const loadedCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
              const loadedContext = loadedCanvas.getContext('2d');
              if (!loadedContext) throw new Error("COVER_IDENTITY_UNCONFIRMED");
              loadedContext.drawImage(thumbnail, 0, 0);
              if (await digest(new Uint8Array(loadedContext.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer)) !== expectedPixels) throw new Error("COVER_IDENTITY_UNCONFIRMED");
            } catch { throw new Error("COVER_IDENTITY_UNCONFIRMED"); }
          }
          const choice = thumbnail.closest<HTMLButtonElement>('button.uploaded-thumbnail')!;
          if (data.coverCropAccepted) {
            if (!data.existingVideo?.coverAlreadyUploaded || choice.querySelector('.uploaded-thumbnail-inactive-mask')) throw new Error("COVER_CONFIRM_UNVERIFIED");
          } else { check(); choice.click(); }
          await wait(() => !choice.querySelector('.uploaded-thumbnail-inactive-mask'), "COVER_CONFIRM_UNVERIFIED");
          const end = Math.min(data.deadline, Date.now() + 20000);
          while (!data.coverCropAccepted) {
            check(); const canvases = document.querySelectorAll<HTMLCanvasElement>('.hide-view-for-exact canvas');
            if (canvases.length === 1 && canvases[0].width === bitmap.width && canvases[0].height === bitmap.height) {
              const context = canvases[0].getContext('2d');
              if (context && await digest(new Uint8Array(context.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer)) === expectedPixels) break;
            }
            if (Date.now() >= end) throw new Error("COVER_IDENTITY_UNCONFIRMED");
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } finally { bitmap.close(); }
        const preview = document.querySelector<HTMLElement>('.cover.cover--row > .default.row');
        if (!preview) throw new Error("COVER_CONFIRM_UNVERIFIED");
        const before = preview.style.backgroundImage;
        const done = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(button => button.textContent?.trim() === '完成' && !button.disabled && button.getBoundingClientRect().width > 0);
        if (done.length !== 1) throw new Error("COVER_CONFIRM_UNVERIFIED");
        check(); done[0].click();
        await wait(() => !document.querySelector(selector) && preview.style.backgroundImage && preview.style.backgroundImage !== before, "COVER_CONFIRM_UNVERIFIED");
        coverSources.push({ kind: 'default', src: preview.style.backgroundImage });
      }
      for (const cover of data.covers.filter(cover => cover.kind !== 'default')) {
        const label = cover.kind === 'horizontal' ? '横版封面' : cover.kind === 'vertical' ? '竖版封面' : '视频封面';
        const findRegion = () => {
          const labels = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => el.childElementCount === 0 && el.textContent?.trim() === label && el.getBoundingClientRect().width > 0);
          if (labels.length > 1) throw new Error("COVER_AMBIGUOUS");
          let region: HTMLElement | null = labels[0]?.parentElement || null;
          // Stay inside the uniquely labelled cover control; never fall back to the video's file input.
          for (let depth = 0; region && depth < 4; depth++, region = region.parentElement) {
            const inputs = Array.from(region.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(el => el.accept.includes('image'));
            if (inputs.length === 1) {
              const otherLabels = Array.from(region.querySelectorAll('*')).filter(el => el.childElementCount === 0 && ['横版封面', '竖版封面', '视频封面'].includes(el.textContent?.trim() || '') && el.textContent?.trim() !== label);
              if (otherLabels.length) return undefined;
              return { region, input: inputs[0] };
            }
            if (inputs.length > 1) return undefined;
          }
          return undefined;
        };
        let control = findRegion();
        if (!control) {
          const triggers = Array.from(document.querySelectorAll<HTMLElement>('button, .noCover.uploadCover, .cover-edit-entry')).filter(el => el.matches('.noCover.uploadCover') || ['设置封面', '编辑封面', '修改封面'].includes(el.textContent?.trim() || ''));
          if (triggers.length !== 1) throw new Error("VIDEO_COVER_CONTROL_UNVERIFIED");
          check(); triggers[0].click();
          control = await wait(findRegion, "VIDEO_COVER_CONTROL_UNVERIFIED");
        }
        const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(cover.url);
        if (!match || cover.size > 16 * 1024 * 1024) throw new Error("INVALID_IMAGE");
        const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
        if (bytes.length !== cover.size) throw new Error("ASSET_SIZE_MISMATCH");
        const sourceDigest = await digest(bytes); const fileList = new DataTransfer();
        fileList.items.add(new File([bytes], cover.name, { type: match[1] }));
        check(); control.input.files = fileList.files; control.input.dispatchEvent(new Event('change', { bubbles: true }));
        const image = await wait(() => {
          const images = Array.from(control!.region.querySelectorAll<HTMLImageElement>('img')).filter(img => img.complete && img.naturalWidth > 0 && img.src.startsWith('blob:https://creator.xiaohongshu.com/'));
          return images.length === 1 ? images[0] : undefined;
        }, "COVER_UPLOAD_UNCONFIRMED");
        const response = await fetch(image.src, { signal: AbortSignal.timeout(5000) }); const blob = await response.blob();
        if (blob.size > 16 * 1024 * 1024 || await digest(new Uint8Array(await blob.arrayBuffer())) !== sourceDigest) throw new Error("COVER_IDENTITY_UNCONFIRMED");
        coverSources.push({ kind: cover.kind, src: image.src });
        const dialog = control.region.closest('[role="dialog"], .d-modal');
        if (dialog) {
          const done = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).filter(el => el.textContent?.trim() === '确定' && !el.disabled);
          if (done.length !== 1) throw new Error("COVER_CONFIRM_UNVERIFIED");
          check(); done[0].click(); await wait(() => !dialog.isConnected, "COVER_CONFIRM_UNVERIFIED");
        }
        await wait(() => { const selected = findRegion(); return selected && Array.from(selected.region.querySelectorAll<HTMLImageElement>('img')).some(img => img.src === image.src && img.complete); }, "COVER_CONFIRM_UNVERIFIED");
      }
    }
    if (data.collectionName !== undefined) {
      const chooser = await wait(() => document.querySelector<HTMLElement>('.collection-plugin-button, .collection-plugin-choose'), "COLLECTION_CONTROL_MISSING");
      check(); chooser.click();
      const match = await wait(() => {
        const matches = Array.from(document.querySelectorAll<HTMLElement>('.collection-plugin-popover-content .item-label')).filter(el => el.textContent?.trim() === data.collectionName);
        if (matches.length > 1) throw new Error("COLLECTION_AMBIGUOUS");
        return matches.length === 1 ? matches[0].closest<HTMLElement>('.item') : undefined;
      }, "COLLECTION_NOT_FOUND");
      check(); match.click();
      await wait(() => document.querySelector('.collection-plugin-choose .collection-name')?.textContent?.trim() === data.collectionName, "COLLECTION_UNCONFIRMED");
    }
    if (data.declareOriginal !== undefined) {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.custom-switch-card')).filter(el => el.querySelector('.has-tips')?.textContent?.trim() === "原创声明");
      if (cards.length !== 1) throw new Error("ORIGINAL_CONTROL_MISSING");
      const checkbox = cards[0].querySelector<HTMLInputElement>('input[type="checkbox"]');
      const toggle = cards[0].querySelector<HTMLElement>('.d-switch');
      if (!checkbox || !toggle) throw new Error("ORIGINAL_CONTROL_MISSING");
      if (checkbox.checked !== data.declareOriginal) { check(); toggle.click(); await new Promise(resolve => setTimeout(resolve, 150)); }
      check();
      const agreement = document.querySelector('.d-modal .originalContainer');
      if (agreement) {
        if (data.originalAgreementAccepted !== true) throw new Error("ORIGINAL_AGREEMENT_REQUIRED");
        const link = agreement.querySelector<HTMLAnchorElement>('a');
        const notices = Array.from(agreement.querySelectorAll('.custom-link.alink')).filter(el => el.textContent?.trim() === '《原创声明须知》');
        const noticeText = agreement.querySelector('.d-checkbox')?.textContent?.replace(/\s/g, '');
        const knownTextControl = notices.length === 1 && noticeText === '我已阅读并同意《原创声明须知》，如滥用声明，平台将驳回并予以相关处置';
        const knownLink = link && new URL(link.href).origin === 'https://fe.xiaohongshu.com' && new URL(link.href).pathname === '/ditto/vincent/45ba4b7117054e64b0e730b81e1a4864';
        if (link ? !knownLink : !knownTextControl) throw new Error("ORIGINAL_AGREEMENT_CHANGED");
        const consent = agreement.querySelector<HTMLInputElement>('input[type="checkbox"]');
        const label = agreement.querySelector<HTMLElement>('.d-checkbox');
        if (!consent || !label) throw new Error("ORIGINAL_CONTROL_MISSING");
        check(); if (!consent.checked) label.click();
        const button = await wait(() => Array.from(agreement.querySelectorAll<HTMLButtonElement>('button')).find(el => el.textContent?.trim() === '声明原创' && !el.disabled && consent.checked), "ORIGINAL_UNCONFIRMED");
        check(); button.click();
        await wait(() => !document.querySelector('.d-modal .originalContainer'), "ORIGINAL_UNCONFIRMED");
      }
      if (checkbox.checked !== data.declareOriginal) throw new Error("ORIGINAL_UNCONFIRMED");
    }
    await wait(() => {
      const preview = data.video ? editor : document.querySelector('.scroll-container .info'); if (!preview) return false;
      const names = topicNames(editor); const previewNames = topicNames(preview);
      const fullText = editor.innerText;
      let remaining = fullText.slice(data.content.length);
      for (const anchor of Array.from(editor.querySelectorAll('a.tiptap-topic'))) remaining = remaining.replace(anchor.textContent || '', '');
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('.format-img img.preview'));
      return title.value === data.title && previewMatches() && fullText.startsWith(data.content) && !remaining.trim() && names.length === data.tags.length && names.every((name, index) => name === data.tags[index] && previewNames[index] === name) && previewNames.length === names.length && preview.textContent === editor.textContent && (data.video ? !!preparedVideo && preparedVideo.readyState >= 1 : images.length === data.images.length && images.every((img, index) => img.complete && img.naturalWidth > 0 && document.querySelector<HTMLImageElement>(`#creator-preview-image-${index}`)?.src === img.src));
    }, "PREVIEW_MISMATCH");
    const pixelDigest = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob);
      try {
        check();
        if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 20_000_000) throw new Error("IMAGE_ORDER_UNCONFIRMED");
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error("IMAGE_ORDER_UNCONFIRMED");
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        return bitmap.width + 'x' + bitmap.height + ':' + await digest(new Uint8Array(pixels.buffer));
      } finally { bitmap.close(); }
    };
    const thumbnails = Array.from(document.querySelectorAll<HTMLImageElement>('.format-img img.preview'));
    for (const [index, thumbnail] of thumbnails.entries()) {
      check(); if (!thumbnail.src.startsWith("blob:https://creator.xiaohongshu.com/")) throw new Error("IMAGE_ORDER_UNCONFIRMED");
      const response = await fetch(thumbnail.src, { signal: AbortSignal.timeout(5000) });
      const blob = await response.blob(); if (blob.size > 32 * 1024 * 1024) throw new Error("IMAGE_ORDER_UNCONFIRMED");
      if (await digest(new Uint8Array(await blob.arrayBuffer())) !== sourceDigests[index]) {
        // Container metadata and lossless re-encoding may change bytes without changing pixels.
        // Compare full-resolution decoded pixels at the same index; never accept visual similarity.
        if (await pixelDigest(blob) !== await pixelDigest(transfer.files[index])) throw new Error("IMAGE_ORDER_UNCONFIRMED");
      }
    }
    check();
    if (data.video) {
      const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video')).filter(video => video.readyState >= 1 && video.duration > 0 && video.videoWidth > 0);
      if (preparedVideo!.currentSrc !== originalVideoSrc || document.querySelectorAll('.hide-view-for-exact video.exact-video').length !== 1 || document.querySelector('.hide-view-for-exact video.exact-video') !== preparedVideo || videos.some(video => video.duration !== originalVideoDuration) || JSON.stringify([...new Set(videos.map(video => video.currentSrc))].sort()) !== JSON.stringify(videoSources)) throw new Error("VIDEO_IDENTITY_UNCONFIRMED");
    }
    run.snapshot = JSON.stringify({ title: title.value, body: editor.innerText, images: thumbnails.map(img => img.src), ...(data.video ? { video: originalVideoSrc, duration: originalVideoDuration, videoSources, covers: coverSources } : {}), collection: document.querySelector('.collection-name')?.textContent?.trim() || '', original: Array.from(document.querySelectorAll('.custom-switch-card')).find(el => el.querySelector('.has-tips')?.textContent?.trim() === '原创声明')?.querySelector<HTMLInputElement>('input')?.checked || false });
    run.result = { ok: true, code: "AWAITING_PUBLISH_CONFIRMATION" }; return run.result;
  } catch (error) {
    const known = error instanceof Error && ['ASSET_SIZE_MISMATCH', 'ASSET_TRANSPORT_LIMIT', 'COLLECTION_AMBIGUOUS', 'COLLECTION_CONTROL_MISSING', 'COLLECTION_NOT_FOUND', 'COLLECTION_UNCONFIRMED', 'CONTENT_MISMATCH', 'CONTENT_TOO_LONG', 'CONTENT_WRITE_FAILED', 'CONTINUATION_UNVERIFIED', 'COVER_AMBIGUOUS', 'COVER_CONFIRM_UNVERIFIED', 'COVER_IDENTITY_UNCONFIRMED', 'COVER_UPLOAD_UNCONFIRMED', 'EDITOR_NOT_EMPTY', 'IMAGE_ORDER_UNCONFIRMED', 'IMAGE_UPLOAD_UNCONFIRMED', 'INVALID_CONTENT', 'INVALID_IMAGE', 'MEDIA_NOT_READY', 'ORIGINAL_AGREEMENT_CHANGED', 'ORIGINAL_AGREEMENT_REQUIRED', 'ORIGINAL_CONTROL_MISSING', 'ORIGINAL_UNCONFIRMED', 'PAGE_NOT_READY', 'PREPARATION_ALREADY_STARTED', 'PREPARATION_EXPIRED', 'PREVIEW_MISMATCH', 'TOPIC_AMBIGUOUS', 'TOPIC_NOT_FOUND', 'TOPIC_UNCONFIRMED', 'TOPIC_WRITE_FAILED', 'VIDEO_COVER_CONTROL_UNVERIFIED', 'VIDEO_IDENTITY_UNCONFIRMED', 'VIDEO_UPLOAD_UNCONFIRMED'].includes(error.message);
    const codes: Record<string, string> = { video_preview_fetch: "VIDEO_PREVIEW_FETCH_FAILED", video_preview_body: "VIDEO_PREVIEW_BODY_FAILED", video_preview_bytes: "VIDEO_PREVIEW_BYTES_FAILED", video_preview_hash: "VIDEO_PREVIEW_HASH_FAILED" };
    const errorName = error instanceof Error && ["Error", "TypeError", "RangeError", "ReferenceError", "AbortError", "TimeoutError", "SecurityError", "NotReadableError"].includes(error.name) ? error.name : "Error";
    run.result = { ok: false, code: known ? error.message : codes[diagnosticStep] || "PREPARATION_INTERRUPTED", ...(!known ? { detail: `${diagnosticStep}; preview=${previewIndex}; error=${errorName}` } : {}) }; return run.result;
  }
  finally { run.stopped = true; run.finished = true; }
}
