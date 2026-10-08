import { message } from "./i18n";

export interface RednoteInspection {
  status: "needs_attention";
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

export async function inspectRednote(): Promise<RednoteInspection> {
  const tabs = await chrome.tabs.query({ url: "https://creator.xiaohongshu.com/*" });
  if (tabs.length !== 1 || !tabs[0].id) return { status: "needs_attention", code: tabs.length ? "AMBIGUOUS_PAGE" : "PAGE_REQUIRED", message: message(tabs.length ? "hqXhsMultiplePages" : "hqXhsOpenPage") };
  const tab = tabs[0];
  const url = new URL(tab.url || "about:blank");
  if (url.origin !== "https://creator.xiaohongshu.com") return { status: "needs_attention", code: "PAGE_REQUIRED", message: message("hqXhsOpenPage") };
  if (url.pathname.startsWith('/login')) return { status: "needs_attention", code: "LOGIN_REQUIRED", message: message("hqXhsLogin") };
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id! }, world: "ISOLATED", func: inspectRednotePage });
  const observed = results[0]?.result;
  if (!observed) return { status: "needs_attention", code: "PAGE_UNAVAILABLE", message: message("hqXhsUnavailable") };
  // Creator account numbers are observations, not the stable platform user ID required for execution.
  return { ...observed, status: "needs_attention", code: "ACCOUNT_UNVERIFIED", message: message("hqXhsUnverified") };
}
