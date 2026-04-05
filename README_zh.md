# SkillPilot

> **通用 Agent Skill 智能路由引擎** —— 在 LLM 推理之前完成技能路由

[![Platform](https://img.shields.io/badge/platform-OpenClaw%20%7C%20Claude%20Code%20%7C%20Codex%20%7C%20LangChain-blue)]()
[![npm](https://img.shields.io/npm/v/@realtapel/skillpilot)](https://www.npmjs.com/package/@realtapel/skillpilot)
[![License](https://img.shields.io/badge/license-MIT-green)]()

**你的 Agent 有 1000 个技能，SkillPilot 确保它使用正确的那一个。**

🌐 [English](./README.md) | [Python 测试示例](./test_openclaw_python/examples.md)

---

## 问题所在

当前主流的 Agent 框架（OpenClaw、Claude Code、Codex 等）处理技能选择的方式只有一种：把**所有技能描述塞进系统提示词**，让 LLM 自己决定。这带来三个问题：

| 问题 | 影响 |
|------|------|
| **慢** | 每次都要等待 LLM 完整推理一轮（1-5 秒）才能开始执行 |
| **贵** | 技能描述占据大量上下文 token，每次对话都在消耗 |
| **不准** | 技能越多，LLM 越容易选错或忽略已安装的技能 |

## 解决方案

SkillPilot 在 LLM 推理**之前**完成技能路由，使用快速关键词匹配 + 语义回退：

```
用户查询
    ↓
SkillPilot 路由器（快速路径：1-5ms）
    ↓
语义匹配（可选，~20ms 需 ONNX 模型）
    ↓
冲突消解（相似技能自动选择）
    ↓
执行技能 或 注入上下文
```

**总路由时间：1-5ms**（库调用）—— 对比等待 LLM 的 1-5 秒

> **注意：** CLI 延迟约 200ms（包含 Node.js 启动）。生产环境建议直接调用库。

---

## 安装

### 方式一：全局安装（推荐）

```bash
# 使用 pnpm（推荐）
pnpm add -g @realtapel/skillpilot

# 或使用 npm
npm install -g @realtapel/skillpilot
```

### 方式二：本地开发

从源码克隆并构建：

```bash
# 克隆仓库
git clone https://github.com/RealTapeL/SkillPilot.git
cd SkillPilot

# 安装依赖
pnpm install

# 构建所有包
cd packages/core && npx tsup src/index.ts --format esm --dts
cd ../cli && npx tsup src/index.ts --format esm --dts

# 链接本地 core 包（重要！）
cd ../cli && pnpm link ../core

# 创建快捷命令
echo 'alias skillpilot="node /path/to/SkillPilot/packages/cli/dist/index.js"' >> ~/.bashrc
source ~/.bashrc
```

### 安装适配器

```bash
npm install @realtapel/skillpilot-openclaw    # OpenClaw
npm install @realtapel/skillpilot-claude-code # Claude Code
npm install @realtapel/skillpilot-langchain   # LangChain
```

---

## 快速开始

### CLI 使用

```bash
# 1. 索引技能（首次设置）
skillpilot index ~/.openclaw/skills ~/.claude/skills
# 或使用本地开发版本：
# node packages/cli/dist/index.js index ~/.openclaw/skills

# 2. 路由查询
skillpilot route "create a GitHub issue"
# 输出：
# ✓ github  (confidence: 0.94, method: semantic, 18ms)
#   Description: Interact with GitHub repositories, issues...

# 3. 解释路由决策
skillpilot explain "send a slack message"
# 显示详细评分和冲突消解

# 4. 查看冲突组
skillpilot conflicts

# 5. 查看统计信息
skillpilot stats

# 6. 记录反馈（用于自学习）
skillpilot feedback correct --wrong slack --right slack-advanced --query "bulk send"
```

### 使用本地构建

如果你从源码安装：

```bash
cd /path/to/SkillPilot/packages/cli

# 索引技能
node dist/index.js index /path/to/skills

# 路由查询
node dist/index.js route "deploy to production"

# 或创建别名
echo 'alias sp="node /path/to/SkillPilot/packages/cli/dist/index.js"' >> ~/.bashrc
source ~/.bashrc
sp route "create GitHub issue"
```

### OpenClaw 集成

```typescript
// 在你的 OpenClaw 插件中
import { createOpenClawPlugin } from '@realtapel/skillpilot-openclaw';

export default createOpenClawPlugin();
```

### Claude Code 集成

添加到你的 `CLAUDE.md`：

```markdown
## SkillPilot 集成

处理任何消息前，运行：
```bash
skillpilot-claude "$MESSAGE"
```
如果输出指示应该使用某个技能，优先使用该技能。
```

### LangChain 集成

```typescript
import { SkillRouteTool } from '@realtapel/skillpilot-langchain';

const router = new SkillRouteTool({ skillDir: './skills' });
await router.initialize();

const result = await router.invoke("create a GitHub issue");
// { skill: "github", confidence: 0.94, shouldUse: true }
```

---

## 核心特性

### 🎯 零配置技能指纹

SkillPilot 自动解析任意 `SKILL.md` 并提取：
- 语义嵌入向量
- 意图模式
- 关键词
- 副作用分类

无需手动配置。安装技能 → 即可路由。

### ⚡ 三阶段路由

| 阶段 | 时间 | 用途 |
|------|------|------|
| 快速路径 | 1-5ms | 关键词 + 触发短语匹配 |
| 语义路径 | ~20ms | 向量相似度（需 ONNX 模型） |
| 冲突消解 | < 1ms | 相似技能自动选择 |

**路由示例：**
```bash
"create a GitHub issue" → github (快速路径, 2ms)
"show me the README" → file-read (模糊匹配, 3ms)
"deploy to production" → aws (语义匹配, 5ms)
```

### 🤝 冲突感知路由

自动检测并解决相似技能之间的冲突（如 `github` vs `github-advanced`）：

```bash
$ skillpilot conflicts
Conflict Group A (similarity 0.91):
  github · github-advanced · github-enterprise
  Tip: Add route.prefer_when to disambiguate
```

### 🔄 自学习

记录路由反馈并自动调整权重：

```bash
# 记录一次纠正
skillpilot feedback correct --wrong slack --right slack-advanced --query "bulk send"
```

### 🔌 跨平台

同一个索引，多个平台共享：

```
~/.skillpilot/index/  ←── 跨平台共享
        ↑               ↑               ↑
  OpenClaw        Claude Code     CLI Tool
```

---

## Skill 指纹规范

SkillPilot 可以从任意 `SKILL.md` 自动提取指纹。为了更精确的路由，技能作者可以在 frontmatter 中添加 `route:` 部分：

```yaml
---
name: github
description: Interact with GitHub repositories

route:
  triggers:
    - "open a PR"
    - "create issue"
  priority: 8
  prefer_when:
    - "issue"
    - "PR"
  side_effects: write-remote
---
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `triggers` | `string[]` | 精确触发短语 |
| `priority` | `number` | 冲突组优先级 (1-10) |
| `prefer_when` | `string[]` | 包含这些词时优先选择此技能 |
| `side_effects` | `enum` | `read-only` / `write-local` / `write-remote` |

---

## 基准测试

本地运行真实基准测试：

```bash
# 快速基准测试 (bash, 无需依赖)
./benchmark_simple.sh

# Python 测试套件
cd test_openclaw_python
pip install -r requirements.txt
python test_skillpilot.py      # 功能测试
python benchmark.py            # 性能测试
```

### 运行测试

```bash
# TypeScript 单元测试 (需要先构建)
pnpm test

# Python 集成测试
cd test_openclaw_python
python test_skillpilot.py
```

### 真实结果 (Raspberry Pi 5, 10 个技能, 58 个测试用例)

```
============================================================
SkillPilot 测试结果
============================================================
总测试数: 58
正确匹配: 52
准确率: 89.7%
平均延迟: ~4ms (库) / ~200ms (CLI 含 Node 启动)
```

**测试覆盖：**
- 10 个技能：github, git, slack, file-read, file-write, docker, npm, python, aws, database
- 58 个测试用例：精确触发、语义匹配、模糊查询
- 快速路径匹配：约 90% 的查询

**关键改进：**
- 修复模糊匹配："show me the README" → file-read
- 修复 "create a GitHub issue" 正确路由到 github（而不是 git）
- 支持部分触发词匹配（如 "show" 匹配 "show content"）

**已知限制：**
- "deploy to production" 仍需更好的语义模型（ONNX）才能匹配
- 文件扩展名处理（如 "README.md"）需要改进

### 对比

| 指标 | 纯 LLM | SkillPilot |
|------|--------|------------|
| 延迟 | 1000-5000ms | ~200ms (CLI) / ~1-5ms (库) |
| 准确率 | ~78% | **~90%** |

---

## 架构

```
┌─────────────────────────────────────────────┐
│              User Message                    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Platform Adapter                   │
│  OpenClaw | Claude Code | LangChain | CLI   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         SkillPilot Core Engine               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐│
│  │  Fast    │ │ Semantic │ │   Conflict   ││
│  │  Router  │ │  Router  │ │   Resolver   ││
│  └──────────┘ └──────────┘ └──────────────┘│
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │      Skill Index (SQLite + Vectors)   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## 配置

创建 `~/.skillpilot/config.yaml`：

```yaml
router:
  hardRouteThreshold: 0.80    # 直接执行技能
  softInjectThreshold: 0.45   # 注入上下文
  enableSemantic: true        # 启用向量匹配

embed:
  provider: local-onnx        # 或 'openai'

index:
  skillDirs:
    - ~/.openclaw/skills
    - ~/.claude/skills

feedback:
  enabled: true
  batchSize: 10
```

---

## 故障排除

### 错误："Could not locate the bindings file" (better-sqlite3)

此错误发生在原生 SQLite 模块未编译时。解决方法：

```bash
# 进入 better-sqlite3 目录
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3

# 编译原生模块
npm run build-release

# 或重新安装并编译
pnpm rebuild better-sqlite3
```

### 全局安装权限错误

如果在全局安装时遇到 `EACCES` 错误：

```bash
# 方法 1：使用 pnpm（推荐）
pnpm add -g @realtapel/skillpilot

# 方法 2：使用 npx（无需安装）
npx @realtapel/skillpilot route "create GitHub issue"

# 方法 3：修改 npm 全局目录
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### ONNX 模型未找到警告

这是正常的 - SkillPilot 将使用回退嵌入方法：

```
ONNX model not found at ~/.skillpilot/models/all-MiniLM-L6-v2.onnx, using fallback embedding
```

如需使用完整 ONNX 模型，请单独下载或在 `~/.skillpilot/config.yaml` 中配置 OpenAI 嵌入。

---

## 开发

```bash
# 克隆仓库
git clone https://github.com/RealTapeL/SkillPilot.git
cd skillpilot

# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 运行基准测试
pnpm bench
```

---

## 包列表

| 包名 | 说明 | npm |
|------|------|-----|
| `@realtapel/skillpilot-core` | 核心路由引擎 | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot-core) |
| `@realtapel/skillpilot` | CLI 工具 | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot) |
| `@realtapel/skillpilot-openclaw` | OpenClaw 插件适配器 | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot-openclaw) |
| `@realtapel/skillpilot-claude-code` | Claude Code 钩子适配器 | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot-claude-code) |
| `@realtapel/skillpilot-langchain` | LangChain 工具适配器 | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot-langchain) |

---

## 许可证

MIT

---

## 参与贡献

欢迎贡献！查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解指南。

---

**SkillPilot** —— Route smarter, not harder.

---

## 相关链接

- [English README](./README.md)
- [GitHub 仓库](https://github.com/RealTapeL/SkillPilot)
- [npm 包](https://www.npmjs.com/package/@realtapel/skillpilot)
