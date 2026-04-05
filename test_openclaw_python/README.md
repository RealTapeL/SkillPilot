# SkillPilot OpenClaw 测试项目

这个 Python 测试项目用于测试 SkillPilot 在 OpenClaw 环境中的表现。

## 项目结构

```
test_openclaw_python/
├── skills/                 # 测试用的 Skill 定义
│   ├── github/
│   ├── slack/
│   ├── file-read/
│   ├── file-write/
│   └── docker/
├── tests/                  # 测试脚本
├── results/                # 测试结果
├── requirements.txt        # Python 依赖
├── test_skillpilot.py      # 主要测试脚本
├── openclaw_mock.py        # OpenClaw 模拟器
└── benchmark.py            # 性能基准测试
```

## 安装依赖

```bash
cd test_openclaw_python
pip install -r requirements.txt
```

## 使用方法

### 1. 基础功能测试

测试 SkillPilot 的路由准确率：

```bash
python test_skillpilot.py
```

这会：
- 索引 `skills/` 目录下的所有技能
- 运行预定义的测试用例
- 显示路由准确率和延迟统计
- 生成详细测试报告

### 2. OpenClaw 模拟测试

模拟 OpenClaw 的完整调度流程：

```bash
python openclaw_mock.py
```

这会模拟：
- `before_dispatch` 钩子（SkillPilot 路由）
- LLM 处理（模拟）
- `before_agent_reply` 钩子（添加路由信息）

### 3. 性能基准测试

测试路由性能和吞吐量：

```bash
python benchmark.py
```

测试指标：
- 平均延迟 (P50, P95, P99)
- 吞吐量 (requests/second)
- 路由准确率

## 测试用例

预定义的测试用例包括：

| 查询 | 期望技能 |
|------|---------|
| "create a GitHub issue" | github |
| "send a message to Slack" | slack |
| "read the README.md file" | file-read |
| "write output to results.txt" | file-write |
| "build a Docker image" | docker |

## 添加自定义测试用例

编辑 `test_skillpilot.py` 中的 `TEST_CASES` 列表：

```python
TEST_CASES = [
    TestCase("你的查询", "期望技能", "描述"),
    # ...
]
```

## 测试结果

测试结果保存在 `results/` 目录：
- `test_results.json` - 功能测试结果
- `benchmark.json` - 性能基准测试结果

## 在 OpenClaw 中实际使用

参考 `openclaw_mock.py` 中的实现，
将 SkillPilot 集成到你的 OpenClaw 插件中：

```python
from skillpilot_openclaw import createOpenClawPlugin

export default createOpenClawPlugin()
```

## 故障排除

### better-sqlite3 错误

如果遇到 native module 错误，需要编译：

```bash
cd ../packages/core
pnpm rebuild better-sqlite3
```

### 找不到 CLI

确保已构建项目：

```bash
cd ..
pnpm run build
```

## 许可证

MIT
