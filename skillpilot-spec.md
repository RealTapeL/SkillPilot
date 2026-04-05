# SkillPilot 技术方案

> **通用 Agent Skill 智能路由引擎** —— 让任意 AI agent 在 LLM 推理之前，自动识别意图、精准调用正确的 Skill

[![Platform](https://img.shields.io/badge/platform-OpenClaw%20%7C%20Claude%20Code%20%7C%20Codex%20%7C%20Gemini%20CLI%20%7C%20LangChain-blue)]()
[![License](https://img.shields.io/badge/license-MIT-green)]()

---

> **⚠️ 重要说明**：本文档包含**设计目标**（规划中）和**实际结果**（已实现）。
> 
> - ✅ **已实现**：见下方 "实际测试结果" 章节
> - 🎯 **设计目标**：见 "Benchmark 方案" 章节（标记为 TODO）
> 
> 当前实际结果：**89.7% 准确率** (10 skills × 58 test cases)，详见 [README](./README.md)

---

## 目录

1. [项目定位](#一项目定位)
2. [核心创新点](#二核心创新点)
3. [整体架构](#三整体架构)
4. [工程结构](#四工程结构)
5. [核心模块实现](#五核心模块实现)
6. [平台适配层](#六平台适配层)
7. [Skill Fingerprint 规范](#七skill-fingerprint-规范)
8. [CLI 工具](#八cli-工具)
9. [Benchmark 方案](#九benchmark-方案)
10. [配置项设计](#十配置项设计)
11. [开发路线图](#十一开发路线图)
12. [GitHub 增长策略](#十二github-增长策略)
13. [技术栈选型](#十三技术栈选型)

---

## 一、项目定位

### 1.1 名字的含义

**SkillPilot** = Skill + Route，两个词直接说明它做什么：给 Skill 做路由。读起来像一个动词，暗示它是主动的、实时的过程，不是静态配置。

### 1.2 一句话定位

```
Agent 装了几千个 Skill，但不知道该用哪个。SkillPilot 解决这个问题。
```

### 1.3 痛点

当前所有主流 agent 框架（OpenClaw、Claude Code、Codex、Gemini CLI、LangChain）处理 skill 选择的方式只有一种：把全部 skill 描述塞进 system prompt，让 LLM 自己决定用哪个。这带来三个问题：

| 问题 | 表现 |
|---|---|
| **慢** | 每次都要等 LLM 完整推理一轮才能开始执行，延迟 1-5 秒 |
| **贵** | skill 描述占据大量 context token，每次对话都在消耗 |
| **不准** | skill 越多，LLM 越容易选错或忽略已安装的 skill |

SkillPilot 在 LLM 推理**之前**完成路由，用向量语义匹配在 <20ms 内找到正确 skill，命中后直接执行，不进 LLM。

### 1.4 竞品对比

| 方案 | 层级 | 平台 | 路由时机 | 自学习 | 冲突检测 |
|---|---|---|---|---|---|
| agent 内置 skill 选择 | LLM prompt | 各自平台 | LLM 推理后 | ✗ | ✗ |
| `agent-dispatch`（OpenClaw skill） | skill 级 | OpenClaw only | LLM 推理后 | ✗ | ✗ |
| `semantic-router`（aurelio-labs） | 通用库 | 无 agent 集成 | 调用前 | ✗ | ✗ |
| **SkillPilot** | **引擎 + 适配层** | **6+ 平台** | **LLM 推理前** | **✓** | **✓** |

---

## 二、核心创新点

### 2.1 Zero-Config Skill Fingerprinting（零配置技能指纹）

现有路由方案（包括 semantic-router）都需要人工定义触发短语。SkillPilot 做到**全自动**：解析任意 `SKILL.md` 全文，自动提取语义向量、使用场景、前置条件和副作用，生成 skill 的"指纹"。用户安装 skill 即可路由，无需任何配置。

```
SKILL.md 全文
    ↓  自动解析
┌─────────────────────────────────┐
│  Skill Fingerprint              │
│  ├─ semantic_vector: float[768] │  ← 描述的语义嵌入
│  ├─ intent_patterns: string[]   │  ← 自动提取的意图模式
│  ├─ side_effects: enum          │  ← read-only | write | network
│  ├─ preconditions: string[]     │  ← 需要哪些 env var / bin
│  └─ conflict_group: string      │  ← 功能重叠分组
└─────────────────────────────────┘
```

### 2.2 Conflict-Aware Routing（冲突感知路由）

13,000+ skill 生态里存在大量功能重叠（如同时安装了 `github` 和 `github-advanced`）。SkillPilot 是第一个系统处理这个问题的方案：

- **重叠检测**：建索引时自动计算 skill 间的语义相似度，标记冲突组
- **上下文感知选择**：根据消息上下文中的具体信号（如 "advanced"、"bulk"、"simple"）在冲突组内选最合适的
- **用户优先级规则**：允许用户声明 `prefer: github-advanced` 覆盖默认选择
- **透明提示**：检测到冲突时，在回复中说明为何选了这个而不是另一个

### 2.3 Feedback Loop（路由反馈自学习）

每次路由结果会被静默记录。当用户纠正（如手动调用了另一个 skill），SkillPilot 自动：
1. 将这次纠正记为负样本，降低原 skill 在该意图模式下的权重
2. 将正确 skill 在该意图模式下的权重提升
3. 累积 10 次纠正后，自动更新本地 skill index

越用越准，不需要用户手动调参。

### 2.4 跨平台通用性

核心路由引擎是纯 TypeScript，**平台无关**。通过薄适配层接入各个 agent 框架。一套索引，到处路由：

```
同一份 ~/.skillpilot/index/  ←── 跨平台共享
        ↑               ↑               ↑
  OpenClaw plugin   Claude Code hook  CLI 工具
```

---

## 三、整体架构

### 3.1 分层设计

```
┌─────────────────────────────────────────────────────────────┐
│                      用户消息                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   Platform Adapter Layer                     │
│   OpenClaw    Claude Code    LangChain    Gemini CLI   CLI   │
└──────────────────────────┬──────────────────────────────────┘
                           │ 标准化的 RouteRequest
┌──────────────────────────▼──────────────────────────────────┐
│                    SkillPilot Core Engine                    │
│                                                              │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  Fast Path │  │  Slow Path   │  │  Conflict Resolver │   │
│  │  关键词+触 │→ │  向量语义    │→ │  冲突感知选择      │   │
│  │  发短语    │  │  embedding   │  │                    │   │
│  └────────────┘  └──────────────┘  └────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │               Skill Index (本地 SQLite + 向量库)     │    │
│  │  fingerprints · conflict_groups · feedback_weights  │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │ RouteResult
┌──────────────────────────▼──────────────────────────────────┐
│                      执行层                                  │
│   高置信度：直接执行 skill，返回结果                          │
│   中置信度：注入 skill 上下文，辅助 LLM                      │
│   低置信度：透传，走 LLM 原生推理                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 路由决策流程

```
收到消息
   │
   ▼
[Fast Path] 关键词 + 触发短语匹配          < 2ms
   │
   ├─ score ≥ 8 → 直接路由（跳过 Slow Path）
   │
   ▼
[Slow Path] 向量语义 embedding 匹配        < 20ms
   │
   ▼
[Conflict Resolver] 冲突组内二次筛选       < 5ms
   │
   ├─ confidence ≥ 0.80 → 硬路由：执行 skill，cancel LLM
   ├─ confidence 0.45~0.80 → 软路由：注入上下文，LLM 参考
   └─ confidence < 0.45  → 透传，记录 no-match 日志
         │
         ▼
   [Feedback Recorder] 异步记录结果，更新权重
```

---

## 四、工程结构

```
skillpilot/
├── package.json
├── pnpm-workspace.yaml
├── packages/
│   ├── core/                          # 平台无关的核心引擎
│   │   ├── src/
│   │   │   ├── index.ts               # 公开 API
│   │   │   ├── fingerprint/
│   │   │   │   ├── SkillParser.ts     # SKILL.md 解析
│   │   │   │   ├── Fingerprinter.ts   # 自动指纹生成
│   │   │   │   └── ConflictDetector.ts # 冲突组检测
│   │   │   ├── router/
│   │   │   │   ├── FastRouter.ts      # 关键词/触发短语快速匹配
│   │   │   │   ├── SemanticRouter.ts  # 向量语义匹配
│   │   │   │   ├── ConflictResolver.ts # 冲突感知二次筛选
│   │   │   │   └── SkillRouter.ts     # 总调度，组合三个路由器
│   │   │   ├── index/
│   │   │   │   ├── SkillIndex.ts      # SQLite + 向量索引管理
│   │   │   │   ├── IndexBuilder.ts    # 从 skill 目录构建索引
│   │   │   │   └── IndexWatcher.ts    # 文件变更热更新
│   │   │   ├── feedback/
│   │   │   │   ├── FeedbackRecorder.ts # 记录路由结果
│   │   │   │   └── WeightUpdater.ts   # 更新 skill 权重
│   │   │   └── embed/
│   │   │       ├── EmbedProvider.ts   # embedding 抽象接口
│   │   │       ├── OpenAIEmbed.ts     # OpenAI text-embedding-3-small
│   │   │       └── LocalEmbed.ts      # 本地 ONNX（offline）
│   │   └── package.json
│   │
│   ├── openclaw/                      # OpenClaw plugin 适配器
│   │   ├── src/
│   │   │   ├── index.ts               # definePluginEntry
│   │   │   └── OpenClawAdapter.ts     # before_dispatch 钩子实现
│   │   ├── openclaw.plugin.json
│   │   └── package.json
│   │
│   ├── claude-code/                   # Claude Code hook 适配器
│   │   ├── src/
│   │   │   └── ClaudeCodeAdapter.ts
│   │   └── package.json
│   │
│   ├── langchain/                     # LangChain tool router 适配器
│   │   ├── src/
│   │   │   └── LangChainAdapter.ts    # 实现 BaseTool 接口
│   │   └── package.json
│   │
│   └── cli/                           # 独立 CLI 工具
│       ├── src/
│       │   ├── index.ts               # Commander.js 入口
│       │   ├── commands/
│       │   │   ├── index.ts           # skillpilot index <dir>
│       │   │   ├── route.ts           # skillpilot route "<query>"
│       │   │   ├── explain.ts         # skillpilot explain "<query>"
│       │   │   └── conflicts.ts       # skillpilot conflicts
│       │   └── output/
│       │       └── Formatter.ts       # 终端彩色输出
│       └── package.json
│
├── benchmarks/                        # 公开 benchmark
│   ├── datasets/
│   │   ├── intents-100.json           # 100 条标注意图测试集
│   │   └── skills-50.json            # 50 个真实 skill 描述
│   ├── run.ts                         # benchmark runner
│   └── results/
│       └── latest.json               # 最新结果（CI 自动更新）
│
├── tests/
│   ├── core/
│   │   ├── fingerprint.test.ts
│   │   ├── router.test.ts
│   │   └── conflict.test.ts
│   └── fixtures/
│       └── mock-skills/               # 测试用 mock SKILL.md
│
└── README.md
```

---

## 五、核心模块实现

### 5.1 Skill Fingerprinter — 零配置自动指纹

```typescript
// packages/core/src/fingerprint/Fingerprinter.ts
import { EmbedProvider } from '../embed/EmbedProvider';
import { parseSkillMd } from './SkillParser';

export interface SkillFingerprint {
  id: string;
  name: string;
  description: string;

  // 自动生成的路由信号
  semanticVector: number[];          // 全文语义嵌入
  intentPatterns: string[];          // 自动提取的意图模式
  keywords: string[];                // 高频关键词

  // 副作用分类（影响路由决策）
  sideEffects: 'read-only' | 'write-local' | 'write-remote' | 'network';

  // 前置条件（未满足则降权）
  preconditions: {
    env: string[];                   // 需要的环境变量
    bins: string[];                  // 需要的外部命令
  };

  // 冲突检测
  conflictGroup?: string;            // 功能重叠分组 ID
  conflictScore: number;             // 与同组其他 skill 的最大相似度

  // 手动 override（来自 SKILL.md frontmatter route: 字段）
  manualTriggers: string[];
  priority: number;

  // 反馈权重（自学习，初始为 1.0）
  feedbackWeight: number;

  // 元信息
  sourcePath: string;
  contentHash: string;               // 用于检测 SKILL.md 变更
  indexedAt: number;
}

export class Fingerprinter {
  constructor(private embed: EmbedProvider) {}

  async fingerprint(skillPath: string): Promise<SkillFingerprint> {
    const { raw, meta } = await parseSkillMd(skillPath);

    // 1. 语义向量：对 name + description + 正文前 500 字 做 embedding
    const embedText = [
      meta.name,
      meta.description,
      raw.slice(0, 500)
    ].join('\n');
    const semanticVector = await this.embed.embed(embedText);

    // 2. 意图模式：从正文中提取 "Use when..." / "Triggered by..." 等句式
    const intentPatterns = extractIntentPatterns(raw);

    // 3. 关键词：TF-IDF 风格的高频名词提取
    const keywords = extractKeywords(raw, meta.description);

    // 4. 副作用分类：根据 requires.bins 和描述中的动词推断
    const sideEffects = classifySideEffects(raw, meta);

    // 5. 手动 override：解析 SKILL.md frontmatter 中的 route: 字段
    const manualTriggers = meta.route?.triggers ?? [];
    const priority = meta.route?.priority ?? 5;

    return {
      id: meta.name ?? path.basename(path.dirname(skillPath)),
      name: meta.name ?? '',
      description: meta.description ?? '',
      semanticVector,
      intentPatterns,
      keywords,
      sideEffects,
      preconditions: {
        env: meta.requires?.env ?? [],
        bins: meta.requires?.bins ?? []
      },
      conflictGroup: undefined,      // 由 ConflictDetector 填充
      conflictScore: 0,
      manualTriggers,
      priority,
      feedbackWeight: 1.0,
      sourcePath: skillPath,
      contentHash: hashContent(raw),
      indexedAt: Date.now()
    };
  }
}

// 从正文提取意图模式（"Use when..."、"Triggered by..."、"Invoke this skill when..."）
function extractIntentPatterns(text: string): string[] {
  const patterns: string[] = [];
  const regex = /(?:use when|triggered by|invoke (?:this )?(?:skill )?when|call when)\s+(.+?)(?:\.|$)/gim;
  for (const match of text.matchAll(regex)) {
    patterns.push(match[1].trim());
  }
  return patterns.slice(0, 10);
}

// 副作用分类
function classifySideEffects(text: string, meta: any): SkillFingerprint['sideEffects'] {
  const ltext = text.toLowerCase();
  if (/\b(write|create|delete|update|post|send|push|commit)\b/.test(ltext)) {
    if (/\b(github|slack|email|telegram|api|http)\b/.test(ltext)) return 'write-remote';
    return 'write-local';
  }
  if (/\b(fetch|request|download|search|browse)\b/.test(ltext)) return 'network';
  return 'read-only';
}
```

### 5.2 ConflictDetector — 冲突感知

```typescript
// packages/core/src/fingerprint/ConflictDetector.ts

export class ConflictDetector {
  // 对所有 skill 两两计算余弦相似度，标记功能重叠组
  detectConflicts(fingerprints: SkillFingerprint[]): SkillFingerprint[] {
    const CONFLICT_THRESHOLD = 0.85;  // 相似度超过此值认为功能重叠
    const groups: Map<string, string[]> = new Map();

    for (let i = 0; i < fingerprints.length; i++) {
      for (let j = i + 1; j < fingerprints.length; j++) {
        const sim = cosineSimilarity(
          fingerprints[i].semanticVector,
          fingerprints[j].semanticVector
        );
        if (sim >= CONFLICT_THRESHOLD) {
          // 合并到同一个冲突组
          const groupId = getOrCreateGroupId(
            fingerprints[i].id,
            fingerprints[j].id,
            groups
          );
          fingerprints[i].conflictGroup = groupId;
          fingerprints[j].conflictGroup = groupId;
          fingerprints[i].conflictScore = Math.max(fingerprints[i].conflictScore, sim);
          fingerprints[j].conflictScore = Math.max(fingerprints[j].conflictScore, sim);
        }
      }
    }

    return fingerprints;
  }
}
```

### 5.3 SkillRouter — 三阶段路由

```typescript
// packages/core/src/router/SkillRouter.ts

export interface RouteResult {
  skill: SkillFingerprint | null;
  confidence: number;
  method: 'fast' | 'semantic' | 'no-match';
  conflictResolved?: boolean;       // 是否经历了冲突消解
  conflictAlternatives?: string[];  // 被排除的冲突 skill 名称
  latencyMs: number;
  trace?: RouteTrace;               // debug 模式下填充
}

export class SkillRouter {
  constructor(
    private index: SkillIndex,
    private fastRouter: FastRouter,
    private semanticRouter: SemanticRouter,
    private conflictResolver: ConflictResolver,
    private config: RouterConfig
  ) {}

  async route(query: string, context?: RouteContext): Promise<RouteResult> {
    const t0 = performance.now();
    const fingerprints = await this.index.getAll();

    // 阶段一：Fast Path（关键词 + 手动触发短语）
    const fastResult = this.fastRouter.match(query, fingerprints);
    if (fastResult && fastResult.score >= this.config.fastRouteMinScore) {
      const resolved = await this.conflictResolver.resolve(fastResult.skill, query, fingerprints);
      return this.buildResult(resolved, 'fast', t0);
    }

    // 阶段二：Slow Path（向量语义匹配）
    const semResult = await this.semanticRouter.match(query, fingerprints);
    if (!semResult) {
      return { skill: null, confidence: 0, method: 'no-match', latencyMs: performance.now() - t0 };
    }

    // 阶段三：Conflict Resolver（冲突感知二次筛选）
    const resolved = await this.conflictResolver.resolve(semResult.skill, query, fingerprints);
    return this.buildResult({ ...semResult, ...resolved }, 'semantic', t0);
  }

  private buildResult(data: any, method: RouteResult['method'], t0: number): RouteResult {
    return {
      skill: data.skill,
      confidence: data.confidence * (data.skill?.feedbackWeight ?? 1),
      method,
      conflictResolved: data.conflictResolved,
      conflictAlternatives: data.alternatives,
      latencyMs: performance.now() - t0
    };
  }
}
```

### 5.4 FeedbackRecorder — 自学习反馈环

```typescript
// packages/core/src/feedback/FeedbackRecorder.ts

export type FeedbackSignal =
  | { type: 'confirmed'; skillId: string; query: string }     // 用户确认了路由
  | { type: 'corrected'; wrongSkillId: string; rightSkillId: string; query: string }  // 用户纠正
  | { type: 'ignored'; skillId: string; query: string };      // 路由了但用户未使用

export class FeedbackRecorder {
  private db: SkillIndex;
  private pendingUpdates: FeedbackSignal[] = [];

  async record(signal: FeedbackSignal): Promise<void> {
    this.pendingUpdates.push(signal);
    // 累积 10 条后批量更新权重
    if (this.pendingUpdates.length >= 10) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    const updates = [...this.pendingUpdates];
    this.pendingUpdates = [];

    for (const signal of updates) {
      if (signal.type === 'confirmed') {
        // 正确路由：小幅提升权重
        await this.db.updateWeight(signal.skillId, w => Math.min(w * 1.05, 2.0));
      } else if (signal.type === 'corrected') {
        // 路由错误：降低错误 skill 权重，提升正确 skill 权重
        await this.db.updateWeight(signal.wrongSkillId, w => Math.max(w * 0.85, 0.1));
        await this.db.updateWeight(signal.rightSkillId, w => Math.min(w * 1.1, 2.0));
      } else if (signal.type === 'ignored') {
        // 用户忽略：轻微降权
        await this.db.updateWeight(signal.skillId, w => Math.max(w * 0.95, 0.3));
      }
    }
  }
}
```

---

## 六、平台适配层

每个适配器实现同一个接口，调用 `@skillpilot/core` 完成路由：

```typescript
// 所有适配器共享的接口
interface SkillPilotAdapter {
  onMessage(query: string, ctx: PlatformContext): Promise<AdapterAction>;
}

type AdapterAction =
  | { type: 'route'; skill: SkillFingerprint; confidence: number }
  | { type: 'inject'; skill: SkillFingerprint; context: string }
  | { type: 'passthrough' };
```

### 6.1 OpenClaw 适配器

```typescript
// packages/openclaw/src/OpenClawAdapter.ts
import { definePluginEntry } from 'openclaw/plugin-sdk';
import { SkillRouter, SkillIndex } from '@skillpilot/core';

export default definePluginEntry({
  id: 'skillpilot',
  name: 'SkillPilot',

  async register(api) {
    const index = await SkillIndex.load('~/.openclaw/skills');
    const router = new SkillRouter(index, api.config);

    api.registerHook('before_dispatch', async (ctx) => {
      const result = await router.route(ctx.message.text);

      if (result.confidence >= api.config.hardRouteThreshold) {
        // 高置信度：直接注入 skill，短路 LLM
        ctx.injectSystemContext(buildSkillContext(result.skill));
        ctx.setMetadata('skillpilot', result);
        if (result.conflictResolved && api.config.showConflictInfo) {
          ctx.appendFooter(
            `\n_SkillPilot: chose \`${result.skill.name}\` over [${result.conflictAlternatives?.join(', ')}]_`
          );
        }
        return { cancel: false };  // 仍走 LLM，但已注入强制上下文
      }

      if (result.confidence >= api.config.softInjectThreshold) {
        ctx.injectSystemContext(buildSoftContext(result.skill));
      }
    });

    api.registerHook('before_agent_reply', async (ctx) => {
      const meta = ctx.metadata?.skillpilot;
      if (meta && api.config.showRoutingInfo) {
        ctx.appendFooter(`\n_via ${meta.skill.name} · ${meta.latencyMs.toFixed(0)}ms_`);
      }
    });

    // 命令：查看路由索引状态
    api.registerCommand({
      name: 'skillpilot',
      description: 'SkillPilot status and diagnostics',
      run: async (args, ctx) => {
        const subcmd = args[0];
        if (subcmd === 'explain') {
          const result = await router.route(args.slice(1).join(' '), { trace: true });
          ctx.reply(formatTrace(result));
        } else if (subcmd === 'conflicts') {
          const conflicts = await index.getConflictGroups();
          ctx.reply(formatConflicts(conflicts));
        } else {
          const stats = await index.getStats();
          ctx.reply(formatStats(stats));
        }
      }
    });
  }
});
```

### 6.2 Claude Code 适配器

```typescript
// packages/claude-code/src/ClaudeCodeAdapter.ts
// Claude Code 通过 CLAUDE.md 中的 hook 配置调用此脚本
import { SkillRouter, SkillIndex } from '@skillpilot/core';

async function main() {
  const query = process.argv[2];
  const skillDir = process.env.SKILLROUTE_SKILL_DIR ?? '~/.claude/skills';

  const index = await SkillIndex.load(skillDir);
  const router = new SkillRouter(index, loadConfig());
  const result = await router.route(query);

  // 输出 JSON，由 Claude Code hook 解析并注入 system context
  process.stdout.write(JSON.stringify(result));
}
main();
```

`CLAUDE.md` 中的配置：
```markdown
## SkillPilot Integration

Before processing any message, run:
```bash
skillpilot route "$MESSAGE" | jq -r '.skill.description // empty'
```
If output is non-empty, use that skill to answer the user.
```

### 6.3 LangChain 适配器

```typescript
// packages/langchain/src/LangChainAdapter.ts
import { BaseTool } from 'langchain/tools';
import { SkillRouter, SkillIndex } from '@skillpilot/core';

export class SkillPilotTool extends BaseTool {
  name = 'skill_router';
  description = 'Routes user intent to the most appropriate installed skill';

  private router: SkillRouter;

  async _call(query: string): Promise<string> {
    const result = await this.router.route(query);
    if (!result.skill) return 'No matching skill found';
    return `Use skill: ${result.skill.name}\n${result.skill.description}`;
  }
}
```

---

## 七、Skill Fingerprint 规范

这是 SkillPilot 对整个 agent skill 生态的标准化贡献——在 `SKILL.md` frontmatter 中定义 `route:` 字段，供 skill 作者提供路由提示，让自动指纹更精准。

此字段完全**可选**。没有 `route:` 字段的 skill 也能被 SkillPilot 自动指纹化，有了则更准。

```yaml
---
name: github
description: Interact with GitHub repositories, issues, pull requests, and workflows

# SkillPilot 路由提示（可选，不填则自动推断）
route:
  # 精确触发短语，比关键词权重高 3 倍
  triggers:
    - "open a PR"
    - "create issue"
    - "review pull request"
    - "list my repos"
    - "check CI status"
  # 功能冲突组（与其他 github-* skill 竞争时的优先级）
  priority: 8
  # 在冲突组内的选择信号（用户消息包含这些词时优先选此 skill）
  prefer_when:
    - "issue"
    - "PR"
    - "repository"
  # 副作用声明（比自动推断更准确）
  side_effects: write-remote

requires:
  env:
    - GITHUB_TOKEN
  bins:
    - gh
---
```

### 字段速查

| 字段 | 类型 | 是否必填 | 说明 |
|---|---|---|---|
| `route.triggers` | `string[]` | 否 | 精确触发短语，优先级最高 |
| `route.priority` | `number` | 否 | 冲突组内的排序权重（1-10，默认 5） |
| `route.prefer_when` | `string[]` | 否 | 消息中包含这些词时，在冲突组内优先选此 skill |
| `route.side_effects` | `enum` | 否 | `read-only` / `write-local` / `write-remote` / `network` |

---

## 八、CLI 工具

CLI 是 SkillPilot 最大的受众入口，任何 agent 框架的用户都能用，不需要安装特定平台。

```bash
# 安装
npm install -g skillpilot

# 建立 skill 索引（支持多个目录）
skillpilot index ~/.openclaw/skills ~/.claude/skills

# 路由查询（单次）
skillpilot route "帮我在 GitHub 上创建一个 issue"
# 输出：
# ✓ github  (confidence: 0.94, method: semantic, 18ms)
#   Description: Interact with GitHub repositories, issues...
#   Triggered by: "create issue" pattern match

# 路由查询（JSON 输出，供脚本使用）
skillpilot route "create a github issue" --json

# 解释路由决策（调试用）
skillpilot explain "send a slack message to #dev"
# 输出：
# Query: "send a slack message to #dev"
# ─────────────────────────────────────
# Fast Path: no trigger match
# Semantic Path:
#   slack          0.91 ██████████████████░░  ← winner
#   slack-advanced 0.89 █████████████████░░░  conflict group A
#   discord        0.61 ████████████░░░░░░░░
#   ...
# Conflict Resolver: chose slack over slack-advanced
#   Reason: "message" + "channel" signals → basic slack preferred
# Final: slack (0.91 × weight 1.0 = 0.91)

# 查看冲突组
skillpilot conflicts
# 输出：
# Conflict Group A (similarity 0.91):
#   slack · slack-advanced · slack-notifier
#   Tip: Add route.prefer_when to disambiguate

# 查看索引统计
skillpilot stats
# 输出：
# Indexed: 127 skills  (3 conflict groups, 12 low-quality fingerprints)
# Last updated: 2 minutes ago
# Embed provider: local-onnx (offline mode)

# 重新建立索引
skillpilot reindex

# 给反馈（训练自学习）
skillpilot feedback correct --wrong slack --right slack-advanced --query "send bulk message"
```

---

## 九、Benchmark 方案

**Benchmark 是项目最强的传播武器。** 发布时附上公开可复现的数据，是技术社区最容易传播的内容。

### 9.1 评估维度

| 指标 | 目标值 | 对比基线 |
|---|---|---|
| 路由准确率（Top-1） | ≥ 92% | LLM 自选 ~78%、关键词匹配 ~61% |
| 路由延迟（P99） | ≤ 25ms | LLM 自选 ~2000ms |
| Token 节省 | ≥ 80% | 不再需要把所有 skill 描述放进 prompt |
| 冲突消解准确率 | ≥ 85% | 无对比基线（竞品不支持此功能） |

### 9.2 测试集构成

```
benchmarks/datasets/
├── intents-100.json     # 100 条标注的用户意图
│                        # {"query": "...", "expected_skill": "github", "difficulty": "easy|hard"}
└── skills-50.json       # 50 个真实 skill 的 SKILL.md 摘要
```

测试集从 ClawHub 上最受欢迎的 50 个 skill 中采样，100 条 intent 由社区贡献标注（可在 README 中发起 "Help us label" 号召，本身就是一种社区参与方式）。

### 9.3 实际测试结果 (Real Results)

**当前实现状态**（Raspberry Pi 5，实际运行）：

```
============================================================
SkillPilot Test Results
============================================================
Dataset: 10 skills × 58 test cases  ✅ 已实现
Total Tests: 58
Correct: 52
Accuracy: 89.7%                     ✅ 实际达成
Avg Latency: ~4ms (library)         ✅ 实际达成
             ~200ms (CLI with Node startup)
```

**测试覆盖**：
- 10 skills: github, git, slack, file-read, file-write, docker, npm, python, aws, database
- 58 test cases: 精确触发、语义匹配、模糊查询

运行测试：
```bash
cd test_openclaw_python
python test_skillpilot.py
```

---

### 9.4 设计目标 (TODO)

**目标 benchmark**（待实现）：

```bash
# TODO: 需要扩展到 50 skills × 100 intents
# TODO: 需要 ONNX 模型支持完整语义匹配

cd benchmarks
pnpm run bench

# 目标输出：
# SkillPilot Benchmark Results
# ─────────────────────────────────────────────
# Dataset: 100 intents × 50 skills     🎯 目标
# ─────────────────────────────────────────────
# Method              Accuracy   P50 lat   P99 lat
# ─────────────────────────────────────────────
# LLM (gpt-4o)         78.0%    1840ms    4200ms
# Keyword only          61.0%       2ms       4ms
# SkillPilot (fast)     84.0%       2ms       4ms
# SkillPilot (full)     93.0%      12ms      23ms  🎯 目标
# ─────────────────────────────────────────────
# Conflict resolution accuracy: 87%    🎯 目标
```

**当前限制**：
- 测试集规模：实际 10 skills vs 目标 50 skills
- 准确率：实际 89.7% vs 目标 93%
- ONNX 语义模型：尚未集成（使用 fallback embedding）

---

## 十、配置项设计

SkillPilot 使用统一的配置文件 `~/.skillpilot/config.yaml`，跨所有平台共享：

```yaml
# ~/.skillpilot/config.yaml

# 路由引擎配置
router:
  # 硬路由阈值：超过此置信度直接调用 skill，注入强制上下文
  hardRouteThreshold: 0.80

  # 软路由阈值：超过此置信度注入 skill 上下文，辅助 LLM
  softInjectThreshold: 0.45

  # 是否启用语义匹配（关掉则只用关键词，速度更快但精度低）
  enableSemantic: true

  # 调试模式：输出完整路由 trace
  debug: false

# Embedding 提供商
embed:
  # openai | local-onnx
  # local-onnx 完全离线，首次运行自动下载 ~30MB 模型
  provider: local-onnx

  # 仅 provider=openai 时有效
  openaiModel: text-embedding-3-small

# Skill 索引配置
index:
  # 扫描的 skill 目录（支持多个）
  skillDirs:
    - ~/.openclaw/skills
    - ~/.claude/skills

  # 索引刷新间隔（分钟）
  refreshInterval: 5

  # 冲突检测阈值（两个 skill 的语义相似度超过此值认为功能重叠）
  conflictThreshold: 0.85

# 反馈自学习
feedback:
  enabled: true
  # 累积多少条反馈后批量更新权重
  batchSize: 10

# 平台特定配置
platforms:
  openclaw:
    # 是否在回复末尾显示路由信息
    showRoutingInfo: false
    showConflictInfo: true

  cli:
    # CLI 默认输出格式（human | json）
    outputFormat: human
```

---

## 十一、开发路线图

### v0.1 — MVP（第 1-2 周）

核心目标：让第一批用户能跑起来，并且有可晒的 benchmark 数据。

- [ ] `@skillpilot/core`：SkillParser + 关键词 FastRouter + 基础 SkillIndex
- [ ] `@skillpilot/cli`：`index`、`route`、`explain` 三个命令
- [ ] `@skillpilot/openclaw`：`before_dispatch` 钩子接入
- [ ] 基础 benchmark：准确率 vs. 关键词匹配 vs. 随机
- [ ] 发布到 npm，README + 演示 GIF

**v0.1 的最小传播素材**：一张图，左边"LLM 自选 2 秒"，右边"SkillPilot 路由 15ms"。

### v0.2 — 核心创新落地（第 3-5 周）

- [ ] 语义 embedding（local-onnx，完全离线）
- [ ] Skill Fingerprinting 自动提取意图模式
- [ ] ConflictDetector 冲突组检测
- [ ] ConflictResolver 冲突感知二次筛选
- [ ] `@skillpilot/claude-code` 适配器
- [ ] `skillpilot conflicts` 命令
- [ ] 完整 benchmark（含冲突消解准确率）
- [ ] Skill Fingerprint 规范（`route:` frontmatter）文档定稿

### v0.3 — 自学习 + 生态扩展（第 6-8 周）

- [ ] FeedbackRecorder + WeightUpdater 反馈自学习
- [ ] `@skillpilot/langchain` 适配器
- [ ] `skillpilot feedback` 命令
- [ ] Web dashboard（本地 localhost，可视化索引和路由日志）
- [ ] 向 20+ 个热门 skill 提 PR 加 `route:` frontmatter
- [ ] 向 `awesome-openclaw-skills`、`awesome-agent-skills` 提交

### v0.4 — 生产级（第 9-12 周）

- [ ] Skill pipeline：一条消息触发多个 skill 串联执行
- [ ] 多语言 query 支持（中文、日文 embedding 优化）
- [ ] `@skillpilot/gemini-cli` 适配器
- [ ] OpenClaw Control UI 集成（可视化路由日志嵌入 Web UI）
- [ ] RFC：提交 `route:` frontmatter 规范给 OpenClaw、AgentSkills spec 社区

---

## 十二、GitHub 增长策略

### 12.1 项目口号

```
"Your agent has 1,000 skills. SkillPilot makes sure it uses the right one."
```

### 12.2 发布策略

**发布时机**：选择周二或周三上午（UTC+8 的工作日下午），这是 HackerNews 和 GitHub Trending 流量最高的时间段。

**首发内容清单**：
- README 顶部：准确率对比图（表格 + 折线图截图）
- 演示 GIF：同一条消息，SkillPilot 15ms vs LLM 2000ms
- `benchmarks/results/latest.json`：公开可复现的 benchmark 数据
- `CONTRIBUTING.md`：如何给 benchmark 贡献标注数据（降低参与门槛）

### 12.3 社区渗透

**OpenClaw 生态**（发布第 1 天）：
- 发布到 ClawHub + `awesome-openclaw-skills`
- 在主仓库 Discussions 发"skill auto-routing RFC"，附链接
- 给 `steipete/github`、`steipete/slack` 等高人气 skill 提 PR 加 `route:` frontmatter

**通用 agent 生态**（发布第 2-3 天）：
- 提交到 `awesome-agent-skills`（已有 9k star 的列表）
- 在 LangChain Discord 的 `#tools` 频道发布
- 在 HackerNews 发 "Show HN: SkillPilot — route agent skills before LLM inference"

**技术内容**（发布后 1 周内）：
- Dev.to 文章：《How I built a pre-LLM skill router with 93% accuracy》
- 少数派文章（面向中文用户）
- 发布 benchmark 数据到 Twitter/X，@aurelio-labs（semantic-router 作者）做友好比较

### 12.4 持续增长钩子

- CI badge：`accuracy: 93% | P99: 23ms | skills indexed: 127`，放在 README 顶部，每次 push 自动更新
- "Help us improve accuracy" issue：邀请社区贡献 benchmark 标注，参与者自动 credited
- Monthly changelog：每月发布一次路由精度提升报告，保持 repo 活跃度

---

## 十三、技术栈选型

| 模块 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript | 与 OpenClaw、Claude Code 生态对齐；类型安全 |
| Monorepo | pnpm workspaces | 多包管理，按需安装各平台适配器 |
| 打包 | tsup | ESM 输出，支持 tree-shaking |
| 测试 | vitest | 快，与 OpenClaw 官方要求对齐 |
| 本地向量库 | better-sqlite3 + sqlite-vss | 轻量，无需启动额外服务，跨平台 |
| 本地 embedding | onnxruntime-node + all-MiniLM-L6-v2 | 30MB 模型，完全离线，768 维，质量足够 |
| 云端 embedding | openai text-embedding-3-small | 1536 维，高精度，按需可选 |
| SKILL.md 解析 | gray-matter + js-yaml | 成熟，支持多行 frontmatter |
| CLI | commander + chalk + cli-table3 | 标准组合，输出美观 |
| 配置 | cosmiconfig + zod | 自动发现配置文件 + 类型验证 |
| CI | GitHub Actions | 自动跑 benchmark，更新 badge |

---

## 附录 A：核心 API 速查

```typescript
import { SkillIndex, SkillRouter } from '@skillpilot/core';

// 建立索引
const index = await SkillIndex.load('~/.openclaw/skills');

// 路由
const router = new SkillRouter(index);
const result = await router.route('create a github issue');
// → { skill: { name: 'github', ... }, confidence: 0.94, method: 'semantic', latencyMs: 18 }

// 带 trace 的路由（调试用）
const debugResult = await router.route('create a github issue', { trace: true });
// → result.trace 包含所有 skill 的得分矩阵

// 反馈
await router.feedback({ type: 'confirmed', skillId: 'github', query: 'create a github issue' });
await router.feedback({ type: 'corrected', wrongSkillId: 'slack', rightSkillId: 'slack-advanced', query: 'bulk send' });

// 查询冲突组
const conflicts = await index.getConflictGroups();
```

---

## 附录 B：与 semantic-router 的区别

[semantic-router](https://github.com/aurelio-labs/semantic-router) 是一个优秀的通用库，SkillPilot 不是它的竞品，而是在其思路基础上针对 agent skill 场景的专化实现。

| 维度 | semantic-router | SkillPilot |
|---|---|---|
| 场景 | 通用 LLM 路由 | 专为 agent skill 设计 |
| 路由来源 | 人工定义 utterances | 自动从 SKILL.md 提取指纹 |
| 冲突处理 | ✗ | ✓ 自动检测 + 上下文消解 |
| 自学习 | ✗ | ✓ 反馈权重更新 |
| agent 集成 | 需自行接入 | 内置 OpenClaw/Claude Code/LangChain 适配器 |
| 离线支持 | 依赖云端 embedding | ✓ 内置本地 ONNX embedding |

---

*方案版本：v2.0 · 2026-04 · SkillPilot*
