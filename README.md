# CAO — X Cleaner

让 X/Twitter 回归清净 —— 广告消失、垃圾隐藏、一键屏蔽。

## 安装

1. [下载扩展](extension/cao-extension-v1.0.0.zip) 或从 GitHub [extension/cao-extension-v1.0.0.zip](https://github.com/hoosin933767/cao/raw/master/extension/cao-extension-v1.0.0.zip) 下载
2. 解压到任意文件夹
3. Chrome 地址栏输入 `chrome://extensions` 回车
4. 打开右上角 **开发者模式**
5. 点击左上角 **加载已解压的扩展程序**，选择解压后的文件夹
6. 刷新 `x.com` 即可使用

## 功能

### 自动屏蔽垃圾

在推文详情页（`x.com/xxx/status/...`）自动检测每条回复，综合特征引擎从以下维度打分：

| 特征 | 分值 |
|---|---|
| 成人强关键词 | +2 |
| 成人弱关键词 | +2 |
| 推广词 | +2 |
| 引流信号 | +2 |
| 内容混杂度 | +2 |
| 随机 handle | +1 |

总分 **≥ 3** 触发自动屏蔽 + 隐藏，无需任何操作。

### 隐藏广告

在首页时间线和详情页自动识别并隐藏 X 的推广推文（Promoted），支持滚动加载后增量扫描。

### 手动上报

系统漏检的垃圾回复 → 点击「上报」→ 自动屏蔽 + 弹出预填推文（点 Post 发送给开发者）。

### 关键词管理

内置 60+ 系统规则，支持自定义添加/删除关键词，实时生效。

### 屏蔽记录

查看已屏蔽账号（头像 + 名称 + handle），支持解除屏蔽、翻页、从 X 同步官方屏蔽列表。

## 隐私

- 所有数据存储在**本地浏览器**，不上传到任何服务器
- 不需要登录、不需要 API Key、不收集任何个人信息
- 扩展仅操作 X/Twitter 页面 DOM，不读取其他网站
- 源代码完全开源，可审计

## 技术栈

- Manifest V3
- 纯前端，零后端依赖
- 综合特征检测引擎（关键词 + 引流信号 + 混杂度 + 随机 handle）
- 支持 Chrome / Edge

## 链接

- [官网](https://vercel-api-hazel-gamma.vercel.app/)
- [下载扩展](https://github.com/hoosin933767/cao/raw/master/extension/cao-extension-v1.0.0.zip)
- [@fuckxegg2](https://x.com/fuckxegg2)
