// ═══════════════════════════════════════════════════════════
//  block-engine.js — 屏蔽引擎（完全自包含，不依赖其他模块）
//
//  功能：
//    1. DOM 模拟点击屏蔽（SPA 导航 + location.href 全页兜底）
//    2. 批量屏蔽（API fetch 顺序执行，2500ms 间隔）
//    3. 解除屏蔽
//    4. 屏蔽状态查询（API）
//    5. 监听 chrome.storage.onChanged 同步 blockedAccounts
//
//  暴露 API（通过 window.BlockEngine）：
//    - blockUser(handle)           → 屏蔽单个用户
//    - unblockUser(handle)         → 解除屏蔽
//    - batchBlock(handles)         → 批量屏蔽
//    - checkBlockStatus(handle)    → 查询屏蔽状态
//    - checkSuspended(handle)       → 查询冻结状态
//    - getBlockedAccounts()         → 获取已屏蔽集合
//    - onChanged                    → 回调（blockedAccounts 变化时触发）
//
//  ⚠ 不要修改此文件，除非你在修改屏蔽逻辑本身
// ═══════════════════════════════════════════════════════════

(function () {
  "use strict";

  // ── 常量 ──
  const STORAGE_KEY = "mv3BlockedTwitterAccounts";
  const SUSPENDED_KEY = "mv3SuspendedAccounts";
  const PENDING_BLOCK_KEY = "mv3PendingBlock";
  const PENDING_BATCH_KEY = "mv3PendingBatch";
  const BLOCK_HISTORY_KEY = "mv3BlockHistory";
  const MAX_BLOCK_HISTORY = 100;
  const NAV_HELPER_URL =
    (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL("nav-helper.js")
      : "";

  // ── 内部状态 ──
  const blockedAccounts = new Set();

  // ── 回调（content.js 设置，用于在 blockedAccounts 变化时触发隐藏更新）──
  let onChangeCallback = null;
  function notifyChanged() {
    if (onChangeCallback) onChangeCallback();
  }

  async function saveBlockHistory(handle) {
    try {
      const d = await chrome.storage.local.get({ [BLOCK_HISTORY_KEY]: [] });
      const list = d[BLOCK_HISTORY_KEY] || [];
      list.unshift({ handle: handle.toLowerCase(), name: handle, avatar: "", blockedAt: Date.now() });
      if (list.length > MAX_BLOCK_HISTORY) list.length = MAX_BLOCK_HISTORY;
      await chrome.storage.local.set({ [BLOCK_HISTORY_KEY]: list });
      // 触发浮动按钮呼吸（闪绿）
      var fb = document.getElementById("cao-floater");
      if (fb) {
        fb.classList.add("active");
        var fbImg = fb.querySelector("img");
        if (fbImg) {
          fbImg.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACjUlEQVR4nOWXwUuTYRzHP793mw2SwkNm0caa9BcUpE5pHqs/oC7OZSDZQalbt27RTQSJhNSpQdAhuniIYAunRhjUvXTMsLJDCkbT6fvrkJtr2zte53wvfU/v+zwPv8/nffc+7PfA/x6xuzAcD7uXPf4O4IoKLcBJlNO7VVaA76K8BaZ92fRMojOxXROBQDzqNTzah+g94IRN3x+oPDCz8ijVOZ6pWiAw13XJUJkEfOXmd779AsDVdNSqxLIp2pVqm3xjtcCwmmie6+41VF5ZwW3GZ6i8Ds5FBvYlEJzt7lPVx0DdAeC5uFEGg8muW7YEgslIO+hgDcD/RmSoORnprCgQiEe9CE+pzZMXx6PCeCAe9VoKGHXmbcB/CPBc/IZH+woH8rvg/EKv5+dm5gvQaLeajV1QLqsNR7xn3l8YyULBG1jLZNr3Az9AGtd/b4VyN3s/gchVB+AAqJh5Vl5A0YvOCdBSIgCcckoAaCoV0L3BQ4/uPWzBN4A6JiCYpQLw1TGBAlZeQGDFKbqUE1ARy7/MWkchUSJgqrxwTMA086y8QCo0/gFYcIC/sNQx9bFEYPemHw51N6iqebeIuZdPoYl5EYYPiy7C8FL71IylAMDn1uCAIM9rDVd46dtM3ykeL23J5L4p68e6VIjVDC7EXOvHr5Vr1St2xcHZ7hugQ0B9uXkb/cAGSP9iKDZmtcCyKwZYDMXG3FvZs8BDYLPS2qJkFR0xPca5SnDYx8koMB8NiLlz00B6lL8nouI3ILBioqNquJ6kWsdTduraFsglHA+7015/mG25vrO60QPgaqwfxa3P/Jl0wu6RrGqBXJqTkcsqTAOocHGpbeJdNXUqfgOVogYNuWvZYa3aOn8AtA/RoewMXeIAAAAASUVORK5CYII=";
        }
        fb.classList.remove("ca-breathe");
        void fb.offsetWidth;
        fb.classList.add("ca-breathe");
        setTimeout(function() {
          fb.classList.remove("active");
          var img2 = fb.querySelector("img");
          if (img2) {
            img2.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACXElEQVR4nOWXz2vTYBzGP2+3wg6iCDLnYP2RiP+AoI5G7I7qsQcV1rd1wnAeHPWiR4/ePXlwrD0JUsSL11aWRFH/hZauwsSeVibYdVtfD2ZlXdc2jW0uPhBIwpfn+bxv3uSbF/53CbeF8UJ88nswdB24VTJy14DzmilnAcpGbgv4qZvyM/Bhbq+6UVwo7o+EMFJIT2lmKgPUAOXyqGlmKhMppKf+LdxO3gCqvYLC+YQK5xP9QKqOx/DS7dQysNvH3A2AAvY0W64OFa5ZqZUBpsMAKEBpZvKhu3BTGoNG7gUAaOqmXOgb7iyaTZeGwwIoYPP4wgwcvagsrD8CQq6myptCgaBaORHg8rflIPB0jOEAlI3sMyerE2C70TCA6XEDANP1381YFwBC3PYhHAAlWu2sNkAplr3qF4DzKe8EAC74BQDMdAFoppw5uXb00kzZHmwboGzklF8AZSPX6gIAfvgFcDSrDaBbcsuvdN2S3QBKiI9+AZRiuWIXQEuJd34BRDcWe2Z9xX1j8dKMlJPRVkczumjJx07RuKSi5uKTvhW6LV8yphlwvDsUOH6jNK+t6lbqrccR9lTUku/ndquZgQCI5y1RP52M2jI7snBbZifqZ+4M/auuWan7wA7eH8GO4+Fdlwr3zgEvgMYQAM2olXwV+ZIe2F9c74win9IR0Tp4EEAslWK5WYBwPgHAZiIP/P2atlBrKjDxujK/XnHj6xrgUPFCfLI6FYqzL+4e1H4tAUxMn1pjUr0JNarFkW3JBkk35U2cKY/a8opXn+63wKVUgLOH5+KAba8+fwDiE3CABCDILwAAAABJRU5ErkJggg==";
          }
        }, 2500);
      }
    } catch (e) {
      console.warn("[BlockEngine] saveBlockHistory error:", e);
    }
  }

  // ── 工具 ──

  function normalizeHandle(handle) {
    return handle.replace(/^@/, "").toLowerCase().trim();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * 等待 DOM 元素出现（MutationObserver）
   */
  function waitForSelector(selector, timeout) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }
      const obs = new MutationObserver(() => {
        const f = document.querySelector(selector);
        if (f) { obs.disconnect(); resolve(f); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
    });
  }

  // ── SPA 导航（通过 nav-helper.js 注入 MAIN world） ──

  function navigateInMainWorld(path) {
    return new Promise((resolve) => {
      if (!NAV_HELPER_URL) { resolve(); return; }
      const s = document.createElement("script");
      s.src = NAV_HELPER_URL + "?path=" + encodeURIComponent(path);
      document.body.appendChild(s);
      if (s.parentNode) setTimeout(() => s.parentNode.removeChild(s), 100);
      setTimeout(resolve, 600);
    });
  }

  // ── 注入式 fetch（查询 X API，不受 CSP 限制） ──

  function pageContextFetch(url, method, body) {
    return new Promise((resolve) => {
      const uid = "_mv3_f_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      const handler = (event) => {
        if (event.data && event.data._u === uid) {
          window.removeEventListener("message", handler);
          resolve(event.data.r);
        }
      };
      window.addEventListener("message", handler);

      const s = document.createElement("script");
      s.textContent = `(async()=>{
        var r={_u:${JSON.stringify(uid)},r:{}};
        try{
          var ct=document.cookie.split("; ").find(c=>c.startsWith("ct0="));
          var h={"content-type":"application/x-www-form-urlencoded"};
          if(ct) h["x-csrf-token"]=ct.split("=")[1];
          h["x-twitter-active-user"]="yes";
          h["x-twitter-auth-type"]="OAuth2Session";
          h["x-twitter-client-language"]="zh-cn";
          var opt={method:${JSON.stringify(method)},headers:h,credentials:"include"};
          if(${body ? "true" : "false"}) opt.body=${JSON.stringify(body || "")};
          var resp=await fetch(${JSON.stringify(url)},opt);
          if(resp.ok){
            r.r={ok:true};
            try{var j=await resp.json();r.r.data=j}catch(e){}
          }else{
            var t=await resp.text().catch(()=>"");
            r.r={ok:false,error:"HTTP "+resp.status+": "+t.slice(0,200)};
          }
        }catch(e){r.r={ok:false,error:e.message}}
        window.postMessage(r,"*");
      })();`;
      document.body.appendChild(s);
      if (s.parentNode) s.parentNode.removeChild(s);

      setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve({ ok: false, error: "timeout" });
      }, 15000);
    });
  }

  // ── 查询 API ──

  async function checkBlockStatus(handle) {
    const normalized = normalizeHandle(handle);
    if (!normalized) return { ok: false, error: "empty handle", blocked: false };
    return pageContextFetch(
      "https://x.com/i/api/1.1/friendships/show.json?target_screen_name=" + normalized,
      "GET", null
    ).then((result) => {
      if (result.ok) {
        return { ok: true, blocked: result.data?.relationship?.source?.blocking === true };
      }
      return { ok: false, error: result.error, blocked: false };
    });
  }

  async function checkSuspended(handle) {
    const normalized = normalizeHandle(handle);
    if (!normalized) return { ok: false, error: "empty handle", suspended: false };
    return pageContextFetch(
      "https://x.com/i/api/1.1/users/show.json?screen_name=" + normalized,
      "GET", null
    ).then((result) => {
      if (result.ok) return { ok: true, suspended: false };
      return { ok: true, suspended: (result.error || "").startsWith("HTTP 40") };
    });
  }

  // ── 当前页屏蔽操作（dom 点击序列） ──

  async function domBlockCurrentProfile(handle, originalUrl) {
    const moreBtn = await waitForSelector(
      'button[data-testid="userActions"], button[data-testid="caret"]',
      12000
    );
    if (!moreBtn) {
      return { ok: false, error: "page load timeout" };
    }

    moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    let blockItem = await waitForSelector('div[role="menuitem"][data-testid="block"]', 3000);
    if (!blockItem) {
      const unblockItem = await waitForSelector('div[role="menuitem"][data-testid="unblock"]', 3000);
      if (unblockItem) {
        return { ok: true, alreadyBlocked: true };
      }
      return { ok: false, error: "block menu item not found" };
    }

    blockItem.click();
    await sleep(500);

    const confirmBtn = await waitForSelector('button[data-testid="confirmationSheetConfirm"]', 3000);
    if (!confirmBtn) {
      return { ok: false, error: "confirm button not found" };
    }
    confirmBtn.click();
    await sleep(200);
    await saveBlockHistory(handle);
    return { ok: true };
  }

  async function domUnblockCurrentProfile(handle, originalUrl) {
    const result = await Promise.race([
      waitForSelector(
        'button[data-testid="userActions"], button[data-testid="caret"]',
        10000
      ),
    ]);

    const moreBtn = result;
    if (!moreBtn) {
      return { ok: false, error: "page load timeout" };
    }

    moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    let unblockItem = await waitForSelector('div[role="menuitem"][data-testid="unblock"]', 3000);
    if (!unblockItem) {
      const blockItem = await waitForSelector('div[role="menuitem"][data-testid="block"]', 3000);
      if (blockItem) {
        return { ok: true, alreadyUnblocked: true };
      }
      return { ok: false, error: "unblock menu item not found" };
    }

    unblockItem.click();
    await sleep(500);

    const confirmBtn = await waitForSelector('button[data-testid="confirmationSheetConfirm"]', 3000);
    if (!confirmBtn) {
      return { ok: false, error: "confirm button not found" };
    }
    confirmBtn.click();
    await sleep(800);

    return { ok: true };
  }

  // ── 解除屏蔽（外部入口） ──

  async function executeDomUnblockSequence(handle) {
    const originalUrl = window.location.href;

    if (window.location.pathname === "/" + handle) {
      return await domUnblockCurrentProfile(handle, originalUrl);
    }

    await navigateInMainWorld("/" + handle);
    const result = await domUnblockCurrentProfile(handle, originalUrl);

    if (!result.ok && !result.suspended) {
      const suspendResult = await checkSuspended(handle);
      if (suspendResult.ok && suspendResult.suspended) {
        if (originalUrl && window.location.href !== originalUrl) {
          await navigateInMainWorld(originalUrl);
        }
        return { ok: false, suspended: true };
      }
      const apiResult = await checkBlockStatus(handle);
      if (apiResult.ok && !apiResult.blocked) {
        if (originalUrl && window.location.href !== originalUrl) {
          await navigateInMainWorld(originalUrl);
        }
        return { ok: true, alreadyUnblocked: true };
      }
    }

    if (originalUrl && window.location.href !== originalUrl) {
      await navigateInMainWorld(originalUrl);
    }
    return result;
  }

  async function executeDomBlockSequence(handle, originalUrl) {
    if (!originalUrl) originalUrl = window.location.href;

    // 已在该页面？直接执行
    if (window.location.pathname === "/" + handle) {
      return await domBlockCurrentProfile(handle, originalUrl);
    }

    // 先尝试 SPA 导航
    await navigateInMainWorld("/" + handle);
    let result = await domBlockCurrentProfile(handle, originalUrl);

    // SPA 失败 → location.href 兜底（新页面由 processPendingBlock 接手）
    if (!result || (!result.ok && !result.alreadyBlocked && !result.suspended)) {
      try {
        await chrome.storage.local.set({
          [PENDING_BLOCK_KEY]: { handle, originalUrl, timestamp: Date.now() }
        });
      } catch (e) {
        console.warn("[BlockEngine] Pending save failed:", e);
      }
      window.location.href = window.location.origin + "/" + handle;
      return { ok: true, pending: true };
    }

    // 成功 → 导航回原页面
    if (originalUrl && window.location.pathname !== new URL(originalUrl).pathname) {
      await navigateInMainWorld(new URL(originalUrl).pathname);
    }
    return result;
  }

  // ── 单个屏蔽（外部入口：纯 DOM，不导航离开页面） ──

  async function blockUser(handle) {
    const normalized = normalizeHandle(handle);
    if (!normalized) return { ok: false, error: "empty handle" };
    // 单个屏蔽不走 location.href，避免 sendMessage 通道断开
    return executeDomBlockSequence(normalized);
  }

  // ── 解除屏蔽（外部入口） ──

  async function unblockUser(handle) {
    const normalized = normalizeHandle(handle);
    if (!normalized) return { ok: false, error: "empty handle" };
    const result = await executeDomUnblockSequence(normalized);
    // 解除成功后从 storage 和本地集合中移除
    if (result && (result.ok || result.alreadyUnblocked)) {
      blockedAccounts.delete(normalized);
      try {
        const data = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
        const list = (data[STORAGE_KEY] || []).filter(h => normalizeHandle(h) !== normalized);
        await chrome.storage.local.set({ [STORAGE_KEY]: list });
      } catch (e) {
        console.warn("[BlockEngine] unblock storage cleanup failed:", e);
      }
      notifyChanged();
    }
    return result;
  }

  // ── 批量屏蔽 ──

  async function batchBlock(handles) {
    const normalized = handles.map((h) => normalizeHandle(h)).filter(Boolean);
    if (normalized.length === 0) return { ok: false, error: "empty handles" };

    // 保存批量任务到 local storage（跨页面导航持久化）
    try {
      await chrome.storage.local.set({
        [PENDING_BATCH_KEY]: {
          handles: normalized,
          index: 0,
          results: [],
          originalUrl: window.location.href,
          timestamp: Date.now(),
        }
      });
    } catch (e) {
      console.warn("[BlockEngine] batchBlock save failed:", e);
    }

    // 导航到第一个账号主页
    window.location.href = window.location.origin + "/" + normalized[0];
    return { ok: true, results: normalized.map((h) => ({ handle: h, pending: true })) };
  }


  // ── 待处理批量屏蔽（页面导航后自动接手） ──

  async function processPendingBlock() {
    try {
      // 先检查批量任务
      const data = await chrome.storage.local.get({ [PENDING_BATCH_KEY]: null, [PENDING_BLOCK_KEY]: null });
      const pb = data[PENDING_BATCH_KEY];
      const singlePb = data[PENDING_BLOCK_KEY];

      // 处理单个 pending（executeDomBlockSequence 的 location.href 兜底）
      if (!pb && singlePb && singlePb.handle) {
        const nh = singlePb.handle.replace(/^@/, "").toLowerCase().trim();
        const currentPath = window.location.pathname.replace(/\/$/, "");
        if (currentPath === "/" + nh) {
          console.log("[BlockEngine] Processing single pending block for", nh);
          chrome.storage.local.remove(PENDING_BLOCK_KEY).catch(() => {});
          const result = await domBlockCurrentProfile(nh, singlePb.originalUrl);
          if (result && (result.ok || result.alreadyBlocked)) {
            blockedAccounts.add(nh);
            const blk = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
            const list = blk[STORAGE_KEY];
            if (!list.includes(nh)) { list.push(nh); await chrome.storage.local.set({ [STORAGE_KEY]: list.sort() }); }
          } else if (result && result.suspended) {
            const blk = await chrome.storage.local.get({ [SUSPENDED_KEY]: [] });
            const list = blk[SUSPENDED_KEY];
            if (!list.includes(nh)) { list.push(nh); await chrome.storage.local.set({ [SUSPENDED_KEY]: list }); }
          }
          if (singlePb.originalUrl && singlePb.originalUrl !== window.location.href) {
            window.location.href = singlePb.originalUrl;
          }
        }
        return;
      }

      // 处理批量任务
      if (!pb || !pb.handles) return;

      const idx = pb.index || 0;
      if (idx >= pb.handles.length) {
        chrome.storage.local.remove(PENDING_BATCH_KEY).catch(() => {});
        if (pb.originalUrl && pb.originalUrl !== window.location.href) {
          window.location.href = pb.originalUrl;
        }
        return;
      }

      const handle = pb.handles[idx];
      const originalUrl = pb.originalUrl;
      const nh = handle.replace(/^@/, "").toLowerCase().trim();

      // 确认在正确的用户主页
      const currentPath = window.location.pathname.replace(/\/$/, "");
      if (currentPath !== "/" + nh) {
        console.warn("[BlockEngine] Batch page mismatch:", currentPath, "!=", "/" + nh);
        return;
      }

      console.log("[BlockEngine] Batch processing", nh, `(${idx+1}/${pb.handles.length})`);

      // 执行 DOM 屏蔽
      const result = await executeDomBlockSequence(nh);

      if (result && (result.ok || result.alreadyBlocked)) {
        blockedAccounts.add(nh);
        try {
          const blk = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
          const list = blk[STORAGE_KEY];
          if (!list.includes(nh)) {
            list.push(nh);
            await chrome.storage.local.set({ [STORAGE_KEY]: list.sort() });
          }
        } catch (e) {
          console.warn("[BlockEngine] Storage save failed:", e);
        }
        pb.results = pb.results || [];
        pb.results.push({ handle: nh, ok: true });
      } else if (result && result.suspended) {
        try {
          const blk = await chrome.storage.local.get({ [SUSPENDED_KEY]: [] });
          const list = blk[SUSPENDED_KEY];
          if (!list.includes(nh)) {
            list.push(nh);
            await chrome.storage.local.set({ [SUSPENDED_KEY]: list });
          }
        } catch (e) {
          console.warn("[BlockEngine] Storage save failed:", e);
        }
        pb.results = pb.results || [];
        pb.results.push({ handle: nh, suspended: true });
      } else {
        pb.results = pb.results || [];
        pb.results.push({ handle: nh, ok: false, error: result?.error || "block failed" });
      }

      // 前进到下一个
      pb.index = idx + 1;
      try { await chrome.storage.local.set({ [PENDING_BATCH_KEY]: pb }); } catch (e) {}

      if (pb.index < pb.handles.length) {
        console.log("[BlockEngine] Batch continuing to", pb.handles[pb.index]);
        window.location.href = window.location.origin + "/" + pb.handles[pb.index];
      } else {
        console.log("[BlockEngine] Batch complete");
        chrome.storage.local.remove(PENDING_BATCH_KEY).catch(() => {});
        if (pb.originalUrl && pb.originalUrl !== window.location.href) {
          window.location.href = pb.originalUrl;
        }
      }
    } catch (e) {
      console.error("[BlockEngine] processPendingBlock error:", e);
    }
  }

  // ── 初始加载（从 storage 恢复已屏蔽列表） ──

  function init() {
    // 从 storage 加载已屏蔽列表
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get({ [STORAGE_KEY]: [] }).then((data) => {
        const list = data[STORAGE_KEY] || [];
        list.forEach((h) => {
          const norm = normalizeHandle(h);
          if (norm) blockedAccounts.add(norm);
        });
      }).catch(() => {});
    }

    // 处理待处理屏蔽（全页导航后接手）
    processPendingBlock();

    // 监听其他页面（如 detected.html）对屏蔽列表的修改
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        let changed = false;
        const blockedChange = changes[STORAGE_KEY];
        if (blockedChange) {
          const newBlocked = blockedChange.newValue || [];
          const oldBlocked = blockedChange.oldValue || [];
          newBlocked.forEach((handle) => {
            const norm = normalizeHandle(handle);
            if (norm) { blockedAccounts.add(norm); changed = true; }
          });
          if (oldBlocked.length > newBlocked.length) {
            const newSet = new Set(newBlocked.map((h) => normalizeHandle(h)).filter(Boolean));
            blockedAccounts.forEach((_, handle) => {
              if (!newSet.has(handle)) { blockedAccounts.delete(handle); changed = true; }
            });
          }
        }
        const suspendedChange = changes[SUSPENDED_KEY];
        if (suspendedChange) {
          // 只触发回调（不维护 suspended 集合，由 detected.js 维护）
          changed = true;
        }
        if (changed) notifyChanged();
      });
    }

  }

  // ── 暴露 API ──

  window.BlockEngine = {
    blockUser: blockUser,
    unblockUser: unblockUser,
    batchBlock: batchBlock,
    checkBlockStatus: checkBlockStatus,
    checkSuspended: checkSuspended,
    getBlockedAccounts: function () { return blockedAccounts; },
    get onChanged() { return onChangeCallback; },
    set onChanged(fn) { onChangeCallback = fn; },
    // 在当前页面上直接执行屏蔽（content.js 已做好 SPA 导航）
    blockOnCurrentPage: function () {
      const handle = window.location.pathname.slice(1).toLowerCase();
      const originalUrl = window.location.href;
      return domBlockCurrentProfile(handle, originalUrl);
    },
  };

  init();
})();
