# SkillPilot 测试示例

本文档展示如何使用测试脚本来验证 SkillPilot 在 OpenClaw 环境中的表现。

## 快速开始

```bash
cd test_openclaw_python
pip install -r requirements.txt
```

---

## 1. 基础功能测试 (test_skillpilot.py)

测试 SkillPilot 的路由准确率和延迟性能。

### 基本用法

```bash
python test_skillpilot.py
```

### 输出示例

```
============================================================
SkillPilot OpenClaw Integration Test
============================================================
Indexing skills from /home/lsy/skillpilot/test_openclaw_python/skills...
✓ Skills indexed successfully

Running 23 test cases...
✓ run a docker container... ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100%

============================================================
SkillPilot OpenClaw Test Results
============================================================
┏━━━━━━━━━━━━━┳━━━━━━━┓
┃ Metric      ┃ Value ┃
┡━━━━━━━━━━━━━╇━━━━━━━┩
│ Total Tests │ 23    │
│ Correct     │ 20    │
│ Accuracy    │ 87.0% │
│ Avg Latency │ 1.3ms │
└─────────────┴───────┘

Detailed Results:
┏━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━┓
┃ Query              ┃ Expected   ┃ Actual     ┃ Confidence ┃ Latency ┃ Status ┃
┡━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━┩
│ create issue       │ github     │ github     │ 1.00       │ 1ms     │ PASS   │
│ open a PR          │ github     │ github     │ 1.00       │ 1ms     │ PASS   │
│ send slack message │ slack      │ slack      │ 1.00       │ 1ms     │ PASS   │
│ read file          │ file-read  │ file-read  │ 1.00       │ 1ms     │ PASS   │
│ build docker       │ docker     │ docker     │ 1.00       │ 1ms     │ PASS   │
└────────────────────┴────────────┴────────────┴────────────┴─────────┴────────┘
```

### 添加自定义测试用例

编辑 `test_skillpilot.py` 中的 `TEST_CASES` 列表：

```python
TEST_CASES = [
    # 使用触发词（高准确率）
    TestCase("create issue", "github", "触发词测试"),
    
    # 使用语义匹配
    TestCase("create a GitHub issue", "github", "语义测试"),
    
    # 你的自定义测试
    TestCase("你的查询", "期望技能", "描述"),
]
```

---

## 2. OpenClaw 模拟测试 (openclaw_mock.py)

模拟 OpenClaw 的完整调度流程，包括钩子机制。

### 基本用法

```bash
python openclaw_mock.py
```

### 输出示例

```
============================================================
OpenClaw + SkillPilot Integration Demo
============================================================
╭──────────────────────────────────────────────────────────╮
│ OpenClaw Dispatch                                        │
│ Message: create a GitHub issue                           │
╰──────────────────────────────────────────────────────────╯

1. before_dispatch hooks
→ Calling SkillPilot for routing...
  ✓ Routed to: github
    Confidence: 1.00, Method: fast, Latency: 1ms
  → Injected system context for github

2. LLM Processing (simulated)
System context injected:
╭──────────────────────────────────────────────────────────╮
│ Context 1                                                │
│ You have a skill available: github                       │
│ Description: Interact with GitHub repositories...        │
│ Use this skill to answer the user's request.             │
╰──────────────────────────────────────────────────────────╯
Agent reply: I've processed your request: 'create a GitHub issue'

3. before_agent_reply hooks

Final Output:
╭──────────────────────────────────────────────────────────╮
│ Output                                                   │
│ I've processed your request: 'create a GitHub issue'     │
│ _via github · 1ms_                                       │
╰──────────────────────────────────────────────────────────╯
```

### 工作原理

```python
# 创建 OpenClaw 模拟器
openclaw = OpenClawMock()

# 发送消息
openclaw.dispatch("create a GitHub issue")

# 内部流程：
# 1. before_dispatch 钩子 → SkillPilot 路由
# 2. 根据置信度注入系统上下文
# 3. LLM 处理（模拟）
# 4. before_agent_reply 钩子 → 添加路由信息
```

### 配置选项

```python
openclaw.config = {
    "hardRouteThreshold": 0.80,    # 硬路由阈值
    "softInjectThreshold": 0.45,   # 软注入阈值
    "showRoutingInfo": True,       # 显示路由信息
    "showConflictInfo": True       # 显示冲突信息
}
```

