(function() {
  "use strict";
  // 扁平关键词列表：每个词固定权重，不分类
  var KEYWORDS = [
    { text: "约炮", score: -4 }, { text: "约啪", score: -4 },
    { text: "固炮", score: -4 }, { text: "寻炮", score: -4 },
    { text: "裸聊", score: -4 }, { text: "色情", score: -4 },
    { text: "打飞机", score: -4 }, { text: "破处", score: -4 },
    { text: "处男", score: -4 }, { text: "yp", score: -4 },
    { text: "同城约炮", score: -3 }, { text: "同城约", score: -3 },
    { text: "上门", score: -3 }, { text: "空降", score: -3 },
    { text: "少妇", score: -3 }, { text: "线下", score: -3 },
    { text: "找同城", score: -3 }, { text: "男单", score: -3 },
    { text: "线下资源", score: -3 }, { text: "线下约", score: -3 },
    { text: "同城男大", score: -3 },
    { text: "无偿", score: -2 }, { text: "免费", score: -2 },
    { text: "约爱", score: -2 }, { text: "骚", score: -2 },
    { text: "处女", score: -2 }, { text: "涩", score: -2 },
    { text: "交友", score: -2 }, { text: "反差", score: -2 },
    { text: "返差", score: -2 }, { text: "同城", score: -2 },
    { text: "成人内容", score: -2 }, { text: "附近", score: -2 },
    { text: "探路", score: -2 }, { text: "花样多", score: -2 },
    { text: "已探路", score: -2 }, { text: "体制内", score: -2 },
    { text: "私聊", score: -2 },
    { text: "线更新", score: -1 }, { text: "同步更新", score: -1 },
    { text: "真实可靠", score: -1 },
  ];
  // 引流信号（行为特征，不是关键词）
  var REDIRECT_SIGNALS = ["看简介","点简介","点我头像","点主页","点我主页","看主页","简介有","点击主页","戳主页","个人主页","看个人主页","看置顶","置顶推文","置顶有","主页有","主页进群","主页私聊"];
  var PINYIN_SIGNALS = [{ pattern: /\bsao\b/i, keyword: "骚", pts: 2 }];
  // 自定义关键词：扁平列表，无分类
  var CUSTOM_KEYWORDS = { keywords: [], redirect: [] };
  var CUSTOM_KW_LOADED = false;
  async function loadCustomKeywords() {
    if (CUSTOM_KW_LOADED) return;
    try {
      if (typeof chrome !== "undefined" && chrome.storage) {
        var data = await chrome.storage.local.get("mv3CustomKeywords");
        if (data.mv3CustomKeywords && typeof data.mv3CustomKeywords === "object") {
          var d = data.mv3CustomKeywords;
          // 兼容旧格式：如果 d.adultStrong 存在则合并进来
          var flat = [];
          if (Array.isArray(d.keywords)) flat = d.keywords;
          if (Array.isArray(d.adultStrong)) flat = flat.concat(d.adultStrong);
          if (Array.isArray(d.adultWeak)) flat = flat.concat(d.adultWeak);
          if (Array.isArray(d.promo)) flat = flat.concat(d.promo);
          CUSTOM_KEYWORDS.keywords = flat;
          CUSTOM_KEYWORDS.redirect = Array.isArray(d.redirect) ? d.redirect : [];
          // 如果是旧格式，立即保存新格式清理旧分类
          if (d.adultStrong || d.adultWeak || d.promo) {
            saveCustomKeywords();
          }
        }
      }
    } catch (e) {}
    CUSTOM_KW_LOADED = true;
  }
  async function saveCustomKeywords() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage) {
        await chrome.storage.local.set({ mv3CustomKeywords: {
          keywords: CUSTOM_KEYWORDS.keywords,
          redirect: CUSTOM_KEYWORDS.redirect,
        }});
      }
    } catch (e) {}
  }
  function getCustomKeywords() {
    return {
      keywords: (CUSTOM_KEYWORDS.keywords || []).slice(),
      redirect: (CUSTOM_KEYWORDS.redirect || []).slice(),
    };
  }
  function addCustomKeyword(word) {
    if (!CUSTOM_KEYWORDS.keywords) CUSTOM_KEYWORDS.keywords = [];
    if (CUSTOM_KEYWORDS.keywords.indexOf(word) === -1) {
      CUSTOM_KEYWORDS.keywords.push(word);
      saveCustomKeywords();
    }
  }
  function removeCustomKeyword(word) {
    if (!CUSTOM_KEYWORDS.keywords) return;
    CUSTOM_KEYWORDS.keywords = CUSTOM_KEYWORDS.keywords.filter(function(w) { return w !== word; });
    saveCustomKeywords();
  }
  var SINGLE_STOP = new Set("的了是在有你我他她它们这那不也都和与就还而且但被把对等");
  function trainKeywords(text) {
    var chars = text.split("").filter(function(c) { return /[\u4e00-\u9fff]/.test(c); });
    if (chars.length < 2) return [];
    var candidates = {};
    for (var len = 2; len <= 3; len++) {
      for (var i = 0; i + len <= chars.length; i++) {
        var sub = chars.slice(i, i + len).join("");
        if (sub.split("").every(function(c) { return SINGLE_STOP.has(c); })) continue;
        candidates[sub] = true;
      }
    }
    var existing = new Set();
    KEYWORDS.forEach(function(kw) { existing.add(kw.text); });
    REDIRECT_SIGNALS.concat(CUSTOM_KEYWORDS.keywords || []).forEach(function(k) { existing.add(k); });
    var newWords = Object.keys(candidates).filter(function(w) { return !existing.has(w); });
    if (newWords.length > 0) {
      CUSTOM_KEYWORDS.keywords = (CUSTOM_KEYWORDS.keywords || []).concat(newWords);
      saveCustomKeywords();
    }
    return newWords;
  }
  var EMOJI_MAP = [
    ["\u2708\ufe0f","飞机"],
    ["\u2708","飞机"],
    ["\ud83d\udd1e","成人"],
  ];
  var PINYIN_MAP = [
    ["chu","处"],["jia","加"],["wei","微"],["mian","免"],
    ["fei","费"],["kan","看"],["pian","片"],["yue","约"],
    ["pao","炮"],["se","色"],["ai","爱"],["si","私"],
    ["ni","你"],["wo","我"],["xin","信"],["liao","聊"],
    ["fu","服"],["wu","务"],["fuwu","服务"],
  ];
  var LETTER_MAP = [
    ["v","微"],["V","微"],["u","有"],["U","有"],
    ["8","吧"],["0","你"],["5","我"],
  ];
  var PINYIN_MAP_SORTED = PINYIN_MAP.slice().sort(function(a,b){return b[0].length-a[0].length});
  function normalizeText(text) {
    var t = text;
    // emoji 映射始终执行（与语言无关）
    for (var i = 0; i < EMOJI_MAP.length; i++) { t = t.split(EMOJI_MAP[i][0]).join(EMOJI_MAP[i][1]); }
    // 拼音/字母→中文映射仅在文本已有中文时才执行，防止纯英文误替换
    if (/[\u4e00-\u9fff]/.test(t)) {
      for (var i = 0; i < PINYIN_MAP_SORTED.length; i++) { t = t.split(PINYIN_MAP_SORTED[i][0]).join(PINYIN_MAP_SORTED[i][1]); }
      for (var i = 0; i < LETTER_MAP.length; i++) { t = t.split(LETTER_MAP[i][0]).join(LETTER_MAP[i][1]); }
    }
    return t;
  }
  function extractCJK(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) { if (/[\u4e00-\u9fff]/.test(text[i])) out.push(text[i]); }
    return out;
  }
  function looseKeywordMatch(words, text) {
    var cjk = extractCJK(text).join("");
    for (var wi = 0; wi < words.length; wi++) { if (cjk.indexOf(words[wi]) === -1) return false; }
    return true;
  }
  function consecutiveMatch(kw, targetCJK) {
    var kwC = extractCJK(kw);
    if (kwC.length === 0) return false;
    return targetCJK.join("").indexOf(kwC.join("")) !== -1;
  }
  function calcMixedRate(text, kw, targetCJK) {
    var kwC = extractCJK(kw);
    var kwStr = kwC.join("");
    var targetStr = targetCJK.join("");
    var idx = targetStr.indexOf(kwStr);
    if (idx === -1) return 0;
    var origPositions = [];
    var cjkIdx = 0;
    for (var oi = 0; oi < text.length && origPositions.length < kwC.length; oi++) {
      if (/[\u4e00-\u9fff]/.test(text[oi])) {
        if (cjkIdx >= idx && cjkIdx < idx + kwC.length) origPositions.push(oi);
        cjkIdx++;
      }
    }
    if (origPositions.length < 2) return 0;
    var first = origPositions[0], last = origPositions[origPositions.length - 1];
    var nonCjk = 0;
    for (var i = first; i <= last; i++) { if (!/[\u4e00-\u9fff]/.test(text[i])) nonCjk++; }
    return nonCjk / (last - first + 1);
  }
  /** 装饰 emoji（垃圾号常用的装饰符号） */
  var DECORATIVE_EMOJI = /[\u{1F338}\u{1F33A}\u{1F33B}\u{1F339}\u{1F308}\u{1F381}\u{1F380}\u{1F48B}\u{1F525}\u{1F389}\u{1F38A}\u{1F38C}\u{1F3C6}\u{1F451}\u{1F484}\u{26A1}\u{1F5A4}\u2665\u{1F232}]/u;

  /** 检测是否含装饰 emoji */
  function hasDecorativeEmoji(text) {
    if (!text) return false;
    return DECORATIVE_EMOJI.test(text);
  }

  /** 检测文本是否只有 emoji（不含字母数字汉字） */
  function isPureEmojiText(t) {
    if (!t) return false;
    var stripped = t.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF]|[\uFE00-\uFE0F]|[\u{1F000}-\u{1FFFF}]/gu, "").replace(/\s+/g, "").trim();
    return stripped.length === 0;
  }

  /** 检测回复是否无实质内容：纯 emoji 或纯英文凑数 */
  function isMeaninglessReply(text) {
    if (!text || text.length === 0) return true;
    // 纯 emoji
    var stripped = text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF]|[\uFE00-\uFE0F]|[\u{1F000}-\u{1FFFF}]/gu, "").replace(/\s+/g, "").trim();
    if (stripped.length === 0) return true;
    // 纯英文 + emoji（无中文），长度很短且内容凑数
    if (!/[\u4e00-\u9fff]/.test(text)) {
      var words = text.replace(/[^a-zA-Z]+/g, " ").trim().split(/\s+/);
      // 只有 1-3 个常见单词 + emoji → 凑数回复
      if (words.length <= 3 && words.every(function(w) { return w.length <= 12; })) {
        return true;
      }
    }
    return false;
  }

  /** 检测 handle 是否为随机生成 */
  function isHandleRandom(handle) {
    var letters = (handle || "").replace(/[^a-zA-Z]/g, "");
    if (letters.length <= 6) return false;
    if (!/[aeiouyAEIOUY]/.test(letters)) return true;
    var consec = 0;
    for (var i = 0; i < letters.length; i++) {
      if (/[^aeiouyAEIOUY]/.test(letters[i])) { consec++; if (consec >= 5) return true; }
      else consec = 0;
    }
    return false;
  }

  /** 综合维度评分：检查显示名 + 回复 + handle + pageAuthor 多维信号
   *  返回 { isScam, score, features, bioCheck, mentionedHandle }
   *  - needsBioCheck: 是否需要 profile bio 验证（当多个维度命中时）
   *  - mentionedHandle: 回复中 @ 的第三方 handle（非原文作者、非白名单）
   */
  function detectAccount(displayName, replyText, handle, pageAuthor) {
    var dims = { displayName: 0, reply: 0, handle: 0, cross: 0 };
    var reasons = [];
    var mentionedHandle = null;
    // 正常交互白名单
    var WHITELIST = ["grok","elonmusk","jack","x","twitter","communitynotes","carlzha"];

    // ── Dim1: 显示名 (max -4) ──
    (function() {
      var dn = displayName || "";
      // 扁平关键词匹配
      var allKws = KEYWORDS.concat(CUSTOM_KEYWORDS.keywords.map(function(w) { return { text: w, score: -2 }; }));
      var bestScoreDN = 0;
      for (var i = 0; i < allKws.length; i++) {
        var kwC = extractCJK(allKws[i].text).join("");
        if (kwC && extractCJK(dn).join("").indexOf(kwC) !== -1) {
          if (allKws[i].score < bestScoreDN) bestScoreDN = allKws[i].score;
        }
      }
      if (bestScoreDN <= -4) {
        dims.displayName = -4;
        reasons.push({ k: "显示名-关键词", v: "", p: -4 });
        return;
      }
      if (bestScoreDN < 0) {
        dims.displayName = Math.min(bestScoreDN, -3);
        // 从 KEYWORDS 中找到匹配词用于 reason
        for (var i = 0; i < allKws.length; i++) {
          var kwC = extractCJK(allKws[i].text).join("");
          if (kwC && extractCJK(dn).join("").indexOf(kwC) !== -1 && allKws[i].score === bestScoreDN) {
            reasons.push({ k: "显示名-关键词", v: allKws[i].text, p: bestScoreDN });
            break;
          }
        }
      }
      // 装饰 emoji
      if (hasDecorativeEmoji(dn)) {
        dims.displayName = Math.min(dims.displayName - 2, -4);
        reasons.push({ k: "显示名-装饰emoji", v: "", p: -2 });
      }
      // 引流信号
      var allRedirect = REDIRECT_SIGNALS.concat(CUSTOM_KEYWORDS.redirect || []);
      for (var i = 0; i < allRedirect.length; i++) {
        if (dn.indexOf(allRedirect[i]) !== -1) {
          dims.displayName = Math.min(dims.displayName - 3, -4);
          reasons.push({ k: "显示名-引流", v: allRedirect[i], p: -3 });
          break;
        }
      }
    })();

    // ── Dim2: 回复文本 (max -3) ──
    (function() {
      var rt = replyText || "";
      // 如果回复主要是 @ 别人（去掉 @ 后只剩几个字），说明是正常互动，不惩罚回复内容
      var isReplyToSomeone = false;
      if (rt.indexOf("@") !== -1) {
        var stripped = rt.replace(/@[A-Za-z0-9_]{1,15}/g, "").trim();
        if (stripped.length <= 8) {
          isReplyToSomeone = true;
        }
      }
      if (isReplyToSomeone) {
        // 正常 @ 互动，不对回复内容做惩罚
      } else if (!rt || rt.length === 0) {
        dims.reply = -1;
        reasons.push({ k: "回复-空", v: "", p: -1 });
      } else {
        if (isPureEmojiText(rt)) {
          dims.reply = Math.min(dims.reply - 2, -3);
          reasons.push({ k: "回复-纯emoji", v: "", p: -2 });
        } else if (isMeaninglessReply(rt)) {
          dims.reply = Math.min(dims.reply - 1, -3);
          reasons.push({ k: "回复-无实质内容", v: "", p: -1 });
        }
        // 回复文本中的扁平关键词匹配 → 弱信号
        if (/[\u4e00-\u9fff]/.test(rt)) {
          var allKwsRt = KEYWORDS.concat(CUSTOM_KEYWORDS.keywords.map(function(w) { return { text: w, score: -2 }; }));
          for (var i = 0; i < allKwsRt.length; i++) {
            var kwC = extractCJK(allKwsRt[i].text).join("");
            if (kwC && extractCJK(rt).join("").indexOf(kwC) !== -1) {
              dims.reply = Math.min(dims.reply - 1, -3);
              reasons.push({ k: "回复-关键词", v: allKwsRt[i].text, p: -1 });
              break;
            }
          }
        }
        // 引流信号
        var allRedirect = REDIRECT_SIGNALS.concat(CUSTOM_KEYWORDS.redirect || []);
        for (var i = 0; i < allRedirect.length; i++) {
          if (rt.indexOf(allRedirect[i]) !== -1) {
            dims.reply = Math.min(dims.reply - 2, -3);
            reasons.push({ k: "回复-引流", v: allRedirect[i], p: -2 });
            break;
          }
        }
        // @第三方引流 — 仅当回复文本同时含中文推广/关键词时才扣分，避免"@binance 谢谢"误伤
        if (rt.indexOf("@") !== -1) {
          var atMatches = rt.match(/@[A-Za-z0-9_]{1,15}/g) || [];
          if (atMatches.length > 0) {
            var atHandle = atMatches[0].slice(1).toLowerCase();
            if (atHandle === (pageAuthor || "").toLowerCase() || WHITELIST.indexOf(atHandle) !== -1) {
              // 正常的 @，不扣分
            } else if (/[\u4e00-\u9fff]/.test(rt)) {
              // 回复含中文 + @第三方 → 才有引流嫌疑
              mentionedHandle = atHandle;
              dims.reply = Math.min(dims.reply - 1, -3);
              reasons.push({ k: "回复-@引流", v: atHandle, p: -1 });
            }
          }
        }
      }
    })();

    // ── Dim3: Handle 随机 (max -2) ──
    if (handle && isHandleRandom(handle)) {
      dims.handle = -2;
      reasons.push({ k: "handle随机", v: handle, p: -2 });
    }

    // ── 跨维度协同 (max -3) ──
    if (dims.displayName <= -3 && dims.reply < 0) {
      // 显示名有实质性信号（推广/引流/成人词）+ 回复有信号 = 典型的垃圾号行为
      // 注意：仅装饰emoji(-2)不会触发此跨维
      dims.cross = Math.min(dims.cross - 3, -3);
      reasons.push({ k: "跨维度-广告名+无意义回复", v: "", p: -3 });
    } else if (dims.displayName < 0 && dims.handle < 0) {
      dims.cross = Math.min(dims.cross - 2, -3);
      reasons.push({ k: "跨维度-广告名+随机handle", v: "", p: -2 });
    } else if (hasDecorativeEmoji(displayName || "") && isPureEmojiText(replyText || "")) {
      dims.cross = Math.min(dims.cross - 2, -3);
      reasons.push({ k: "跨维度-装饰名+纯emoji", v: "", p: -2 });
    } else if (dims.reply <= -2 && replyText && replyText.indexOf("@") !== -1) {
      // 回复含中文推广词 + @引流 = 典型广告评论
      dims.cross = Math.min(dims.cross - 2, -3);
      reasons.push({ k: "跨维度-中文推广+@引流", v: "", p: -2 });
    }

    var total = dims.displayName + dims.reply + dims.handle + dims.cross;
    var isSuspicious = total <= -4;
    // 不需要 bio 确认的情况：
    // 1. 显示名含成人强词（-4）且其他维度无信号 → 高置信
    // 2. 总分 ≤ -6 → 信号足够强，直接确认（回复内容已有充分证据）
    // 其他情况需要资料介绍确认
    var needsBioCheck = isSuspicious && !(dims.displayName === -4 && dims.reply === 0 && dims.handle === 0 && dims.cross === 0) && !(total <= -6);
    return { isScam: isSuspicious, score: total, features: reasons, needsBioCheck: needsBioCheck, mentionedHandle: mentionedHandle };
  }

  /** 检测 profile bio 是否含成人推广信号（确认阶段使用）
   *  支持中文词 + 引流链接域名 + bio-emoji 组合 */ 
  function detectBio(text) {
    if (!text) return false;
    var cjk = extractCJK(text);
    var cjkStr = cjk.join("");
    // 扁平关键词
    var allKws = KEYWORDS.concat(CUSTOM_KEYWORDS.keywords.map(function(w) { return { text: w, score: -2 }; }));
    for (var i = 0; i < allKws.length; i++) {
      var kwC = extractCJK(allKws[i].text).join("");
      if (kwC && cjkStr.indexOf(kwC) !== -1) return true;
    }
    // 引流信号
    var allRedirect = REDIRECT_SIGNALS.concat(CUSTOM_KEYWORDS.redirect || []);
    for (var i = 0; i < allRedirect.length; i++) {
      if (text.indexOf(allRedirect[i]) !== -1) return true;
    }
    // 引流链接域名（bio 中常见的成人推广短链）
    var bioLinkDomains = ["linktr.ee","beacons.ai","bio.site","msha.ke","hoo.be","snipfeed.co","withkoji.com","t.co","shopmy.us","o3j1.top"];
    var linkMatch = text.match(/https?:\/\/[^\s]+/g) || [];
    for (var li = 0; li < linkMatch.length; li++) {
      var url = linkMatch[li].toLowerCase();
      for (var di = 0; di < bioLinkDomains.length; di++) {
        if (url.indexOf(bioLinkDomains[di]) !== -1) return true;
      }
    }
    // 中文 bio + 含链接 = 高概率推广（正常用户 bio 有链接的少，垃圾号几乎都有）
    if (cjk.length > 0 && linkMatch.length > 0) return true;
    return false;
  }
  var ready = false, readyCallbacks = [];
  async function init() {
    try {
      await loadCustomKeywords();
      try { if (typeof chrome !== "undefined" && chrome.storage) await chrome.storage.local.remove(["mv3SpamTexts", "mv3SpamSamples"]); } catch (e) {}
      ready = true;
      readyCallbacks.forEach(function(cb) { cb(); });
      readyCallbacks = [];
    } catch (e) { console.error("[SpamEngine] init failed:", e); }
  }
  function onReady(cb) { if (ready) return cb(); readyCallbacks.push(cb); }
  window.SpamEngine = { init: init, onReady: onReady, ready: function() { return ready; }, normalizeText: normalizeText, detectAccount: detectAccount, detectBio: detectBio, isHandleRandom: isHandleRandom, trainKeywords: trainKeywords, loadCustomKeywords: loadCustomKeywords, addCustomKeyword: addCustomKeyword, removeCustomKeyword: removeCustomKeyword, getCustomKeywords: getCustomKeywords };
  init();
})();
