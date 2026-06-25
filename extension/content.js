(function initTwitterAccountBlocker() {
  const supportedHosts = new Set(["twitter.com", "www.twitter.com", "x.com", "www.x.com"]);
  const ignoredPaths = new Set([
    "compose",
    "explore",
    "hashtag",
    "home",
    "i",
    "intent",
    "login",
    "messages",
    "notifications",
    "search",
    "settings",
    "share",
    "tos",
  ]);
  const storageKey = "mv3BlockedTwitterAccounts";
  const detectedAccountsStorageKey = "mv3DetectedTwitterAccounts";
  const MAX_DETECTED_ACCOUNTS = 10000;
  const blockHistoryKey = "mv3BlockHistory";
  const MAX_BLOCK_HISTORY = 100;
  const adAccountsStorageKey = "mv3AdTwitterAccounts";
  const hideAdStorageKey = "mv3HideAdEnabled";
  const garbageHiddenClass = "mv3-twitter-garbage-hidden";
  var autoBlockEnabled = true;
  const adHiddenClass = "mv3-twitter-ad-hidden";


  if (!supportedHosts.has(window.location.hostname)) {
    return;
  }


  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message) {
        return;
      }

      if (message.type === "MV3_PING") {
        sendResponse({ ok: true });
        return;
      }

      // ── block.html 批量屏蔽 ──
      if (message.type === "MV3_BATCH_BLOCK") {
        const handles = (message.handles || []).filter(h => !blockedAccounts.has(h));
        sendResponse({ ok: true, count: handles.length });
        setTimeout(() => inlineBlockUsers(handles), 100);
        return;
      }

      // ── Popup 通信 ──

      if (message.type === "MV3_POPUP_GET_STATE") {
        chrome.storage.local.get({[detectedAccountsStorageKey]: {}}).then((result) => { const accountsByHandle = result[detectedAccountsStorageKey];
          const autoHandles = Object.keys(accountsByHandle || {});
          sendResponse({
            hideAdEnabled,
            detectedCount: autoHandles.length,
            totalMergedCount: autoHandles.length,
            ...getCurrentXUser(),
          });
        });
        return true;
      }

      if (message.type === "MV3_POPUP_SET_HIDE_AD") {
        hideAdEnabled = message.enabled !== false;
        scanAndHideAds();
        settingsStorage.setHideAdEnabled(hideAdEnabled).then(() => {
          sendResponse({ ok: true });
        });
        return true;
      }

      
      // ── 查询屏蔽状态 ──
      if (message.type === "MV3_CHECK_BLOCK_STATUS") {
        const handle = (message.handle || "").toLowerCase();
        if (!handle) { sendResponse({ ok: false, error: "missing handle" }); return; }
        BlockEngine.checkBlockStatus(handle).then(sendResponse);
        return true;
      }

      // ── 查询账号是否被冻结（suspended） ──
      if (message.type === "MV3_CHECK_SUSPENDED") {
        const handle = (message.handle || "").toLowerCase();
        if (!handle) { sendResponse({ ok: false, error: "missing handle" }); return; }
        BlockEngine.checkSuspended(handle).then(sendResponse);
        return true;
      }

      // ── 通过 DOM 模拟点击屏蔽 ──
      if (message.type === "MV3_BLOCK_USER_VIA_API") {
        const handle = (message.handle || "").toLowerCase();
        if (!handle) { sendResponse({ ok: false, error: "missing handle" }); return; }
        // 使用 .then(sendResponse) 异步返回结果（SPA 成功时能正常回调）
        // location.href 兜底时会销毁 content script，sendResponse 不触发，
        // 导致 sendMessage 超时，由 detected.js 的 catch 处理
        BlockEngine.blockUser(handle).then(sendResponse);
        return true;
      }

      // ── 批量屏蔽 ──
      if (message.type === "MV3_BATCH_BLOCK_USERS") {
        const handles = message.handles || [];
        if (!Array.isArray(handles) || handles.length === 0) {
          sendResponse({ ok: false, error: "empty handles" }); return;
        }
        BlockEngine.batchBlock(handles).then(sendResponse);
        return true;
      }
    });
  }

  const blockedAccounts = (typeof window.BlockEngine !== "undefined" && window.BlockEngine.getBlockedAccounts) ? window.BlockEngine.getBlockedAccounts() : new Set();
  const suggestedAccounts = new Map();
  let scanTimer = null;
  let adRescanInterval = null;
  let currentUrl = window.location.href;
  let hideAdEnabled = true;
  let adAccounts = new Map();
  let mutationObserver = null;
  let adObserver = null;

  const settingsStorage = {
    async getHideAdEnabled() {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get({ [hideAdStorageKey]: true });
        return Boolean(result[hideAdStorageKey]);
      }
      return JSON.parse(window.localStorage.getItem(hideAdStorageKey) || "true");
    },
    async setHideAdEnabled(value) {
      const normalizedValue = Boolean(value);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [hideAdStorageKey]: normalizedValue });
        return;
      }
      window.localStorage.setItem(hideAdStorageKey, JSON.stringify(normalizedValue));
    },
  };

      
  const adAccountsStorage = {
    async get() {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get({ [adAccountsStorageKey]: {} });
        return result[adAccountsStorageKey];
      }
      return JSON.parse(window.localStorage.getItem(adAccountsStorageKey) || "{}");
    },
    async set(accountsByHandle) {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [adAccountsStorageKey]: accountsByHandle });
        return;
      }
      window.localStorage.setItem(adAccountsStorageKey, JSON.stringify(accountsByHandle));
    },
  };

  // ── 检测当前 X/Twitter 登录用户 ──

  let currentXHandle = null;
  let currentXDisplayName = null;

  function detectCurrentXUser() {
    try {
      // 从侧边栏用户菜单中获取
      const profileLink = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      if (profileLink) {
        const href = profileLink.getAttribute("href") || "";
        const parts = href.split("/").filter(Boolean);
        if (parts.length > 0) {
          const handle = parts[parts.length - 1].toLowerCase();
          if (handle && !handle.includes("settings") && handle.length > 1) {
            currentXHandle = handle;
          }
        }
      }

      // 尝试从导航栏获取显示名
      if (!currentXHandle) {
        // 从侧边栏的用户资料卡片获取
        const userCell = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        if (userCell) {
          const spans = userCell.querySelectorAll("span");
          spans.forEach((s) => {
            const text = s.textContent || "";
            if (text.startsWith("@") && text.length > 2) {
              currentXHandle = text.slice(1).toLowerCase();
            }
          });
        }
      }

      // 从 settings 链接反推
      if (!currentXHandle) {
        const settingsLink = document.querySelector('a[href*="/settings"]');
        if (settingsLink) {
          // settings 通常在 /settings 或 /username/settings
          const href = settingsLink.getAttribute("href") || "";
          const parts = href.split("/").filter((p) => p && p !== "settings");
          if (parts.length > 0) {
            currentXHandle = parts[parts.length - 1].toLowerCase();
          }
        }
      }
    } catch (e) {
      // 忽略
    }
  }

  function getCurrentXUser() {
    return { handle: currentXHandle, displayName: currentXDisplayName };
  }


  function startUserDetection() {
    detectCurrentXUser();
    // 页面变化后重新检测（X 是 SPA）
    const observer = new MutationObserver(() => {
      if (!currentXHandle) {
        detectCurrentXUser();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function clearGarbageHiddenState() {
    document.querySelectorAll("[data-cao-hidden]").forEach((el) => {
      el.removeAttribute("data-cao-hidden");
      el.classList.remove(garbageHiddenClass);
    });
  }

  /**
   * 判断 article 是否为回复（评论），而非独立主推文
   * X 在每条回复上方显示 "Replying to @xxx" / "回复 @xxx" 标记
   */
  function isArticleAReply(article) {
    // 在 article 内查找 "Replying to @xxx" 或 "回复 @xxx" 文本
    const text = article.textContent || "";
    return /replying\s+to\s+@|回复\s*@/i.test(text);
  }


  /** 隐藏已屏蔽账号的回复（始终生效） */
  function hideBlockedArticles() {
    if (!isTweetDetailPage()) return;
    document.querySelectorAll('article').forEach((article, index) => {
      if (index === 0) return;
      const handle = getArticleHandle(article);
      if (!handle) return;
      if (getMyHandle() && handle.toLowerCase() === getMyHandle()) return;
      if (blockedAccounts.has(handle)) {
        article.classList.add(garbageHiddenClass);
        article.dataset.caoHidden = "1";
      }
    });
  }

  // ── 广告检测与隐藏 ──

  function isAdArticle(article) {
    // data-testid="placementTracking" 是 X 官方广告标记，最可靠
    if (article.querySelector('[data-testid="placementTracking"]')) return true;

    return false;
  }

  function saveAdAccount(handle) {
    if (!handle) {
      return;
    }
    const normalized = normalizeHandle(handle);
    adAccounts.set(normalized, {
      handle: normalized,
      firstDetectedAt: adAccounts.has(normalized)
        ? adAccounts.get(normalized).firstDetectedAt
        : new Date().toISOString(),
      lastDetectedAt: new Date().toISOString(),
    });
  }

  function scanAndHideAds() {
    if (!hideAdEnabled) {
      clearAdHiddenState();
      return;
    }

    if (!isTwitterHomePage()) {
      clearAdHiddenState();
      return;
    }

    let hasNewAds = false;

    document.querySelectorAll("article").forEach((article) => {
      const handle = normalizeHandle(getArticleHandle(article));
      if (!handle) {
        return;
      }

      const isAd = isAdArticle(article);
      if (isAd) {
        article.classList.add(adHiddenClass);
        if (!adAccounts.has(handle)) {
          saveAdAccount(handle);
          hasNewAds = true;
        }
      }
    });

    if (hasNewAds) {
      const obj = {};
      adAccounts.forEach((value, key) => {
        obj[key] = value;
      });
      adAccountsStorage.set(obj).catch(() => {});
    }

  }

  function clearAdHiddenState() {
    document.querySelectorAll(`.${adHiddenClass}`).forEach((el) => {
      el.classList.remove(adHiddenClass);
    });
  }

  function normalizeHandle(handle) {
    return handle.replace(/^@/, "").toLowerCase();
  }

  function isTwitterHomePage() {
    return window.location.pathname === "/home";
  }

  function isTweetDetailPage() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length >= 3 && parts[1] === "status" && /^[0-9]+$/.test(parts[2]);
  }

  function isProfilePage() {
    if (isTwitterHomePage() || isTweetDetailPage()) return false;
    const parts = window.location.pathname.split("/").filter(Boolean);
    // 单段路径且不像其它系统路径 → profile 页
    if (parts.length === 1 && /^[a-zA-Z0-9_]{1,30}$/.test(parts[0])) {
      return parts[0].toLowerCase() !== "explore" && parts[0] !== "notifications" && parts[0] !== "messages" && parts[0] !== "search" && parts[0] !== "settings" && parts[0] !== "i" && parts[0] !== "jobs" && parts[0] !== "compose" && parts[0] !== "lists" && parts[0] !== "communities";
    }
    return false;
  }



  function handleRouteChange() {
    if (currentUrl === window.location.href) {
      return;
    }

    currentUrl = window.location.href;
    window.clearTimeout(scanTimer);

    if (isTweetDetailPage()) {
      // 进入推文详情页：清除首页遗留的广告隐藏状态 + 停止广告定时扫描
      clearAdHiddenState();
      if (adRescanInterval) {
        clearInterval(adRescanInterval);
        adRescanInterval = null;
      }

      // 启动 MutationObserver
      if (!mutationObserver) {
        mutationObserver = new MutationObserver(scheduleScan);
      }
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // 离开主页时断开 adObserver
      if (adObserver) {
        adObserver.disconnect();
      }

      scanWithVectorDB().then(function() { injectReportButtons(); });
      return;
    }

    // 进入主页：为广告检测启动 observer
    if (isTwitterHomePage()) {
      // 离开详情页时断开 observer 并清除所有隐藏状态
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      clearGarbageHiddenState(); // 清除之前详情页设置的隐藏类

      if (!adObserver) {
        adObserver = new MutationObserver(() => {
          if (isTwitterHomePage()) {
            scheduleAdScan();
          }
        });
      }
      adObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // 启动定时重扫（防 X 虚拟 DOM 替换 article 导致类名丢失）
      if (!adRescanInterval) {
        adRescanInterval = setInterval(() => {
          if (isTwitterHomePage() && hideAdEnabled) scanAndHideAds();
        }, 2000);
      }

      scanAndHideAds();
    } else if (isProfilePage()) {
      // 离开主页时停止定时重扫
      if (adRescanInterval) {
        clearInterval(adRescanInterval);
        adRescanInterval = null;
      }
      // 进入个人主页：断开其它 observer，清除隐藏状态，显示 CAO 标识
      clearAdHiddenState();
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      if (adObserver) {
        adObserver.disconnect();
      }
      clearGarbageHiddenState();
    } else {
      // 非主页/详情页：断开所有 observer + 停止广告定时扫描
      if (adRescanInterval) {
        clearInterval(adRescanInterval);
        adRescanInterval = null;
      }
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      if (adObserver) {
        adObserver.disconnect();
      }
      clearGarbageHiddenState();
    }
  }

  function watchRouteChanges() {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      window.setTimeout(handleRouteChange, 0);
      return result;
    };

    window.history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      window.setTimeout(handleRouteChange, 0);
      return result;
    };

    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    // 用 2000ms 间隔轮询代替 500ms，大幅减少不必要的执行
    window.setInterval(handleRouteChange, 2000);
  }

  function getProfileHandleFromUrl() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts.length >= 1 && /^[a-zA-Z0-9_]{1,30}$/.test(parts[0])) {
      return parts[0].toLowerCase();
    }
    return "";
  }


  function getHandleFromLink(link) {
    const url = new URL(link.href, window.location.origin);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length === 0 || ignoredPaths.has(parts[0])) {
      return "";
    }

    const handle = parts[0];
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
      return "";
    }

    return normalizeHandle(handle);
  }

  function getAccountContainer(link) {
    return (
      link.closest("article") ||
      link.closest('[data-testid="UserCell"]') ||
      (link.closest('[data-testid="User-Name"]') && link.closest('[data-testid="cellInnerDiv"]'))
    );
  }

  function getArticleHandle(article) {
    const userNameRoot = article.querySelector('[data-testid="User-Name"]');
    if (!userNameRoot) {
      return "";
    }

    const link = getHandleLinkFromRoot(userNameRoot);
    return link ? getHandleFromLink(link) : "";
  }

  function getArticleDisplayName(article) {
    const userNameRoot = article.querySelector('[data-testid="User-Name"]');
    if (!userNameRoot) {
      return "";
    }

    const handleText = userNameRoot.querySelector('a[href*="/"] span')?.textContent || "";
    // innerHTML 还原 img[alt] 中的 emoji 字符，再剥掉其余标签
    var html = userNameRoot.innerHTML;
    var allText = html
      .replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    var withoutHandle = allText.replace(/@[A-Za-z0-9_]{1,15}.*/, "").trim();
    return withoutHandle || handleText.trim();
  }

  /**
   * 获取文章转发/分享数量
   */
  function getArticleShareCount(article) {
    try {
      // X 的转发数量在 a[href*="/retweets"] 中
      var shareLink = article.querySelector('a[href*="/retweets"]');
      if (shareLink) {
        var text = shareLink.textContent.trim();
        // 解析数字："12" → 12, "1.2K" → 1200, "12K" → 12000
        var match = text.match(/^([\d.]+)(K|k|M|m)?/);
        if (match) {
          var num = parseFloat(match[1]);
          var suffix = match[2];
          if (suffix && (suffix === "K" || suffix === "k")) num *= 1000;
          if (suffix && (suffix === "M" || suffix === "m")) num *= 1000000;
          return Math.floor(num);
        }
      }
    } catch (e) {}
    return 0;
  }

  function extractTweetTextForRuleCheck(element) {
    // 提取可见文本，包括 <img alt="😀"> 中的 emoji alt 文本
    const parts = [];
    const text = (element.textContent || "").trim();
    if (text) parts.push(text);
    element.querySelectorAll("img[alt]").forEach((img) => {
      const alt = (img.getAttribute("alt") || "").trim();
      if (alt) parts.push(alt);
    });
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function getArticleReplyText(article) {
    // 先尝试标准 selector
    const tweetTextElements = article.querySelectorAll('[data-testid="tweetText"]');
    if (tweetTextElements.length > 0) {
      return Array.from(tweetTextElements)
        .map((element) => extractTweetTextForRuleCheck(element))
        .filter(Boolean)
        .join(" ")
        .trim();
    }

    // 兜底：如果找不到 [data-testid="tweetText"]（X DOM 可能变了），
    // 尝试其他可能的 tweet 内容容器
    const fallbackSelectors = [
      '[data-testid="tweet"]',
      '[lang] div[dir="auto"]',
      'div[data-testid*="tweet"]',
    ];
    for (const selector of fallbackSelectors) {
      const elements = article.querySelectorAll(selector);
      if (elements.length > 0) {
        const text = Array.from(elements)
          .map((el) => extractTweetTextForRuleCheck(el))
          .filter(Boolean)
          .join(" ")
          .trim();
        if (text) {
          return text;
        }
      }
    }
    // 最后兜底：直接从 article 取所有文本
    const allText = (article.textContent || "").replace(/\s+/g, " ").trim();
    if (allText) return allText;
    return "";
  }

  function saveSuggestedToStorage() {
    // 用当前 session 最近一次检测到的账号覆盖 storage（不留旧数据）
    const obj = {};
    suggestedAccounts.forEach((acct, handle) => { obj[handle.toLowerCase()] = acct; });
    chrome.storage.local.set({ [detectedAccountsStorageKey]: obj }).catch(() => {});
  }

  /** 获取 article 中的头像 URL */
  function getArticleAvatar(article) {
    try {
      var img = article.querySelector('img[src*="twimg.com"][src*="_normal"]');
      if (img) return img.src.replace("_normal.", "_bigger.");
      img = article.querySelector('img[src*="twimg.com"]');
      if (img) return img.src;
    } catch (e) {}
    return "";
  }

  /** 浮动按钮图标（全局定义，供 triggerFloaterBreath 使用） */
  var blackIconData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACcklEQVR4nO3Xu2tUQRTH8c+92U02MYiFjRaiFhJ8gAhaW2ilCBb+DWIjNjY2YiWI2PgfaKWF2KggohFECy0EUSwUBB9oJYKRPPdazAw7+/CxyTWVB4a7zNw7v++cM2fObCFYCzuwHruxiCbe4cWk1svvZqFEW812Hh8xj2pA+4EHOBDfL+sG2InpKLbY09oZSBsH4zfNuiFaeBaFlvR7YS4+768tx9M3I3WJN+JzCt8iQL7y1FL/I+z7VxAnotj8AIi2EJbkkWO1Q4yGua5GkQWdfZCEE1zyyOE/QJRxrJG1kdhf9L5cxIEJXNEfghl8yOAqfMaG+G0+4d9mStlLUaBqaZi1eBSnsDUKn8MrIWO2CJ4YxcWS0+2wsqUo3l5jzIy5KWzHJsGLI3gppP3ruIg+S54wYRQm1xjLx/fqDs9nrOtZ+V489OuzZQ5vcPx37hnR79ZGI3Rd070f9mfw2/BVd/Ys9LQKd7D5dwDJcogEdSRbSRtns/cuZWODUrnCUyF8Q1sS2SisMk14AyaLMbinP3PyNJ7FnjhPSv+hAUbxNpv8OsZwM0INOk1TuC4sVzwHGNdJyUrY2Xd13JzXkqVM/Ckm9e+voQAKwQPPdcc1FbNBx3iFJ0L6ssKKWsZ2OxNNIAnmsrDLP+ExTgoFb8XiyW0tvM+E2zrpdaaJ8SKeIUXXGbLiu0QO8E53zCtcaAaNpsHpu2IbBJBWPq1TbIqe92uzX3lgBrvi2FDluY77XYkvQnEpDHlpreuCWQruH1jdVgPAcsTrBliW/Qf4D7CsmhwtVb30e9UBJnROxonVAqiEsM0LF9NDsf9W7Bv67/tPyfTpZUC5YpgAAAAASUVORK5CYII=";
  var greenIconData = "data:image/png;base64,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";

  /** 浮动按钮触发呼吸动画 + 闪绿 */
  function triggerFloaterBreath() {
    var el = document.getElementById("cao-floater");
    if (!el) return;
    el.classList.add("active");
    el.classList.remove("ca-breathe");
    void el.offsetWidth;
    el.classList.add("ca-breathe");
    // 动画结束后变回黑色
    setTimeout(function() {
      el.classList.remove("active");
      var img = el.querySelector("img");
      if (img) img.src = blackIconData;
    }, 2500);
    // 立即换绿色图标
    var img = el.querySelector("img");
    if (img) img.src = greenIconData;
  }

  /** 记录屏蔽历史（仅保留最近 MAX_BLOCK_HISTORY 条） */
  async function saveBlockHistory(handle, name, avatar) {
    try {
      const d = await chrome.storage.local.get(blockHistoryKey);
      let list = d[blockHistoryKey] || [];
      list.unshift({ handle: handle.toLowerCase(), name: name || handle, avatar: avatar || "", blockedAt: Date.now() });
      if (list.length > MAX_BLOCK_HISTORY) list = list.slice(0, MAX_BLOCK_HISTORY);
      await chrome.storage.local.set({ [blockHistoryKey]: list });
      triggerFloaterBreath();
    } catch (e) {
      console.warn("[CAO] saveBlockHistory error:", e);
    }
  }

  function isUserNameTextLink(link, handle) {
    const text = link.textContent.trim().toLowerCase();
    return text.includes(`@${handle}`) || Boolean(link.closest('[data-testid="User-Name"]'));
  }

  function getHandleLinkFromRoot(root) {
    const links = Array.from(root.querySelectorAll("a[href]"));
    return links.find((link) => {
      const handle = getHandleFromLink(link);
      return handle && isUserNameTextLink(link, handle);
    });
  }

  function hideBlockedAccounts() {
    if (!isTweetDetailPage()) {
      return;
    }

    document.querySelectorAll("a[href]").forEach((link) => {
      const handle = getHandleFromLink(link);
      if (!handle || !blockedAccounts.has(handle)) {
        return;
      }

      const container = getAccountContainer(link);
      if (container) {
        container.classList.add("mv3-twitter-blocked-account");
      }
    });
  }

  function hideBlockedAccountsSoon() {
    hideBlockedAccounts();
    window.setTimeout(hideBlockedAccounts, 100);
  }

  /**
   * 在账号主页上自动执行屏蔽操作（「更多 → 屏蔽 → 确认」）
   * 由 block.js 通过 chrome.tabs.sendMessage 触发
   * 检测到冻结账号主动返回 suspended: true
   */
  /**
   * 注入 <script> 到 page context 执行 fetch，通过 postMessage 回传结果
   */

  const trainBtnClass = "mv3-train-btn";

  /** 上报并屏蔽：屏蔽账号 + 发推报告 + 存本地记录 */
  async function reportAndBlock(article, handle, replyText, displayName, matchedKeyword, matchedRedirect, score) {
    // 1. 屏蔽
    var blockResult = await blockArticleUser(article);
    if (blockResult && (blockResult.ok || blockResult.alreadyBlocked)) {
      blockedAccounts.add(handle);
      try {
        var d = await chrome.storage.local.get({ [storageKey]: [] });
        var list = d[storageKey] || [];
        if (!list.includes(handle)) { list.push(handle); await chrome.storage.local.set({ [storageKey]: list.sort() }); }
      } catch (e) {}
      await saveBlockHistory(handle, displayName, getArticleAvatar(article));
      hideBlockedAccountsSoon();
    } else {
      return { ok: false, error: (blockResult && blockResult.error) || "屏蔽失败" };
    }

    // 2. 发推上报（回复到收集贴评论区）
    var REPORT_TWEET_ID = "2069432891864690876";
    var tweetText = "垃圾账号 @" + handle;
    try {
      var csrf = (document.cookie.match(/\bct0=([^;]+)/) || [])[1] || "";
      var resp = await fetch("https://x.com/i/api/1.1/statuses/update.json", {
        method: "POST",
        credentials: "include",
        headers: {
          "x-csrf-token": csrf,
          "x-twitter-active-user": "yes",
          "x-twitter-auth-type": "OAuth2Session",
          "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
          "content-type": "application/x-www-form-urlencoded"
        },
        body: "status=" + encodeURIComponent(tweetText) + "&in_reply_to_status_id=" + REPORT_TWEET_ID
      });
      if (!resp.ok) {
        // fallback: 打开预填发推
        window.open("https://x.com/intent/post?text=" + encodeURIComponent(tweetText), "_blank");
      }
    } catch (e) {
      window.open("https://x.com/intent/post?text=" + encodeURIComponent(tweetText), "_blank");
    }

    // 3. 隐藏
    article.classList.add(garbageHiddenClass);
    article.dataset.caoHidden = "1";
    return { ok: true };
  }

  function injectReportButtons() {
    if (!isTweetDetailPage()) return;
    var myHandle = getMyHandle();
    document.querySelectorAll('article').forEach(function(article, index) {
      if (index === 0) return; // 跳过主推文
      var userNameRoot = article.querySelector('[data-testid="User-Name"]');
      if (!userNameRoot || userNameRoot.querySelector("." + trainBtnClass)) return;
      var handle = getArticleHandle(article);
      if (!handle) return;
      if (myHandle && handle.toLowerCase() === myHandle) return;
      // 跳过已隐藏的（已处理过的）
      if (article.classList.contains(garbageHiddenClass)) return;
      // 只给被标记为垃圾的回复加上报按钮
      if (!article.classList.contains("flagged-spam")) return;
      var btn = document.createElement("button");
      btn.className = trainBtnClass;
      btn.type = "button";
      btn.textContent = "上报";
      btn.title = "屏蔽此账号并 @fuckxegg2 上报（用于系统未检测到的垃圾）";
      btn.addEventListener("click", async function(e) {
        e.preventDefault();
        e.stopPropagation();
        btn.disabled = true;
        btn.textContent = "…";
        var replyText = getArticleReplyText(article) || "";
        var displayName = getArticleDisplayName(article);
        var result = await reportAndBlock(article, handle, replyText, displayName, null, null, 0);
        if (result.ok) {
          btn.textContent = "✓";
        } else {
          btn.textContent = "✗";
          btn.title = result.error;
          btn.disabled = false;
        }
      });
      userNameRoot.appendChild(btn);
    });
  }

  async function scheduleScan() {
    if (!isTweetDetailPage()) return;
    window.clearTimeout(scanTimer);
    await scanWithVectorDB();
    injectReportButtons();
  }

  function scheduleAdScan() {
    if (!hideAdEnabled || !isTwitterHomePage()) {
      return;
    }
    // 立即扫一次（捕获大部分已渲染广告），防闪现
    scanAndHideAds();
    // 延迟补扫（等 X 的广告标签异步绑定完）
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanAndHideAds, 300);
  }

  // init: 从 storage 加载已屏蔽列表 + 广告设置
  chrome.storage.local.get({ [storageKey]: [] }).then(async (data) => {
    (data[storageKey] || []).forEach((handle) => blockedAccounts.add(normalizeHandle(handle)));

    // 加载广告相关设置
    const storedAdAccounts = await adAccountsStorage.get();
    if (storedAdAccounts && typeof storedAdAccounts === "object") {
      Object.keys(storedAdAccounts).forEach((key) => {
        adAccounts.set(key, storedAdAccounts[key]);
      });
    }

    hideAdEnabled = await settingsStorage.getHideAdEnabled();

    // 监听 storage 变化，同步 blockedAccounts（block-engine 解除屏蔽后同步）
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const change = changes[storageKey];
      if (change) {
        blockedAccounts.clear();
        (change.newValue || []).forEach(h => blockedAccounts.add(normalizeHandle(h)));
        hideBlockedAccountsSoon();
        injectReportButtons();
      }
    });

    watchRouteChanges();
    // 首次加载：仅在推文详情页才创建并启动 observer
    if (isTweetDetailPage()) {
      mutationObserver = new MutationObserver(function() { scheduleScan(); });
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      scanWithVectorDB().then(function() { injectReportButtons(); });
    }

    // 首次加载：如果在主页，启动广告 observer
    if (isTwitterHomePage()) {
      adObserver = new MutationObserver(() => {
        if (isTwitterHomePage()) {
          scheduleAdScan();
        }
      });
      adObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    // 监听 BlockEngine 的 blockedAccounts 变化 → 触发隐藏更新
    if (typeof window.BlockEngine !== "undefined") {
      BlockEngine.onChanged = function () { hideBlockedAccountsSoon(); };
    }

    hideBlockedArticles();
    scanAndHideAds();

    // ── 创建浮动按钮 ──
    (function() {
      if (document.getElementById("cao-floater")) return;
      var floater = document.createElement("div");
      floater.id = "cao-floater";
      floater.title = "CAO 屏蔽管理";
      floater.innerHTML = '<img src="' + blackIconData + '" alt="CAO">';
      floater.addEventListener("click", function() {
        var url = (chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL("block.html") : "";
        if (url) window.open(url, "_blank");
      });
      document.body.appendChild(floater);
    })();
  });

  // ── 内联屏蔽：在当前推文详情页直接屏蔽（twitter-helper 方案）──

  let inlineBlockBusy = false;

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function waitForSelector(sel, timeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(sel);
      if (el) return el;
      await sleep(200);
    }
    return null;
  }

  /** 在当前页面屏蔽一个 article 中的用户（参照 twitter-helper 已验证模式） */
  async function blockArticleUser(article) {
    // 找「更多」按钮（⋯），只在 article 内查找
    const moreBtn = article.querySelector('button[data-testid="caret"]')
                || article.querySelector('button[data-testid="userActions"]');
    if (!moreBtn) return { ok: false, error: "no caret" };

    // 先点击「更多」
    moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(100);

    // 找「屏蔽」菜单项 (全局，菜单是挂在 body 上的)
    let blockItem = document.querySelector('div[data-testid="block"]');
    if (!blockItem) {
      // 可能已经屏蔽过，找「解除屏蔽」
      const unblockItem = document.querySelector('div[data-testid="unblock"]');
      if (unblockItem) { document.body.click(); return { ok: true, alreadyBlocked: true }; }
      return { ok: false, error: "no block item" };
    }
    blockItem.click();
    await sleep(100);

    // 找确认按钮
    const confirmBtn = document.querySelector('button[data-testid="confirmationSheetConfirm"]');
    if (!confirmBtn) {
      // 有些 X 版本不需要确认就屏蔽了，算成功
      return { ok: true, noConfirm: true };
    }
    confirmBtn.click();
    await sleep(200);

    return { ok: true };
  }

  /** 主入口：传入 handle 列表，在当前页面逐个屏蔽（DOM 点击方式） */
  async function inlineBlockUsers(handles) {
    if (!handles.length || inlineBlockBusy) return false;
    inlineBlockBusy = true;
    let anyOk = false;
    try {
      for (const handle of handles) {
        if (blockedAccounts.has(handle)) { anyOk = true; continue; }
        // 通过 handle 找到 article，用 DOM 点击方式屏蔽
        const article = findArticleByHandle(handle);
        if (!article) continue;
        const result = await blockArticleUser(article);
        if (result && (result.ok || result.alreadyBlocked)) {
          anyOk = true;
          blockedAccounts.add(handle);
          try {
            const d = await chrome.storage.local.get({ [storageKey]: [] });
            const list = d[storageKey] || [];
            if (!list.includes(handle)) {
              list.push(handle);
              await chrome.storage.local.set({ [storageKey]: list.sort() });
            }
          } catch (e) {}
          await saveBlockHistory(handle, getArticleDisplayName(article), getArticleAvatar(article));
        }
        await sleep(500);
      }
      hideBlockedAccountsSoon();
      return anyOk;
    } finally {
      inlineBlockBusy = false;
    }
  }

  function findArticleByHandle(handle) {
    const articles = document.querySelectorAll('article');
    for (const article of articles) {
      const h = getArticleHandle(article);
      if (h && h.toLowerCase() === handle.toLowerCase()) return article;
    }
    return null;
  }

  // ── 向量库 spam 检测（complementary to rule-based system）──

  let vectorScanQueued = false;
  let vectorScanRunning = false;

  /** 判断 article 对应的账号是否有认证标识（蓝V/金V/灰V） */
  function isVerifiedAccount(article) {
    return !!article.querySelector(
      '[data-testid="icon-verified"], [data-testid="icon-verified-2"], [aria-label*="Verified"], svg[aria-label*="Verified"]'
    );
  }

  /** 从 DOM 获取当前登录用户自己的 handle */
  let currentUserHandle = null;
  let myHandlePromise = null;
  function getMyHandle() {
    if (!currentUserHandle) {
      try {
        const link = document.querySelector('a[data-testid="AppTabBar-Profile"]');
        if (link) {
          const href = link.getAttribute("href") || "";
          if (href && href !== "/") {
            currentUserHandle = href.replace(/^\//, "").toLowerCase();
          }
        }
      } catch (e) {}
    }
    return currentUserHandle || "";
  }
  /** 从当前页面 URL 提取推文作者 handle（如 x.com/fuckxegg2/status/... → fuckxegg2） */
  function getPageTweetAuthorHandle() {
    var m = location.pathname.match(/^\/(\w+)\/status\//);
    return m ? m[1].toLowerCase() : null;
  }
  /** 等待 handle 就绪（重试 DOM 最多 8 秒） */
  async function waitForMyHandle() {
    if (currentUserHandle) return currentUserHandle;
    if (!myHandlePromise) {
      myHandlePromise = new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 16; // 8秒
        function poll() {
          const h = getMyHandle();
          if (h) { resolve(h); return; }
          attempts++;
          if (attempts >= maxAttempts) { resolve(""); return; }
          setTimeout(poll, 500);
        }
        poll();
      });
    }
    return await myHandlePromise;
  }

  // 加载自动屏蔽设置
  (async function() {
    try {
      const data = await chrome.storage.local.get("mv3AutoBlock");
      autoBlockEnabled = data.mv3AutoBlock !== false;
    } catch (e) {}
  })();

  /** 等待 SpamEngine 就绪后，扫描当前页面所有回复文本进行特征检测 */
  async function scanWithVectorDB() {
    if (vectorScanRunning) return;
    vectorScanRunning = true;
    try {
      if (typeof window.SpamEngine === "undefined" || !window.SpamEngine.ready()) {
        if (!vectorScanQueued) {
          vectorScanQueued = true;
          window.SpamEngine?.onReady(() => { vectorScanQueued = false; scanWithVectorDB(); });
        }
        return;
      }

      const allArticles = document.querySelectorAll('article');
      const myHandle = await waitForMyHandle();
      const pageAuthorHandle = getPageTweetAuthorHandle();
      for (const article of allArticles) {
        const handle = getArticleHandle(article);
        // 跳过自己、已建议、已检测过的、以及主推文作者（url 中的 handle）
        if (!handle || suggestedAccounts.has(handle) || article.classList.contains("flagged-spam") || (myHandle && handle.toLowerCase() === myHandle) || (pageAuthorHandle && handle.toLowerCase() === pageAuthorHandle)) continue;
        const replyText = getArticleReplyText(article);
        // 回复文本为空时不跳过，可能名字本身就是垃圾（如纯 emoji 回复）

        // 认证账号（蓝V/金V/灰V）跳过检测
        if (isVerifiedAccount(article)) continue;

        try {
          const displayName = getArticleDisplayName(article);

          // --- 特征检测 ---

          let featureResult = null;
          if (replyText && replyText.length > 0) {
            const r = window.SpamEngine.detectScam(replyText, handle, pageAuthorHandle);
            if (r.isScam) { featureResult = r; }
          }

          if (!featureResult && displayName) {
            const r = window.SpamEngine.detectScam(displayName, handle, pageAuthorHandle);
            if (r.isScam) { featureResult = r; }
          }

          // 3. 转发数量检测：评论有大量转发是典型的垃圾互刷特征
          var shareCount = getArticleShareCount(article);
          if (shareCount > 0) {
            if (featureResult) {
              featureResult.score += 2;
              featureResult.features.push({ k: "\u8f6c\u53d1\u91cf", v: shareCount + "", p: 2 });
              if (featureResult.score >= 3) featureResult.isScam = true;
            } else {
              featureResult = { isScam: shareCount >= 5, score: shareCount >= 5 ? 4 : 0, features: [{ k: "\u8f6c\u53d1\u91cf", v: shareCount + "", p: shareCount >= 5 ? 4 : 0 }], matchedKeyword: null, matchedRedirect: null };
            }
          }

          if (featureResult) {
            article.classList.add("flagged-spam");
            injectFeatureBadge(article, handle, featureResult);
            console.log("[CAO] detected spam, saving history for", handle);
            // 记录检测结果（无论自动屏蔽是否开启）
            await saveBlockHistory(handle, displayName, getArticleAvatar(article));
            console.log("[CAO] history saved, now auto-blocking", handle);
            // 自动屏蔽 + 自动隐藏
            await autoBlockAndHide(article, handle);
          }
        } catch (e) {
        }
      }
    } finally {
      vectorScanRunning = false;
    }
  }

  /** 自动屏蔽账号并隐藏回复 */
  async function autoBlockAndHide(article, handle) {
    if (!autoBlockEnabled) return;
    // 安全兜底：防止对自己执行屏蔽
    if (handle) {
      var h = handle.toLowerCase();
      var myH = (currentUserHandle || "").toLowerCase();
      var pageAuthor = getPageTweetAuthorHandle();
      if ((myH && h === myH) || (pageAuthor && h === pageAuthor)) return;
    }
    const blockResult = await blockArticleUser(article);
    if (blockResult && (blockResult.ok || blockResult.alreadyBlocked)) {
      blockedAccounts.add(handle);
      try {
        const d = await chrome.storage.local.get({ [storageKey]: [] });
        const list = d[storageKey] || [];
        if (!list.includes(handle)) {
          list.push(handle);
          await chrome.storage.local.set({ [storageKey]: list.sort() });
        }
      } catch (e) {}
      // 屏蔽成功后直接隐藏该回复
      article.classList.add(garbageHiddenClass);
      article.dataset.caoHidden = "1";
      hideBlockedAccountsSoon();
    }
  }

  /** 打开自动屏蔽后，重新屏蔽所有已标记但尚未隐藏的账号 */
  function processPendingAutoBlocks() {
    const allArticles = document.querySelectorAll('article.flagged-spam');
    for (const article of allArticles) {
      const handle = getArticleHandle(article);
      if (!handle || blockedAccounts.has(handle)) continue;
      autoBlockAndHide(article, handle);
    }
  }

  /** 在指定的 article 中注入特征标签（无屏蔽按钮） */
  function injectFeatureBadge(article, handle, featureResult) {
    const userNameRoot = article.querySelector('[data-testid="User-Name"]');
    if (!userNameRoot) return;

    let featureLabel = null;
    if (featureResult) {
      const txt = featureResult.matchedKeyword || featureResult.matchedRedirect || featureResult.features[0]?.v || "";
      featureLabel = `🔑 ${txt.length > 16 ? txt.slice(0, 16) + "…" : txt}`;
    }

    // 特征信息提示（只显示 badge，无屏蔽按钮）
    if (featureLabel) {
      // 避免重复注入
      if (userNameRoot.querySelector(".mv3-feature-badge")) return;
      const h = document.createElement("span");
      h.className = "mv3-feature-badge";
      h.textContent = featureLabel;
      h.style.cssText = [
        "display:inline-block",
        "font:600 10px/1.2 Arial,sans-serif",
        "color:#92400e",
        "background:#fef3c7",
        "border:1px solid #fde68a",
        "border-radius:3px",
        "padding:1px 4px",
        "max-width:160px",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:nowrap",
        "vertical-align:middle",
        "margin-left:3px",
      ].join(";");
      h.title = `命中特征: ${featureResult.matchedKeyword || featureResult.matchedRedirect || featureResult.features.map(function(f){return f.k+":"+f.v}).join(", ")}`;
      userNameRoot.appendChild(h);
    }
  }

  // 当 SpamEngine 就绪时，自动触发一次扫描
  if (typeof window.SpamEngine !== "undefined") {
    window.SpamEngine.onReady(() => {
      if (isTweetDetailPage()) scanWithVectorDB();
    });
  }

  // ── 消息处理器 ──
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message) return;

      // block.html 通知重新加载关键词
      if (message.type === "MV3_RELOAD_KEYWORDS") {
        window.SpamEngine?.loadCustomKeywords().then(() => sendResponse({ ok: true }));
        return true;
      }

      // block.html 切换自动屏蔽
      if (message.type === "MV3_AUTO_BLOCK_TOGGLE") {
        autoBlockEnabled = !!message.enabled;
        if (autoBlockEnabled) {
          // 打开自动屏蔽后，重新处理已标记 flagged-spam 但尚未屏蔽的账号
          processPendingAutoBlocks();
        }
        sendResponse({ ok: true });
        return true;
      }

      // 获取屏蔽历史
      if (message.type === "MV3_GET_BLOCK_HISTORY") {
        chrome.storage.local.get(blockHistoryKey).then(function(d) {
          var list = d[blockHistoryKey] || [];
          sendResponse({ ok: true, list: list });
        });
        return true;
      }

      // block.html 解除屏蔽：从 blockedAccounts 移除
      if (message.type === "MV3_UNBLOCK") {
        blockedAccounts.delete(normalizeHandle(message.handle));
        // 同时从持久存储 mv3BlockedTwitterAccounts 中移除，避免页面刷新后重新加载
        chrome.storage.local.get({ [storageKey]: [] }).then(function(d) {
          var list = d[storageKey] || [];
          var nh = message.handle.toLowerCase();
          var idx = list.indexOf(nh);
          if (idx !== -1) {
            list.splice(idx, 1);
            chrome.storage.local.set({ [storageKey]: list });
          }
        });
        sendResponse({ ok: true });
        return true;
      }

      // 获取 CSRF token
      if (message.type === "MV3_GET_CSRF") {
        var csrf = (document.cookie.match(/\bct0=([^;]+)/) || [])[1] || "";
        sendResponse({ csrf: csrf });
        return true;
      }
    });
  }

})();
