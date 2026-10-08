import type { DynamicData, SyncData } from "../common";

// 优先发布图文
export async function DynamicRednote(data: SyncData) {
  const { title, content, images, tags, videos } = data.data as DynamicData;
  // Final submission must be a separate operation after the task API grants submit intent.
  if (data.isAutoPublish) throw new Error("SUBMIT_INTENT_REQUIRED: 此入口仅准备内容，不再直接点击发布");
  if (!images?.length) throw new Error("MISSING_REQUIRED_FIELD: 小红书图文需要图片");
  if (videos?.length || tags?.length) throw new Error("UNSUPPORTED_FIELD: 图文视频或独立话题尚未验收，不可忽略或自行拼接");
  // 辅助函数：等待元素出现
  function waitForElement(selector: string, timeout = 10000): Promise<Element> {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      let timer: ReturnType<typeof setTimeout>;
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          observer.disconnect();
          clearTimeout(timer);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element with selector "${selector}" not found within ${timeout}ms`));
      }, timeout);
    });
  }

  // 辅助函数：上传文件
  async function uploadImages() {
    const fileInput = (await waitForElement('input[type="file"]')) as HTMLInputElement;
    if (!fileInput) {
      throw new Error("PAGE_CHANGED: 未找到图片输入控件");
    }

    const dataTransfer = new DataTransfer();

    for (const fileInfo of images) {
      const response = await fetch(fileInfo.url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`ASSET_DOWNLOAD_FAILED: HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size || blob.size > 32_000_000) throw new Error("INVALID_ASSET_SIZE: 图片为空或超过已观测的32MB上限");
      if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type)) throw new Error("INVALID_ASSET_TYPE: 图片格式尚不支持");
      if (fileInfo.size !== undefined && blob.size !== fileInfo.size) throw new Error("ASSET_SIZE_MISMATCH: 图片大小与确认素材不一致");
      const file = new File([blob], fileInfo.name, { type: blob.type });
      dataTransfer.items.add(file);
    }

    if (dataTransfer.files.length > 0) {
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待文件处理
      console.log("文件上传操作完成");
    } else {
      throw new Error("ASSET_UPLOAD_FAILED: 未准备完整图片");
    }
  }

  if (images && images.length > 0) {
    // 等待页面加载
    await waitForElement('span[class="title"]');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 点击上传图文按钮
    const uploadButtons = document.querySelectorAll('span[class="title"]');
    const uploadButton = Array.from(uploadButtons).find((element) =>
      element.textContent?.trim() === "上传图文" &&
      !element.closest('[aria-hidden="true"]') &&
      element.getBoundingClientRect().x >= 0 && element.getBoundingClientRect().y >= 0 &&
      getComputedStyle(element.parentElement!).opacity === "1",
    ) as HTMLElement;

    if (!uploadButton) {
      throw new Error("PAGE_CHANGED: 未找到可见图文入口");
    }

    uploadButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 上传文件
    await uploadImages();
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 等待图片上传完成

    // 填写标题
    const titleInput = (await waitForElement('input[type="text"]')) as HTMLInputElement;
    if (titleInput) {
      const titleText = title || "";
      if (titleInput.maxLength >= 0 && titleText.length > titleInput.maxLength) throw new Error("CONTENT_TOO_LONG: 标题超过页面声明上限");
      titleInput.value = titleText;
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // 填写内容
    const contentEditor = (await waitForElement('div[contenteditable="true"]')) as HTMLDivElement;
    if (contentEditor) {
      contentEditor.focus();
      const contentPasteEvent = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
      });
      contentPasteEvent.clipboardData!.setData("text/plain", content || "");
      contentEditor.dispatchEvent(contentPasteEvent);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      contentEditor.blur();
      if (contentEditor.innerText.replace(/\r\n/g, "\n") !== (content || "").replace(/\r\n/g, "\n")) throw new Error("CONTENT_MISMATCH: 页面正文与确认内容不同");
    }

    // Filling the editor is not proof of a saved draft or a successful upload/publication.
    if (titleInput.value !== (title || "")) throw new Error("CONTENT_MISMATCH: 页面标题与确认内容不同");
  }
}
