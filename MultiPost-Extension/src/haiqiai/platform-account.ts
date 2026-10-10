import type { RednoteInspection } from './rednote';
import { message } from './i18n';

// Only DOM evidence from the logged-in page. Nicknames never count as account identity.
export function inspectPlatformAccount(platform: string, expectedId: string) {
  if (platform === 'x' && location.origin === 'https://x.com') {
    const profile = document.querySelector<HTMLAnchorElement>('[data-testid="AppTabBar_Profile_Link"]');
    const menu = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    const handle = profile?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1];
    if (!handle || !menu?.textContent?.toLowerCase().includes('@' + handle.toLowerCase())) return { code: 'ACCOUNT_UNVERIFIED' };
    return handle.toLowerCase() === expectedId.toLowerCase() ? { code: 'ACCOUNT_MATCHED', platformAccountId: expectedId } : { code: 'ACCOUNT_MISMATCH' };
  }
  if (platform === 'douyin' && location.origin === 'https://creator.douyin.com' && location.pathname === '/creator-micro/home') {
    const numbers = Array.from(document.querySelectorAll('*')).filter(el => el.childElementCount === 0).map(el => el.textContent?.trim().match(/^抖音号[：:]\s*([A-Za-z0-9_.-]+)$/)?.[1]).filter(Boolean);
    if (numbers.length !== 1) return { code: 'ACCOUNT_UNVERIFIED' };
    // The identifier explicitly records that this is the creator's public handle, not sec_uid.
    return expectedId === 'handle:' + numbers[0] ? { code: 'ACCOUNT_MATCHED', platformAccountId: expectedId } : { code: 'ACCOUNT_MISMATCH' };
  }
  if (platform === 'maimai' && location.origin === 'https://maimai.cn') {
    return { code: document.querySelector('main')?.textContent?.includes('****') ? 'POSTING_IDENTITY_UNVERIFIED' : 'ACCOUNT_UNVERIFIED' };
  }
  return { code: 'PAGE_NOT_READY' };
}
export async function inspectOtherPlatform(platform: string, expectedId: string): Promise<RednoteInspection> {
  const url = ({ x: 'https://x.com/home', douyin: 'https://creator.douyin.com/creator-micro/home', maimai: 'https://maimai.cn/community' } as Record<string, string>)[platform];
  if (!url) return { status: 'needs_attention', code: 'ADAPTER_NOT_READY', message: message('hqLiveCheckInterrupted') };
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab.id === undefined) throw new Error('PAGE_NOT_READY');
  try {
    const end = Date.now() + 20000;
    while ((await chrome.tabs.get(tab.id)).status !== 'complete') {
      if (Date.now() >= end) throw new Error('PAGE_NOT_READY');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    while (true) {
      const observed = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', func: inspectPlatformAccount, args: [platform, expectedId] }))[0]?.result;
      if (observed && (observed.code === 'ACCOUNT_MATCHED' || observed.code === 'ACCOUNT_MISMATCH' || Date.now() >= end)) return { ...observed, status: observed.code === 'ACCOUNT_MATCHED' ? 'matched' : 'needs_attention', message: message(observed.code === 'ACCOUNT_MATCHED' ? 'hqPlatformAccountMatched' : observed.code === 'POSTING_IDENTITY_UNVERIFIED' ? 'hqFillReasonPOSTING_IDENTITY_UNVERIFIED' : 'hqPlatformAccountUnverified') };
      if (Date.now() >= end) throw new Error('PAGE_NOT_READY');
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
}
