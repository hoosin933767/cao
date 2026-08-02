# GitHub 备份规范（所有项目通用）

> 目的：让**每个项目**的代码自动备份到 GitHub，且**不反复输入 Token**。
> 属于 `_dev-rules/` 共享规则的一部分，所有项目引用同一份。

---

## 〇、项目仓库原则（重要）

1. **一个项目 = 一个独立目录 = 一个独立 Git 仓库**
   - 禁止把多个项目塞进同一个仓库（如都放 CAO 下面）
   - 每个项目有自己的 `.git/`、自己的 GitHub 远程仓库
2. 新项目建目录后立即 `git init`，立即关联 GitHub 远程
3. 项目根目录放 `README.md`，注明"开发规则见 ../../_dev-rules/PROJECT_RULES.md"

---

## 一、核心原则

1. **首选 SSH 认证**（推荐，无需 Token、无过期时间、无需每次输入）
   - 一台电脑生成一次 SSH key，**一个 key 对 GitHub 账号下所有仓库有效**
2. **Token 永远不写进 git remote URL**（`https://user:token@github.com/...` 是错误做法）
   - 风险：Token 明文存在 `.git/config`，泄露即被盗用
3. Token 方式仅作为备用（SSH 不可用时），Token 只存系统凭据库

---

## 二、SSH 方式（推荐）

### 2.1 生成 SSH key（一次性，每台电脑做一次）

```bash
# 检查是否已有 key
ls ~/.ssh/id_ed25519.pub ~/.ssh/id_rsa.pub 2>/dev/null

# 没有则生成（一路回车即可）
ssh-keygen -t ed25519 -C "你的邮箱或备注"

# 查看公钥
cat ~/.ssh/id_ed25519.pub
```

### 2.2 添加公钥到 GitHub（一次性）

```
GitHub → Settings → SSH and GPG keys → New SSH key
→ Title: 任意（如 MacBook-Air）
→ Key: 粘贴上一步的公钥内容 → Add SSH key
```

> 已添加后：**所有项目、所有仓库**都能用这把 key，不用重复添加。

### 2.3 验证 SSH 连接（一次性）

```bash
ssh -T git@github.com
# 看到 "Hi <用户名>! You've successfully authenticated" 即成功
```

### 2.4 新项目关联远程仓库

```bash
# 1. 先建本地仓库
cd <项目目录>
git init
git add -A
git commit -m "feat: 项目初始化"

# 2. 去 GitHub 网页建仓库（Settings 右侧 + New repository，命名与目录同名）
# 3. 关联远程（用 SSH URL）
git remote add origin git@github.com:<用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

### 2.5 已有 HTTPS 项目切换 SSH

```bash
git remote set-url origin git@github.com:<用户名>/<仓库名>.git
```

---

## 三、Token 方式（备用）

### 3.1 生成 Token（GitHub 网页）

```
Settings → Developer settings → Personal access tokens → Tokens (classic)
→ Generate new token
→ 勾选权限：repo（完整仓库权限）+ write:public_key（添加 SSH key 用）
→ 生成后复制（只显示一次！）
```

### 3.2 存入系统钥匙串（macOS）

```bash
printf 'protocol=https\nhost=github.com\nusername=<你的GitHub用户名>\npassword=<TOKEN>\n\n' | git credential-osxkeychain store
```

### 3.3 remote 用干净 URL（不含 Token）

```bash
git remote set-url origin https://github.com/<用户名>/<仓库名>.git
```

---

## 四、日常提交流程（每个项目）

```
改代码前：git status 确认干净
  → 改代码
  → git add <只加改动的文件>
  → git commit -m "类型: 描述"        # feat/fix/docs/style/test/refactor
  → git push origin <分支名>          # SSH 或钥匙串，无需输入
  → git log origin/<分支> --oneline -1  # 确认推送成功
```

---

## 五、Token 泄露应急（重要）

发现 Token 可能泄露（贴到对话/日志/远程仓库）时：

1. 立即去 GitHub **撤销**该 Token：Settings → Developer settings → Tokens → Revoke
2. 重新生成新 Token，重复第三节配置
3. 检查本地所有项目 `git remote -v`，确认没有明文 Token

---

## 六、AI 代理注意事项（本项目场景）

- AI（Codex/TRAE 等）**不得把 Token 写进任何文件**（代码、配置、文档、remote URL）
- AI 需要配置凭据时，使用钥匙串命令或 SSH，命令输出不回显 Token
- AI 发现 remote URL 含明文 Token 时，应立即提醒用户撤销并重新配置（见第五节）
- AI 发现多个项目共用同一仓库时，应提醒用户拆分（见第〇节）

---

*规则文档 · 2026-08-02 建立，2026-08-02 更新加入 SSH 方式与项目仓库原则*
