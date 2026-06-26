(function() {
  "use strict";
  var ADULT_STRONG = ["约炮","炮友","yp","裸聊","色情","打飞机","破处","处男","约P","约啪","固炮","寻炮","看片"];
  var ADULT_WEAK = ["骚","处女","涩","上门","空降","同城","少妇","同城约","约爱","成人内容","无偿","交友","反差","返差"];
  var ADULT_PROMO = ["线下资源","线下约","线更新","同步更新","真实可靠","同城男大","无偿","同城约炮","附近","探路","花样多","已探路","体制内","私聊"];
  var REDIRECT_SIGNALS = ["看简介","点简介","点我头像","点主页","点我主页","看主页","简介有","点击主页","戳主页","个人主页","看个人主页","看置顶","置顶推文","置顶有","主页有","主页进群","主页私聊"];
  var PINYIN_SIGNALS = [{ pattern: /\bsao\b/i, keyword: "骚", pts: 2 }];
  var CUSTOM_KEYWORDS = { adultStrong: [], adultWeak: [], promo: [], redirect: [] };
  var CUSTOM_KW_LOADED = false;
  async function loadCustomKeywords() {
    if (CUSTOM_KW_LOADED) return;
    try {
      if (typeof chrome !== "undefined" && chrome.storage) {
        var data = await chrome.storage.local.get("mv3CustomKeywords");
        if (data.mv3CustomKeywords && typeof data.mv3CustomKeywords === "object") {
          var d = data.mv3CustomKeywords;
          CUSTOM_KEYWORDS.adultStrong = Array.isArray(d.adultStrong) ? d.adultStrong : [];
          CUSTOM_KEYWORDS.adultWeak = Array.isArray(d.adultWeak) ? d.adultWeak : [];
          CUSTOM_KEYWORDS.promo = Array.isArray(d.promo) ? d.promo : [];
          CUSTOM_KEYWORDS.redirect = Array.isArray(d.redirect) ? d.redirect : [];
        }
      }
    } catch (e) {}
    CUSTOM_KW_LOADED = true;
  }
  async function saveCustomKeywords() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage) {
        await chrome.storage.local.set({ mv3CustomKeywords: {
          adultStrong: CUSTOM_KEYWORDS.adultStrong,
          adultWeak: CUSTOM_KEYWORDS.adultWeak,
          promo: CUSTOM_KEYWORDS.promo,
          redirect: CUSTOM_KEYWORDS.redirect,
        }});
      }
    } catch (e) {}
  }
  function getCustomKeywords() {
    return {
      adultStrong: (CUSTOM_KEYWORDS.adultStrong || []).slice(),
      adultWeak: (CUSTOM_KEYWORDS.adultWeak || []).slice(),
      promo: (CUSTOM_KEYWORDS.promo || []).slice(),
      redirect: (CUSTOM_KEYWORDS.redirect || []).slice(),
    };
  }
  function addCustomKeyword(category, word) {
    if (!CUSTOM_KEYWORDS[category]) CUSTOM_KEYWORDS[category] = [];
    if (CUSTOM_KEYWORDS[category].indexOf(word) === -1) {
      CUSTOM_KEYWORDS[category].push(word);
      saveCustomKeywords();
    }
  }
  function removeCustomKeyword(category, word) {
    if (!CUSTOM_KEYWORDS[category]) return;
    CUSTOM_KEYWORDS[category] = CUSTOM_KEYWORDS[category].filter(function(w) { return w !== word; });
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
    ADULT_STRONG.concat(ADULT_WEAK, ADULT_PROMO, REDIRECT_SIGNALS,
      CUSTOM_KEYWORDS.adultStrong, CUSTOM_KEYWORDS.adultWeak,
      CUSTOM_KEYWORDS.promo, CUSTOM_KEYWORDS.redirect).forEach(function(k) { existing.add(k); });
    var newWords = Object.keys(candidates).filter(function(w) { return !existing.has(w); });
    if (newWords.length > 0) {
      CUSTOM_KEYWORDS.adultStrong = (CUSTOM_KEYWORDS.adultStrong || []).concat(newWords);
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
  var DECORATIVE_EMOJI = /[\u{1F338}\u{1F33A}\u{1F33B}\u{1F339}\u{1F308}\u{1F381}\u{1F380}\u{1F48B}\u{1F525}\u{1F389}\u{1F38A}\u{1F38C}\u{1F3C6}\u{1F451}\u{1F484}\u{26A1}\u{1F5A4}]/u;

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
    // 正常交互白名单：不会作为引流目标的账号
    var WHITELIST = ["grok","elonmusk","jack","x","twitter","communitynotes"];

    // ── Dim1: 显示名 (max -4) ──
    (function() {
      var dn = displayName || "";
      var cjk = extractCJK(dn);
      if (cjk.length > 0) {
        var cjkStr = cjk.join("");
        // 成人强词 → 立即判 spam（高置信）
        var allStrong = ADULT_STRONG.concat(CUSTOM_KEYWORDS.adultStrong || []);
        for (var i = 0; i < allStrong.length; i++) {
          var kwc = extractCJK(allStrong[i]).join("");
          if (kwc && cjkStr.indexOf(kwc) !== -1) {
            dims.displayName = -4;
            reasons.push({ k: "显示名-成人强词", v: allStrong[i], p: -4 });
            return;
          }
        }
        // 推广词
        var allPromo = ADULT_PROMO.concat(CUSTOM_KEYWORDS.promo || []);
        for (var i = 0; i < allPromo.length; i++) {
          var kwc = extractCJK(allPromo[i]).join("");
          if (kwc && cjkStr.indexOf(kwc) !== -1) {
            dims.displayName = Math.min(dims.displayName - 3, -4);
            reasons.push({ k: "显示名-推广词", v: allPromo[i], p: -3 });
            break;
          }
        }
        // 高置信弱词（上门/空降/少妇/同城约）
        var highConfWeak = ["上门","空降","少妇","同城约"];
        for (var i = 0; i < highConfWeak.length; i++) {
          var kwc = extractCJK(highConfWeak[i]).join("");
          if (kwc && cjkStr.indexOf(kwc) !== -1) {
            dims.displayName = Math.min(dims.displayName - 3, -4);
            reasons.push({ k: "显示名-成人弱词", v: highConfWeak[i], p: -3 });
            break;
          }
        }
      }
      // 装饰 emoji
      if (hasDecorativeEmoji(dn)) {
        dims.displayName = Math.min(dims.displayName - 2, -4);
        reasons.push({ k: "显示名-装饰emoji", v: "", p: -2 });
      }
      // 引流信号（显示名中出现"主页进群"等）
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
      if (!rt || rt.length === 0) {
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
        // 回复文本中的中文推广/弱关键词 → 弱信号
        if (/[\u4e00-\u9fff]/.test(rt)) {
          var cjk = extractCJK(rt).join("");
          var allPromo = ADULT_PROMO.concat(CUSTOM_KEYWORDS.promo || []);
          for (var i = 0; i < allPromo.length; i++) {
            var kwc = extractCJK(allPromo[i]).join("");
            if (kwc && cjk.indexOf(kwc) !== -1) {
              dims.reply = Math.min(dims.reply - 1, -3);
              reasons.push({ k: "回复-中文推广词", v: allPromo[i], p: -1 });
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
        // @第三方引流 + 检查 @ 的账号 handle 是否可疑
        // 排除：原文作者(pageAuthor)、白名单账号
        if (rt.indexOf("@") !== -1) {
          var atMatches = rt.match(/@[A-Za-z0-9_]{1,15}/g) || [];
          if (atMatches.length > 0) {
            var atHandle = atMatches[0].slice(1).toLowerCase();
            // 排除原文作者（正常回复链）和内置白名单
            if (atHandle === (pageAuthor || "").toLowerCase() || WHITELIST.indexOf(atHandle) !== -1) {
              // 正常的 @，不扣分
            } else {
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
    // 仅显示名成人强词命中（-4）且其他维度无信号 → 高置信，跳过 bio 确认
    // 其他所有情况都需要资料介绍确认
    var needsBioCheck = isSuspicious && !(dims.displayName === -4 && dims.reply === 0 && dims.handle === 0 && dims.cross === 0);
    return { isScam: isSuspicious, score: total, features: reasons, needsBioCheck: needsBioCheck, mentionedHandle: mentionedHandle };
  }

  /** 检测 profile bio 是否含成人推广信号（确认阶段使用） */
  function detectBio(text) {
    if (!text) return false;
    var cjk = extractCJK(text);
    if (cjk.length === 0) return false;
    var cjkStr = cjk.join("");
    // 成人强词
    var allStrong = ADULT_STRONG.concat(CUSTOM_KEYWORDS.adultStrong || []);
    for (var i = 0; i < allStrong.length; i++) {
      var kwc = extractCJK(allStrong[i]).join("");
      if (kwc && cjkStr.indexOf(kwc) !== -1) return true;
    }
    // 推广词
    var allPromo = ADULT_PROMO.concat(CUSTOM_KEYWORDS.promo || []);
    for (var i = 0; i < allPromo.length; i++) {
      var kwc = extractCJK(allPromo[i]).join("");
      if (kwc && cjkStr.indexOf(kwc) !== -1) return true;
    }
    // 引流信号
    var allRedirect = REDIRECT_SIGNALS.concat(CUSTOM_KEYWORDS.redirect || []);
    for (var i = 0; i < allRedirect.length; i++) {
      if (text.indexOf(allRedirect[i]) !== -1) return true;
    }
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
