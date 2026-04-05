# SkillPilot

> **Universal Agent Skill Router** — Route agent skills before LLM inference

[![Platform](https://img.shields.io/badge/platform-OpenClaw%20%7C%20Claude%20Code%20%7C%20Codex%20%7C%20LangChain-blue)]()
[![npm](https://img.shields.io/npm/v/@realtapel/skillpilot)](https://www.npmjs.com/package/@realtapel/skillpilot)
[![License](https://img.shields.io/badge/license-MIT-green)]()

**Your agent has 1,000 skills. SkillPilot makes sure it uses the right one.**

🌐 [中文文档](./README_zh.md) | [Python Test Examples](./test_openclaw_python/examples.md)

---

## The Problem

Current agent frameworks (OpenClaw, Claude Code, Codex, etc.) handle skill selection by putting **all skill descriptions into the system prompt** and letting the LLM decide. This causes three issues:

| Problem | Impact |
|---------|--------|
| **Slow** | Wait 1-5 seconds for LLM to reason about which skill to use |
| **Expensive** | Every request includes thousands of tokens of skill descriptions |
| **Inaccurate** | More skills = more confusion for the LLM |

## The Solution

SkillPilot routes skills **before** LLM inference using vector semantic matching:

```
User Query
    ↓
SkillPilot Router (Fast Path: < 2ms)
    ↓
Semantic Matching (Vector similarity: < 20ms)
    ↓
Conflict Resolution (< 5ms)
    ↓
Execute Skill OR Inject Context
```

**Total routing time: < 25ms** — vs. 1-5 seconds waiting for LLM.

---

## Installation

### Method 1: Global Install (Recommended)

```bash
# Using pnpm (recommended)
pnpm add -g @realtapel/skillpilot

# Or using npm
npm install -g @realtapel/skillpilot
```

### Method 2: Local Development

Clone and build from source:

```bash
# Clone repository
git clone https://github.com/RealTapeL/SkillPilot.git
cd SkillPilot

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Compile native modules (better-sqlite3)
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3
npm run build-release

# Create alias for easy usage
echo 'alias skillpilot="node /path/to/SkillPilot/packages/cli/dist/index.js"' >> ~/.bashrc
source ~/.bashrc
```

### Install Adapters

```bash
npm install @realtapel/skillpilot-openclaw    # For OpenClaw
npm install @realtapel/skillpilot-claude-code # For Claude Code
npm install @realtapel/skillpilot-langchain   # For LangChain
```

---

## Quick Start

### CLI Usage

```bash
# 1. Index your skills (first time setup)
skillpilot index ~/.openclaw/skills ~/.claude/skills
# Or use local development version:
# node packages/cli/dist/index.js index ~/.openclaw/skills

# 2. Route a query
skillpilot route "create a GitHub issue"
# Output:
# ✓ github  (confidence: 0.94, method: semantic, 18ms)
#   Description: Interact with GitHub repositories, issues...

# 3. Explain routing decision
skillpilot explain "send a slack message"
# Shows detailed scoring and conflict resolution

# 4. View conflict groups
skillpilot conflicts

# 5. View statistics
skillpilot stats

# 6. Record feedback (for self-learning)
skillpilot feedback correct --wrong slack --right slack-advanced --query "bulk send"
```

### Using Local Build

If you installed from source:

```bash
cd /path/to/SkillPilot/packages/cli

# Index skills
node dist/index.js index /path/to/skills

# Route query
node dist/index.js route "deploy to production"

# Or create an alias
echo 'alias sp="node /path/to/SkillPilot/packages/cli/dist/index.js"' >> ~/.bashrc
source ~/.bashrc
sp route "create GitHub issue"
```

### OpenClaw Integration

```typescript
// In your OpenClaw plugin
import { createOpenClawPlugin } from '@realtapel/skillpilot-openclaw';

export default createOpenClawPlugin();
```

### Claude Code Integration

Add to your `CLAUDE.md`:

```markdown
## SkillPilot Integration

Before processing any message, run:
```bash
skillpilot-claude "$MESSAGE"
```
If the output indicates a skill should be used, prefer that skill.
```

### LangChain Integration

```typescript
import { SkillRouteTool } from '@realtapel/skillpilot-langchain';

const router = new SkillRouteTool({ skillDir: './skills' });
await router.initialize();

const result = await router.invoke("create a GitHub issue");
// { skill: "github", confidence: 0.94, shouldUse: true }
```

---

## Key Features

### 🎯 Zero-Config Skill Fingerprinting

SkillPilot automatically parses any `SKILL.md` and extracts:
- Semantic embeddings
- Intent patterns
- Keywords
- Side effects classification

No manual configuration needed. Install a skill → it can be routed.

### ⚡ Three-Stage Routing

| Stage | Time | Purpose |
|-------|------|---------|
| Fast Path | < 2ms | Keyword + trigger phrase matching |
| Semantic Path | < 20ms | Vector similarity matching |
| Conflict Resolution | < 5ms | Resolve overlapping skill conflicts |

### 🤝 Conflict-Aware Routing

Automatically detects and resolves conflicts between similar skills (e.g., `github` vs `github-advanced`):

```bash
$ skillpilot conflicts
Conflict Group A (similarity 0.91):
  github · github-advanced · github-enterprise
  Tip: Add route.prefer_when to disambiguate
```

### 🔄 Self-Learning

Records routing feedback and automatically adjusts weights:

```bash
# Record a correction
skillpilot feedback correct --wrong slack --right slack-advanced --query "bulk send"
```

### 🔌 Cross-Platform

Same index, multiple platforms:

```
~/.skillpilot/index/  ←── Shared across platforms
        ↑               ↑               ↑
  OpenClaw        Claude Code     CLI Tool
```

---

## Skill Fingerprint Specification

SkillPilot can auto-extract fingerprints from any `SKILL.md`. For better routing accuracy, skill authors can add a `route:` section to the frontmatter:

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

| Field | Type | Description |
|-------|------|-------------|
| `triggers` | `string[]` | Exact trigger phrases |
| `priority` | `number` | Conflict group priority (1-10) |
| `prefer_when` | `string[]` | Keywords that favor this skill |
| `side_effects` | `enum` | `read-only` / `write-local` / `write-remote` |

---

## Benchmarks

Run real benchmarks locally:

```bash
# Quick benchmark (bash, no dependencies)
./benchmark_simple.sh

# Python test suite
cd test_openclaw_python
pip install -r requirements.txt
python test_skillpilot.py      # 功能测试
python benchmark.py            # 性能测试

# OpenClaw 模拟测试
python openclaw_mock.py
```

### Running Tests

```bash
# TypeScript unit tests (requires build)
pnpm test

# Python integration tests
cd test_openclaw_python
python test_skillpilot.py
```

### Real Results (Raspberry Pi 5, 10 skills, 58 test cases)

```
============================================================
SkillPilot Test Results
============================================================
Total Tests: 58
Correct: 52
Accuracy: 89.7%
Avg Latency: ~4ms (library) / ~200ms (CLI with Node startup)
```

**Key improvements:**
- Fixed fuzzy matching for queries like "show me the README" → file-read
- Fixed "create a GitHub issue" correctly routes to github (not git)
- Handles partial trigger matches (e.g., "show" matches "show content")

### Comparison

| Metric | LLM-only | SkillPilot |
|--------|----------|------------|
| Latency | 1000-5000ms | ~200ms (CLI) / ~1-5ms (library) |
| Accuracy | ~78% | **~90%** |

---

## Architecture

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

## Configuration

Create `~/.skillpilot/config.yaml`:

```yaml
router:
  hardRouteThreshold: 0.80    # Direct skill execution
  softInjectThreshold: 0.45   # Inject context
  enableSemantic: true        # Enable vector matching

embed:
  provider: local-onnx        # or 'openai'

index:
  skillDirs:
    - ~/.openclaw/skills
    - ~/.claude/skills

feedback:
  enabled: true
  batchSize: 10
```

---

## Troubleshooting

### Error: "Could not locate the bindings file" (better-sqlite3)

This error occurs when the native SQLite module is not compiled. Fix:

```bash
# Navigate to better-sqlite3 directory
cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3

# Compile native module
npm run build-release

# Or reinstall with build scripts
pnpm rebuild better-sqlite3
```

### Global install permission error

If you get `EACCES` errors during global install:

```bash
# Method 1: Use pnpm (recommended)
pnpm add -g @realtapel/skillpilot

# Method 2: Use npx (no install needed)
npx @realtapel/skillpilot route "create GitHub issue"

# Method 3: Change npm global directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### ONNX model not found warning

This is normal - SkillPilot will use a fallback embedding method:

```
ONNX model not found at ~/.skillpilot/models/all-MiniLM-L6-v2.onnx, using fallback embedding
```

To use the full ONNX model, download it separately or configure OpenAI embedding in `~/.skillpilot/config.yaml`.

---

## Development

```bash
# Clone repository
git clone https://github.com/RealTapeL/SkillPilot.git
cd skillpilot

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Run benchmarks
pnpm bench
```

---

## Packages

| Package | Description |
|---------|-------------|
| Package | Description | npm |
|---------|-------------|-----|
| `@realtapel/skillpilot-core` | Core routing engine | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot-core) |
| `@realtapel/skillpilot` | CLI tool | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot) |
| `@realtapel/skillpilot-openclaw` | OpenClaw plugin adapter | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot-openclaw) |
| `@realtapel/skillpilot-claude-code` | Claude Code hook adapter | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot-claude-code) |
| `@realtapel/skillpilot-langchain` | LangChain tool adapter | [🔗](https://www.npmjs.com/package/@realtapel/skillpilot-langchain) |

---

## License

MIT

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

**SkillPilot** — Route smarter, not harder.
