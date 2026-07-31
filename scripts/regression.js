// 回测脚本 v2：读样本库 → 跑修复后的引擎 + 水军模板检测 → 输出结果对照 expected
const fs = require("fs");
const path = "/Users/xinhu/Documents/Codex/2026-06-02/manifest-v3-chrome/extension/spam-engine.js";
const SAMPLES_DIR = "/Users/xinhu/Documents/Codex/2026-06-02/manifest-v3-chrome/docs/samples";

global.window = {};
global.document = { createElement: function() { return { textContent: "", setAttribute: function(){} }; } };
global.chrome = {
  storage: { local: { get: async function() { return { mv3CustomKeywords: { keywords: [], redirect: [] } }; } } }
};
global.navigator = { userAgent: "node" };
global.self = global;

eval(fs.readFileSync(path, "utf8"));
const engine = global.window.SpamEngine;

/** 与 content.js 相同的模板 key 逻辑 */
function templateKey(text) {
  return (text || "")
    .replace(/@[A-Za-z0-9_]{1,15}/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27FF]|[\uFE00-\uFE0F]|[\u{1F000}-\u{1FFFF}]/gu, " ")
    .replace(/[^\u4e00-\u9fffA-Za-z0-9]+/g, "")
    .trim();
}

(async function() {
  await engine.init();

  const files = fs.readdirSync(SAMPLES_DIR).filter(f => f.endsWith(".json"));
  let total = 0, pass = 0, fail = 0;
  const failures = [];

  files.forEach(function(file) {
    const batch = JSON.parse(fs.readFileSync(SAMPLES_DIR + "/" + file, "utf8"));
    console.log("\n" + "=".repeat(110));
    console.log("批次: " + batch.批次 + "（" + batch.样本.length + " 条）");
    console.log("=".repeat(110));

    // 模板统计（同一批次内）
    const templateCount = {};
    batch.样本.forEach(function(s) {
      const key = templateKey(s.replyText);
      if (key && key.length >= 4) templateCount[key] = (templateCount[key] || 0) + 1;
    });

    batch.样本.forEach(function(s) {
      total++;
      const r = engine.detectAccount(s.name, s.replyText, s.handle, s.pageAuthor || "");
      
      // 水军模板惩罚
      const tKey = templateKey(s.replyText);
      let templateHit = false;
      if (tKey && templateCount[tKey] >= 2) {
        r.score -= 2;
        r.features.push({ k: "回复-水军模板", v: "x" + templateCount[tKey], p: -2 });
        if (r.score <= -4) r.isScam = true;
        templateHit = true;
      }

      let actual;
      if (r.isScam && !r.needsBioCheck) actual = "block";
      else if (r.isScam && r.needsBioCheck) actual = "bio";
      else actual = "pass";

      // borderline：不强制命中也不强制放行，只要不是严重误杀就算过
      const ok = (s.expected === "borderline") ||
                 (actual === s.expected) || 
                 (s.expected === "bio" && (actual === "bio" || actual === "block")) ||
                 (s.expected === "block" && actual === "bio");
      
      const mark = ok ? "✅" : "❌";
      if (!ok) { fail++; failures.push({ file: file, sample: s, actual: actual, r: r }); }
      else pass++;

      console.log(mark + " [" + s.expected + "/实际:" + actual + "] @" + s.handle + " score=" + r.score + (r.isScam ? " 🔴" : " 🟢") + (templateHit ? " 📋模板" : ""));
      console.log("    名:" + s.name);
      console.log("    回:" + (s.replyText || "").substring(0, 60));
      r.features.forEach(function(f) { console.log("      - " + f.k + " (" + (f.v||"") + ") " + f.p + "分"); });
    });
  });

  console.log("\n" + "=".repeat(110));
  console.log("回测总结: " + total + " 条，通过 " + pass + "，失败 " + fail);
  if (failures.length) {
    console.log("\n失败明细:");
    failures.forEach(function(f) {
      console.log("  ❌ " + f.sample.handle + " 期望=" + f.sample.expected + " 实际=" + f.actual + " score=" + f.r.score);
    });
  }
  console.log("=".repeat(110));
})();
