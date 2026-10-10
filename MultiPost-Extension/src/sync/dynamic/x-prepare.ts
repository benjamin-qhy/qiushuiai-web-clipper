export interface XPreparation {
  runId: string; deadline: number; accountId: string; title: string; content: string; tags: string[];
  images: { name: string; url: string; size: number }[];
}
// MultiPost-style isolated injection. Final submission is handled separately after submit-intent.
export async function prepareXPost(data: XPreparation): Promise<{ ok: boolean; code: string }> {
  if (location.origin !== 'https://x.com' || location.pathname !== '/home') return { ok: false, code: 'PAGE_NOT_READY' };
  if (Date.now() >= data.deadline || !Number.isFinite(data.deadline)) return { ok: false, code: 'PREPARATION_EXPIRED' };
  const profile = document.querySelector<HTMLAnchorElement>('[data-testid="AppTabBar_Profile_Link"]');
  const menu = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
  if (profile?.getAttribute('href')?.toLowerCase() !== '/' + data.accountId.toLowerCase() || !menu?.textContent?.toLowerCase().includes('@' + data.accountId.toLowerCase())) return { ok: false, code: 'ACCOUNT_MISMATCH' };
  const editors = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="tweetTextarea_0"][contenteditable="true"]'));
  if (editors.length !== 1) return { ok: false, code: 'PAGE_NOT_READY' };
  const editor = editors[0];
  if (editor.textContent?.trim() || document.querySelector('[data-testid="attachments"]')) return { ok: false, code: 'EDITOR_NOT_EMPTY' };
  const scope = globalThis as typeof globalThis & { haiqiaiPreparation?: { id: string; stopped: boolean; finished: boolean; snapshot?: string; result?: { ok: boolean; code: string } } };
  if (scope.haiqiaiPreparation) return { ok: false, code: 'PREPARATION_ALREADY_STARTED' };
  const run = { id: data.runId, stopped: false, finished: false, result: undefined as { ok: boolean; code: string } | undefined, snapshot: undefined as string | undefined }; scope.haiqiaiPreparation = run;
  const check = () => { if (run.stopped || Date.now() >= data.deadline) throw new Error('PREPARATION_EXPIRED'); };
  const wait = async (predicate: () => boolean, code: string) => {
    const end = Math.min(data.deadline, Date.now() + 20000);
    while (!predicate()) { check(); if (Date.now() >= end) throw new Error(code); await new Promise(resolve => setTimeout(resolve, 150)); }
    check();
  };
  const text = `${data.title ? data.title + '\n' : ''}${data.content}${data.tags.length ? ' ' + data.tags.map(tag => '#' + tag).join(' ') : ''}`;
  try {
    if (data.images.length > 4 || data.images.reduce((sum, image) => sum + image.size, 0) > 32 * 1024 * 1024 || data.tags.some(tag => /[\s#]/.test(tag))) throw new Error('INVALID_CONTENT');
    // Conservative local guard. Never truncate; premium long posts require their own verified capability.
    if ([...text].reduce((sum, ch) => sum + (ch.codePointAt(0)! > 0x10ff ? 2 : 1), 0) > 280) throw new Error('CONTENT_TOO_LONG');
    const transfer = new DataTransfer(); const digests: string[] = [];
    const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
    for (const image of data.images) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image.url);
      if (!match) throw new Error('INVALID_IMAGE');
      const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
      if (bytes.length !== image.size) throw new Error('ASSET_SIZE_MISMATCH');
      digests.push(await digest(bytes.buffer)); transfer.items.add(new File([bytes], image.name, { type: match[1] }));
    }
    check(); editor.focus(); if (!document.execCommand('insertText', false, text)) throw new Error('CONTENT_WRITE_FAILED');
    await wait(() => editor.innerText === text, 'CONTENT_MISMATCH');
    if (data.images.length) {
      const inputs = document.querySelectorAll<HTMLInputElement>('input[data-testid="fileInput"][type="file"]');
      if (inputs.length !== 1) throw new Error('PAGE_NOT_READY');
      check(); inputs[0].files = transfer.files; inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      await wait(() => document.querySelectorAll('[data-testid="attachments"] [data-testid="tweetPhoto"] img').length === data.images.length, 'IMAGE_UPLOAD_UNCONFIRMED');
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('[data-testid="attachments"] [data-testid="tweetPhoto"] img'));
      for (const [index, image] of images.entries()) {
        if (!image.src.startsWith('blob:https://x.com/')) throw new Error('IMAGE_ORDER_UNCONFIRMED');
        const response = await fetch(image.src, { signal: AbortSignal.timeout(5000) }); const blob = await response.blob();
        if (blob.size > 32 * 1024 * 1024 || await digest(await blob.arrayBuffer()) !== digests[index]) throw new Error('IMAGE_ORDER_UNCONFIRMED');
        check();
      }
    }
    check();
    if (editor.innerText !== text) throw new Error('CONTENT_MISMATCH');
    run.snapshot = JSON.stringify({ accountId: data.accountId, body: editor.innerText, images: Array.from(document.querySelectorAll<HTMLImageElement>('[data-testid="attachments"] [data-testid="tweetPhoto"] img')).map(img => img.src) });
    run.result = { ok: true, code: 'AWAITING_PUBLISH_CONFIRMATION' }; return run.result;
  } catch (error) { run.result = { ok: false, code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PREPARATION_INTERRUPTED' }; return run.result; }
  finally { run.stopped = true; run.finished = true; }
}
