(function () {
  const autoBlockCheckbox = document.getElementById("autoBlockCheckbox");
  const reportBtn = document.getElementById("reportBtn");

  let currentTabId = null;

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
      autoBlockCheckbox.disabled = true;
      return;
    }

    autoBlockCheckbox.disabled = false;

    const settings = await chrome.storage.local.get({
      mv3AutoBlock: true,
    });
    autoBlockCheckbox.checked = settings.mv3AutoBlock !== false;
  }

  autoBlockCheckbox.addEventListener("change", async () => {
    const enabled = autoBlockCheckbox.checked;
    await chrome.storage.local.set({ mv3AutoBlock: enabled });
    // 通知所有 X tab
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

  loadState();
})();
