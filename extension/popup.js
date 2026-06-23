(function () {
  const hideAdCheckbox = document.getElementById("hideAdCheckbox");
  const hideGarbageCheckbox = document.getElementById("hideGarbageCheckbox");
  const reportBtn = document.getElementById("reportBtn");

  let currentTabId = null;

  const HIDE_AD_KEY = "mv3HideAdEnabled";
  const HIDE_GARBAGE_KEY = "mv3HideGarbageRepliesEnabled";

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
      hideGarbageCheckbox.disabled = true;
      return;
    }

    hideAdCheckbox.disabled = false;
    hideGarbageCheckbox.disabled = false;

    const settings = await chrome.storage.local.get({
      [HIDE_GARBAGE_KEY]: true,
      [HIDE_AD_KEY]: true,
    });
    hideGarbageCheckbox.checked = settings[HIDE_GARBAGE_KEY] !== false;
    hideAdCheckbox.checked = settings[HIDE_AD_KEY] !== false;
  }

  hideAdCheckbox.addEventListener("change", async () => {
    const enabled = hideAdCheckbox.checked;
    await chrome.storage.local.set({ [HIDE_AD_KEY]: enabled });
    await sendMessage("MV3_POPUP_SET_HIDE_AD", { enabled });
  });

  hideGarbageCheckbox.addEventListener("change", async () => {
    const enabled = hideGarbageCheckbox.checked;
    await chrome.storage.local.set({ [HIDE_GARBAGE_KEY]: enabled });
    await sendMessage("MV3_POPUP_SET_HIDE_GARBAGE", { enabled });
  });

  reportBtn.addEventListener("click", () => {
    const runtime = globalThis.chrome?.runtime || globalThis.browser?.runtime;
    const url = runtime?.getURL ? runtime.getURL("block.html") : "";
    if (url) chrome.tabs.create({ url });
  });

  loadState();
})();
