# SkillPilot OpenClaw 测试项目

这个 Python 测试项目用于测试 SkillPilot 在 OpenClaw 环境中的表现。

📖 **详细示例文档**: [examples.md](./examples.md)  
🌐 **项目主页**: [English](../README.md) | [中文](../README_zh.md)

## 快速开始

```bash
pip install -r requirements.txt
python test_skillpilot.py      # 功能测试
python openclaw_mock.py        # OpenClaw 模拟
python benchmark.py            # 性能测试
```

## 项目结构

```
test_openclaw_python/
├── skills/                 # 测试用的 Skill 定义 (10 个)
│   ├── github/             # GitHub 操作
│   ├── git/                # Git 版本控制
│   ├── slack/              # Slack 消息
│   ├── file-read/          # 文件读取
│   ├── file-write/         # 文件写入
│   ├── docker/             # Docker 操作
│   ├── npm/                # NPM 包管理
│   ├── python/             # Python 脚本
│   ├── aws/                # AWS 云服务
│   └── database/           # 数据库操作
├── tests/                  # 测试脚本
├── results/                # 测试结果
├── requirements.txt        # Python 依赖
├── test_skillpilot.py      # 主要测试脚本 (58 个测试用例)
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

预定义的 58 个测试用例覆盖：

### 精确触发匹配
| 查询 | 期望技能 |
|------|---------|
| "create issue" | github |
| "git commit" | git |
| "npm install" | npm |
| "docker build" | docker |

### 语义匹配
| 查询 | 期望技能 |
|------|---------|
| "create a GitHub issue" | github |
| "send a message to Slack" | slack |
| "commit these changes" | git |
| "build a Docker image" | docker |

### 模糊匹配
| 查询 | 期望技能 |
|------|---------|
| "show me the README" | file-read |
| "notify the team" | slack |
| "deploy to production" | aws |

### 最新测试结果
```
总测试数: 58
正确匹配: 52
准确率: 89.7%
平均延迟: ~4ms
```

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

### 找不到 CLI 或路由结果不正确

确保已构建项目并链接本地包：

```bash
cd ../packages/core
npx tsup src/index.ts --format esm --dts

cd ../cli
npx tsup src/index.ts --format esm --dts
pnpm link ../core  # 重要！确保使用本地 core 包
cd ../..

# 测试
node packages/cli/dist/index.js route "create a GitHub issue"
```

### 路由返回旧版本结果

如果修改了 core 但 CLI 仍使用旧版本，重新链接：

```bash
cd packages/cli
pnpm unlink ../core
pnpm link ../core
cd ../..
```

## 许可证

MIT
