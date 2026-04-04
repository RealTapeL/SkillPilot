# 发布到 NPM 指南

## 前置准备

1. **注册 npm 账号**（如果还没有）
   ```bash
   npm adduser
   ```

2. **登录 npm**
   ```bash
   npm login
   ```

## 发布步骤

### 1. 确保代码已构建

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm run build
```

### 2. 按顺序发布包

**重要**：必须按依赖顺序发布，先发布核心包，再发布适配器。

```bash
# 1. 发布核心包
npm publish packages/core

# 2. 发布 CLI 工具
npm publish packages/cli

# 3. 发布适配器（可以并行）
npm publish packages/openclaw
npm publish packages/claude-code
npm publish packages/langchain
```

### 3. 使用 npm/pnpm 安装

发布后，用户可以通过以下方式安装：

```bash
# 全局安装 CLI
npm install -g skillpilot

# 或本地安装
npm install skillpilot

# 使用 pnpm
pnpm add -g skillpilot

# 安装适配器
npm install @skillpilot/openclaw
npm install @skillpilot/claude-code
npm install @skillpilot/langchain
```

## 版本更新

1. 更新版本号
   ```bash
   # 更新所有包的版本（手动修改 package.json 中的 version）
   ```

2. 重新构建
   ```bash
   pnpm run build
   ```

3. 重新发布
   ```bash
   npm publish packages/core
   npm publish packages/cli
   # ... 其他包
   ```

## 常见问题

### 1. 包名被占用

如果 `skillpilot` 已被占用，考虑使用 scoped package：
- `@yourusername/skillpilot`
- `@skillpilot/cli`

### 2. 权限问题

确保已登录且有权限：
```bash
npm whoami
```

### 3. 工作区依赖

发布前将 `workspace:*` 改为具体版本号（已配置好）。

## 使用说明文档

发布成功后，用户可以这样使用：

```bash
# 安装 CLI
npm install -g skillpilot

# 索引技能
skillpilot index ~/.openclaw/skills

# 路由查询
skillpilot route "create a GitHub issue"

# 查看帮助
skillpilot --help
```

更多用法见 README.md
