# SkillPilot

> **Universal Agent Skill Router** — Route agent skills before LLM inference

[![npm](https://img.shields.io/npm/v/@realtapel/skillpilot)](https://www.npmjs.com/package/@realtapel/skillpilot)
[![License](https://img.shields.io/badge/license-MIT-green)]()

**Your agent has 1,000 skills. SkillPilot makes sure it uses the right one.**

---

## 快速开始（100%可运行）

### 1. 克隆代码

```bash
git clone https://github.com/RealTapeL/SkillPilot.git
cd SkillPilot
```

### 2. 一键安装&构建

```bash
nvm use
pnpm setup
```

### 3. 运行示例

```bash
pnpm demo
```

---

## 安装后使用

```bash
# 索引技能
skillpilot index ~/.openclaw/skills

# 路由查询
skillpilot route "create a GitHub issue"

# 查看统计
skillpilot stats
```

---

## 开发命令

```bash
# 构建所有包
pnpm build:all

# 清理构建产物
pnpm clean:all

# 本地测试CLI
pnpm cli route "your query"
```

---

## 文档

- [详细文档](./docs/)
- [测试报告](./benchmarks/)

## License

MIT
