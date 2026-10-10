export interface RednoteResultInput {
  mode: 'manager' | 'profile' | 'detail'; title: string; submittedAt: string;
  accountId: string; content: string; tags: string[]; imageCount: number; video?: boolean; noteId?: string;
}
export interface RednoteResultObservation { code: string; noteId?: string; url?: string; publishedAt?: string; platformState?: string }

// Read-only DOM inspection, serialized into the platform page. Never clicks or uploads.
export function inspectRednoteResult(data: RednoteResultInput): RednoteResultObservation {
  if (data.mode === 'manager') {
    if (location.origin !== 'https://creator.xiaohongshu.com' || location.pathname !== '/new/note-manager') return { code: 'RESULT_PAGE_UNAVAILABLE' };
    const submitted = Date.parse(data.submittedAt);
    if (!Number.isFinite(submitted)) return { code: 'RESULT_NOT_FOUND' };
    const matches = Array.from(document.querySelectorAll('.note-card')).filter(card => {
      const date = card.querySelector('.note-card__time')?.textContent?.trim();
      if (!date || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(date)) return false;
      const time = Date.parse(date.replace(' ', 'T') + ':00+08:00');
      return card.querySelector('.note-card__title')?.textContent?.trim() === data.title && time >= Math.floor(submitted / 60000) * 60000 && time <= submitted + 120000;
    });
    if (matches.length !== 1) return { code: matches.length ? 'RESULT_AMBIGUOUS' : 'RESULT_NOT_FOUND' };
    let noteId: unknown;
    try { noteId = JSON.parse(matches[0].getAttribute('data-impression') || '{}').noteTarget?.value?.noteId; } catch { /* absent evidence stays unknown */ }
    if (typeof noteId !== 'string' || !/^[a-f0-9]{24}$/.test(noteId)) return { code: 'RESULT_NOT_FOUND' };
    const statusGroup = matches[0].querySelector('.note-card__title-group')?.cloneNode(true) as Element | undefined;
    statusGroup?.querySelector('.note-card__title')?.remove();
    const text = statusGroup?.textContent?.trim() || '';
    return { code: 'CANDIDATE_FOUND', noteId, publishedAt: matches[0].querySelector('.note-card__time')!.textContent!.trim(), platformState: text === '审核中' ? 'reviewing' : text === '未通过' ? 'rejected' : undefined };
  }
  if (location.origin !== 'https://www.xiaohongshu.com' || !/^[a-f0-9]{24}$/.test(data.accountId) || !data.noteId || !/^[a-f0-9]{24}$/.test(data.noteId)) return { code: 'RESULT_PAGE_UNAVAILABLE' };
  if (data.mode === 'profile') {
    if (location.pathname !== `/user/profile/${data.accountId}`) return { code: 'RESULT_PAGE_UNAVAILABLE' };
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(a => { const url = new URL(a.href); return url.origin === location.origin && url.pathname === `/user/profile/${data.accountId}/${data.noteId}`; });
    return links.length ? { code: 'DETAIL_LINK_FOUND', url: links[0].href } : { code: 'RESULT_NOT_FOUND' };
  }
  if (![ `/explore/${data.noteId}`, `/user/profile/${data.accountId}/${data.noteId}` ].includes(location.pathname)) return { code: 'RESULT_PAGE_UNAVAILABLE' };
  const title = document.querySelector('#detail-title'); const description = document.querySelector('#detail-desc');
  if (!title || !description) return { code: 'RESULT_NOT_FOUND' };
  const authors = Array.from(document.querySelectorAll<HTMLAnchorElement>('div.author a.name'));
  const tags = Array.from(description.querySelectorAll('a.tag')).map(a => a.textContent?.replace(/^#/, '').trim());
  const copy = description.cloneNode(true) as Element; copy.querySelectorAll('a.tag').forEach(a => a.remove());
  const counts = Array.from(document.querySelectorAll('.pagination-media-container .pagination-list')).map(el => el.querySelectorAll('.pagination-item').length);
  // Some layouts put pagination-item directly under the media container.
  const count = counts.length === 1 ? counts[0] : document.querySelector('.pagination-media-container')?.querySelectorAll('.pagination-item').length;
  if (authors.length !== 1 || new URL(authors[0].href).pathname !== `/user/profile/${data.accountId}` || title.textContent !== data.title || copy.textContent?.trim() !== data.content.trim() || tags.length !== data.tags.length || tags.some((tag, i) => tag !== data.tags[i]) || (data.video ? document.querySelectorAll('video').length !== 1 || !(document.querySelector('video')!.duration > 0) : count !== data.imageCount)) return { code: 'RESULT_CONTENT_MISMATCH' };
  return { code: 'PUBLISHED_CONFIRMED', noteId: data.noteId, url: `https://www.xiaohongshu.com/explore/${data.noteId}` };
}
