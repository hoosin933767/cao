# 项目文档

> 本项目的开发规则见 **`../../_dev-rules/PROJECT_RULES.md`**（所有项目共享的唯一规则源）
> 规则使用说明见 **`../../_dev-rules/README.md`**

## 文档索引

| 文件 | 内容 |
|------|------|
| `requirements.md` | 需求文档（用户原话 + 确认结果） |
| `design.md` | 设计文档（架构、评分规则、存储、边界） |
| `CHANGELOG.md` | 变更日志（每次改动 + 原因 + 回测） |
| `samples/` | 回测样本库（固定样本，永久保留） |
| `ideas/` | 未开发的功能设计（一键查杀） |

## 项目信息

- 名称：CAO — Clean Accounts Optimizer（Chrome 扩展，MV3）
- 功能：全自动检测 X/Twitter 垃圾回复，多维特征引擎一键屏蔽
- 回测：`node scripts/regression.js`（38 条样本）