---

## 3. 性能基准测试 (benchmark.py)

测试路由延迟和吞吐量性能。

### 基本用法

```bash
python benchmark.py
```

### 输出示例

```
============================================================
SkillPilot Performance Benchmark
============================================================

Running Latency Test (5 iterations per query)...

Latency Statistics
┏━━━━━━━━━━━━━┳━━━━━━━━━━━━━┓
┃ Metric      ┃ Value (ms)  ┃
┡━━━━━━━━━━━━━╇━━━━━━━━━━━━━┩
│ Count       │ 50          │
│ Min         │ 0.82        │
│ Max         │ 4.15        │
│ Mean        │ 1.45        │
│ Median      │ 1.20        │
│ P95         │ 3.80        │
│ P99         │ 4.10        │
│ Std Dev     │ 0.89        │
└─────────────┴─────────────┘

Detailed Results:
┏━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━━━━┓
┃ Query               ┃ Skill   ┃ Confidence ┃ Method   ┃ Avg Latency ┃
┡━━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━━━━┩
│ create GitHub issue │ github  │ 1.00       │ fast     │ 0.9ms       │
│ send Slack message  │ slack   │ 1.00       │ fast     │ 0.8ms       │
│ read file           │ file... │ 1.00       │ fast     │ 0.9ms       │
│ build Docker        │ docker  │ 1.00       │ fast     │ 0.9ms       │
└─────────────────────┴─────────┴────────────┴──────────┴─────────────┘

Throughput Test:
┏━━━━━━━━━━━━━━━━━━┳━━━━━━━━┓
┃ Metric           ┃ Value  ┃
┡━━━━━━━━━━━━━━━━━━╇━━━━━━━━┩
│ Total Requests   │ 1567   │
│ Duration         │ 10.0s  │
│ Requests/sec     │ 156.5  │
└──────────────────┴────────┘

Performance Assessment:
╭────────────────────────────────────────╮
│ Excellent! < 10ms average latency      │
╰────────────────────────────────────────╯
```

### 测试指标说明

| 指标 | 说明 | 目标值 |
|------|------|--------|
| **P50 Latency** | 50% 请求延迟 | < 10ms |
| **P95 Latency** | 95% 请求延迟 | < 25ms |
| **P99 Latency** | 99% 请求延迟 | < 50ms |
| **Throughput** | 每秒请求数 | > 100 RPS |

---

## 测试结果对比

### 不同路由方式的性能

| 路由方式 | 平均延迟 | 准确率 | 适用场景 |
|---------|---------|--------|---------|
| **Fast Path** (触发词) | ~1ms | 100% | 精确匹配 |
| **Semantic Path** (语义) | ~3-4ms | ~85% | 模糊匹配 |
| **LLM 自选** | 2000ms+ | ~78% | 无 SkillPilot |

### 优化前后对比

| 配置 | 准确率 | 平均延迟 |
|------|--------|---------|
| 默认配置 | 47.4% | 2.4ms |
| **优化配置** | **87.0%** | **1.3ms** |

优化配置 (`~/.skillpilot/config.yaml`):

```yaml
router:
  hardRouteThreshold: 0.30
  softInjectThreshold: 0.15
  fastRouteMinScore: 6
```

---

## 故障排除

### 测试失败："Could not locate the bindings file"

```bash
# 编译 better-sqlite3
cd ../packages/core
pnpm rebuild better-sqlite3

# 或重新安装依赖
cd ../test_openclaw_python
rm -rf node_modules
pnpm install
```

### 准确率过低

检查配置阈值：

```bash
# 查看当前配置
cat ~/.skillpilot/config.yaml

# 降低阈值以提高匹配率
router:
  hardRouteThreshold: 0.30  # 降低此值
```

### 延迟过高

- 确保使用 **Fast Path**（触发词匹配）
- 在 `SKILL.md` 中添加更多 `triggers`
- 使用本地构建版本而非全局安装

---

## 相关链接

- [English README](./README.md)
- [中文 README](../README_zh.md)
- [GitHub 仓库](https://github.com/RealTapeL/SkillPilot)
