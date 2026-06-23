(function() {
  "use strict";
  // ── 综合特征检测引擎（纯 JS，无模型依赖）──
  var ADULT_STRONG = [
    "约炮","炮友","yp",
    "裸聊","色色","色情",
    "打飞机",
    "破处","处男",
    "约P","约啪",
    "固炮","寻炮",
    "看片",
  ];
  var ADULT_WEAK = [
    "骚",
    "处女","涩",
    "上门","空降","同城",
    "私密","刺激","诱惑",
    "妹子","少妇",
    "同城约",
    "约爱",
    "资源",
    "成人内容",
    "无偿",
    "交友",
  ];
  var ADULT_PROMO = [
    "线下资源","线下约","线更新","同步更新",
    "真实可靠",
  ];
  var REDIRECT_SIGNALS = [
    "看简介","点简介","点我头像","点主页","点我主页",
    "看主页","简介有","点击主页","戳主页",
    "点我","个人主页","看个人主页",
    "看置顶","置顶推文","置顶有",
    "简介","主页有",
    "的主页",
  ];
  // ── 拼音/变体匹配（匹配原始文本，非 CJK 提取）──
  var PINYIN_SIGNALS = [
    { pattern: /sao/i, keyword: "骚", pts: 2 },
  ];
  // ── 自定义关键词（你训练的 + block.html 管理的）──
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
  var ALL_MAPS = (PINYIN_MAP_SORTED.concat(LETTER_MAP)).concat(EMOJI_MAP);
  function normalizeText(text) {
    var t = text;
    for (var i = 0; i < ALL_MAPS.length; i++) { t = t.split(ALL_MAPS[i][0]).join(ALL_MAPS[i][1]); }
    return t;
  }
  function extractCJK(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) { if (/[\u4e00-\u9fff]/.test(text[i])) out.push(text[i]); }
    return out;
  }
  /** 宽松匹配：多个词的汉字以任意顺序、非连续地出现在文本的 CJK 中 */
  function looseKeywordMatch(words, text) {
    var cjk = extractCJK(text).join("");
    for (var wi = 0; wi < words.length; wi++) {
      if (cjk.indexOf(words[wi]) === -1) return false;
    }
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
  function isChaoticText(text) {
    // 排除纯 URL 链接导致的误判
    var urlCount = (text.match(/https?:\/\/[^\s]+/g) || []).length +
                   (text.match(/(?:^|\s)(x\.com|twitter\.com)\/[^\s]+/g) || []).length;
    if (urlCount >= 1) return false;
    var runs = [], run = "";
    for (var i = 0; i < text.length; i++) {
      if (/[a-zA-Z0-9]/.test(text[i])) { run += text[i]; }
      else { if (run.length >= 2) runs.push(run); run = ""; }
    }
    if (run.length >= 2) runs.push(run);
    return runs.length >= 2;
  }
  function isHandleRandom(handle) {
    var letters = (handle || "").replace(/[^a-zA-Z]/g, "");
    if (letters.length <= 6) return false;
    if (!/[aeiouAEIOU]/.test(letters)) return true;
    var consec = 0;
    for (var i = 0; i < letters.length; i++) {
      if (/[^aeiouAEIOU]/.test(letters[i])) { consec++; if (consec >= 5) return true; }
      else consec = 0;
    }
    return false;
  }
  function detectScam(text, handle, pageAuthor) {
    if (!text && !handle) return { isScam: false, score: 0, features: [], matchedKeyword: null, matchedRedirect: null };
    var score = 0, features = [], matchedKeyword = null, matchedRedirect = null;
    if (text && typeof text === "string" && text.length > 0) {
      var normalized = normalizeText(text);
      // ── 拼音/变体匹配（基于完整文本，不受 CJK 提取限制）──
      if (!matchedKeyword) {
        for (var pi = 0; pi < PINYIN_SIGNALS.length; pi++) {
          var ps = PINYIN_SIGNALS[pi];
          if (ps.pattern.test(normalized)) {
            matchedKeyword = ps.keyword; score += ps.pts;
            features.push({ k: "\u62fc\u97f3/\u53d8\u4f53", v: ps.keyword, p: ps.pts });
            break;
          }
        }
      }
      var normCJK = extractCJK(normalized);
      if (normCJK.length > 0) {
        function tryMatch(kw, pts) {
          if (consecutiveMatch(kw, normCJK)) {
            matchedKeyword = kw; score += pts;
            features.push({ k: "\u6210\u4eba\u5173\u952e\u8bcd", v: kw, p: pts });
            var mr = calcMixedRate(text, kw, normCJK);
            if (mr > 0) { score += 2; features.push({ k: "\u95f4\u6742\u7387", v: (mr * 100).toFixed(0) + "%", p: 2 }); }
            return true;
          }
          return false;
        }
        var allStrong = ADULT_STRONG.concat(CUSTOM_KEYWORDS.adultStrong || []);
        for (var i = 0; i < allStrong.length; i++) { if (tryMatch(allStrong[i], 2)) break; }
        if (!matchedKeyword) {
          var allWeak = ADULT_WEAK.concat(CUSTOM_KEYWORDS.adultWeak || []);
          for (var i = 0; i < allWeak.length; i++) { if (tryMatch(allWeak[i], 2)) break; }
        }
        if (!matchedKeyword) {
          var allPromo = ADULT_PROMO.concat(CUSTOM_KEYWORDS.promo || []);
          for (var i = 0; i < allPromo.length; i++) { if (tryMatch(allPromo[i], 2)) break; }
        }
        // --- emoji 位移兜底：如 ✈️ 被 DOM 推到文本末尾，"打"+"飞机"不连续但同时存在 ---
        if (!matchedKeyword) {
          var EMOJI_DISPLACED = [
            { emoji: "\u2708", words: ["打","飞机"], kw: "打飞机", pts: 2 },
          ];
          for (var di = 0; di < EMOJI_DISPLACED.length; di++) {
            var entry = EMOJI_DISPLACED[di];
            if (text.indexOf(entry.emoji) !== -1 && looseKeywordMatch(entry.words, normalized)) {
              matchedKeyword = entry.kw; score += entry.pts;
              features.push({ k: "\u6210\u4eba\u5173\u952e\u8bcd", v: entry.kw, p: entry.pts });
              break;
            }
          }
        }
      }
      var allRedirect = REDIRECT_SIGNALS.concat(CUSTOM_KEYWORDS.redirect || []);
      for (var i = 0; i < allRedirect.length; i++) {
        var sig = allRedirect[i];
        if (text.indexOf(sig) !== -1) {
          matchedRedirect = sig;
          if (score < 4) score += 2;
          features.push({ k: "\u5f15\u6d41\u4fe1\u53f7", v: sig, p: 2 });
          break;
        }
      }
      if (isChaoticText(text)) { score += 2; features.push({ k: "\u5185\u5bb9\u6742\u4e71", v: "", p: 2 }); }
      // ── 第三方 @ 引流检测：评论中 @ 了非对话作者的账号 ──
      if (!matchedRedirect && pageAuthor && text.indexOf("@") !== -1) {
        var atMatches = text.match(/@[A-Za-z0-9_]{1,15}/g) || [];
        var thirdParty = null;
        for (var ai = 0; ai < atMatches.length; ai++) {
          var atHandle = atMatches[ai].slice(1).toLowerCase();
          if (atHandle !== pageAuthor.toLowerCase() && atHandle !== (handle || "").toLowerCase()) {
            thirdParty = atHandle;
            break;
          }
        }
        if (thirdParty) {
          matchedRedirect = "@" + thirdParty;
          if (score < 4) score += 2;
          features.push({ k: "\u5f15\u6d41\u4fe1\u53f7", v: matchedRedirect, p: 2 });
        }
      }
    }
    if (handle && isHandleRandom(handle)) { score += 1; features.push({ k: "handle \u968f\u673a", v: handle, p: 1 }); }
    return { isScam: score >= 4, score: score, features: features, matchedKeyword: matchedKeyword, matchedRedirect: matchedRedirect };
  }
  // ── 初始化（只需加载自定义关键词）──
  var ready = false, readyCallbacks = [];
  async function init() {
    try {
      await loadCustomKeywords();
      // 清理旧的向量数据
      try { if (typeof chrome !== "undefined" && chrome.storage) await chrome.storage.local.remove(["mv3SpamTexts", "mv3SpamSamples"]); } catch (e) {}
      ready = true;
      readyCallbacks.forEach(function(cb) { cb(); });
      readyCallbacks = [];
    } catch (e) { console.error("[SpamEngine] init failed:", e); }
  }
  function onReady(cb) { if (ready) return cb(); readyCallbacks.push(cb); }
  window.SpamEngine = {
    init, onReady, ready: function() { return ready; },
    normalizeText, detectScam,
    trainKeywords, loadCustomKeywords, addCustomKeyword, removeCustomKeyword, getCustomKeywords,
  };
  init();
})();
