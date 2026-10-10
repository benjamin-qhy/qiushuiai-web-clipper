import { message } from "./i18n";

export interface RednoteInspection {
  status: "needs_attention" | "matched";
  platformAccountId?: string;
  profileAccountNumber?: string;
  code: string;
  message: string;
  displayName?: string;
  creatorAccountNumber?: string;
  fields?: { imageInput: boolean; titleInput: boolean; contentEditor: boolean };
}

// Runs in the page's isolated world. Only returns selected DOM observations, never cookies or HTML.
export function inspectRednotePage() {
  if (location.origin !== "https://creator.xiaohongshu.com" || location.pathname.startsWith("/login")) return null;
  const name = document.querySelector('.user-info .name-box')?.textContent?.trim();
  const numbers = Array.from(document.querySelectorAll('.others.description-text > div'))
    .map(element => element.textContent?.trim().match(/^小红书账号[:：]\s*(\S+)$/)?.[1]).filter(Boolean);
  return {
    displayName: name?.slice(0, 200),
    creatorAccountNumber: numbers.length === 1 ? numbers[0] : undefined,
    fields: {
      imageInput: !!document.querySelector('input[type="file"][multiple]'),
      titleInput: document.querySelectorAll('input[type="text"]').length === 1,
      contentEditor: document.querySelectorAll('[contenteditable="true"]').length === 1,
    },
  };
}

// This checks the public profile's current unique handle against the logged-in creator home.
// A nickname alone or the consumer site's logged-in account never proves creator identity.
export function inspectRednoteProfile() {
  if (location.origin !== "https://www.xiaohongshu.com" || !/^\/user\/profile\/[a-f0-9]{24}\/?$/.test(location.pathname)) return null;
  const numbers = Array.from(document.querySelectorAll('.user-redId'))
    .map(element => element.textContent?.trim().match(/^小红书号[:：]\s*(\S+)$/)?.[1]).filter(Boolean);
  return numbers.length === 1 ? { platformAccountId: location.pathname.split('/')[3], number: numbers[0] } : null;
}

export async function inspectRednote(expectedId?: string, creatorTabId?: number, profileTabId?: number): Promise<RednoteInspection> {
  let tabs = await chrome.tabs.query({ url: "https://creator.xiaohongshu.com/*" });
  if (creatorTabId !== undefined) tabs = [await chrome.tabs.get(creatorTabId)];
  const homes = tabs.filter(tab => { try { return new URL(tab.url || "").pathname === "/new/home"; } catch { return false; } });
  if (homes.length === 1) tabs = homes;
  if (tabs.length !== 1 || !tabs[0].id) return { status: "needs_attention", code: tabs.length ? "AMBIGUOUS_PAGE" : "PAGE_REQUIRED", message: message(tabs.length ? "hqXhsMultiplePages" : "hqXhsOpenPage") };
  const tab = tabs[0];
  const url = new URL(tab.url || "about:blank");
  if (url.origin !== "https://creator.xiaohongshu.com") return { status: "needs_attention", code: "PAGE_REQUIRED", message: message("hqXhsOpenPage") };
  if (url.pathname.startsWith('/login')) return { status: "needs_attention", code: "LOGIN_REQUIRED", message: message("hqXhsLogin") };
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id! }, world: "ISOLATED", func: inspectRednotePage });
  const observed = results[0]?.result;
  if (!observed) return { status: "needs_attention", code: "PAGE_UNAVAILABLE", message: message("hqXhsUnavailable") };
  if (expectedId && /^[a-f0-9]{24}$/.test(expectedId) && observed.creatorAccountNumber) {
    const profiles = (profileTabId !== undefined ? [await chrome.tabs.get(profileTabId)] : await chrome.tabs.query({ url: "https://www.xiaohongshu.com/user/profile/*" }))
      .filter(tab => { try { return new URL(tab.url || "").pathname.replace(/\/$/, "") === `/user/profile/${expectedId}`; } catch { return false; } });
    if (profiles.length === 1 && profiles[0].id) {
      const profile = (await chrome.scripting.executeScript({ target: { tabId: profiles[0].id }, world: "ISOLATED", func: inspectRednoteProfile }))[0]?.result;
      if (profile?.platformAccountId === expectedId && profile.number) {
        const matched = profile.number === observed.creatorAccountNumber;
        return { ...observed, profileAccountNumber: profile.number, ...(matched ? { platformAccountId: expectedId } : {}), status: matched ? "matched" : "needs_attention", code: matched ? "ACCOUNT_MATCHED" : "ACCOUNT_MISMATCH", message: message(matched ? "hqXhsIdentityMatched" : "hqXhsIdentityMismatch") };
      }
    }
  }
  // Missing public profile evidence remains unverified, never matched by nickname.
  return { ...observed, status: "needs_attention", code: "ACCOUNT_UNVERIFIED", message: message("hqXhsUnverified") };
}
