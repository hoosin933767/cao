(function () {
  "use strict";

  // ── 屏蔽记录 ──

  const HISTORY_KEY = "mv3BlockHistory";
  const HISTORY_PAGE_SIZE = 20;

  const $historyBody = document.getElementById("historyBody");
  const $historyEmpty = document.getElementById("historyEmpty");
  const $historySummary = document.getElementById("historySummary");
  const $historyPageInfo = document.getElementById("historyPageInfo");
  const $historyPrev = document.getElementById("historyPrevBtn");
  const $historyNext = document.getElementById("historyNextBtn");

  let history = [];
  let historyPage = 1;

  async function loadHistory() {
    try {
      const d = await chrome.storage.local.get(HISTORY_KEY);
      history = d[HISTORY_KEY] || [];
      console.log("[CAO] block.js loaded", history.length, "records");
    } catch (e) { history = []; console.warn("[CAO] block.js load error:", e); }
    historyPage = 1;
    renderHistory();
  }

  function renderHistory() {
    if (!history.length) {
      $historyBody.innerHTML = "";
      $historyEmpty.style.display = "block";
      $historyPageInfo.textContent = "暂无屏蔽记录";
      $historySummary.textContent = "暂无屏蔽记录";
      return;
    }
    $historyEmpty.style.display = "none";
    const totalPages = Math.ceil(history.length / HISTORY_PAGE_SIZE);
    if (historyPage > totalPages) historyPage = totalPages;
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    const pageItems = history.slice(start, start + HISTORY_PAGE_SIZE);

    $historyBody.innerHTML = pageItems.map(function(item) {
      var avatarHtml = item.avatar ? '<img src="' + item.avatar.replace(/"/g,"&quot;") + '" class="history-avatar" alt="">' : '<span class="history-avatar-placeholder">?</span>';
      var safeHandle = h(item.handle);
      var attrHandle = item.handle.replace(/"/g,"&quot;");
      return '<tr>' +
        '<td>' +
          '<a class="history-account" href="https://x.com/' + safeHandle + '" target="_blank">' +
            avatarHtml +
            '<span class="history-name">' + h(item.name || item.handle) + '</span>' +
            '<span class="history-handle">@' + safeHandle + '</span>' +
          '</a>' +
        '</td>' +
        '<td class="date-cell">' + formatBlockTime(item.blockedAt) + '</td>' +
        '<td><button type="button" class="unblock-btn" data-handle="' + attrHandle + '">解除屏蔽</button></td>' +
      '</tr>';
    }).join("");

    $historyPageInfo.textContent = '第 ' + historyPage + ' / ' + totalPages + ' 页，共 ' + history.length + ' 条';
    $historyPrev.disabled = historyPage <= 1;
    $historyNext.disabled = historyPage >= totalPages;
    $historySummary.textContent = '共 ' + history.length + ' 条屏蔽记录';

    // 绑定解除屏蔽按钮
    $historyBody.querySelectorAll(".unblock-btn").forEach(function(el) {
      el.addEventListener("click", function(e) {
        e.preventDefault();
        unblockHistoryItem(el.dataset.handle, el);
      });
    });
  }

  async function removeFromHistory(handle) {
    try {
      history = history.filter(function(item) {
        return item.handle.toLowerCase() !== handle.toLowerCase();
      });
      await chrome.storage.local.set({ [HISTORY_KEY]: history });
      renderHistory();
      // 通知 content script 从 blockedAccounts 移除
      var tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
      for (var t of tabs) {
        try { await chrome.tabs.sendMessage(t.id, { type: "MV3_UNBLOCK", handle: handle }); } catch (e) {}
      }
    } catch (e) {}
  }

  async function unblockHistoryItem(handle, btnEl) {
    // 先调用 X API 解除屏蔽
    btnEl.disabled = true;
    btnEl.textContent = "解除中…";
    try {
      var CSRF_TOKEN = await getXCSRFToken();
      if (CSRF_TOKEN) {
        var resp = await fetch("https://x.com/i/api/1.1/blocks/destroy.json?screen_name=" + encodeURIComponent(handle), {
          method: "POST",
          credentials: "include",
          headers: {
            "x-csrf-token": CSRF_TOKEN,
            "x-twitter-active-user": "yes",
            "x-twitter-auth-type": "OAuth2Session",
            "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
          }
        });
        console.log("[block] unblock history status=" + resp.status);
      }
    } catch (e) { console.warn("[block] unblock API error:", e); }
    // 无论 API 成功与否，都从本地历史和 blockedAccounts 移除
    await removeFromHistory(handle);
    btnEl.textContent = "✅ 已解除";
    setTimeout(function() { btnEl.textContent = "解除屏蔽"; btnEl.disabled = false; }, 2000);
  }

  function formatBlockTime(ts) {
    if (!ts) return "-";
    var diff = Date.now() - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
    if (diff < 604800000) return Math.floor(diff / 86400000) + " 天前";
    return new Date(ts).toLocaleString();
  }

  $historyPrev.addEventListener("click", function() { if (historyPage > 1) { historyPage--; renderHistory(); } });
  $historyNext.addEventListener("click", function() { if (historyPage < Math.ceil(history.length / HISTORY_PAGE_SIZE)) { historyPage++; renderHistory(); } });

  loadHistory();

  function h(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  // ── 关键词管理 ──

  const CAT_LABELS = { adultStrong: "成人强", adultWeak: "成人弱", promo: "推广", redirect: "引流" };
  // 系统内置关键词（同步自 spam-engine.js）
  const SYSTEM_KEYWORDS = {
    adultStrong: ["约炮","炮友","yp","裸聊","色色","色情","打飞机","破处","处男","约P","约啪","固炮","寻炮","看片"],
    adultWeak: ["骚","处女","涩","上门","空降","同城","私密","刺激","诱惑","妹子","少妇","同城约","约爱","资源","成人内容","无偿","交友"],
    promo: ["线下资源","线下约","线更新","同步更新","真实可靠"],
    redirect: ["看简介","点简介","点我头像","点主页","点我主页","看主页","简介有","点击主页","戳主页","点我","个人主页","看个人主页","看置顶","置顶推文","置顶有","简介","主页有","的主页"],
  };
  const $kwCount = document.getElementById("kwCount");
  const $kwTabs = document.getElementById("kwTabs");
  const $kwList = document.getElementById("kwList");
  const $kwInput = document.getElementById("kwInput");
  const $kwCategory = document.getElementById("kwCategory");
  const $kwAddBtn = document.getElementById("kwAddBtn");
  const $kwInfo = document.getElementById("kwInfo");

  let kwData = { adultStrong: [], adultWeak: [], promo: [], redirect: [] };
  let kwActiveCat = "adultStrong";

  async function loadKeywordsAndRender() {
    try {
      const data = await chrome.storage.local.get("mv3CustomKeywords");
      const d = data.mv3CustomKeywords || {};
      kwData = {
        adultStrong: Array.isArray(d.adultStrong) ? d.adultStrong : [],
        adultWeak: Array.isArray(d.adultWeak) ? d.adultWeak : [],
        promo: Array.isArray(d.promo) ? d.promo : [],
        redirect: Array.isArray(d.redirect) ? d.redirect : [],
      };
    } catch (e) {}
    renderKeywords();
    notifyXTab();
  }

  function renderKeywords() {
    const customList = kwData[kwActiveCat] || [];
    const systemList = SYSTEM_KEYWORDS[kwActiveCat] || [];
    const total = Object.values(kwData).reduce((s, a) => s + a.length, 0);
    $kwCount.textContent = `(${total})`;
    if (!systemList.length && !customList.length) {
      $kwList.innerHTML = '<div class="kw-empty">暂无关键词</div>';
      return;
    }
    var html = '';
    // 系统内置关键词
    if (systemList.length) {
      html += '<div class="kw-subtitle">系统内置</div>';
      html += systemList.map(function(w) {
        return '<span class="kw-chip kw-system">' + h(w) + '</span>';
      }).join('');
    }
    // 自定义关键词（可删除）
    if (customList.length) {
      html += '<div class="kw-subtitle">自定义</div>';
      html += customList.map(function(w) {
        var safe = h(w);
        return '<span class="kw-chip">' + safe + '<span class="kw-del" data-word="' + safe.replace(/"/g,"&quot;") + '">×</span></span>';
      }).join('');
    }
    $kwList.innerHTML = html;
    // 绑定删除
    $kwList.querySelectorAll(".kw-del").forEach(function(el) {
      el.addEventListener("click", function() {
        const word = el.dataset.word;
        kwData[kwActiveCat] = kwData[kwActiveCat].filter(function(w2) { return w2 !== word; });
        saveCurrentKeywords();
        renderKeywords();
      });
    });
  }

  async function saveCurrentKeywords() {
    try {
      await chrome.storage.local.set({ mv3CustomKeywords: kwData });
      notifyXTab();
    } catch (e) {}
    $kwInfo.textContent = "✅ 已保存";
    setTimeout(function() { $kwInfo.textContent = ""; }, 2000);
  }

  async function notifyXTab() {
    try {
      const tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
      for (const tab of tabs) {
        try { await chrome.tabs.sendMessage(tab.id, { type: "MV3_RELOAD_KEYWORDS" }); } catch (e) {}
      }
    } catch (e) {}
  }

  // Tab 切换
  $kwTabs.addEventListener("click", function(e) {
    const tab = e.target.closest(".kw-tab");
    if (!tab) return;
    const cat = tab.dataset.cat;
    if (cat === kwActiveCat) return;
    kwActiveCat = cat;
    $kwTabs.querySelectorAll(".kw-tab").forEach(function(t) { t.classList.remove("active"); });
    tab.classList.add("active");
    renderKeywords();
  });

  // 添加关键词
  $kwAddBtn.addEventListener("click", function() {
    const word = $kwInput.value.trim();
    if (!word) { $kwInfo.textContent = "请输入关键词"; return; }
    const cat = $kwCategory.value;
    if (!kwData[cat]) kwData[cat] = [];
    if (kwData[cat].indexOf(word) !== -1) { $kwInfo.textContent = "该关键词已存在"; return; }
    kwData[cat].push(word);
    saveCurrentKeywords();
    $kwInput.value = "";
    if (cat !== kwActiveCat) {
      // 切换到对应的 tab
      kwActiveCat = cat;
      $kwTabs.querySelectorAll(".kw-tab").forEach(function(t) { t.classList.remove("active"); });
      $kwTabs.querySelector('[data-cat="' + cat + '"]').classList.add("active");
    }
    renderKeywords();
  });
  $kwInput.addEventListener("keydown", function(e) { if (e.key === "Enter") $kwAddBtn.click(); });

  loadKeywordsAndRender();

  // ── 自动屏蔽开关 ──

  const $autoBlockToggle = document.getElementById("autoBlockToggle");

  async function loadAutoBlockSetting() {
    try {
      const data = await chrome.storage.local.get("mv3AutoBlock");
      const enabled = data.mv3AutoBlock !== false;
      $autoBlockToggle.checked = enabled;
    } catch (e) {}
  }

  async function saveAutoBlockSetting(enabled) {
    try {
      await chrome.storage.local.set({ mv3AutoBlock: enabled });
      const tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
      for (const tab of tabs) {
        try { await chrome.tabs.sendMessage(tab.id, { type: "MV3_AUTO_BLOCK_TOGGLE", enabled }); } catch (e) {}
      }
    } catch (e) {}
  }

  $autoBlockToggle.addEventListener("change", function() {
    saveAutoBlockSetting($autoBlockToggle.checked);
  });

  loadAutoBlockSetting();

  // ── X 屏蔽列表 ──

  const BLOCKED_CACHE_KEY = "mv3XBlockedCache";
  const PAGE_SIZE = 20;
  const $blockedSection = document.querySelector(".blocked-section");
  const $syncBlockedBtn = document.getElementById("syncBlockedBtn");
  const $blockedStatus = document.getElementById("blockedStatus");
  const $blockedList = document.getElementById("blockedList");
  const $blockedCount = document.getElementById("blockedCount");
  var blockedListData = [];
  var blockedPage = 1;

  function sortBlockedByFollowers(list) {
    return list.sort(function(a, b) { return (b.followers || 0) - (a.followers || 0); });
  }

  // 加载本地缓存
  loadBlockedCache();
  async function loadBlockedCache() {
    try {
      var data = await chrome.storage.local.get(BLOCKED_CACHE_KEY);
      var cached = data[BLOCKED_CACHE_KEY];
      if (cached && Array.isArray(cached.list) && cached.list.length) {
        blockedListData = sortBlockedByFollowers(cached.list);
        renderXBlockedList(blockedListData);
        $blockedStatus.textContent = "本地缓存，共 " + cached.list.length + " 个";
      }
    } catch (e) {}
  }

  async function saveBlockedCache(list) {
    try {
      await chrome.storage.local.set({ [BLOCKED_CACHE_KEY]: { list: list, savedAt: Date.now() } });
    } catch (e) {}
  }

  async function fetchXBlockedList() {
    $blockedStatus.textContent = "读取中…";
    try {
      var list = await fetchBlockedListDirect();
      if (list && list.length) {
        blockedListData = sortBlockedByFollowers(list);
        blockedPage = 1;
        saveBlockedCache(blockedListData);
        renderXBlockedList(blockedListData);
        $blockedStatus.textContent = "共 " + list.length + " 个";
      } else {
        $blockedStatus.textContent = "读取失败，请确认 X 已登录";
      }
    } catch (e) {
      $blockedStatus.textContent = "读取失败: " + e.message;
    }
  }

  /** 从 extension 上下文直接发 fetch（不走 content script，不受 CSP/cookie 隔离限制） */
  async function getXCSRFToken() {
    try {
      var cookie = await chrome.cookies.get({ url: "https://x.com", name: "ct0" });
      if (cookie) return cookie.value;
    } catch (e) {}
    var tabs = await chrome.tabs.query({ url: ["https://x.com/*", "https://twitter.com/*"] });
    if (tabs.length) {
      try {
        var r = await chrome.tabs.sendMessage(tabs[0].id, { type: "MV3_GET_CSRF" });
        if (r && r.csrf) return r.csrf;
      } catch (e) {}
    }
    return "";
  }

  /** 解除屏蔽某个账号 */
  async function unblockHandle(handle, btnEl) {
    try {
      var CSRF_TOKEN = await getXCSRFToken();
      if (!CSRF_TOKEN) { alert("获取 CSRF token 失败，请刷新 X 页面后重试"); return; }
      btnEl.disabled = true;
      btnEl.textContent = "解除中…";
      var resp = await fetch("https://x.com/i/api/1.1/blocks/destroy.json?screen_name=" + encodeURIComponent(handle), {
        method: "POST",
        credentials: "include",
        headers: {
          "x-csrf-token": CSRF_TOKEN,
          "x-twitter-active-user": "yes",
          "x-twitter-auth-type": "OAuth2Session",
          "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
        }
      });
      var text = await resp.text();
      console.log("[block] unblock response status=" + resp.status + " body=" + text.slice(0, 300));
      if (resp.ok) {
        btnEl.textContent = "✅ 已解除";
        setTimeout(function() {
          blockedListData = blockedListData.filter(function(item) {
            var h = item.handle || item;
            return h.toLowerCase() !== handle.toLowerCase();
          });
          saveBlockedCache(blockedListData);
          renderXBlockedList(blockedListData);
        }, 800);
      } else {
        console.warn("[block] unblock HTTP", resp.status, text.slice(0, 500));
        btnEl.disabled = false;
        btnEl.textContent = "解除失败";
        setTimeout(function() { btnEl.textContent = "解除屏蔽"; }, 2000);
      }
    } catch (e) {
      btnEl.disabled = false;
      btnEl.textContent = "解除失败";
      console.warn("[block] unblock error:", e);
    }
  }

  /** 从 extension 上下文直接发 fetch */
  async function fetchBlockedListDirect() {
    var CSRF_TOKEN = await getXCSRFToken();
    if (!CSRF_TOKEN) { return []; }
    var all = [];
    var cursor = "-1";
    for (var page = 0; page < 5; page++) {
      var resp = await fetch("https://x.com/i/api/1.1/blocks/list.json?count=200&cursor=" + encodeURIComponent(cursor), {
        credentials: "include",
        headers: {
          "x-csrf-token": CSRF_TOKEN,
          "x-twitter-active-user": "yes",
          "x-twitter-auth-type": "OAuth2Session",
          "authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
        }
      });
      if (!resp.ok) {
        console.warn("[block] API HTTP", resp.status);
        if (resp.status === 429) break;
        continue;
      }
      var data = await resp.json();
      var users = data.users || [];
      users.forEach(function(u) {
        if (u.screen_name) all.push({ handle: u.screen_name, name: u.name || u.screen_name, avatar: (u.profile_image_url_https || "").replace("_normal.", "_bigger."), followers: u.followers_count || 0 });
      });
      cursor = data.next_cursor_str || data.next_cursor;
      if (!cursor || cursor === "0" || cursor === 0) break;
    }
    return all;
  }

  function renderXBlockedList(list) {
    $blockedCount.textContent = "(" + list.length + ")";
    if (!list.length) {
      $blockedList.innerHTML = '<div class="kw-empty">没有已屏蔽的账号</div>';
      return;
    }
    var totalPages = Math.ceil(list.length / PAGE_SIZE);
    if (blockedPage > totalPages) blockedPage = totalPages;
    var start = (blockedPage - 1) * PAGE_SIZE;
    var pageItems = list.slice(start, start + PAGE_SIZE);

    var html = pageItems.map(function(item) {
      var handle = item.handle || item;
      var name = item.name || handle;
      var avatar = item.avatar || "";
      var followers = item.followers || 0;
      var followersText = followers >= 10000 ? (followers / 10000).toFixed(1) + "万" : followers >= 1000 ? (followers / 1000).toFixed(1) + "千" : String(followers);
      var avatarHtml = avatar ? '<img src="' + avatar.replace(/"/g,"&quot;") + '" class="blocked-avatar" alt="">' : '<span class="blocked-avatar-placeholder">?</span>';
      var safeHandle = h(handle);
      var attrHandle = handle.replace(/"/g,"&quot;");
      return '<div class="blocked-item-wrap">' +
        '<a class="blocked-avatar-link" href="https://x.com/' + safeHandle + '" target="_blank" rel="noopener noreferrer">' + avatarHtml + '</a>' +
        '<a class="blocked-info-block" href="https://x.com/' + safeHandle + '" target="_blank" rel="noopener noreferrer">' +
          '<div class="blocked-name">' + h(name) + '</div>' +
          '<div class="blocked-handle-row">@' + safeHandle + (followers ? ' · <span class="blocked-handle-followers">' + followersText + '</span>' : '') + '</div>' +
        '</a>' +
        '<button type="button" class="unblock-btn" data-handle="' + attrHandle + '">解除屏蔽</button>' +
      '</div>';
    }).join("");

    // 分页导航（先加到 html 里，一次性 innerHTML，事件不会丢失）
    if (totalPages > 1) {
      html += '<div class="blocked-pagination">';
      html += '<button type="button" class="blocked-page-btn" data-page="prev"' + (blockedPage <= 1 ? ' disabled' : '') + '>上一页</button>';
      html += '<span class="blocked-page-info">第 ' + blockedPage + ' / ' + totalPages + ' 页</span>';
      html += '<button type="button" class="blocked-page-btn" data-page="next"' + (blockedPage >= totalPages ? ' disabled' : '') + '>下一页</button>';
      html += '</div>';
    }

    $blockedList.innerHTML = html;

    // 绑定解除屏蔽按钮
    $blockedList.querySelectorAll(".unblock-btn").forEach(function(el) {
      el.addEventListener("click", function(e) {
        e.preventDefault();
        unblockHandle(el.dataset.handle, el);
      });
    });

    // 绑定分页按钮
    $blockedList.querySelectorAll(".blocked-page-btn").forEach(function(el) {
      el.addEventListener("click", function() {
        if (el.dataset.page === "prev" && blockedPage > 1) blockedPage--;
        else if (el.dataset.page === "next" && blockedPage < totalPages) blockedPage++;
        else return;
        renderXBlockedList(blockedListData);
      });
    });
  }

  $syncBlockedBtn.addEventListener("click", fetchXBlockedList);

  // ── TAB 切换 ──

  const $tabNav = document.getElementById("mainTabs");
  if ($tabNav) {
    $tabNav.addEventListener("click", function(e) {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (!tab) return;

      // Update button states
      $tabNav.querySelectorAll(".tab-btn").forEach(function(t) { t.classList.remove("active"); });
      btn.classList.add("active");

      // Show/hide tab content
      document.querySelectorAll(".tab-content").forEach(function(c) { c.classList.remove("active"); });
      var target = document.getElementById("tab-" + tab);
      if (target) target.classList.add("active");
    });
  }
})();
