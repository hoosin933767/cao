# GitHub 备份规范（所有项目通用）

> 目的：让所有项目的代码自动备份到 GitHub，且**不反复输入 Token**。
> 属于 `_dev-rules/` 共享规则的一部分，所有项目引用同一份。

---

## 一、核心原则

1. **Token 永远不写进 git remote URL**（`https://user:token@github.com/...` 是错误做法）
   - 风险：Token 明文存在 `.git/config`，泄露即被盗用
2. **Token 只存系统凭据库**（macOS 钥匙串 / Windows 凭据管理器 / Linux libsecret）
3. **每个项目 remote 用干净的 HTTPS URL**，凭据由系统自动提供

---

## 二、首次配置（一次性，每台电脑做一次）

### 2.1 生成 Token（GitHub 网页）

```
Settings → Developer settings → Personal access tokens → Tokens (classic)
→ Generate new token
→ 勾选权限：repo（完整仓库权限）+ workflow（如果有 CI）
→ 生成后复制（只显示一次！）
```

> 建议：Token 命名 `codex-backup`，过期时间选 90 天或自定义，到期后重新生成。

### 2.2 存入系统钥匙串（macOS 推荐 osxkeychain）

```bash
# 一条命令存进钥匙串（不会写入任何项目文件）
printf 'protocol=https\nhost=github.com\nusername=<你的GitHub用户名>\npassword=<TOKEN>\n\n' | git credential-osxkeychain store
```

### 2.3 把 remote 设为干净 URL（不含 Token）

```bash
git remote set-url origin https://github.com/<用户名>/<仓库名>.git
```

### 2.4 验证

```bash
git ls-remote origin HEAD
# 无报错、无要求输入密码 → 配置成功
```

---

## 三、日常提交流程（每个项目）

```
改代码前：git status 确认干净
  → 改代码
  → git add <只加改动的文件>
  → git commit -m "类型: 描述"        # feat/fix/docs/style/test/refactor
  → git push origin <分支名>          # 不再需要输入 Token
  → git log origin/<分支> --oneline -1  # 确认推送成功
```

---

## 四、多项目通用配置（省去重复设置）

在 `~/.gitconfig` 中设置全局凭据助手：

```bash
git config --global credential.helper osxkeychain
```

这样所有项目共用钥匙串里的 GitHub 凭据，新项目 clone 后直接能 push。

---

## 五、Token 泄露应急（重要）

发现 Token 可能泄露（贴到对话/日志/远程仓库）时：

1. 立即去 GitHub **撤销**该 Token：Settings → Developer settings → Tokens → Revoke
2. 重新生成新 Token，重复第二节配置
3. 检查本地所有项目 `git remote -v`，确认没有明文 Token

---

## 六、AI 代理注意事项（本项目场景）

- AI（Codex/TRAE 等）**不得把 Token 写进任何文件**（代码、配置、文档、remote URL）
- AI 需要配置凭据时，使用 2.2 的钥匙串命令，命令本身含 Token 属临时操作，但**输出中不回显**
- AI 发现 remote URL 含明文 Token 时，应立即提醒用户撤销并重新配置（见第五节）

---

*规则文档 · 2026-08-02 加入 _dev-rules 共享库*
