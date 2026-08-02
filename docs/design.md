# 设计文档（design.md）

> 架构、规则、界面设计。维护规则见 `../../_dev-rules/PROJECT_RULES.md`。

---

## 一、总体架构

Chrome 扩展（Manifest V3），四个脚本 + 两个页面：

```
background.js      Service Worker（消息路由、心跳保活）
block-engine.js    屏蔽引擎（屏蔽状态管理、blockedAccounts 同步）
spam-engine.js     检测引擎（多维评分 detectAccount + bio 检测 detectBio）
content.js         内容脚本（DOM 扫描、隐藏、屏蔽执行、右下角状态）
block.html/.js     屏蔽管理页（记录列表、解除屏蔽）
popup.html/.js     扩展弹窗（开关、自定义关键词）
```

## 二、检测引擎（spam-engine.js）

### 2.1 评分维度

`detectAccount(displayName, replyText, handle, pageAuthor)`
返回 `{ isScam, score, features, needsBioCheck, mentionedHandle, matchedCustom }`

| 维度 | 范围 | 说明 |
|------|------|------|
| displayName | 0 ~ -4 | 关键词（真实权重）、装饰 emoji（-2）、引流信号（-3） |
| reply | 0 ~ -4 | 关键词（真实权重，强词如"骚"-4）、纯emoji、无实质、@引流（-1）、自定义关键词（-3） |
| handle | 0 ~ -2 | 随机 handle（字母串无元音/长辅音串） |
| cross | 0 ~ -3 | 跨维度协同（广告名+无意义回复 等） |

**判定：** `total <= -4` → isScam；`<= -6` 或特定组合 → 直接屏蔽（免 bio 确认）

**钳制规则（重要）：** 每个维度有下限（displayName -4 / reply -4 / handle -2 / cross -3），
负分累加用 `Math.max(当前分 - 扣分, 下限)` —— 曾误用 `Math.min` 导致轻微信号扣满（v1.2.1 修复）。

### 2.2 关键词匹配规则（对用户 FAQ）

- **不是模糊匹配**，是「子串包含匹配」：回复/显示名中**连续包含**关键词即命中
- 只比对**中文**（extractCJK 提取），标点/表情/英文夹中间不影响（如"约❗炮"→"约炮"命中）
- 拼音归一化：`sao→骚` 等少量映射（防 "sao货" 绕过）
- 自定义关键词：精确子串，用户加什么匹配什么

### 2.3 @ 引流判定（v1.2.1 收紧）

```
回复含 @xxx
  ├─ xxx = 页面作者 或 白名单 → 不扣分（正常互动）
  ├─ 命中推广关键词（拼音归一化后）→ -1 分，记为 mentionedHandle
  └─ 否则 → 不扣分（修复前：含中文就扣分 → 误杀 Cecilia Hsueh）
```

### 2.4 水军模板检测（v1.2.1 新增）

- `templateKey(replyText)`：去 @/链接/emoji/标点，只留中文+字母数字
- 同一页面同模板 ≥2 个账号 → 每条 -2 分
- 解决 "应该没人比我玩的开了吧 我福不黑不信你看" 水军模板漏杀

### 2.5 Bio 确认（detectBio）

- 关键词 / 引流信号 / 引流域名（linktr.ee 等）/ 中文+链接 组合
- 疑似账号拉 bio → 命中 → 确认屏蔽
- bio 拉取失败但 score ≤ -5 → 兜底确认

### 2.6 企业认证跳过（v1.2.1 新增）

- 金V/组织认证（`isGoldVerifiedAccount`）→ 跳过检测
- 个人蓝V → 正常检测（垃圾号也买蓝V）

## 三、屏蔽执行（content.js）

```
扫描 article（推文详情页）
  → detectAccount 评分
  → 疑似 → 打标 + 隐藏（主页只标记）
  → 确认 → saveBlockHistory + 屏蔽（DOM 模拟点击 更多→屏蔽→确认）
  → 右下角状态条显示当前推文已屏蔽数
```

## 四、数据存储

| Key | 内容 |
|-----|------|
| mv3BlockedTwitterAccounts | 已屏蔽 handle 列表 |
| mv3DetectedTwitterAccounts | 检测到的账号（去重） |
| mv3BlockHistory | 屏蔽历史（≤100 条，含 replyText/tweetUrl/blockedAt） |
| mv3CustomKeywords | 自定义关键词 { keywords, redirect } |

## 五、已知边界/待办

- 回测样本 `pbertram2230` 单条独立时 -2 放行（页面有同伙时靠模板检测命中）
- `li888real`、`aivideohub_` 商业推广号：用户确认"可屏蔽可不屏蔽"，未加规则
- 一键查杀：已设计未开发（`docs/ideas/一键查杀设计.md`）
- 关键词模糊匹配（拼音/插字/繁体）：用户未确认，未实现
