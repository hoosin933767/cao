# Chrome Web Store Listing — CAO: Clean Accounts Optimizer

---

## 扩展名称
CAO — Clean Accounts Optimizer

## 简短描述（132 字以内）
一键屏蔽 X/Twitter 垃圾回复。基于多维特征引擎自动识别色情、引流、广告评论，装上即用。

## 详细描述

**CAO (Clean Accounts Optimizer)** 是一款专注于 X/Twitter 的垃圾回复屏蔽工具。装上一键生效，无需配置。

### 核心功能

**自动屏蔽垃圾**
在推文详情页自动检测每条回复，从四个维度综合评分：
- 显示名关键词匹配（约炮、上门、私聊等 40+ 内置关键词）
- 回复文本质量（emoji 凑数、无实质内容）
- Handle 随机性检测
- 引流信号（看简介、点主页等行为特征）
- 跨维度协同（多信号叠加时加权扣分）

**关键词管理**
- 内置 40+ 系统关键词，0-4 级权重
- 支持添加/删除自定义关键词
- 支持添加自定义引流词（看简介、点主页等）
- 实时生效，无需重启

**屏蔽记录**
- 查看已屏蔽账号列表
- 支持解除屏蔽
- 从 X 同步官方屏蔽列表
- 分页浏览

### 隐私保障
- 所有数据存储在本地浏览器，不上传任何服务器
- 不需要登录、不需要 API Key
- 仅操作 X/Twitter 页面，不读取其他网站
- 完全开源

### 安装方式
1. 安装后在 Chrome 地址栏输入 chrome://extensions 确认已启用
2. 打开 x.com 即可自动工作

---

## 类别
Social & Communication

## 语言
中文 (简体), 中文 (繁體), English

## 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 保存屏蔽记录、关键词、设置到本地 |
| `activeTab` | 与当前 X 标签页通信 |
| `tabs` | 查询所有打开 X 标签页并同步设置 |
| `cookies` | 读取 X 的 CSRF token 用于 X API 调用（仅 x.com/twitter.com） |
| `host_permissions` (x.com, twitter.com) | 在 X 页面上运行内容脚本 |

## Privacy Policy

CAO 不会收集、传输或分享任何用户数据。所有数据完全存储在用户浏览器本地（chrome.storage.local）。扩展仅在 X/Twitter 域名下运行，不读取其他网站内容。详见源代码：https://github.com/hoosin933767/cao

---

## 截图说明

| 文件名 | 尺寸 | 内容 |
|--------|------|------|
| `screenshot1.png` | 1280×800 | 推文详情页自动屏蔽效果：垃圾回复被自动标注"已屏蔽" |
| `screenshot2.png` | 1280×800 | Popup 控制面板 + 屏蔽管理页面 |

## 推广图片（可选）

| 文件名 | 尺寸 | 类型 |
|--------|------|------|
| `promo_small.png` | 440×280 | 小型推广图 |
