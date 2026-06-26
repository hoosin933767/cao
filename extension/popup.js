(function () {
  const hideAdCheckbox = document.getElementById("hideAdCheckbox");
  const autoBlockCheckbox = document.getElementById("autoBlockCheckbox");
  const reportBtn = document.getElementById("reportBtn");
  const supportersBtn = document.getElementById("supportersBtn");

  let currentTabId = null;

  const HIDE_AD_KEY = "mv3HideAdEnabled";

  async function getCurrentTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return null;
    try {
      const url = new URL(tab.url || "");
      if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) return null;
    } catch { return null; }
    currentTabId = tab.id;
    return tab;
  }

  async function sendMessage(type, payload = {}) {
    if (!currentTabId) return null;
    try { return await chrome.tabs.sendMessage(currentTabId, { type, ...payload }); }
    catch { return null; }
  }

  async function loadState() {
    const tab = await getCurrentTab();
    if (!tab) {
      hideAdCheckbox.disabled = true;
      autoBlockCheckbox.disabled = true;
      return;
    }

    hideAdCheckbox.disabled = false;
    autoBlockCheckbox.disabled = false;

    const settings = await chrome.storage.local.get({
      mv3AutoBlock: true,
      [HIDE_AD_KEY]: true,
    });
    autoBlockCheckbox.checked = settings.mv3AutoBlock !== false;
    hideAdCheckbox.checked = settings[HIDE_AD_KEY] !== false;

    // Pop-up 打开时触发支持者同步（此时 X 页面 DOM 已就绪）
    sendMessage("MV3_SYNC_SUPPORTER");
  }

  hideAdCheckbox.addEventListener("change", async () => {
    const enabled = hideAdCheckbox.checked;
    await chrome.storage.local.set({ [HIDE_AD_KEY]: enabled });
    await sendMessage("MV3_POPUP_SET_HIDE_AD", { enabled });
  });

  autoBlockCheckbox.addEventListener("change", async () => {
    const enabled = autoBlockCheckbox.checked;
    await chrome.storage.local.set({ mv3AutoBlock: enabled });
    // 通知所有 X tab（并非仅当前 tab），因为 block-engine.js 需要同步
    const tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
    for (const tab of tabs) {
      try { await chrome.tabs.sendMessage(tab.id, { type: "MV3_AUTO_BLOCK_TOGGLE", enabled }); } catch (e) {}
    }
  });

  reportBtn.addEventListener("click", () => {
    const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
    const url = runtime?.getURL ? runtime.getURL("block.html") : "";
    if (url) chrome.tabs.create({ url });
  });

  supportersBtn.addEventListener("click", () => {
    const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
    const url = runtime?.getURL ? runtime.getURL("block.html?tab=supporters") : "";
    if (url) chrome.tabs.create({ url });
  });

  loadState();
})();
